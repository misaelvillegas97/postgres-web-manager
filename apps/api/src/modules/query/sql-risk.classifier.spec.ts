import { classifyRisk } from './sql-risk.classifier';
import { SqlRiskLevel } from '@postgres-web-manager/contracts';

describe('classifyRisk', () => {
  describe('SAFE statements', () => {
    it('classifies SELECT', () => {
      expect(classifyRisk('SELECT 1')).toBe(SqlRiskLevel.SAFE);
      expect(classifyRisk('  select * from users  ')).toBe(SqlRiskLevel.SAFE);
    });

    it('classifies EXPLAIN (no ANALYZE)', () => {
      expect(classifyRisk('EXPLAIN SELECT * FROM users')).toBe(SqlRiskLevel.SAFE);
      expect(classifyRisk('EXPLAIN (FORMAT JSON) SELECT 1')).toBe(SqlRiskLevel.SAFE);
    });

    it('classifies SHOW', () => {
      expect(classifyRisk('SHOW search_path')).toBe(SqlRiskLevel.SAFE);
    });

    it('classifies TABLE shorthand', () => {
      expect(classifyRisk('TABLE users')).toBe(SqlRiskLevel.SAFE);
    });

    it('classifies WITH CTE without writes as SAFE', () => {
      expect(classifyRisk('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe(SqlRiskLevel.SAFE);
    });

    it('classifies transaction control as SAFE', () => {
      expect(classifyRisk('BEGIN')).toBe(SqlRiskLevel.SAFE);
      expect(classifyRisk('COMMIT')).toBe(SqlRiskLevel.SAFE);
      expect(classifyRisk('ROLLBACK')).toBe(SqlRiskLevel.SAFE);
    });
  });

  describe('WRITE statements', () => {
    it('classifies INSERT', () => {
      expect(classifyRisk("INSERT INTO users (name) VALUES ('Alice')")).toBe(SqlRiskLevel.WRITE);
    });

    it('classifies UPDATE', () => {
      expect(classifyRisk('UPDATE users SET name = $1 WHERE id = $2')).toBe(SqlRiskLevel.WRITE);
    });

    it('classifies DELETE', () => {
      expect(classifyRisk('DELETE FROM users WHERE id = 1')).toBe(SqlRiskLevel.WRITE);
    });

    it('classifies MERGE', () => {
      expect(classifyRisk('MERGE INTO target USING source ON target.id = source.id WHEN MATCHED THEN UPDATE SET name = source.name')).toBe(SqlRiskLevel.WRITE);
    });

    it('classifies EXPLAIN ANALYZE as WRITE', () => {
      expect(classifyRisk('EXPLAIN ANALYZE SELECT * FROM users')).toBe(SqlRiskLevel.WRITE);
      expect(classifyRisk('EXPLAIN (ANALYZE, FORMAT JSON) SELECT 1')).toBe(SqlRiskLevel.WRITE);
    });

    it('classifies CTE with INSERT as WRITE', () => {
      expect(classifyRisk('WITH ins AS (INSERT INTO logs (msg) VALUES ($1) RETURNING id) SELECT * FROM ins')).toBe(SqlRiskLevel.WRITE);
    });
  });

  describe('DDL statements', () => {
    it('classifies CREATE TABLE', () => {
      expect(classifyRisk('CREATE TABLE foo (id SERIAL PRIMARY KEY)')).toBe(SqlRiskLevel.DDL);
    });

    it('classifies CREATE INDEX', () => {
      expect(classifyRisk('CREATE INDEX idx_users_email ON users(email)')).toBe(SqlRiskLevel.DDL);
    });

    it('classifies ALTER TABLE', () => {
      expect(classifyRisk('ALTER TABLE users ADD COLUMN bio TEXT')).toBe(SqlRiskLevel.DDL);
    });

    it('classifies COMMENT', () => {
      expect(classifyRisk("COMMENT ON TABLE users IS 'User accounts'")).toBe(SqlRiskLevel.DDL);
    });
  });

  describe('DESTRUCTIVE statements', () => {
    it('classifies DROP TABLE', () => {
      expect(classifyRisk('DROP TABLE users')).toBe(SqlRiskLevel.DESTRUCTIVE);
    });

    it('classifies DROP SCHEMA CASCADE', () => {
      expect(classifyRisk('DROP SCHEMA public CASCADE')).toBe(SqlRiskLevel.DESTRUCTIVE);
    });

    it('classifies TRUNCATE', () => {
      expect(classifyRisk('TRUNCATE TABLE audit_logs')).toBe(SqlRiskLevel.DESTRUCTIVE);
    });

    it('classifies VACUUM', () => {
      expect(classifyRisk('VACUUM FULL users')).toBe(SqlRiskLevel.DESTRUCTIVE);
    });
  });

  describe('ADMIN statements', () => {
    it('classifies GRANT', () => {
      expect(classifyRisk('GRANT SELECT ON users TO readonly_role')).toBe(SqlRiskLevel.ADMIN);
    });

    it('classifies REVOKE', () => {
      expect(classifyRisk('REVOKE ALL ON users FROM PUBLIC')).toBe(SqlRiskLevel.ADMIN);
    });

    it('classifies CREATE ROLE', () => {
      expect(classifyRisk('CREATE ROLE app_user LOGIN PASSWORD $1')).toBe(SqlRiskLevel.ADMIN);
    });

    it('classifies CREATE DATABASE', () => {
      expect(classifyRisk('CREATE DATABASE mydb')).toBe(SqlRiskLevel.ADMIN);
    });

    it('classifies SET', () => {
      expect(classifyRisk("SET search_path TO 'public'")).toBe(SqlRiskLevel.ADMIN);
    });
  });

  describe('UNKNOWN statements', () => {
    it('classifies empty string as UNKNOWN', () => {
      expect(classifyRisk('')).toBe(SqlRiskLevel.UNKNOWN);
      expect(classifyRisk('   ')).toBe(SqlRiskLevel.UNKNOWN);
    });

    it('classifies unrecognized statement as UNKNOWN', () => {
      expect(classifyRisk('FOOBAR x y z')).toBe(SqlRiskLevel.UNKNOWN);
    });
  });
});
