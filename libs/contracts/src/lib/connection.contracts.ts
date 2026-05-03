export enum ConnectionMode {
  DIRECT_GATEWAY = 'DIRECT_GATEWAY',
  READ_ONLY = 'READ_ONLY',
  TEMPORARY = 'TEMPORARY',
}

export interface ConnectionProfile {
  id: string;
  workspaceId: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  encryptedPassword?: string;
  sslMode: 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  defaultSchema?: string;
  accessMode: 'read-only' | 'read-write' | 'admin';
  statementTimeoutMs: number;
  maxRows: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectionDto {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  sslMode: 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  defaultSchema?: string;
  accessMode: 'read-only' | 'read-write' | 'admin';
  statementTimeoutMs?: number;
  maxRows?: number;
  savePassword?: boolean;
}

export interface TestConnectionDto {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
}

export interface TestConnectionResult {
  success: boolean;
  serverVersion?: string;
  latencyMs?: number;
  error?: string;
}
