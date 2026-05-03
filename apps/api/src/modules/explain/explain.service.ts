import {
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ExplainPlanNode,
  ExplainRequest,
  ExplainResponse,
} from '@postgres-web-manager/contracts';
import { v4 as uuidv4 } from 'uuid';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager';
import { classifyRisk } from '../query/sql-risk.classifier';
import { SqlRiskLevel } from '@postgres-web-manager/contracts';

@Injectable()
export class ExplainService {
  constructor(private readonly poolManager: PostgresPoolManager) {}

  async explain(dto: ExplainRequest): Promise<ExplainResponse> {
    const risk = classifyRisk(dto.sql);

    // EXPLAIN ANALYZE on destructive/DDL statements is dangerous — block it
    if (dto.analyze && risk !== SqlRiskLevel.SAFE) {
      throw new UnprocessableEntityException(
        `EXPLAIN ANALYZE is not allowed for ${risk} statements. ` +
          `Use analyze: false or wrap in a transaction with manual rollback.`,
      );
    }

    if (!this.poolManager.hasPool(dto.connectionId)) {
      throw new UnprocessableEntityException(
        `No active pool for connection ${dto.connectionId}. ` +
          `Call POST /connections/:id/unlock first.`,
      );
    }

    const client = await this.poolManager.getClient(dto.connectionId);
    try {
      const options: string[] = ['FORMAT JSON'];
      if (dto.analyze) options.push('ANALYZE');
      if (dto.buffers) options.push('BUFFERS');

      const explainSql = `EXPLAIN (${options.join(', ')}) ${dto.sql}`;
      const start = Date.now();
      const result = await client.query(explainSql);
      const durationMs = Date.now() - start;

      // PostgreSQL EXPLAIN JSON returns [{QUERY PLAN: [...]}]
      const raw = result.rows[0]?.['QUERY PLAN'] as unknown[];
      const planJson = Array.isArray(raw) ? raw[0] : raw;

      const plan = this.parsePlanNode(planJson as Record<string, unknown>);

      const planningTimeMs = (planJson as Record<string, number>)?.['Planning Time'];
      const executionTimeMs = (planJson as Record<string, number>)?.['Execution Time'];
      const totalCost = plan.totalCost;

      return {
        queryId: uuidv4(),
        format: 'json',
        planningTimeMs,
        executionTimeMs: dto.analyze ? executionTimeMs : undefined,
        totalCost,
        plan,
        raw: planJson,
      };
    } finally {
      client.release();
    }
  }

  private parsePlanNode(node: Record<string, unknown>): ExplainPlanNode {
    const plan = node['Plan'] as Record<string, unknown> | undefined ?? node;

    const children = (plan['Plans'] as Record<string, unknown>[] | undefined)?.map((child) =>
      this.parsePlanNode(child),
    );

    return {
      nodeType: plan['Node Type'] as string ?? 'Unknown',
      relation: plan['Relation Name'] as string | undefined,
      schema: plan['Schema'] as string | undefined,
      alias: plan['Alias'] as string | undefined,
      startupCost: (plan['Startup Cost'] as number) ?? 0,
      totalCost: (plan['Total Cost'] as number) ?? 0,
      planRows: (plan['Plan Rows'] as number) ?? 0,
      planWidth: (plan['Plan Width'] as number) ?? 0,
      actualStartupTime: plan['Actual Startup Time'] as number | undefined,
      actualTotalTime: plan['Actual Total Time'] as number | undefined,
      actualRows: plan['Actual Rows'] as number | undefined,
      actualLoops: plan['Actual Loops'] as number | undefined,
      sharedHitBlocks: plan['Shared Hit Blocks'] as number | undefined,
      sharedReadBlocks: plan['Shared Read Blocks'] as number | undefined,
      children: children?.length ? children : undefined,
      extra: this.extractExtra(plan),
    };
  }

  private extractExtra(plan: Record<string, unknown>): Record<string, unknown> | undefined {
    const knownKeys = new Set([
      'Node Type', 'Relation Name', 'Schema', 'Alias', 'Startup Cost', 'Total Cost',
      'Plan Rows', 'Plan Width', 'Actual Startup Time', 'Actual Total Time',
      'Actual Rows', 'Actual Loops', 'Shared Hit Blocks', 'Shared Read Blocks', 'Plans',
    ]);
    const extra: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(plan)) {
      if (!knownKeys.has(key)) extra[key] = val;
    }
    return Object.keys(extra).length > 0 ? extra : undefined;
  }
}
