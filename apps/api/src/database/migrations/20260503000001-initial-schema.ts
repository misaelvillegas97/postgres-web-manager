import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema20260503000001 implements MigrationInterface {
  name = 'InitialSchema20260503000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(255) NOT NULL,
        slug        VARCHAR(100) NOT NULL UNIQUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        email         VARCHAR(320) NOT NULL,
        display_name  VARCHAR(255),
        role          VARCHAR(50) NOT NULL DEFAULT 'DEVELOPER'
                      CHECK (role IN ('OWNER', 'ADMIN', 'DEVELOPER', 'READ_ONLY')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(workspace_id, email)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS connection_profiles (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name                  VARCHAR(255) NOT NULL,
        host                  VARCHAR(255) NOT NULL,
        port                  INTEGER NOT NULL DEFAULT 5432,
        database              VARCHAR(255) NOT NULL,
        username              VARCHAR(255) NOT NULL,
        password_encrypted    TEXT,
        ssl_mode              VARCHAR(20) NOT NULL DEFAULT 'prefer'
                              CHECK (ssl_mode IN ('disable', 'prefer', 'require', 'verify-ca', 'verify-full')),
        access_mode           VARCHAR(10) NOT NULL DEFAULT 'read-write'
                              CHECK (access_mode IN ('read-only', 'read-write')),
        max_rows              INTEGER NOT NULL DEFAULT 1000,
        statement_timeout_ms  INTEGER NOT NULL DEFAULT 30000,
        save_password         BOOLEAN NOT NULL DEFAULT FALSE,
        color                 VARCHAR(7),
        notes                 TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS query_history (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id   UUID REFERENCES workspaces(id) ON DELETE SET NULL,
        connection_id  UUID REFERENCES connection_profiles(id) ON DELETE SET NULL,
        user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
        sql            TEXT NOT NULL,
        status         VARCHAR(20) NOT NULL DEFAULT 'success'
                       CHECK (status IN ('success', 'error', 'cancelled')),
        duration_ms    INTEGER,
        row_count      INTEGER,
        error_message  TEXT,
        error_code     VARCHAR(10),
        started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at       TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_query_history_connection
      ON query_history(connection_id, started_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_query_history_workspace
      ON query_history(workspace_id, started_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id   UUID REFERENCES workspaces(id) ON DELETE SET NULL,
        connection_id  UUID REFERENCES connection_profiles(id) ON DELETE SET NULL,
        user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
        action         VARCHAR(100) NOT NULL,
        risk_level     VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN'
                       CHECK (risk_level IN ('SAFE', 'WRITE', 'DDL', 'DESTRUCTIVE', 'ADMIN', 'UNKNOWN')),
        resource       TEXT,
        sql_preview    TEXT,
        metadata       JSONB,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace
      ON audit_logs(workspace_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_connection
      ON audit_logs(connection_id, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS query_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS connection_profiles`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
    await queryRunner.query(`DROP TABLE IF EXISTS workspaces`);
  }
}
