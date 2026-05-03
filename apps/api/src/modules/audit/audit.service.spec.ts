import { Test, TestingModule } from '@nestjs/testing';
import { AuditService, AuditEventDto } from './audit.service';
import { INTERNAL_DB_POOL } from '../../database/database.module';
import { SqlRiskLevel } from '@postgres-web-manager/contracts';

function buildMockPool(overrides: Partial<{ query: jest.Mock }> = {}) {
  return { query: jest.fn().mockResolvedValue({ rows: [] }), ...overrides };
}

describe('AuditService', () => {
  let service: AuditService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = buildMockPool();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: INTERNAL_DB_POOL, useValue: mockDb },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('log()', () => {
    const baseEvent: AuditEventDto = {
      workspaceId: 'ws-001',
      userId: 'usr-001',
      connectionId: 'conn-abc',
      action: 'EXECUTE_QUERY',
      riskLevel: SqlRiskLevel.WRITE,
      resource: 'users',
      sqlPreview: 'INSERT INTO users (name) VALUES ($1)',
    };

    it('inserts audit log row into DB', async () => {
      await service.log(baseEvent);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('INSERT INTO audit_logs');
      expect(params[0]).toBe('ws-001');
      expect(params[1]).toBe('conn-abc');
      expect(params[2]).toBe('usr-001');
      expect(params[3]).toBe('EXECUTE_QUERY');
      expect(params[4]).toBe(SqlRiskLevel.WRITE);
    });

    it('truncates sqlPreview to 500 characters', async () => {
      const longSql = 'SELECT ' + 'x'.repeat(600);
      await service.log({ ...baseEvent, sqlPreview: longSql });

      const [, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      const preview = params[6] as string;
      expect(preview.length).toBe(500);
    });

    it('sets sqlPreview to null when not provided', async () => {
      const { sqlPreview: _, ...eventWithoutSql } = baseEvent;
      await service.log(eventWithoutSql);

      const [, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(params[6]).toBeNull();
    });

    it('does not throw when DB fails (audit must not block main op)', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('DB down'));
      await expect(service.log(baseEvent)).resolves.not.toThrow();
    });

    it('skips DB insert and logs debug when pool is null', async () => {
      const moduleNoDb: TestingModule = await Test.createTestingModule({
        providers: [
          AuditService,
          { provide: INTERNAL_DB_POOL, useValue: null },
        ],
      }).compile();

      const svcNoDb = moduleNoDb.get<AuditService>(AuditService);
      await expect(svcNoDb.log(baseEvent)).resolves.not.toThrow();
    });
  });

  describe('findAll()', () => {
    it('returns rows and total for a given workspace', async () => {
      const fakeRows = [{ id: '1', action: 'EXECUTE_QUERY', risk_level: SqlRiskLevel.SAFE }];
      mockDb.query
        .mockResolvedValueOnce({ rows: fakeRows })          // first query: data
        .mockResolvedValueOnce({ rows: [{ total: '3' }] }); // second: count

      const result = await service.findAll('ws-001');

      expect(result.rows).toEqual(fakeRows);
      expect(result.total).toBe(3);
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('passes limit and offset to query', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await service.findAll('ws-001', 25, 50);

      const [, params] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(params[1]).toBe(25);
      expect(params[2]).toBe(50);
    });

    it('returns empty result when pool is null', async () => {
      const moduleNoDb: TestingModule = await Test.createTestingModule({
        providers: [
          AuditService,
          { provide: INTERNAL_DB_POOL, useValue: null },
        ],
      }).compile();

      const svcNoDb = moduleNoDb.get<AuditService>(AuditService);
      const result = await svcNoDb.findAll('ws-001');
      expect(result).toEqual({ rows: [], total: 0 });
    });
  });
});
