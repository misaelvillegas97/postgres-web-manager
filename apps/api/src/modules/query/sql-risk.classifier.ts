import { SqlRiskLevel } from '@postgres-web-manager/contracts';

/**
 * Classifies the risk level of a SQL statement without executing it.
 * Uses keyword pattern matching on the normalized first token.
 *
 * Risk levels (ascending severity):
 *  SAFE        — read-only queries (SELECT, EXPLAIN without ANALYZE, SHOW, etc.)
 *  WRITE       — data modification (INSERT, UPDATE, DELETE, MERGE)
 *  DDL         — schema modification (CREATE, ALTER, COMMENT, REFRESH MATERIALIZED VIEW)
 *  DESTRUCTIVE — irreversible or high-impact (DROP, TRUNCATE, VACUUM FULL, REINDEX)
 *  ADMIN       — server administration (GRANT, REVOKE, CREATE ROLE, etc.)
 *  UNKNOWN     — unrecognized or empty statement
 */
export function classifyRisk(sql: string): SqlRiskLevel {
  const trimmed = sql.trim();
  if (!trimmed) {
    return SqlRiskLevel.UNKNOWN;
  }

  // Normalize: collapse whitespace, uppercase
  const normalized = trimmed.replace(/\s+/g, ' ').toUpperCase();

  // EXPLAIN ANALYZE actually executes the query → treat as same risk as wrapped query
  // Matches both: EXPLAIN ANALYZE ... and EXPLAIN (ANALYZE ...) and EXPLAIN (FORMAT JSON, ANALYZE ...)
  if (/^EXPLAIN\s+(?:ANALYZE\b|\((?:[^)]*,\s*)?ANALYZE\b)/.test(normalized)) {
    return SqlRiskLevel.WRITE;
  }

  // EXPLAIN without ANALYZE is SAFE
  if (/^EXPLAIN\b/.test(normalized)) {
    return SqlRiskLevel.SAFE;
  }

  const firstToken = normalized.split(/[\s(;]/)[0];

  switch (firstToken) {
    // SAFE
    case 'SELECT':
    case 'SHOW':
    case 'TABLE': // TABLE foo → equivalent to SELECT * FROM foo
    case 'VALUES':
    case 'WITH': // CTEs may contain writes, conservative fallback below
      return classifyWithCte(normalized);

    // WRITE
    case 'INSERT':
    case 'UPDATE':
    case 'DELETE':
    case 'MERGE':
    case 'UPSERT':
    case 'COPY': // COPY can read or write, treat as WRITE
      return SqlRiskLevel.WRITE;

    // DDL
    case 'CREATE':
      return classifyCreate(normalized);
    case 'ALTER':
    case 'COMMENT':
    case 'RENAME':
      return SqlRiskLevel.DDL;

    // DESTRUCTIVE
    case 'DROP':
    case 'TRUNCATE':
    case 'VACUUM':
    case 'REINDEX':
    case 'CLUSTER':
      return SqlRiskLevel.DESTRUCTIVE;

    // ADMIN
    case 'GRANT':
    case 'REVOKE':
    case 'REASSIGN':
    case 'SECURITY':
    case 'SET': // SET search_path etc — could be side-effecting, treat as admin
    case 'RESET':
    case 'LOAD':
      return SqlRiskLevel.ADMIN;

    // Transaction control — context-dependent; treat as SAFE for classification
    case 'BEGIN':
    case 'START':
    case 'COMMIT':
    case 'ROLLBACK':
    case 'SAVEPOINT':
    case 'RELEASE':
      return SqlRiskLevel.SAFE;

    default:
      return SqlRiskLevel.UNKNOWN;
  }
}

/** CTEs (WITH) may contain INSERT, UPDATE, DELETE — check inner keywords */
function classifyWithCte(normalized: string): SqlRiskLevel {
  if (/\b(INSERT|UPDATE|DELETE|MERGE)\b/.test(normalized)) {
    return SqlRiskLevel.WRITE;
  }
  if (/\b(DROP|TRUNCATE)\b/.test(normalized)) {
    return SqlRiskLevel.DESTRUCTIVE;
  }
  return SqlRiskLevel.SAFE;
}

/** CREATE INDEX/TABLE/VIEW = DDL; CREATE OR REPLACE FUNCTION, etc. = DDL */
function classifyCreate(normalized: string): SqlRiskLevel {
  // CREATE DATABASE / CREATE TABLESPACE / CREATE ROLE / CREATE USER = ADMIN
  if (/^CREATE\s+(DATABASE|TABLESPACE|ROLE|USER|GROUP|SCHEMA)\b/.test(normalized)) {
    return SqlRiskLevel.ADMIN;
  }
  return SqlRiskLevel.DDL;
}
