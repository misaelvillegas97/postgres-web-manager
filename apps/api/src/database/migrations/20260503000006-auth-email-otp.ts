import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthEmailOtp20260503000006 implements MigrationInterface {
  name = 'AuthEmailOtp20260503000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ
    `);

    await queryRunner.query(`
      UPDATE users
      SET email_verified_at = COALESCE(email_verified_at, NOW()),
          updated_at        = NOW()
      WHERE email_verified_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS auth_email_otps
      (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id     UUID REFERENCES users (id) ON DELETE CASCADE,
          email       VARCHAR(320) NOT NULL,
          purpose     VARCHAR(32)  NOT NULL CHECK (purpose IN ('EMAIL_CONFIRMATION', 'PASSWORD_RESET')),
          code_hash   CHAR(64)     NOT NULL,
          attempts    INTEGER      NOT NULL DEFAULT 0,
          expires_at  TIMESTAMPTZ  NOT NULL,
          consumed_at TIMESTAMPTZ,
          created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_email_otps_active
      ON auth_email_otps (lower(email), purpose, created_at DESC)
      WHERE consumed_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_email_otps_user
      ON auth_email_otps (user_id, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS auth_email_otps`);
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS email_verified_at
    `);
  }
}
