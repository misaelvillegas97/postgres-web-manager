export interface ExplainRequest {
  connectionId: string;
  sql: string;
  analyze: boolean;
  buffers: boolean;
  format: 'json' | 'text';
}

export interface ExplainPlanNode {
  nodeType: string;
  relation?: string;
  schema?: string;
  alias?: string;
  startupCost: number;
  totalCost: number;
  planRows: number;
  planWidth: number;
  actualStartupTime?: number;
  actualTotalTime?: number;
  actualRows?: number;
  actualLoops?: number;
  sharedHitBlocks?: number;
  sharedReadBlocks?: number;
  children?: ExplainPlanNode[];
  extra?: Record<string, unknown>;
}

export interface ExplainResponse {
  queryId: string;
  format: 'json' | 'text';
  planningTimeMs?: number;
  executionTimeMs?: number;
  totalCost?: number;
  plan: ExplainPlanNode;
  raw: unknown;
}
