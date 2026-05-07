import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplyTableChangesRequest,
  ApplyTableChangesResponse,
  ExportTableDataRequest,
  ExportTableDataResponse,
  ImportTableDataRequest,
  ImportTableDataResponse,
  PreviewChangesRequest,
  PreviewChangesResponse,
  ReadTableDataRequest,
  ReadTableDataResponse,
  TableDataFormat,
} from '@postgres-web-manager/contracts';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager.js';
import { ConnectionsService } from '../connections/connections.service';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 50_000;
const DEFAULT_EXPORT_ROWS = 10_000;
const MAX_IMPORT_ROWS = 10_000;
const MAX_IMPORT_CONTENT_BYTES = 8 * 1024 * 1024;
const IMPORT_BATCH_SIZE = 500;
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;

const ALLOWED_FILTER_OPERATORS = new Set([
  '=',
  '!=',
  '<>',
  '<',
  '>',
  '<=',
  '>=',
  'IS NULL',
  'IS NOT NULL',
  'LIKE',
  'ILIKE',
  'NOT LIKE',
  'NOT ILIKE',
  'IN',
  'NOT IN',
]);

@Injectable()
export class TableDataService {
  constructor(
    private readonly poolManager: PostgresPoolManager,
    private readonly connectionsService: ConnectionsService,
  ) {}

  async read(
    dto: ReadTableDataRequest,
    workspaceId?: string,
  ): Promise<ReadTableDataResponse> {
    const tableRef = this.getTableRef(dto.schema, dto.table);
    await this.ensureConnectionAccess(dto.connectionId, workspaceId);

    const page = Math.max(1, dto.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, dto.pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const offset = (page - 1) * pageSize;

    const pool = this.poolManager.getPool(dto.connectionId);
    if (!pool)
      throw new NotFoundException(
        `No active connection for id "${dto.connectionId}"`,
      );

    const client = await pool.connect();
    try {
      const params: unknown[] = [];
      const whereClause = this.buildWhereClause(dto.filters, params);
      const orderClause = this.buildOrderClause(dto.orderBy);

      const countResult = await client.query(
        `SELECT COUNT(*) FROM ${tableRef} ${whereClause}`,
        params,
      );
      const totalCount = parseInt(countResult.rows[0].count as string, 10);

      const dataParams = [...params, pageSize, offset];
      const dataSql = `
        SELECT * FROM ${tableRef}
        ${whereClause}
        ${orderClause}
        LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
      `;
      const dataResult = await client.query({
        text: dataSql,
        values: dataParams,
        rowMode: 'array',
      });

      const columns = dataResult.fields.map((f) => ({
        name: f.name,
        dataTypeId: f.dataTypeID,
      }));

      const rows: Record<string, unknown>[] = dataResult.rows.map((row) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          obj[col.name] = row[i];
        });
        return obj;
      });

      return { columns, rows, totalCount, page, pageSize };
    } finally {
      client.release();
    }
  }

  async exportData(
    dto: ExportTableDataRequest,
    workspaceId?: string,
  ): Promise<ExportTableDataResponse> {
    const tableRef = this.getTableRef(dto.schema, dto.table);
    const format = this.normalizeFormat(dto.format);
    await this.ensureConnectionAccess(dto.connectionId, workspaceId);

    const pool = this.poolManager.getPool(dto.connectionId);
    if (!pool)
      throw new NotFoundException(
        `No active connection for id "${dto.connectionId}"`,
      );

    const limit = Math.min(
      MAX_EXPORT_ROWS,
      Math.max(1, dto.limit ?? DEFAULT_EXPORT_ROWS),
    );
    const client = await pool.connect();
    try {
      const params: unknown[] = [];
      const whereClause = this.buildWhereClause(dto.filters, params);
      const orderClause = this.buildOrderClause(dto.orderBy);
      const exportParams = [...params, limit];
      const result = await client.query({
        text: `
          SELECT * FROM ${tableRef}
          ${whereClause}
          ${orderClause}
          LIMIT $${exportParams.length}
        `,
        values: exportParams,
        rowMode: 'array',
      });

      const columns = result.fields.map((field) => field.name);
      const rows = result.rows.map((row) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((column, index) => {
          obj[column] = row[index];
        });
        return obj;
      });

      const content =
        format === 'json'
          ? JSON.stringify(rows, null, 2)
          : this.stringifyCsv(columns, rows);

      return {
        format,
        fileName: this.buildExportFileName(dto.schema, dto.table, format),
        mimeType: format === 'json' ? 'application/json' : 'text/csv',
        content,
        rowCount: rows.length,
      };
    } finally {
      client.release();
    }
  }

  async importData(
    dto: ImportTableDataRequest,
    workspaceId?: string,
  ): Promise<ImportTableDataResponse> {
    const tableRef = this.getTableRef(dto.schema, dto.table);
    const format = this.normalizeFormat(dto.format);
    const mode = dto.mode ?? 'insert';
    if (mode !== 'insert' && mode !== 'upsert') {
      throw new BadRequestException(`Unsupported import mode "${mode}"`);
    }
    if (
      Buffer.byteLength(dto.content ?? '', 'utf8') > MAX_IMPORT_CONTENT_BYTES
    ) {
      throw new BadRequestException(
        `Import content exceeds ${MAX_IMPORT_CONTENT_BYTES} bytes`,
      );
    }

    await this.ensureConnectionAccess(dto.connectionId, workspaceId);
    if (
      !dto.dryRun &&
      this.poolManager.getAccessMode(dto.connectionId) === 'read-only'
    ) {
      throw new ForbiddenException(
        'Connection is in read-only mode. Table imports are not allowed.',
      );
    }

    const rows =
      format === 'json'
        ? this.parseJsonRows(dto.content)
        : this.parseCsvRows(dto.content);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `Import is limited to ${MAX_IMPORT_ROWS} rows per request`,
      );
    }
    const columns = this.getImportColumns(rows);
    if (rows.length > 0 && columns.length === 0) {
      throw new BadRequestException('Import requires at least one column');
    }

    const conflictColumns =
      mode === 'upsert'
        ? this.validateColumnList(dto.conflictColumns ?? [], 'conflict column')
        : [];
    if (mode === 'upsert' && conflictColumns.length === 0) {
      throw new BadRequestException('Upsert imports require conflictColumns');
    }

    const pool = this.poolManager.getPool(dto.connectionId);
    if (!pool)
      throw new NotFoundException(
        `No active connection for id "${dto.connectionId}"`,
      );

    const client = await pool.connect();
    try {
      const tableColumns = await this.getTableColumnNames(
        client,
        dto.schema,
        dto.table,
      );
      this.ensureKnownColumns(columns, tableColumns, 'import column');
      this.ensureKnownColumns(conflictColumns, tableColumns, 'conflict column');
      for (const column of conflictColumns) {
        if (!columns.includes(column)) {
          throw new BadRequestException(
            `Conflict column "${column}" must be present in imported rows`,
          );
        }
      }

      if (dto.dryRun || rows.length === 0) {
        return {
          status: 'success',
          rowCount: rows.length,
          affectedRows: 0,
          columns,
        };
      }

      let affectedRows = 0;
      let inTransaction = false;
      try {
        await client.query('BEGIN');
        inTransaction = true;
        for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
          const batch = rows.slice(i, i + IMPORT_BATCH_SIZE);
          const statement = this.buildImportStatement(
            tableRef,
            columns,
            batch,
            mode,
            conflictColumns,
          );
          const result = await client.query(statement.sql, statement.params);
          affectedRows += result.rowCount ?? 0;
        }
        await client.query('COMMIT');
        inTransaction = false;
        return {
          status: 'success',
          rowCount: rows.length,
          affectedRows,
          columns,
        };
      } catch (err) {
        if (inTransaction) {
          await client.query('ROLLBACK');
        }
        return {
          status: 'error',
          rowCount: rows.length,
          affectedRows: 0,
          columns,
          error: (err as Error).message,
        };
      }
    } finally {
      client.release();
    }
  }

  async previewChanges(
    dto: PreviewChangesRequest,
    workspaceId?: string,
  ): Promise<PreviewChangesResponse> {
    const statements: { sql: string; params: unknown[] }[] = [];

    for (const change of dto.changes) {
      const tableRef = this.getTableRef(change.schema, change.table);

      if (change.type === 'insert') {
        const cols = this.validateColumnList(
          Object.keys(change.after ?? {}),
          'insert column',
        );
        const vals = Object.values(change.after ?? {});
        const placeholders = vals.map((_, i) => `$${i + 1}`);
        if (cols.length === 0) {
          statements.push({
            sql: `INSERT INTO ${tableRef} DEFAULT VALUES`,
            params: [],
          });
          continue;
        }
        statements.push({
          sql: `INSERT INTO ${tableRef} (${cols.map((c) => this.quoteIdentifier(c)).join(', ')}) VALUES (${placeholders.join(', ')})`,
          params: vals,
        });
      } else if (change.type === 'update') {
        const setCols = this.validateColumnList(
          Object.keys(change.after ?? {}),
          'update column',
        );
        const setVals = Object.values(change.after ?? {});
        const pkCols = this.validateColumnList(
          Object.keys(change.primaryKey ?? {}),
          'primary key column',
        );
        const pkVals = Object.values(change.primaryKey ?? {});
        if (setCols.length === 0) {
          throw new BadRequestException(
            'Update changes require at least one column',
          );
        }
        if (pkCols.length === 0) {
          throw new BadRequestException('Update changes require a primary key');
        }
        const setClause = setCols
          .map((c, i) => `${this.quoteIdentifier(c)} = $${i + 1}`)
          .join(', ');
        const whereClause = pkCols
          .map(
            (c, i) => `${this.quoteIdentifier(c)} = $${setVals.length + i + 1}`,
          )
          .join(' AND ');
        statements.push({
          sql: `UPDATE ${tableRef} SET ${setClause} WHERE ${whereClause}`,
          params: [...setVals, ...pkVals],
        });
      } else if (change.type === 'delete') {
        const pkCols = this.validateColumnList(
          Object.keys(change.primaryKey ?? {}),
          'primary key column',
        );
        const pkVals = Object.values(change.primaryKey ?? {});
        if (pkCols.length === 0) {
          throw new BadRequestException('Delete changes require a primary key');
        }
        const whereClause = pkCols
          .map((c, i) => `${this.quoteIdentifier(c)} = $${i + 1}`)
          .join(' AND ');
        statements.push({
          sql: `DELETE FROM ${tableRef} WHERE ${whereClause}`,
          params: pkVals,
        });
      }
    }

    await this.ensureConnectionAccess(dto.connectionId, workspaceId);
    return { statements };
  }

  async applyChanges(
    dto: ApplyTableChangesRequest,
    workspaceId?: string,
  ): Promise<ApplyTableChangesResponse> {
    const { statements } = await this.previewChanges(
      { connectionId: dto.connectionId, changes: dto.changes },
      workspaceId,
    );

    if (this.poolManager.getAccessMode(dto.connectionId) === 'read-only') {
      throw new ForbiddenException(
        'Connection is in read-only mode. Table edits are not allowed.',
      );
    }
    const pool = this.poolManager.getPool(dto.connectionId);
    if (!pool)
      throw new NotFoundException(
        `No active connection for id "${dto.connectionId}"`,
      );

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
      return {
        status: 'error',
        affectedRows: 0,
        error: (err as Error).message,
      };
    } finally {
      client.release();
    }
  }

  private buildWhereClause(
    filters: ReadTableDataRequest['filters'],
    params: unknown[],
  ): string {
    if (!filters?.length) return '';
    const conditions = filters.map((f) => {
      const column = this.quoteIdentifier(f.column);
      const op = f.operator.toUpperCase();
      if (!ALLOWED_FILTER_OPERATORS.has(op)) {
        throw new BadRequestException(
          `Operator "${f.operator}" is not allowed`,
        );
      }
      if (op === 'IS NULL' || op === 'IS NOT NULL') {
        return `${column} ${op}`;
      }
      if (op === 'IN' || op === 'NOT IN') {
        const values = Array.isArray(f.value) ? f.value : [f.value];
        if (values.length === 0) {
          throw new BadRequestException(
            `${op} filters require at least one value`,
          );
        }
        const placeholders = values.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${column} ${op} (${placeholders.join(', ')})`;
      }
      params.push(f.value);
      return `${column} ${op} $${params.length}`;
    });
    return `WHERE ${conditions.join(' AND ')}`;
  }

  private buildOrderClause(orderBy: ReadTableDataRequest['orderBy']): string {
    if (!orderBy?.length) return '';
    const parts = orderBy.map((o) => {
      const column = this.quoteIdentifier(o.column);
      const dir = o.direction === 'DESC' ? 'DESC' : 'ASC';
      return `${column} ${dir}`;
    });
    return `ORDER BY ${parts.join(', ')}`;
  }

  private buildImportStatement(
    tableRef: string,
    columns: string[],
    rows: Record<string, unknown>[],
    mode: 'insert' | 'upsert',
    conflictColumns: string[],
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const columnRefs = columns.map((column) => this.quoteIdentifier(column));
    const tuples = rows.map((row) => {
      const placeholders = columns.map((column) => {
        params.push(row[column] ?? null);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    let sql = `INSERT INTO ${tableRef} (${columnRefs.join(', ')}) VALUES ${tuples.join(', ')}`;
    if (mode === 'upsert') {
      const conflictRefs = conflictColumns.map((column) =>
        this.quoteIdentifier(column),
      );
      const updateColumns = columns.filter(
        (column) => !conflictColumns.includes(column),
      );
      if (updateColumns.length === 0) {
        sql += ` ON CONFLICT (${conflictRefs.join(', ')}) DO NOTHING`;
      } else {
        const updateClause = updateColumns
          .map(
            (column) =>
              `${this.quoteIdentifier(column)} = EXCLUDED.${this.quoteIdentifier(column)}`,
          )
          .join(', ');
        sql += ` ON CONFLICT (${conflictRefs.join(', ')}) DO UPDATE SET ${updateClause}`;
      }
    }

    return { sql, params };
  }

  private stringifyCsv(
    columns: string[],
    rows: Record<string, unknown>[],
  ): string {
    const lines = [
      columns.map((column) => this.escapeCsvValue(column)).join(','),
    ];
    for (const row of rows) {
      lines.push(
        columns.map((column) => this.escapeCsvValue(row[column])).join(','),
      );
    }
    return `${lines.join('\r\n')}\r\n`;
  }

  private parseCsvRows(content: string): Record<string, unknown>[] {
    const records = this.parseCsvRecords(content);
    if (records.length === 0) {
      throw new BadRequestException('CSV import requires a header row');
    }

    const headers = records[0].map((header, index) => {
      const normalized = index === 0 ? header.replace(/^\uFEFF/, '') : header;
      return normalized.trim();
    });
    if (headers.some((header) => header.length === 0)) {
      throw new BadRequestException('CSV header contains empty column names');
    }
    this.validateNoDuplicateColumns(headers);
    this.validateColumnList(headers, 'CSV column');

    return records
      .slice(1)
      .filter((record) => record.some((value) => value.length > 0))
      .map((record) => {
        const row: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          row[header] = record[index] ?? '';
        });
        return row;
      });
  }

  private parseCsvRecords(content: string): string[][] {
    const records: string[][] = [];
    let record: string[] = [];
    let field = '';
    let inQuotes = false;

    const finishRecord = () => {
      record.push(field);
      field = '';
      records.push(record);
      record = [];
    };

    for (let i = 0; i < content.length; i += 1) {
      const char = content[i];
      if (inQuotes) {
        if (char === '"') {
          if (content[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"' && field.length === 0) {
        inQuotes = true;
      } else if (char === ',') {
        record.push(field);
        field = '';
      } else if (char === '\n') {
        finishRecord();
      } else if (char === '\r') {
        if (content[i + 1] === '\n') {
          i += 1;
        }
        finishRecord();
      } else {
        field += char;
      }
    }

    if (inQuotes) {
      throw new BadRequestException(
        'CSV import has an unterminated quoted field',
      );
    }

    const endedWithLineBreak = content.endsWith('\n') || content.endsWith('\r');
    if (field.length > 0 || record.length > 0 || !endedWithLineBreak) {
      finishRecord();
    }

    return records;
  }

  private parseJsonRows(content: string): Record<string, unknown>[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new BadRequestException('JSON import content is not valid JSON');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException(
        'JSON import content must be an array of objects',
      );
    }

    return parsed.map((row, index) => {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) {
        throw new BadRequestException(
          `JSON import row ${index + 1} must be an object`,
        );
      }
      return row as Record<string, unknown>;
    });
  }

  private getImportColumns(rows: Record<string, unknown>[]): string[] {
    const columns: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      for (const column of Object.keys(row)) {
        if (!seen.has(column)) {
          seen.add(column);
          columns.push(column);
        }
      }
    }
    this.validateColumnList(columns, 'import column');
    return columns;
  }

  private async getTableColumnNames(
    client: {
      query: (
        sql: string,
        params?: unknown[],
      ) => Promise<{ rows: { column_name: string }[] }>;
    },
    schema: string,
    table: string,
  ): Promise<Set<string>> {
    const result = await client.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `,
      [schema, table],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(
        `Table "${schema}"."${table}" was not found or has no importable columns`,
      );
    }
    return new Set(result.rows.map((row) => row.column_name));
  }

  private ensureKnownColumns(
    columns: string[],
    knownColumns: Set<string>,
    label: string,
  ): void {
    for (const column of columns) {
      if (!knownColumns.has(column)) {
        throw new BadRequestException(`Unknown ${label}: "${column}"`);
      }
    }
  }

  private validateNoDuplicateColumns(columns: string[]): void {
    const seen = new Set<string>();
    for (const column of columns) {
      if (seen.has(column)) {
        throw new BadRequestException(
          `Duplicate column "${column}" in import content`,
        );
      }
      seen.add(column);
    }
  }

  private escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text =
      typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  private buildExportFileName(
    schema: string,
    table: string,
    format: TableDataFormat,
  ): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${schema}.${table}.${stamp}.${format}`;
  }

  private normalizeFormat(format?: string): TableDataFormat {
    if (!format || format === 'csv') return 'csv';
    if (format === 'json') return 'json';
    throw new BadRequestException(`Unsupported table data format "${format}"`);
  }

  private getTableRef(schema: string, table: string): string {
    return `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(table)}`;
  }

  private quoteIdentifier(name: string): string {
    this.validateIdentifier(name, 'identifier');
    return `"${name}"`;
  }

  private validateColumnList(columns: string[], label: string): string[] {
    for (const column of columns) {
      this.validateIdentifier(column, label);
    }
    return columns;
  }

  private validateIdentifier(name: string, label: string): void {
    if (!IDENTIFIER_RE.test(name)) {
      throw new BadRequestException(`Invalid ${label}: "${name}"`);
    }
  }

  private async ensureConnectionAccess(
    connectionId: string,
    workspaceId?: string,
  ): Promise<void> {
    if (!workspaceId) return;
    await this.connectionsService.findOne(connectionId, workspaceId);
  }
}
