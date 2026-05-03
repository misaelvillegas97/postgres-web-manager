export interface PostgresClientConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  statementTimeoutMs?: number;
}

export function createClientConfig(config: PostgresClientConfig): Record<string, unknown> {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl,
    statement_timeout: config.statementTimeoutMs,
  };
}
