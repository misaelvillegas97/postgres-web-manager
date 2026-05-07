import {
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  type CancelQueryRequest,
  type ExecuteQueryRequest,
  type ExecuteQueryResponse,
  SqlRiskLevel,
} from '@postgres-web-manager/contracts';
import { format as formatSql } from 'sql-formatter';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager';
import { mapPostgresError } from '../../postgres/postgres-error.mapper';
import { classifyRisk } from './sql-risk.classifier';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../decorators/current-user.decorator';
import { ConnectionsService } from '../connections/connections.service';

@Injectable()
export class QueryService {
  constructor(
    private readonly poolManager: PostgresPoolManager,
    private readonly auditService: AuditService,
    private readonly connectionsService: ConnectionsService,
  ) {}

  async execute(
    dto: ExecuteQueryRequest,
    user?: AuthenticatedUser,
  ): Promise<ExecuteQueryResponse> {
    const queryId = uuidv4();
    const startedAt = new Date();

    // Classify risk before running
    const risk = classifyRisk(dto.sql);

    if (!dto.sql.trim()) {
      throw new UnprocessableEntityException('SQL statement cannot be empty');
    }

    if (dto.params !== undefined && !Array.isArray(dto.params)) {
      throw new UnprocessableEntityException('Query params must be an array');
    }

    await this.ensureConnectionAccess(dto.connectionId, user?.workspaceId);

    // Ensure pool is available
    if (!this.poolManager.hasPool(dto.connectionId)) {
      throw new UnprocessableEntityException(
        `No active pool for connection ${dto.connectionId}. ` +
          `Call POST /connections/:id/unlock first.`,
      );
    }

    // Read-only enforcement: block write/DDL/destructive queries
    const accessMode = this.poolManager.getAccessMode(dto.connectionId);
    if (accessMode === 'read-only' && risk !== SqlRiskLevel.SAFE) {
      throw new ForbiddenException(
        `Connection is in read-only mode. ${risk} operations are not allowed.`,
      );
    }

    const client = await this.poolManager.getClient(dto.connectionId);

    try {
      // Apply timeout at session level
      const timeoutMs = this.normalizePositiveInteger(
        dto.timeoutMs,
        'timeoutMs',
        600_000,
      );
      if (timeoutMs) {
        await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
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
      const maxRows =
        this.normalizePositiveInteger(dto.maxRows, 'maxRows', 100_000) ?? 1000;
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

      await this.auditRiskyQuery(dto, response, risk, user);

      return response;
    } catch (err) {
      const pgErr = mapPostgresError(err);
      const durationMs = Date.now() - startedAt.getTime();
      const response: ExecuteQueryResponse = {
        queryId,
        status: 'error',
        columns: [],
        rows: [],
        rowCount: 0,
        durationMs,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        error: pgErr,
      };

      return response;
    } finally {
      client.release();
    }
  }

  async cancel(dto: CancelQueryRequest): Promise<{ cancelled: boolean }> {
    void dto;
    // In the isolated query model, cancellation isn't possible after the fact.
    // For WS sessions (F1.7), cancellation is implemented in the gateway.
    return { cancelled: false };
  }

  async format(sql: string): Promise<{ sql: string }> {
    try {
      const formatted = formatSql(sql, {
        language: 'postgresql',
        tabWidth: 2,
        keywordCase: 'upper',
      });
      return { sql: formatted };
    } catch {
      // If formatter fails, return the original SQL unchanged
      return { sql };
    }
  }

  private async auditRiskyQuery(
    dto: ExecuteQueryRequest,
    response: ExecuteQueryResponse,
    risk: SqlRiskLevel,
    user?: AuthenticatedUser,
  ): Promise<void> {
    if (
      risk === SqlRiskLevel.SAFE ||
      risk === SqlRiskLevel.UNKNOWN ||
      response.status !== 'success'
    ) {
      return;
    }

    await this.auditService.log({
      workspaceId: user?.workspaceId,
      userId: user?.sub,
      connectionId: dto.connectionId,
      action: 'query.execute',
      riskLevel: risk,
      metadata: {
        queryId: response.queryId,
        rowCount: response.rowCount,
        durationMs: response.durationMs,
        command: response.status,
      },
    });
  }

  private async ensureConnectionAccess(
    connectionId: string,
    workspaceId?: string,
  ): Promise<void> {
    if (!workspaceId) return;
    await this.connectionsService.findOne(connectionId, workspaceId);
  }

  private normalizePositiveInteger(
    value: unknown,
    label: string,
    max: number,
  ): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value <= 0 ||
      value > max
    ) {
      throw new UnprocessableEntityException(
        `${label} must be an integer between 1 and ${max}`,
      );
    }
    return value;
  }
}
