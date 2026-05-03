import {
  Component,
  inject,
  signal,
  Input,
  computed,
  OnChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ExplainService } from '../../../../core/services/explain.service';
import { ToastService } from '../../../../core/services/toast.service';
import { PlanTreeComponent } from './plan-tree.component';
import { ExplainPlanNode, ExplainResponse } from '@postgres-web-manager/contracts';

interface PlanWarning {
  type: 'bad-estimate' | 'high-cost' | 'seq-scan' | 'disk-read';
  message: string;
  severity: 'warn' | 'crit';
}

@Component({
  selector: 'app-query-analyzer',
  standalone: true,
  imports: [FormsModule, DecimalPipe, PlanTreeComponent],
  template: `
    <div class="analyzer">
      <!-- Toolbar -->
      <div class="analyzer__bar">
        <div class="bar-left">
          <label class="opt-label">
            <input type="checkbox" [(ngModel)]="analyze" />
            ANALYZE
          </label>
          <label class="opt-label">
            <input type="checkbox" [(ngModel)]="buffers" [disabled]="!analyze" />
            BUFFERS
          </label>
          @if (analyze) {
            <span class="warn-tip">⚠ ANALYZE will execute the query</span>
          }
        </div>
        <div class="bar-right">
          <button
            class="btn btn--primary btn--sm"
            (click)="run()"
            [disabled]="loading() || !sql.trim()"
          >
            @if (loading()) { <span class="spinner"></span> Analyzing… }
            @else { ▶ Explain }
          </button>
        </div>
      </div>

      @if (!result() && !loading() && !error()) {
        <div class="analyzer__empty">
          <div class="analyzer__empty-icon">🔍</div>
          <p>Paste or select a query in the SQL Editor, then click <strong>Explain</strong>.</p>
          <p class="text-muted">Enable <em>ANALYZE</em> for real execution stats (runs the query).</p>
        </div>
      }

      @if (loading()) {
        <div class="analyzer__empty">
          <span class="spinner spinner--lg"></span>
          <p class="text-muted">Running EXPLAIN…</p>
        </div>
      }

      @if (error() && !loading()) {
        <div class="analyzer__error">
          <span class="error-icon">✘</span>
          <div class="error-body">
            <div class="error-msg">{{ error() }}</div>
          </div>
        </div>
      }

      @if (result() && !loading()) {
        <!-- Summary bar -->
        <div class="analyzer__summary">
          <div class="summary-card">
            <div class="summary-card__label">Total Cost</div>
            <div class="summary-card__value" [class.text-warn]="totalCost() > 1000" [class.text-crit]="totalCost() > 10000">
              {{ totalCost() | number:'1.0-2' }}
            </div>
          </div>
          @if (result()!.planningTimeMs !== undefined) {
            <div class="summary-card">
              <div class="summary-card__label">Planning</div>
              <div class="summary-card__value">{{ result()!.planningTimeMs | number:'1.2-2' }}ms</div>
            </div>
          }
          @if (result()!.executionTimeMs !== undefined) {
            <div class="summary-card">
              <div class="summary-card__label">Execution</div>
              <div class="summary-card__value" [class.text-warn]="(result()!.executionTimeMs ?? 0) > 500">
                {{ result()!.executionTimeMs | number:'1.2-2' }}ms
              </div>
            </div>
          }
          @if (result()!.executionTimeMs !== undefined && result()!.planningTimeMs !== undefined) {
            <div class="summary-card">
              <div class="summary-card__label">Total time</div>
              <div class="summary-card__value">
                {{ (result()!.executionTimeMs! + result()!.planningTimeMs!) | number:'1.2-2' }}ms
              </div>
            </div>
          }
        </div>

        <!-- Warnings -->
        @if (warnings().length) {
          <div class="analyzer__warnings">
            @for (w of warnings(); track $index) {
              <div class="warning-pill" [class.warning-pill--crit]="w.severity === 'crit'">
                <span>@if (w.severity === 'crit') {⛔} @else {⚠}</span>
                <span>{{ w.message }}</span>
              </div>
            }
          </div>
        }

        <!-- Plan tree -->
        <div class="analyzer__tree">
          <div class="tree-header">
            <span class="tree-title">Execution Plan</span>
            <button class="btn-link" (click)="expandAll()">expand all</button>
            <span class="sep">·</span>
            <button class="btn-link" (click)="collapseAll()">collapse all</button>
          </div>
          <div class="tree-body">
            @if (result()!.plan) {
              <app-plan-tree
                [node]="result()!.plan"
                [maxCost]="totalCost()"
              />
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

    .analyzer {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    /* Toolbar */
    .analyzer__bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 14px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      gap: 12px;
      flex-wrap: wrap;
    }

    .bar-left { display: flex; align-items: center; gap: 16px; }
    .bar-right { display: flex; align-items: center; gap: 8px; }

    .opt-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      user-select: none;
    }

    .warn-tip {
      font-size: 11px;
      color: #f5a623;
      background: rgba(245,166,35,0.1);
      padding: 2px 8px;
      border-radius: 4px;
    }

    /* Empty / loading */
    .analyzer__empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--text-muted);
      font-size: 13px;
      text-align: center;
      padding: 32px;
    }

    .analyzer__empty-icon { font-size: 36px; opacity: 0.4; }

    .text-muted { color: var(--text-muted); }

    .spinner--lg {
      width: 24px;
      height: 24px;
      border-width: 3px;
    }

    /* Error */
    .analyzer__error {
      margin: 14px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: rgba(229, 62, 62, 0.08);
      border: 1px solid rgba(229, 62, 62, 0.35);
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 12px;
    }

    .error-icon { color: #e53e3e; font-size: 14px; flex-shrink: 0; }
    .error-msg  { color: var(--text-primary); font-family: var(--font-mono); white-space: pre-wrap; word-break: break-all; }

    /* Summary */
    .analyzer__summary {
      display: flex;
      gap: 1px;
      background: var(--border);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .summary-card {
      flex: 1;
      padding: 8px 14px;
      background: var(--bg-elevated);
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 80px;
    }

    .summary-card__label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .summary-card__value {
      font-size: 18px;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--text-primary);
    }

    .text-warn { color: #f5a623 !important; }
    .text-crit { color: #e53e3e !important; }

    /* Warnings */
    .analyzer__warnings {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 14px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .warning-pill {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: #f5a623;
      background: rgba(245,166,35,0.1);
      border: 1px solid rgba(245,166,35,0.3);
      padding: 3px 10px;
      border-radius: 20px;

      &--crit { color: #e53e3e; background: rgba(229,62,62,0.1); border-color: rgba(229,62,62,0.3); }
    }

    /* Tree */
    .analyzer__tree {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }

    .tree-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .tree-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      flex: 1;
    }

    .btn-link {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 11px;
      color: var(--accent);
      padding: 0;
      &:hover { text-decoration: underline; }
    }

    .sep { color: var(--text-muted); font-size: 11px; }

    .tree-body {
      flex: 1;
      overflow-y: auto;
      padding: 10px 14px;
    }
  `],
})
export class QueryAnalyzerComponent implements OnChanges {
  @Input({ required: true }) connectionId!: string;
  @Input() sql = '';

  private explainSvc = inject(ExplainService);
  private toast = inject(ToastService);

  analyze = false;
  buffers = false;

  loading = signal(false);
  error = signal<string | null>(null);
  result = signal<ExplainResponse | null>(null);

  totalCost = computed(() => this.result()?.plan?.totalCost ?? 0);

  warnings = computed<PlanWarning[]>(() => {
    const r = this.result();
    if (!r) return [];
    const warns: PlanWarning[] = [];
    this.collectWarnings(r.plan, warns);
    return warns;
  });

  ngOnChanges() {
    // Reset when sql changes
    this.result.set(null);
    this.error.set(null);
  }

  run() {
    const sqlText = this.sql.trim();
    if (!sqlText) { this.toast.error('No SQL to explain'); return; }

    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);

    this.explainSvc.explain({
      connectionId: this.connectionId,
      sql: sqlText,
      analyze: this.analyze,
      buffers: this.buffers && this.analyze,
      format: 'json',
    }).subscribe({
      next: (res) => {
        this.result.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'EXPLAIN failed');
      },
    });
  }

  expandAll()   { this._setAllExpanded(true); }
  collapseAll() { this._setAllExpanded(false); }

  private _setAllExpanded(_val: boolean) {
    // Trigger re-render via signal re-assignment
    const r = this.result();
    if (r) { this.result.set(null); setTimeout(() => this.result.set(r), 0); }
  }

  private collectWarnings(node: ExplainPlanNode, out: PlanWarning[]) {
    if (!node) return;

    // High cost
    if (node.totalCost > 10_000) {
      out.push({ type: 'high-cost', severity: 'crit', message: `High cost node: ${node.nodeType} (cost ${node.totalCost.toFixed(0)})` });
    } else if (node.totalCost > 1_000) {
      out.push({ type: 'high-cost', severity: 'warn', message: `Moderate cost: ${node.nodeType} (cost ${node.totalCost.toFixed(0)})` });
    }

    // Seq scan on large tables
    if (node.nodeType === 'Seq Scan' && (node.actualRows ?? node.planRows) > 1000) {
      out.push({ type: 'seq-scan', severity: 'warn', message: `Seq Scan on ${node.relation ?? 'table'} — consider adding an index` });
    }

    // Bad row estimate
    if (node.actualRows !== undefined && node.planRows > 0) {
      const factor = node.actualRows / node.planRows;
      if (factor > 10 || (factor < 0.1 && node.planRows > 10)) {
        out.push({ type: 'bad-estimate', severity: 'warn', message: `Row estimate mismatch on ${node.nodeType}: planned ${node.planRows}, actual ${node.actualRows}` });
      }
    }

    // Disk reads
    if ((node.sharedReadBlocks ?? 0) > 1000) {
      out.push({ type: 'disk-read', severity: 'crit', message: `High disk reads: ${node.sharedReadBlocks} blocks on ${node.nodeType}` });
    } else if ((node.sharedReadBlocks ?? 0) > 100) {
      out.push({ type: 'disk-read', severity: 'warn', message: `Disk reads: ${node.sharedReadBlocks} blocks on ${node.nodeType}` });
    }

    node.children?.forEach((child) => this.collectWarnings(child, out));
  }
}
