import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropQueryHistory20260503000005 implements MigrationInterface {
  name = 'DropQueryHistory20260503000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS query_history`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
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
  }
}
