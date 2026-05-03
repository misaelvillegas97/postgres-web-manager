import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  CancelQueryRequest,
  ExecuteQueryRequest,
  ExecuteQueryResponse,
  QueryHistoryEntry,
  SqlRiskLevel,
} from '@postgres-web-manager/contracts';
import { INTERNAL_DB_POOL } from '../../database/database.module';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager';
import { mapPostgresError } from '../../postgres/postgres-error.mapper';
import { classifyRisk } from './sql-risk.classifier';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../decorators/current-user.decorator';

type DbRow = Record<string, unknown>;

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(
    @Inject(INTERNAL_DB_POOL) private readonly db: Pool | null,
    private readonly poolManager: PostgresPoolManager,
    private readonly auditService: AuditService,
  ) {}

  async execute(dto: ExecuteQueryRequest, user?: AuthenticatedUser): Promise<ExecuteQueryResponse> {
    const queryId = uuidv4();
    const startedAt = new Date();

    // Classify risk before running
    const risk = classifyRisk(dto.sql);

    if (!dto.sql.trim()) {
      throw new UnprocessableEntityException('SQL statement cannot be empty');
    }

    // Ensure pool is available
    if (!this.poolManager.hasPool(dto.connectionId)) {
      throw new UnprocessableEntityException(
        `No active pool for connection ${dto.connectionId}. ` +
          `Call POST /connections/:id/unlock first.`,
      );
    }

    // Read-only enforcement: block write/DDL/destructive queries
    const accessMode = this.poolManager.getAccessMode(dto.connectionId);
    if (accessMode === 'read-only' && risk !== SqlRiskLevel.SAFE && risk !== SqlRiskLevel.UNKNOWN) {
      throw new ForbiddenException(
        `Connection is in read-only mode. ${risk} operations are not allowed.`,
      );
    }

    const client = await this.poolManager.getClient(dto.connectionId);
    const endedAt = new Date();

    try {
      // Apply timeout at session level
      if (dto.timeoutMs) {
        await client.query(`SET LOCAL statement_timeout = ${dto.timeoutMs}`);
      }

      const start = Date.now();
      const result = await client.query({
        text: dto.sql,
        values: dto.params as unknown[],
        rowMode: 'array',
      });

      const durationMs = Date.now() - start;
      const endedAtFinal = new Date();

      // Limit rows
      const maxRows = dto.maxRows ?? 1000;
      const rows = (result.rows as unknown[][]).slice(0, maxRows).map((row) => {
        const obj: Record<string, unknown> = {};
        result.fields.forEach((field, i) => {
          obj[field.name] = row[i];
        });
        return obj;
      });

      const response: ExecuteQueryResponse = {
        queryId,
        status: 'success',
        statement: dto.sql,
        columns: result.fields.map((f) => ({
          name: f.name,
          dataTypeId: f.dataTypeID,
        })),
        rows,
        rowCount: result.rowCount ?? rows.length,
        durationMs,
        startedAt: startedAt.toISOString(),
        endedAt: endedAtFinal.toISOString(),
      };

      // Persist history
      await this.persistHistory(dto, response, risk, user);

      return response;
    } catch (err) {
      const pgErr = mapPostgresError(err);
      const durationMs = Date.now() - startedAt.getTime();
      const response: ExecuteQueryResponse = {
        queryId,
        status: 'error',
        statement: dto.sql,
        columns: [],
        rows: [],
        rowCount: 0,
        durationMs,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        error: pgErr,
      };

      await this.persistHistory(dto, response, risk, user);
      return response;
    } finally {
      client.release();
    }
  }

  async cancel(_dto: CancelQueryRequest): Promise<{ cancelled: boolean }> {
    // In the isolated query model, cancellation isn't possible after the fact.
    // For WS sessions (F1.7), cancellation is implemented in the gateway.
    return { cancelled: false };
  }

  async getHistory(workspaceId?: string): Promise<QueryHistoryEntry[]> {
    if (!this.db) return [];
    const { rows } = await this.db.query<DbRow>(
      `SELECT id, connection_id, sql, status, duration_ms, row_count,
              error_message, started_at
       FROM query_history
       WHERE ($1::uuid IS NULL OR workspace_id = $1)
       ORDER BY started_at DESC
       LIMIT 200`,
      [workspaceId ?? null],
    );
    return rows.map(this.toHistoryEntry);
  }

  async getHistoryEntry(id: string): Promise<QueryHistoryEntry | null> {
    if (!this.db) return null;
    const { rows } = await this.db.query<DbRow>(
      `SELECT id, connection_id, sql, status, duration_ms, row_count,
              error_message, started_at
       FROM query_history WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) throw new NotFoundException(`History entry ${id} not found`);
    return this.toHistoryEntry(rows[0]);
  }

  async format(sql: string): Promise<{ sql: string }> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { format } = require('sql-formatter') as { format: (s: string, opts: Record<string, unknown>) => string };
      const formatted = format(sql, { language: 'postgresql', tabWidth: 2, keywordCase: 'upper' });
      return { sql: formatted };
    } catch {
      // If formatter fails, return the original SQL unchanged
      return { sql };
    }
  }

  private async persistHistory(
    dto: ExecuteQueryRequest,
    response: ExecuteQueryResponse,
    risk: SqlRiskLevel,
    user?: AuthenticatedUser,
  ): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.query(
        `INSERT INTO query_history
           (id, workspace_id, connection_id, user_id, sql, status, duration_ms, row_count, error_message, error_code, started_at, ended_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [
          response.queryId,
          user?.workspaceId ?? null,
          dto.connectionId,
          user?.sub ?? null,
          dto.sql,
          response.status,
          response.durationMs,
          response.rowCount,
          response.error?.message ?? null,
          response.error?.code ?? null,
          response.startedAt,
        ],
      );

      // Audit write/DDL/destructive operations
      if (risk !== SqlRiskLevel.SAFE && risk !== SqlRiskLevel.UNKNOWN && response.status === 'success') {
        await this.auditService.log({
          workspaceId: user?.workspaceId,
          userId: user?.sub,
          connectionId: dto.connectionId,
          action: 'query.execute',
          riskLevel: risk,
          sqlPreview: dto.sql.slice(0, 500),
          metadata: { queryId: response.queryId, rowCount: response.rowCount, durationMs: response.durationMs },
        });
      }
    } catch (err) {
      this.logger.warn('Failed to persist query history', err);
    }
  }

  private toHistoryEntry(row: DbRow): QueryHistoryEntry {
    return {
      id: row['id'] as string,
      connectionId: row['connection_id'] as string | undefined,
      sql: row['sql'] as string,
      status: row['status'] as QueryHistoryEntry['status'],
      durationMs: row['duration_ms'] as number | undefined,
      rowCount: row['row_count'] as number | undefined,
      errorMessage: row['error_message'] as string | undefined,
      createdAt: (row['started_at'] as Date).toISOString(),
    };
  }
}
