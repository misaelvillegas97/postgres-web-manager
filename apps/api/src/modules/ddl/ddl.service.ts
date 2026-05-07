import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlterTableRequest,
  CreateTableColumn,
  CreateTableRequest,
  DdlExecuteResponse,
  DdlPreviewResponse,
} from '@postgres-web-manager/contracts';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager';
import { ConnectionsService } from '../connections/connections.service';

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;
const TYPE_RE = /^[a-z][a-z0-9_ ]*$/;
const ALLOWED_INDEX_METHODS = new Set(['btree', 'hash', 'gist', 'gin', 'brin']);
const ALLOWED_REFERENTIAL_ACTIONS = new Set([
  'NO ACTION',
  'RESTRICT',
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
]);

// Map of common short-form type aliases to full PG types
const TYPE_ALIASES: Record<string, string> = {
  int: 'integer',
  int2: 'smallint',
  int4: 'integer',
  int8: 'bigint',
  bool: 'boolean',
  float4: 'real',
  float8: 'double precision',
  serial: 'serial',
  bigserial: 'bigserial',
};

@Injectable()
export class DdlService {
  constructor(
    private readonly poolManager: PostgresPoolManager,
    private readonly connectionsService: ConnectionsService,
  ) {}

  // ── CREATE TABLE ────────────────────────────────────────────────────────────

  async previewCreateTable(
    dto: CreateTableRequest,
    workspaceId?: string,
  ): Promise<DdlPreviewResponse> {
    await this.ensureConnectionAccess(dto.connectionId, workspaceId);
    const sql = this.buildCreateTableSql(dto);
    const warnings = this.warnCreateTable(dto);
    return { sql, warnings };
  }

  async executeCreateTable(
    dto: CreateTableRequest,
    workspaceId?: string,
  ): Promise<DdlExecuteResponse> {
    await this.ensureConnectionAccess(dto.connectionId, workspaceId);
    if (this.poolManager.getAccessMode(dto.connectionId) === 'read-only') {
      throw new ForbiddenException(
        'Connection is in read-only mode. DDL operations are not allowed.',
      );
    }
    const sql = this.buildCreateTableSql(dto);
    return this.executeDdl(dto.connectionId, sql);
  }

  // ── ALTER TABLE ─────────────────────────────────────────────────────────────

  async previewAlterTable(
    dto: AlterTableRequest,
    workspaceId?: string,
  ): Promise<DdlPreviewResponse> {
    await this.ensureConnectionAccess(dto.connectionId, workspaceId);
    const statements = this.buildAlterTableStatements(dto);
    const sql = statements.join(';\n') + ';';
    const warnings = this.warnAlterTable(dto);
    return { sql, warnings };
  }

  async executeAlterTable(
    dto: AlterTableRequest,
    workspaceId?: string,
  ): Promise<DdlExecuteResponse> {
    await this.ensureConnectionAccess(dto.connectionId, workspaceId);
    if (this.poolManager.getAccessMode(dto.connectionId) === 'read-only') {
      throw new ForbiddenException(
        'Connection is in read-only mode. DDL operations are not allowed.',
      );
    }
    const statements = this.buildAlterTableStatements(dto);
    const sql = statements.join(';\n') + ';';
    return this.executeDdl(dto.connectionId, sql);
  }

  // ── SQL Builders ─────────────────────────────────────────────────────────────

  private buildCreateTableSql(dto: CreateTableRequest): string {
    this.validateId(dto.schema, 'schema');
    this.validateId(dto.tableName, 'table name');

    const tableRef = `"${dto.schema}"."${dto.tableName}"`;
    const lines: string[] = [];

    // Columns
    for (const col of dto.columns) {
      lines.push('  ' + this.columnDef(col));
    }

    // Primary Key inline constraint
    if (dto.primaryKey?.length) {
      dto.primaryKey.forEach((c) => this.validateId(c, 'primary key column'));
      const pkCols = dto.primaryKey.map((c) => `"${c}"`).join(', ');
      lines.push(
        `  CONSTRAINT "${dto.tableName}_pkey" PRIMARY KEY (${pkCols})`,
      );
    }

    // Unique constraints from column definitions
    for (const col of dto.columns) {
      if (col.unique && !(dto.primaryKey ?? []).includes(col.name)) {
        lines.push(
          `  CONSTRAINT "${dto.tableName}_${col.name}_key" UNIQUE ("${col.name}")`,
        );
      }
    }

    // Check constraints
    for (const chk of dto.checks ?? []) {
      const name =
        chk.name ??
        `${dto.tableName}_check_${Math.random().toString(36).slice(2, 7)}`;
      this.validateId(name, 'check constraint name');
      lines.push(`  CONSTRAINT "${name}" CHECK (${chk.expression})`);
    }

    // Foreign keys
    for (const fk of dto.foreignKeys ?? []) {
      fk.columns.forEach((c) => this.validateId(c, 'foreign key column'));
      this.validateId(fk.referencedSchema, 'referenced schema');
      this.validateId(fk.referencedTable, 'referenced table');
      fk.referencedColumns.forEach((c) =>
        this.validateId(c, 'referenced column'),
      );
      if (fk.name) this.validateId(fk.name, 'foreign key name');
      if (fk.onDelete) this.validateReferentialAction(fk.onDelete, 'onDelete');
      if (fk.onUpdate) this.validateReferentialAction(fk.onUpdate, 'onUpdate');

      const fkCols = fk.columns.map((c) => `"${c}"`).join(', ');
      const refCols = fk.referencedColumns.map((c) => `"${c}"`).join(', ');
      const name = fk.name ?? `${dto.tableName}_${fk.columns.join('_')}_fkey`;
      lines.push(
        `  CONSTRAINT "${name}" FOREIGN KEY (${fkCols}) ` +
          `REFERENCES "${fk.referencedSchema}"."${fk.referencedTable}" (${refCols})` +
          (fk.onDelete && fk.onDelete !== 'NO ACTION'
            ? ` ON DELETE ${fk.onDelete}`
            : '') +
          (fk.onUpdate && fk.onUpdate !== 'NO ACTION'
            ? ` ON UPDATE ${fk.onUpdate}`
            : ''),
      );
    }

    let sql = `CREATE TABLE ${tableRef} (\n${lines.join(',\n')}\n)`;

    // Table comment
    if (dto.comment) {
      sql += `;\nCOMMENT ON TABLE ${tableRef} IS '${dto.comment.replace(/'/g, "''")}'`;
    }

    // Indexes (outside the CREATE TABLE body)
    for (const idx of dto.indexes ?? []) {
      idx.columns.forEach((c) => this.validateId(c, 'index column'));
      if (idx.name) this.validateId(idx.name, 'index name');
      if (idx.method && !ALLOWED_INDEX_METHODS.has(idx.method)) {
        throw new BadRequestException(`Invalid index method: "${idx.method}"`);
      }
      const idxCols = idx.columns.map((c) => `"${c}"`).join(', ');
      const name = idx.name ?? `${dto.tableName}_${idx.columns.join('_')}_idx`;
      const unique = idx.unique ? 'UNIQUE ' : '';
      const method = idx.method ? ` USING ${idx.method}` : '';
      sql += `;\nCREATE ${unique}INDEX "${name}" ON ${tableRef}${method} (${idxCols})`;
    }

    return sql;
  }

  private buildAlterTableStatements(dto: AlterTableRequest): string[] {
    this.validateId(dto.schema, 'schema');
    this.validateId(dto.tableName, 'table name');

    const tableRef = `"${dto.schema}"."${dto.tableName}"`;
    const stmts: string[] = [];

    // Add columns
    for (const col of dto.addColumns ?? []) {
      stmts.push(`ALTER TABLE ${tableRef} ADD COLUMN ${this.columnDef(col)}`);
    }

    // Drop columns
    for (const colName of dto.dropColumns ?? []) {
      this.validateId(colName, 'column name');
      stmts.push(`ALTER TABLE ${tableRef} DROP COLUMN "${colName}"`);
    }

    // Rename columns
    for (const r of dto.renameColumns ?? []) {
      this.validateId(r.from, 'column name');
      this.validateId(r.to, 'column name');
      stmts.push(
        `ALTER TABLE ${tableRef} RENAME COLUMN "${r.from}" TO "${r.to}"`,
      );
    }

    // Alter column properties
    for (const alt of dto.alterColumns ?? []) {
      this.validateId(alt.name, 'column name');
      const colRef = `"${alt.name}"`;
      const chg = alt.changes;

      if (chg.type) {
        const typeSql = this.columnTypeSql({
          ...chg,
          name: alt.name,
        } as CreateTableColumn);
        stmts.push(
          `ALTER TABLE ${tableRef} ALTER COLUMN ${colRef} TYPE ${typeSql} USING ${colRef}::${typeSql}`,
        );
      }
      if (chg.nullable !== undefined) {
        stmts.push(
          `ALTER TABLE ${tableRef} ALTER COLUMN ${colRef} ${chg.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'}`,
        );
      }
      if (chg.defaultValue !== undefined) {
        if (chg.defaultValue === '' || chg.defaultValue === null) {
          stmts.push(
            `ALTER TABLE ${tableRef} ALTER COLUMN ${colRef} DROP DEFAULT`,
          );
        } else {
          stmts.push(
            `ALTER TABLE ${tableRef} ALTER COLUMN ${colRef} SET DEFAULT ${chg.defaultValue}`,
          );
        }
      }
    }

    return stmts;
  }

  private columnDef(col: CreateTableColumn): string {
    this.validateId(col.name, 'column name');
    const type = this.columnTypeSql(col);
    const notNull = col.nullable === false ? ' NOT NULL' : '';
    const def = col.defaultValue != null ? ` DEFAULT ${col.defaultValue}` : '';
    return `"${col.name}" ${type}${notNull}${def}`;
  }

  private columnTypeSql(
    col: Pick<
      CreateTableColumn,
      'type' | 'length' | 'precision' | 'scale' | 'identity'
    >,
  ): string {
    if (col.identity) return 'bigserial';
    const rawType = (col.type ?? 'text').toLowerCase();
    if (!TYPE_RE.test(rawType)) {
      throw new BadRequestException(`Invalid column type: "${col.type}"`);
    }
    const resolved = TYPE_ALIASES[rawType] ?? rawType;

    if (
      col.length &&
      [
        'character varying',
        'varchar',
        'char',
        'character',
        'bit',
        'varbit',
      ].includes(resolved)
    ) {
      return `${resolved}(${col.length})`;
    }
    if (col.precision != null && ['numeric', 'decimal'].includes(resolved)) {
      return col.scale != null
        ? `${resolved}(${col.precision}, ${col.scale})`
        : `${resolved}(${col.precision})`;
    }
    return resolved;
  }

  // ── Warnings ────────────────────────────────────────────────────────────────

  private warnCreateTable(dto: CreateTableRequest): string[] {
    const warns: string[] = [];
    if (!dto.primaryKey?.length) {
      const hasPkCol = dto.columns.some((c) => c.identity);
      if (!hasPkCol)
        warns.push(
          'No primary key defined — consider adding one for safe row identification.',
        );
    }
    return warns;
  }

  private warnAlterTable(dto: AlterTableRequest): string[] {
    const warns: string[] = [];
    if (dto.dropColumns?.length) {
      warns.push(
        `Dropping columns is irreversible. Affected: ${dto.dropColumns.join(', ')}.`,
      );
    }
    if (dto.alterColumns?.some((a) => a.changes.type)) {
      warns.push(
        'Changing column types may fail if existing data cannot be cast. A USING clause is generated but review before executing.',
      );
    }
    return warns;
  }

  // ── Execution ────────────────────────────────────────────────────────────────

  private async executeDdl(
    connectionId: string,
    sql: string,
  ): Promise<DdlExecuteResponse> {
    const pool = this.poolManager.getPool(connectionId);
    if (!pool)
      throw new NotFoundException(
        `No active connection for id "${connectionId}"`,
      );

    const client = await pool.connect();
    const start = Date.now();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      return { success: true, sql, durationMs: Date.now() - start };
    } catch (err) {
      await client.query('ROLLBACK');
      return {
        success: false,
        sql,
        durationMs: Date.now() - start,
        error: (err as Error).message,
      };
    } finally {
      client.release();
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private validateId(name: string, label: string): void {
    if (!IDENTIFIER_RE.test(name)) {
      throw new BadRequestException(`Invalid ${label}: "${name}"`);
    }
  }

  private validateReferentialAction(action: string, label: string): void {
    if (!ALLOWED_REFERENTIAL_ACTIONS.has(action)) {
      throw new BadRequestException(`Invalid ${label}: "${action}"`);
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
