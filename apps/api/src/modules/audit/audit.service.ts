import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { INTERNAL_DATA_SOURCE } from '../../database/database.module';
import { AuditLogEntity } from '../../database/entities';
import { SqlRiskLevel } from '@postgres-web-manager/contracts';

export interface AuditEventDto {
  workspaceId?: string;
  userId?: string;
  connectionId?: string;
  action: string;
  riskLevel: SqlRiskLevel;
  resource?: string;
  sqlPreview?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(INTERNAL_DATA_SOURCE)
    private readonly dataSource: DataSource | null,
  ) {}

  async log(event: AuditEventDto): Promise<void> {
    if (!this.dataSource) {
      this.logger.debug(`[AUDIT] ${event.action} risk=${event.riskLevel}`);
      return;
    }

    try {
      await this.dataSource.getRepository(AuditLogEntity).insert({
        workspaceId: event.workspaceId ?? null,
        connectionId: event.connectionId ?? null,
        userId: event.userId ?? null,
        action: event.action,
        riskLevel: event.riskLevel,
        resource: event.resource ?? null,
        sqlPreview: event.sqlPreview
          ? event.sqlPreview.substring(0, 500)
          : null,
        metadata: event.metadata ?? null,
      });
    } catch (err) {
      // Audit failures must never block the main operation
      this.logger.error('Failed to write audit log', err);
    }
  }

  async findAll(workspaceId: string, limit = 100, offset = 0) {
    if (!this.dataSource) return { rows: [], total: 0 };
    const [rows, total] = await this.dataSource
      .getRepository(AuditLogEntity)
      .findAndCount({
        where: { workspaceId },
        order: { createdAt: 'DESC' },
        take: limit,
        skip: offset,
      });
    return { rows, total };
  }
}
