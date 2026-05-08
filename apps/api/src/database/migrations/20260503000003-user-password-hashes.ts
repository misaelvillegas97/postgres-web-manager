import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserPasswordHashes20260503000003 implements MigrationInterface {
  name = 'UserPasswordHashes20260503000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash TEXT
    `);

    await queryRunner.query(`
      UPDATE users
      SET password_hash = 'pbkdf2-sha256$310000$dev-auth-seed-v1$a86JLRoEH3UNTahi8fUaFRFA86V2fhPsYXQ9NTFXFxI'
      WHERE email IN ('admin@pgstudio.local', 'dev@pgstudio.local')
    `);

    await queryRunner.query(`
      UPDATE users
      SET password_hash = 'disabled'
      WHERE password_hash IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN password_hash SET NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS password_hash
    `);
  }
}
