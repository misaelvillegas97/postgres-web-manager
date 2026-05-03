import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApplyTableChangesRequest,
  ApplyTableChangesResponse,
  PreviewChangesRequest,
  PreviewChangesResponse,
  ReadTableDataRequest,
  ReadTableDataResponse,
} from '@postgres-web-manager/contracts';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager.js';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;

const ALLOWED_FILTER_OPERATORS = new Set([
  '=', '!=', '<>', '<', '>', '<=', '>=',
  'IS NULL', 'IS NOT NULL', 'LIKE', 'ILIKE', 'NOT LIKE', 'NOT ILIKE',
  'IN', 'NOT IN',
]);

@Injectable()
export class TableDataService {
  constructor(private readonly poolManager: PostgresPoolManager) {}

  private validateIdentifier(name: string, label: string): void {
    if (!IDENTIFIER_RE.test(name)) {
      throw new BadRequestException(`Invalid ${label}: "${name}"`);
    }
  }

  async read(dto: ReadTableDataRequest): Promise<ReadTableDataResponse> {
    this.validateIdentifier(dto.schema, 'schema');
    this.validateIdentifier(dto.table, 'table');

    const page = Math.max(1, dto.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, dto.pageSize ?? DEFAULT_PAGE_SIZE));
    const offset = (page - 1) * pageSize;

    const pool = this.poolManager.getPool(dto.connectionId);
    if (!pool) throw new NotFoundException(`No active connection for id "${dto.connectionId}"`);

    const client = await pool.connect();
    try {
      // Build ORDER BY clause — validate each column identifier
      let orderClause = '';
      if (dto.orderBy?.length) {
        const parts = dto.orderBy.map((o) => {
          this.validateIdentifier(o.column, 'orderBy column');
          const dir = o.direction === 'DESC' ? 'DESC' : 'ASC';
          return `"${o.column}" ${dir}`;
        });
        orderClause = `ORDER BY ${parts.join(', ')}`;
      }

      // Build WHERE clause — only allow known operators, parameterise values
      const params: unknown[] = [];
      let whereClause = '';
      if (dto.filters?.length) {
        const conditions = dto.filters.map((f) => {
          this.validateIdentifier(f.column, 'filter column');
          const op = f.operator.toUpperCase();
          if (!ALLOWED_FILTER_OPERATORS.has(op)) {
            throw new BadRequestException(`Operator "${f.operator}" is not allowed`);
          }
          if (op === 'IS NULL' || op === 'IS NOT NULL') {
            return `"${f.column}" ${op}`;
          }
          if (op === 'IN' || op === 'NOT IN') {
            const values = Array.isArray(f.value) ? f.value : [f.value];
            const placeholders = values.map((v) => { params.push(v); return `$${params.length}`; });
            return `"${f.column}" ${op} (${placeholders.join(', ')})`;
          }
          params.push(f.value);
          return `"${f.column}" ${op} $${params.length}`;
        });
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      const tableRef = `"${dto.schema}"."${dto.table}"`;

      // Total count — use a sub-select so WHERE is applied
      const countSql = `SELECT COUNT(*) FROM ${tableRef} ${whereClause}`;
      const countResult = await client.query(countSql, params);
      const totalCount = parseInt(countResult.rows[0].count as string, 10);

      // Paginated data
      params.push(pageSize, offset);
      const dataSql = `
        SELECT * FROM ${tableRef}
        ${whereClause}
        ${orderClause}
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;
      const dataResult = await client.query({ text: dataSql, values: params, rowMode: 'array' });

      const columns = dataResult.fields.map((f) => ({
        name: f.name,
        dataTypeId: f.dataTypeID,
      }));

      const rows: Record<string, unknown>[] = dataResult.rows.map((row) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col, i) => { obj[col.name] = row[i]; });
        return obj;
      });

      return { columns, rows, totalCount, page, pageSize };
    } finally {
      client.release();
    }
  }

  async previewChanges(dto: PreviewChangesRequest): Promise<PreviewChangesResponse> {
    this.validateIdentifier(dto.changes[0]?.schema ?? 'public', 'schema');
    const statements: { sql: string; params: unknown[] }[] = [];

    for (const change of dto.changes) {
      this.validateIdentifier(change.schema, 'schema');
      this.validateIdentifier(change.table, 'table');
      const tableRef = `"${change.schema}"."${change.table}"`;

      if (change.type === 'insert') {
        const cols = Object.keys(change.after ?? {});
        const vals = Object.values(change.after ?? {});
        const placeholders = vals.map((_, i) => `$${i + 1}`);
        statements.push({
          sql: `INSERT INTO ${tableRef} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`,
          params: vals,
        });
      } else if (change.type === 'update') {
        const setCols = Object.keys(change.after ?? {});
        const setVals = Object.values(change.after ?? {});
        const pkCols = Object.keys(change.primaryKey ?? {});
        const pkVals = Object.values(change.primaryKey ?? {});
        const setClause = setCols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
        const whereClause = pkCols.map((c, i) => `"${c}" = $${setVals.length + i + 1}`).join(' AND ');
        statements.push({
          sql: `UPDATE ${tableRef} SET ${setClause} WHERE ${whereClause}`,
          params: [...setVals, ...pkVals],
        });
      } else if (change.type === 'delete') {
        const pkCols = Object.keys(change.primaryKey ?? {});
        const pkVals = Object.values(change.primaryKey ?? {});
        const whereClause = pkCols.map((c, i) => `"${c}" = $${i + 1}`).join(' AND ');
        statements.push({
          sql: `DELETE FROM ${tableRef} WHERE ${whereClause}`,
          params: pkVals,
        });
      }
    }

    return { statements };
  }

  async applyChanges(dto: ApplyTableChangesRequest): Promise<ApplyTableChangesResponse> {
    if (this.poolManager.getAccessMode(dto.connectionId) === 'read-only') {
      throw new ForbiddenException('Connection is in read-only mode. Table edits are not allowed.');
    }
    const pool = this.poolManager.getPool(dto.connectionId);
    if (!pool) throw new NotFoundException(`No active connection for id "${dto.connectionId}"`);

    const { statements } = await this.previewChanges({ connectionId: dto.connectionId, changes: dto.changes });
    let affectedRows = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const stmt of statements) {
        const result = await client.query(stmt.sql, stmt.params as unknown[]);
        affectedRows += result.rowCount ?? 0;
      }
      await client.query('COMMIT');
      return { status: 'success', affectedRows };
    } catch (err) {
      await client.query('ROLLBACK');
      return { status: 'error', affectedRows: 0, error: (err as Error).message };
    } finally {
      client.release();
    }
  }
}
