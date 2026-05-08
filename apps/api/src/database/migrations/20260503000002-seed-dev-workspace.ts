import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedDevWorkspace20260503000002 implements MigrationInterface {
  name = 'SeedDevWorkspace20260503000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasPasswordHash = await queryRunner.hasColumn(
      'users',
      'password_hash',
    );

    await queryRunner.query(`
      INSERT INTO workspaces (id, name, slug)
      VALUES ('00000000-0000-4000-8000-000000000001',
              'Development Workspace',
              'development')
      ON CONFLICT (id) DO UPDATE
          SET name       = EXCLUDED.name,
              slug       = EXCLUDED.slug,
              updated_at = NOW()
    `);

    if (hasPasswordHash) {
      await queryRunner.query(`
        INSERT INTO users (id, workspace_id, email, display_name, role, password_hash)
        VALUES ('00000000-0000-4000-8000-000000000101',
                '00000000-0000-4000-8000-000000000001',
                'admin@pgstudio.local',
                'Admin User',
                'OWNER',
                'pbkdf2-sha256$310000$dev-auth-seed-v1$a86JLRoEH3UNTahi8fUaFRFA86V2fhPsYXQ9NTFXFxI'),
               ('00000000-0000-4000-8000-000000000102',
                '00000000-0000-4000-8000-000000000001',
                'dev@pgstudio.local',
                'Developer',
                'DEVELOPER',
                'pbkdf2-sha256$310000$dev-auth-seed-v1$a86JLRoEH3UNTahi8fUaFRFA86V2fhPsYXQ9NTFXFxI')
        ON CONFLICT (workspace_id, email) DO UPDATE
            SET display_name = EXCLUDED.display_name,
                role         = EXCLUDED.role,
                password_hash = EXCLUDED.password_hash,
                updated_at   = NOW()
      `);
      return;
    }

    await queryRunner.query(`
      INSERT INTO users (id, workspace_id, email, display_name, role)
      VALUES ('00000000-0000-4000-8000-000000000101',
              '00000000-0000-4000-8000-000000000001',
              'admin@pgstudio.local',
              'Admin User',
              'OWNER'),
             ('00000000-0000-4000-8000-000000000102',
              '00000000-0000-4000-8000-000000000001',
              'dev@pgstudio.local',
              'Developer',
              'DEVELOPER')
      ON CONFLICT (workspace_id, email) DO UPDATE
          SET display_name = EXCLUDED.display_name,
              role         = EXCLUDED.role,
              updated_at   = NOW()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM users
      WHERE id IN ('00000000-0000-4000-8000-000000000101',
                   '00000000-0000-4000-8000-000000000102')
    `);
    await queryRunner.query(`
      DELETE FROM workspaces
      WHERE id = '00000000-0000-4000-8000-000000000001'
    `);
  }
}
