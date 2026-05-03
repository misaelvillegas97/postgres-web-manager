import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

@Injectable()
export class DatabaseMigrationService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseMigrationService.name);

  constructor(private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.runMigrations();
  }

  private async runMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Ensure migrations tracking table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id         SERIAL      PRIMARY KEY,
          name       VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      const migrationsDir = path.join(__dirname, 'migrations');

      // Read migration files, sorted by name
      let files: string[];
      try {
        files = fs
          .readdirSync(migrationsDir)
          .filter((f) => f.endsWith('.sql'))
          .sort();
      } catch {
        this.logger.warn(`Migrations directory not found at ${migrationsDir}, skipping.`);
        return;
      }

      for (const file of files) {
        const { rows } = await client.query(
          'SELECT id FROM _migrations WHERE name = $1',
          [file],
        );
        if (rows.length > 0) {
          this.logger.debug(`Migration ${file} already applied, skipping.`);
          continue;
        }

        this.logger.log(`Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO _migrations (name) VALUES ($1)',
            [file],
          );
          await client.query('COMMIT');
          this.logger.log(`Migration ${file} applied successfully.`);
        } catch (err) {
          await client.query('ROLLBACK');
          this.logger.error(`Migration ${file} failed, rolled back.`, err);
          throw err;
        }
      }
    } finally {
      client.release();
    }
  }
}
