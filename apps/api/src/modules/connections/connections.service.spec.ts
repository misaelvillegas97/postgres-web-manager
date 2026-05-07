import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { INTERNAL_DB_POOL } from '../../database/database.module';
import { CredentialsEncryptionService } from '../../crypto/credentials-encryption.service';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager';
import { CreateConnectionDto } from '@postgres-web-manager/contracts';
import { SessionRegistryService } from '../sessions/session-registry.service';

const mockRow = {
  id: 'conn-001',
  workspace_id: 'ws-001',
  name: 'Local Dev',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  username: 'postgres',
  ssl_mode: 'prefer',
  access_mode: 'read-write',
  max_rows: 1000,
  statement_timeout_ms: 30000,
  save_password: false,
  created_at: new Date(),
  updated_at: new Date(),
};

function buildMockPool(overrides: Partial<{ query: jest.Mock }> = {}) {
  return {
    query: jest.fn().mockResolvedValue({ rows: [mockRow] }),
    ...overrides,
  };
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
  let mockDb: { query: jest.Mock };
  let mockEncryption: MockEncryptionService;
  let mockPoolManager: MockPostgresPoolManager;
  let mockSessionRegistry: MockSessionRegistry;

  beforeEach(async () => {
    mockDb = buildMockPool();
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
        { provide: INTERNAL_DB_POOL, useValue: mockDb },
        { provide: CredentialsEncryptionService, useValue: mockEncryption },
        { provide: PostgresPoolManager, useValue: mockPoolManager },
        { provide: SessionRegistryService, useValue: mockSessionRegistry },
      ],
    }).compile();

    service = module.get<ConnectionsService>(ConnectionsService);
  });

  describe('findAll()', () => {
    it('returns empty array when pool is null', async () => {
      const moduleNoDb: TestingModule = await Test.createTestingModule({
        providers: [
          ConnectionsService,
          { provide: INTERNAL_DB_POOL, useValue: null },
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
      const [, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(params[0]).toBe('ws-001');
    });

    it('passes null when workspaceId is omitted', async () => {
      await service.findAll();
      const [, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(params[0]).toBeNull();
    });

    it('maps snake_case DB columns to camelCase profile', async () => {
      const [profile] = await service.findAll('ws-001');
      expect(profile.id).toBe(mockRow.id);
      expect(profile.name).toBe(mockRow.name);
      expect(profile.sslMode).toBe(mockRow.ssl_mode);
      expect(profile.accessMode).toBe(mockRow.access_mode);
    });
  });

  describe('findOne()', () => {
    it('throws NotFoundException when DB has no results', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns mapped profile when found', async () => {
      const profile = await service.findOne('conn-001', 'ws-001');
      expect(profile.id).toBe('conn-001');
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
    };

    it('creates connection without encrypting password when savePassword is false', async () => {
      await service.create(dto, 'ws-001');
      expect(mockEncryption.encrypt).not.toHaveBeenCalled();
      const [, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(params[6]).toBeNull(); // password_encrypted = null
    });

    it('encrypts password when savePassword is true', async () => {
      await service.create(
        { ...dto, savePassword: true, password: 'secret' },
        'ws-001',
      );
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('secret');
      const [, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(params[6]).toBe('enc-secret');
    });

    it('sets workspace_id from caller context', async () => {
      await service.create(dto, 'ws-abc');
      const [, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(params[0]).toBe('ws-abc');
    });
  });

  describe('remove()', () => {
    it('throws NotFoundException when no rows deleted', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('calls destroyPool if pool is active', async () => {
      mockPoolManager.hasPool.mockReturnValueOnce(true);
      mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      await service.remove('conn-001', 'ws-001');
      expect(mockPoolManager.destroyPool).toHaveBeenCalledWith('conn-001');
    });

    it('does not call destroyPool when pool is inactive', async () => {
      mockPoolManager.hasPool.mockReturnValueOnce(false);
      mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
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
        {
          code: '28P01',
        },
      );
      mockPoolManager.getClient.mockRejectedValueOnce(authError);
      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...mockRow, password_encrypted: null, save_password: true }],
      });

      await expect(
        service.unlock('conn-001', 'bad-secret', 'ws-001'),
      ).rejects.toThrow('password authentication failed for user "postgres"');
      expect(mockPoolManager.destroyPool).toHaveBeenCalledWith('conn-001');

      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...mockRow, save_password: true }],
      });
      mockPoolManager.hasPool.mockReturnValueOnce(false);
      await expect(service.status('conn-001', 'ws-001')).resolves.toMatchObject(
        {
          state: 'locked',
          canAutoUnlock: false,
        },
      );

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            ...mockRow,
            password_encrypted: 'saved-secret',
            save_password: true,
          },
        ],
      });
      mockEncryption.decrypt.mockReturnValueOnce('saved-secret');
      await expect(
        service.unlock('conn-001', undefined, 'ws-001'),
      ).rejects.toThrow('Password is required to unlock this connection');
    });
  });
});
