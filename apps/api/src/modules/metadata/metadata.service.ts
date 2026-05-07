import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  DbColumn,
  DbConstraint,
  DbExtension,
  DbForeignKey,
  DbFunction,
  DbIndex,
  DbSchema,
  DbTable,
  TableDetail,
} from '@postgres-web-manager/contracts';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager';
import { ConnectionsService } from '../connections/connections.service';

type DbRow = Record<string, unknown>;

@Injectable()
export class MetadataService {
  constructor(
    private readonly poolManager: PostgresPoolManager,
    private readonly connectionsService: ConnectionsService,
  ) {}

  async getSchemas(
    connectionId: string,
    workspaceId?: string,
  ): Promise<DbSchema[]> {
    const client = await this.getClient(connectionId, workspaceId);
    try {
      const { rows } = await client.query<DbRow>(
        `SELECT schema_name AS name, schema_owner AS owner
         FROM information_schema.schemata
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
           AND schema_name NOT LIKE 'pg_temp_%'
           AND schema_name NOT LIKE 'pg_toast_temp_%'
         ORDER BY schema_name`,
      );
      return rows.map((r) => ({
        name: r['name'] as string,
        owner: r['owner'] as string,
      }));
    } finally {
      client.release();
    }
  }

  async getTables(
    connectionId: string,
    schema: string,
    workspaceId?: string,
  ): Promise<DbTable[]> {
    this.validateIdentifier(schema, 'schema');
    const client = await this.getClient(connectionId, workspaceId);
    try {
      const { rows } = await client.query<DbRow>(
        `SELECT
           t.table_schema AS schema,
           t.table_name AS name,
           CASE t.table_type
             WHEN 'VIEW' THEN 'view'
             ELSE 'table'
           END AS type,
           obj_description(
             (quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass,
             'pg_class'
           ) AS comment
         FROM information_schema.tables t
         WHERE t.table_schema = $1
           AND t.table_type IN ('BASE TABLE', 'VIEW')
         ORDER BY t.table_name`,
        [schema],
      );

      // Add materialized views
      const { rows: matViews } = await client.query<DbRow>(
        `SELECT schemaname AS schema, matviewname AS name, 'materialized_view' AS type
         FROM pg_matviews
         WHERE schemaname = $1
         ORDER BY matviewname`,
        [schema],
      );

      return [
        ...rows.map((r) => ({
          schema: r['schema'] as string,
          name: r['name'] as string,
          type: r['type'] as DbTable['type'],
          comment: r['comment'] as string | undefined,
        })),
        ...matViews.map((r) => ({
          schema: r['schema'] as string,
          name: r['name'] as string,
          type: 'materialized_view' as const,
        })),
      ];
    } finally {
      client.release();
    }
  }

  async getTableDetail(
    connectionId: string,
    schema: string,
    table: string,
    workspaceId?: string,
  ): Promise<TableDetail> {
    this.validateIdentifier(schema, 'schema');
    this.validateIdentifier(table, 'table');
    const client = await this.getClient(connectionId, workspaceId);

    try {
      // Columns
      const { rows: colRows } = await client.query<DbRow>(
        `SELECT
           c.column_name AS name,
           c.ordinal_position,
           c.data_type,
           c.is_nullable = 'YES' AS is_nullable,
           c.column_default AS default_value,
           c.character_maximum_length AS max_length,
           c.numeric_precision,
           c.numeric_scale,
           pgd.description AS comment,
           EXISTS (
             SELECT 1 FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND tc.table_schema = c.table_schema
               AND tc.table_name = c.table_name
               AND kcu.column_name = c.column_name
           ) AS is_primary_key,
           EXISTS (
             SELECT 1 FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
             WHERE tc.constraint_type = 'UNIQUE'
               AND tc.table_schema = c.table_schema
               AND tc.table_name = c.table_name
               AND kcu.column_name = c.column_name
           ) AS is_unique
         FROM information_schema.columns c
         LEFT JOIN pg_catalog.pg_statio_all_tables st
           ON st.schemaname = c.table_schema AND st.relname = c.table_name
         LEFT JOIN pg_catalog.pg_description pgd
           ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
         WHERE c.table_schema = $1 AND c.table_name = $2
         ORDER BY c.ordinal_position`,
        [schema, table],
      );

      // Indexes
      const { rows: idxRows } = await client.query<DbRow>(
        `SELECT
           i.relname AS name,
           ix.indisunique AS is_unique,
           ix.indisprimary AS is_primary,
           pg_get_indexdef(ix.indexrelid) AS definition,
           ARRAY(
             SELECT a.attname FROM pg_attribute a
             WHERE a.attrelid = ix.indrelid AND a.attnum = ANY(ix.indkey)
             ORDER BY a.attnum
           ) AS columns
         FROM pg_index ix
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = $1 AND t.relname = $2`,
        [schema, table],
      );

      // Constraints
      const { rows: conRows } = await client.query<DbRow>(
        `SELECT
           tc.constraint_name AS name,
           tc.constraint_type AS type,
           ARRAY_AGG(kcu.column_name ORDER BY kcu.ordinal_position) AS columns,
           pg_get_constraintdef(pgc.oid) AS definition
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
         JOIN pg_constraint pgc
           ON pgc.conname = tc.constraint_name
         WHERE tc.table_schema = $1 AND tc.table_name = $2
           AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'CHECK')
         GROUP BY tc.constraint_name, tc.constraint_type, pgc.oid`,
        [schema, table],
      );

      // Foreign keys
      const { rows: fkRows } = await client.query<DbRow>(
        `SELECT
           tc.constraint_name AS name,
           ARRAY_AGG(kcu.column_name ORDER BY kcu.position_in_unique_constraint) AS columns,
           ccu.table_schema AS referenced_schema,
           ccu.table_name AS referenced_table,
           ARRAY_AGG(ccu.column_name ORDER BY kcu.position_in_unique_constraint) AS referenced_columns,
           rc.update_rule AS on_update,
           rc.delete_rule AS on_delete
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
         JOIN information_schema.referential_constraints rc
           ON tc.constraint_name = rc.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON rc.unique_constraint_name = ccu.constraint_name
         WHERE tc.table_schema = $1 AND tc.table_name = $2
           AND tc.constraint_type = 'FOREIGN KEY'
         GROUP BY tc.constraint_name, ccu.table_schema, ccu.table_name, rc.update_rule, rc.delete_rule`,
        [schema, table],
      );

      const columns: DbColumn[] = colRows.map((r) => ({
        name: r['name'] as string,
        ordinalPosition: r['ordinal_position'] as number,
        dataType: r['data_type'] as string,
        isNullable: Boolean(r['is_nullable']),
        defaultValue: r['default_value'] as string | undefined,
        isPrimaryKey: Boolean(r['is_primary_key']),
        isUnique: Boolean(r['is_unique']),
        comment: r['comment'] as string | undefined,
        maxLength: r['max_length'] as number | undefined,
        numericPrecision: r['numeric_precision'] as number | undefined,
        numericScale: r['numeric_scale'] as number | undefined,
      }));

      const indexes: DbIndex[] = idxRows.map((r) => ({
        name: r['name'] as string,
        isUnique: Boolean(r['is_unique']),
        isPrimary: Boolean(r['is_primary']),
        columns: r['columns'] as string[],
        definition: r['definition'] as string | undefined,
      }));

      const constraints: DbConstraint[] = conRows.map((r) => ({
        name: r['name'] as string,
        type: r['type'] as DbConstraint['type'],
        columns: r['columns'] as string[],
        definition: r['definition'] as string | undefined,
      }));

      const foreignKeys: DbForeignKey[] = fkRows.map((r) => ({
        name: r['name'] as string,
        columns: r['columns'] as string[],
        referencedSchema: r['referenced_schema'] as string,
        referencedTable: r['referenced_table'] as string,
        referencedColumns: r['referenced_columns'] as string[],
        onUpdate: r['on_update'] as string,
        onDelete: r['on_delete'] as string,
      }));

      return {
        schema,
        name: table,
        columns,
        indexes,
        constraints,
        foreignKeys,
      };
    } finally {
      client.release();
    }
  }

  async getFunctions(
    connectionId: string,
    schema: string,
    workspaceId?: string,
  ): Promise<DbFunction[]> {
    this.validateIdentifier(schema, 'schema');
    const client = await this.getClient(connectionId, workspaceId);
    try {
      const { rows } = await client.query<DbRow>(
        `SELECT
           n.nspname AS schema,
           p.proname AS name,
           pg_get_function_result(p.oid) AS return_type,
           l.lanname AS language,
           CASE p.prokind
             WHEN 'f' THEN 'function'
             WHEN 'p' THEN 'procedure'
             WHEN 'a' THEN 'aggregate'
             ELSE 'function'
           END AS kind
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_language l ON l.oid = p.prolang
         WHERE n.nspname = $1
           AND p.prokind IN ('f', 'p', 'a')
         ORDER BY p.proname`,
        [schema],
      );
      return rows.map((r) => ({
        schema: r['schema'] as string,
        name: r['name'] as string,
        returnType: r['return_type'] as string,
        language: r['language'] as string,
        kind: r['kind'] as DbFunction['kind'],
      }));
    } finally {
      client.release();
    }
  }

  async getExtensions(
    connectionId: string,
    workspaceId?: string,
  ): Promise<DbExtension[]> {
    const client = await this.getClient(connectionId, workspaceId);
    try {
      const { rows } = await client.query<DbRow>(
        `SELECT
           e.extname AS name,
           e.extversion AS version,
           n.nspname AS schema,
           c.description
         FROM pg_extension e
         LEFT JOIN pg_namespace n ON n.oid = e.extnamespace
         LEFT JOIN pg_description c ON c.objoid = e.oid
         ORDER BY e.extname`,
      );
      return rows.map((r) => ({
        name: r['name'] as string,
        version: r['version'] as string,
        schema: r['schema'] as string | undefined,
        description: r['description'] as string | undefined,
      }));
    } finally {
      client.release();
    }
  }

  private async getClient(connectionId: string, workspaceId?: string) {
    await this.ensureConnectionAccess(connectionId, workspaceId);

    if (!this.poolManager.hasPool(connectionId)) {
      throw new UnprocessableEntityException(
        `No active pool for connection ${connectionId}. ` +
          `Call POST /connections/:id/unlock first.`,
      );
    }
    return this.poolManager.getClient(connectionId);
  }

  private async ensureConnectionAccess(
    connectionId: string,
    workspaceId?: string,
  ): Promise<void> {
    if (!workspaceId) return;
    await this.connectionsService.findOne(connectionId, workspaceId);
  }

  /** Validates that an identifier contains only safe characters to prevent injection. */
  private validateIdentifier(value: string, label: string): void {
    if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(value)) {
      throw new UnprocessableEntityException(
        `Invalid ${label} name: "${value}". Only alphanumeric characters and underscores are allowed.`,
      );
    }
  }
}
