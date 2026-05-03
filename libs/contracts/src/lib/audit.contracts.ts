import { SqlRiskLevel } from './query.contracts.js';

export interface AuditLogDto {
  id: string;
  workspaceId: string;
  connectionId: string;
  userId: string;
  action: 'QUERY_EXECUTE' | 'DDL_EXECUTE' | 'CONNECTION_CREATE' | 'CONNECTION_DELETE' | 'TABLE_EDIT';
  sqlPreview?: string;
  riskLevel: SqlRiskLevel;
  resource?: string;
  createdAt: string;
}

export interface AuditLogFilter {
  workspaceId?: string;
  connectionId?: string;
  userId?: string;
  riskLevel?: SqlRiskLevel;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
