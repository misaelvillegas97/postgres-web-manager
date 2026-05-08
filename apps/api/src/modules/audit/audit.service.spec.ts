import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { AuditEventDto, AuditService } from './audit.service';
import { INTERNAL_DATA_SOURCE } from '../../database/database.module';
import { AuditLogEntity } from '../../database/entities';
import { SqlRiskLevel } from '@postgres-web-manager/contracts';

type MockAuditRepository = jest.Mocked<
  Pick<Repository<AuditLogEntity>, 'insert' | 'findAndCount'>
>;

function buildMockDataSource(repository: MockAuditRepository): DataSource {
  return {
    getRepository: jest.fn().mockReturnValue(repository),
  } as unknown as DataSource;
}

describe('AuditService', () => {
  let service: AuditService;
  let mockRepository: MockAuditRepository;

  beforeEach(async () => {
    mockRepository = {
      insert: jest.fn().mockResolvedValue({}),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: INTERNAL_DATA_SOURCE,
          useValue: buildMockDataSource(mockRepository),
        },
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

      expect(mockRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-001',
          connectionId: 'conn-abc',
          userId: 'usr-001',
          action: 'EXECUTE_QUERY',
          riskLevel: SqlRiskLevel.WRITE,
        }),
      );
    });

    it('truncates sqlPreview to 500 characters', async () => {
      const longSql = 'SELECT ' + 'x'.repeat(600);
      await service.log({ ...baseEvent, sqlPreview: longSql });

      const [inserted] = mockRepository.insert.mock.calls[0];
      expect(inserted.sqlPreview).toHaveLength(500);
    });

    it('sets sqlPreview to null when not provided', async () => {
      const eventWithoutSql = { ...baseEvent };
      delete eventWithoutSql.sqlPreview;
      await service.log(eventWithoutSql);

      const [inserted] = mockRepository.insert.mock.calls[0];
      expect(inserted.sqlPreview).toBeNull();
    });

    it('does not throw when DB fails (audit must not block main op)', async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      mockRepository.insert.mockRejectedValueOnce(new Error('DB down'));
      try {
        await expect(service.log(baseEvent)).resolves.not.toThrow();
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('skips DB insert and logs debug when data source is null', async () => {
      const moduleNoDb: TestingModule = await Test.createTestingModule({
        providers: [
          AuditService,
          { provide: INTERNAL_DATA_SOURCE, useValue: null },
        ],
      }).compile();

      const svcNoDb = moduleNoDb.get<AuditService>(AuditService);
      await expect(svcNoDb.log(baseEvent)).resolves.not.toThrow();
    });
  });

  describe('findAll()', () => {
    it('returns rows and total for a given workspace', async () => {
      const fakeRows = [
        { id: '1', action: 'EXECUTE_QUERY', riskLevel: SqlRiskLevel.SAFE },
      ] as AuditLogEntity[];
      mockRepository.findAndCount.mockResolvedValueOnce([fakeRows, 3]);

      const result = await service.findAll('ws-001');

      expect(result.rows).toEqual(fakeRows);
      expect(result.total).toBe(3);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-001' } }),
      );
    });

    it('passes limit and offset to query', async () => {
      await service.findAll('ws-001', 25, 50);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25, skip: 50 }),
      );
    });

    it('returns empty result when data source is null', async () => {
      const moduleNoDb: TestingModule = await Test.createTestingModule({
        providers: [
          AuditService,
          { provide: INTERNAL_DATA_SOURCE, useValue: null },
        ],
      }).compile();

      const svcNoDb = moduleNoDb.get<AuditService>(AuditService);
      const result = await svcNoDb.findAll('ws-001');
      expect(result).toEqual({ rows: [], total: 0 });
    });
  });
});
