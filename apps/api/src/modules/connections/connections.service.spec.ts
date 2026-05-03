import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { INTERNAL_DB_POOL } from '../../database/database.module';
import { CredentialsEncryptionService } from '../../crypto/credentials-encryption.service';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager';
import { CreateConnectionDto } from '@postgres-web-manager/contracts';

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
  return { query: jest.fn().mockResolvedValue({ rows: [mockRow] }), ...overrides };
}

describe('ConnectionsService', () => {
  let service: ConnectionsService;
  let mockDb: { query: jest.Mock };
  let mockEncryption: jest.Mocked<CredentialsEncryptionService>;
  let mockPoolManager: jest.Mocked<PostgresPoolManager>;

  beforeEach(async () => {
    mockDb = buildMockPool();
    mockEncryption = { encrypt: jest.fn().mockReturnValue('enc-secret'), decrypt: jest.fn() } as unknown as jest.Mocked<CredentialsEncryptionService>;
    mockPoolManager = {
      hasPool: jest.fn().mockReturnValue(false),
      createPool: jest.fn(),
      destroyPool: jest.fn(),
      getClient: jest.fn(),
      getAccessMode: jest.fn().mockReturnValue('read-write'),
    } as unknown as jest.Mocked<PostgresPoolManager>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionsService,
        { provide: INTERNAL_DB_POOL, useValue: mockDb },
        { provide: CredentialsEncryptionService, useValue: mockEncryption },
        { provide: PostgresPoolManager, useValue: mockPoolManager },
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
      await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
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
      await service.create({ ...dto, savePassword: true, password: 'secret' }, 'ws-001');
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
      await expect(service.remove('missing-id')).rejects.toThrow(NotFoundException);
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
});
