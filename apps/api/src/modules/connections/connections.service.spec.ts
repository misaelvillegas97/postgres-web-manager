import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { ConnectionsService } from './connections.service';
import { INTERNAL_DATA_SOURCE } from '../../database/database.module';
import { ConnectionProfileEntity } from '../../database/entities';
import { CredentialsEncryptionService } from '../../crypto/credentials-encryption.service';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager';
import { CreateConnectionDto } from '@postgres-web-manager/contracts';
import { SessionRegistryService } from '../sessions/session-registry.service';

const createdAt = new Date('2026-05-03T00:00:00.000Z');
const updatedAt = new Date('2026-05-03T00:00:00.000Z');

function buildEntity(
  overrides: Partial<ConnectionProfileEntity> = {},
): ConnectionProfileEntity {
  return {
    id: 'conn-001',
    workspaceId: 'ws-001',
    name: 'Local Dev',
    host: 'localhost',
    port: 5432,
    database: 'mydb',
    username: 'postgres',
    passwordEncrypted: null,
    sslMode: 'prefer',
    accessMode: 'read-write',
    maxRows: 1000,
    statementTimeoutMs: 30000,
    savePassword: false,
    color: null,
    notes: null,
    createdAt,
    updatedAt,
    ...overrides,
  } as ConnectionProfileEntity;
}

type MockQueryBuilder = {
  orderBy: jest.Mock;
  where: jest.Mock;
  getMany: jest.Mock;
};

type MockConnectionRepository = {
  createQueryBuilder: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  delete: jest.Mock;
};

function buildQueryBuilder(): MockQueryBuilder {
  const queryBuilder = {} as MockQueryBuilder;
  queryBuilder.orderBy = jest.fn().mockReturnValue(queryBuilder);
  queryBuilder.where = jest.fn().mockReturnValue(queryBuilder);
  queryBuilder.getMany = jest.fn().mockResolvedValue([buildEntity()]);
  return queryBuilder;
}

function buildMockDataSource(repository: MockConnectionRepository): DataSource {
  return {
    getRepository: jest.fn().mockReturnValue(repository),
  } as unknown as DataSource;
}

type MockEncryptionService = jest.Mocked<
  Pick<CredentialsEncryptionService, 'encrypt' | 'decrypt' | 'isAvailable'>
>;

type MockPostgresPoolManager = jest.Mocked<
  Pick<
    PostgresPoolManager,
    'hasPool' | 'createPool' | 'destroyPool' | 'getClient' | 'getAccessMode'
  >
>;
type MockSessionRegistry = jest.Mocked<
  Pick<SessionRegistryService, 'hasActiveConnection'>
>;

describe('ConnectionsService', () => {
  let service: ConnectionsService;
  let queryBuilder: MockQueryBuilder;
  let mockRepository: MockConnectionRepository;
  let mockEncryption: MockEncryptionService;
  let mockPoolManager: MockPostgresPoolManager;
  let mockSessionRegistry: MockSessionRegistry;

  beforeEach(async () => {
    queryBuilder = buildQueryBuilder();
    mockRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findOne: jest.fn().mockResolvedValue(buildEntity()),
      create: jest.fn((value: Partial<ConnectionProfileEntity>) =>
        buildEntity(value),
      ),
      save: jest.fn(async (entity: ConnectionProfileEntity) => entity),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    mockEncryption = {
      encrypt: jest.fn().mockReturnValue('enc-secret'),
      decrypt: jest.fn(),
      isAvailable: jest.fn().mockReturnValue(true),
    };
    mockPoolManager = {
      hasPool: jest.fn().mockReturnValue(false),
      createPool: jest.fn().mockResolvedValue(undefined),
      destroyPool: jest.fn().mockResolvedValue(undefined),
      getClient: jest.fn(),
      getAccessMode: jest.fn().mockReturnValue('read-write'),
    };
    mockSessionRegistry = {
      hasActiveConnection: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionsService,
        {
          provide: INTERNAL_DATA_SOURCE,
          useValue: buildMockDataSource(mockRepository),
        },
        { provide: CredentialsEncryptionService, useValue: mockEncryption },
        { provide: PostgresPoolManager, useValue: mockPoolManager },
        { provide: SessionRegistryService, useValue: mockSessionRegistry },
      ],
    }).compile();

    service = module.get<ConnectionsService>(ConnectionsService);
  });

  describe('findAll()', () => {
    it('returns empty array when data source is null', async () => {
      const moduleNoDb: TestingModule = await Test.createTestingModule({
        providers: [
          ConnectionsService,
          { provide: INTERNAL_DATA_SOURCE, useValue: null },
          { provide: CredentialsEncryptionService, useValue: mockEncryption },
          { provide: PostgresPoolManager, useValue: mockPoolManager },
          { provide: SessionRegistryService, useValue: mockSessionRegistry },
        ],
      }).compile();
      const svcNoDb = moduleNoDb.get<ConnectionsService>(ConnectionsService);
      expect(await svcNoDb.findAll()).toEqual([]);
    });

    it('passes workspaceId filter to query', async () => {
      await service.findAll('ws-001');
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'profile.workspace_id = :workspaceId',
        { workspaceId: 'ws-001' },
      );
    });

    it('does not filter by workspace when workspaceId is omitted', async () => {
      await service.findAll();
      expect(queryBuilder.where).not.toHaveBeenCalled();
    });

    it('maps entity fields to camelCase profile', async () => {
      const [profile] = await service.findAll('ws-001');
      expect(profile.id).toBe('conn-001');
      expect(profile.name).toBe('Local Dev');
      expect(profile.sslMode).toBe('prefer');
      expect(profile.accessMode).toBe('read-write');
    });
  });

  describe('findOne()', () => {
    it('throws NotFoundException when DB has no results', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns mapped profile when found', async () => {
      const profile = await service.findOne('conn-001', 'ws-001');
      expect(profile.id).toBe('conn-001');
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'conn-001', workspaceId: 'ws-001' },
      });
    });
  });

  describe('create()', () => {
    const dto: CreateConnectionDto = {
      name: 'Test Conn',
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      username: 'test',
      sslMode: 'prefer',
      accessMode: 'read-write',
    };

    it('creates connection without encrypting password when savePassword is false', async () => {
      await service.create(dto, 'ws-001');
      expect(mockEncryption.encrypt).not.toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ passwordEncrypted: null }),
      );
    });

    it('encrypts password when savePassword is true', async () => {
      await service.create(
        { ...dto, savePassword: true, password: 'secret' },
        'ws-001',
      );
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('secret');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ passwordEncrypted: 'enc-secret' }),
      );
    });

    it('sets workspace_id from caller context', async () => {
      await service.create(dto, 'ws-abc');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-abc' }),
      );
    });
  });

  describe('remove()', () => {
    it('throws NotFoundException when no rows deleted', async () => {
      mockRepository.delete.mockResolvedValueOnce({ affected: 0 });
      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('calls destroyPool if pool is active', async () => {
      mockPoolManager.hasPool.mockReturnValueOnce(true);
      await service.remove('conn-001', 'ws-001');
      expect(mockRepository.delete).toHaveBeenCalledWith({
        id: 'conn-001',
        workspaceId: 'ws-001',
      });
      expect(mockPoolManager.destroyPool).toHaveBeenCalledWith('conn-001');
    });

    it('does not call destroyPool when pool is inactive', async () => {
      mockPoolManager.hasPool.mockReturnValueOnce(false);
      await service.remove('conn-001');
      expect(mockPoolManager.destroyPool).not.toHaveBeenCalled();
    });
  });

  describe('test()', () => {
    it('uses an isolated temporary pool id for connection tests', async () => {
      const release = jest.fn();
      const client = {
        query: jest
          .fn()
          .mockResolvedValue({ rows: [{ version: 'PostgreSQL test' }] }),
        release,
      };
      mockPoolManager.getClient.mockResolvedValueOnce(client);

      const result = await service.test({
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        username: 'postgres',
        password: 'secret',
        sslMode: 'prefer',
      });

      const [poolId] = mockPoolManager.createPool.mock.calls[0];
      expect(poolId).toMatch(/^__test__:/);
      expect(poolId).not.toBe('__test__');
      expect(mockPoolManager.getClient).toHaveBeenCalledWith(poolId);
      expect(mockPoolManager.destroyPool).toHaveBeenCalledWith(poolId);
      expect(release).toHaveBeenCalled();
      expect(result).toMatchObject({
        success: true,
        serverVersion: 'PostgreSQL test',
      });
    });
  });

  describe('unlock()', () => {
    it('verifies the pool before returning unlocked', async () => {
      const release = jest.fn();
      const client = {
        query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
        release,
      };
      mockPoolManager.getClient.mockResolvedValueOnce(client);

      await expect(
        service.unlock('conn-001', 'secret', 'ws-001'),
      ).resolves.toEqual({
        unlocked: true,
      });

      expect(mockPoolManager.createPool).toHaveBeenCalledWith(
        'conn-001',
        expect.objectContaining({ password: 'secret' }),
      );
      expect(mockPoolManager.getClient).toHaveBeenCalledWith('conn-001');
      expect(client.query).toHaveBeenCalledWith('SELECT 1');
      expect(release).toHaveBeenCalled();
    });

    it('rejects unlock when another websocket session already owns the connection', async () => {
      mockSessionRegistry.hasActiveConnection.mockReturnValueOnce(true);

      await expect(
        service.unlock('conn-001', 'secret', 'ws-001'),
      ).rejects.toThrow(
        'This database connection is already open in another browser or device',
      );
      expect(mockPoolManager.createPool).not.toHaveBeenCalled();
    });

    it('reuses an existing healthy pool when no explicit password is supplied', async () => {
      const release = jest.fn();
      const client = {
        query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
        release,
      };
      mockPoolManager.hasPool.mockReturnValueOnce(true);
      mockPoolManager.getClient.mockResolvedValueOnce(client);

      await expect(
        service.unlock('conn-001', undefined, 'ws-001'),
      ).resolves.toEqual({
        unlocked: true,
      });
      expect(mockPoolManager.createPool).not.toHaveBeenCalled();
      expect(client.query).toHaveBeenCalledWith('SELECT 1');
      expect(release).toHaveBeenCalled();
    });

    it('clears failed password attempts and disables auto unlock after auth failure', async () => {
      const authError = Object.assign(
        new Error('password authentication failed for user "postgres"'),
        { code: '28P01' },
      );
      mockPoolManager.getClient.mockRejectedValueOnce(authError);
      mockRepository.findOne.mockResolvedValueOnce(
        buildEntity({ passwordEncrypted: null, savePassword: true }),
      );

      await expect(
        service.unlock('conn-001', 'bad-secret', 'ws-001'),
      ).rejects.toThrow('password authentication failed for user "postgres"');
      expect(mockPoolManager.destroyPool).toHaveBeenCalledWith('conn-001');

      mockRepository.findOne.mockResolvedValueOnce(
        buildEntity({ savePassword: true }),
      );
      mockPoolManager.hasPool.mockReturnValueOnce(false);
      await expect(service.status('conn-001', 'ws-001')).resolves.toMatchObject(
        {
          state: 'locked',
          canAutoUnlock: false,
        },
      );

      mockRepository.findOne.mockResolvedValueOnce(
        buildEntity({ passwordEncrypted: 'saved-secret', savePassword: true }),
      );
      mockEncryption.decrypt.mockReturnValueOnce('saved-secret');
      await expect(
        service.unlock('conn-001', undefined, 'ws-001'),
      ).rejects.toThrow('Password is required to unlock this connection');
    });
  });
});
