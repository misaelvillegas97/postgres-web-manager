import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { INTERNAL_DB_POOL } from '../../database/database.module';
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

  constructor(@Inject(INTERNAL_DB_POOL) private readonly db: Pool | null) {}

  async log(event: AuditEventDto): Promise<void> {
    if (!this.db) {
      this.logger.debug(`[AUDIT] ${event.action} risk=${event.riskLevel}`);
      return;
    }

    try {
      await this.db.query(
        `INSERT INTO audit_logs
           (workspace_id, connection_id, user_id, action, risk_level, resource, sql_preview, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          event.workspaceId ?? null,
          event.connectionId ?? null,
          event.userId ?? null,
          event.action,
          event.riskLevel,
          event.resource ?? null,
          event.sqlPreview ? event.sqlPreview.substring(0, 500) : null,
          event.metadata ? JSON.stringify(event.metadata) : null,
        ],
      );
    } catch (err) {
      // Audit failures must never block the main operation
      this.logger.error('Failed to write audit log', err);
    }
  }

  async findAll(workspaceId: string, limit = 100, offset = 0) {
    if (!this.db) return { rows: [], total: 0 };
    const { rows } = await this.db.query(
      `SELECT id, workspace_id, connection_id, user_id, action, risk_level,
              resource, sql_preview, metadata, created_at
       FROM audit_logs
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [workspaceId, limit, offset],
    );
    const { rows: countRows } = await this.db.query(
      'SELECT COUNT(*) as total FROM audit_logs WHERE workspace_id = $1',
      [workspaceId],
    );
    return { rows, total: Number(countRows[0]?.['total'] ?? 0) };
  }
}
