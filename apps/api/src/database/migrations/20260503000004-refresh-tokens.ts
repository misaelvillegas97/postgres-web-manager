import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshTokens20260503000004 implements MigrationInterface {
  name = 'RefreshTokens20260503000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS auth_refresh_tokens
      (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
          token_hash CHAR(64)    NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          revoked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user
      ON auth_refresh_tokens (user_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_active
      ON auth_refresh_tokens (token_hash)
      WHERE revoked_at IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS auth_refresh_tokens`);
  }
}
