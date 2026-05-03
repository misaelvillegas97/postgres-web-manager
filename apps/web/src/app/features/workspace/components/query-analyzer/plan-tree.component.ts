import { Component, Input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ExplainPlanNode } from '@postgres-web-manager/contracts';

/** Thresholds for cost/row warnings */
const COST_WARN = 1000;
const COST_CRIT = 10_000;
const ROW_DEVIATION = 10; // actualRows > planRows * this → bad estimate

@Component({
  selector: 'app-plan-tree',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="plan-node" [class.plan-node--expanded]="expanded()">

      <!-- Node header -->
      <div
        class="plan-node__header"
        [class.plan-node--warn]="costLevel() === 'warn'"
        [class.plan-node--crit]="costLevel() === 'crit'"
        (click)="expanded.set(!expanded())"
      >
        <span class="plan-node__toggle" [class.plan-node__toggle--open]="expanded()">›</span>

        <span class="plan-node__type" [class]="'node-type node-type--' + nodeClass()">
          {{ node.nodeType }}
        </span>

        @if (node.relation) {
          <span class="plan-node__rel">
            @if (node.schema) { <span class="plan-node__schema">{{ node.schema }}.</span> }{{ node.relation }}
            @if (node.alias && node.alias !== node.relation) { <em class="plan-node__alias"> ({{ node.alias }})</em> }
          </span>
        }

        <span class="plan-node__spacer"></span>

        <!-- Cost bar -->
        <span class="plan-node__cost" [class.text-warn]="costLevel() === 'warn'" [class.text-crit]="costLevel() === 'crit'">
          cost {{ node.startupCost | number:'1.0-1' }}..{{ node.totalCost | number:'1.0-1' }}
        </span>

        <!-- Rows -->
        <span class="plan-node__rows">
          <span class="plan-node__rows-est" title="Estimated rows">{{ node.planRows | number }}</span>
          @if (node.actualRows !== undefined) {
            <span class="plan-node__rows-sep">→</span>
            <span
              class="plan-node__rows-actual"
              [class.text-warn]="rowDeviation()"
              title="Actual rows"
            >{{ node.actualRows | number }}</span>
          }
        </span>

        @if (node.actualTotalTime !== undefined) {
          <span class="plan-node__time">{{ node.actualTotalTime | number:'1.2-2' }}ms</span>
        }

        @if (costLevel() === 'crit') {
          <span class="badge badge--danger" title="High cost node">⚠ critical</span>
        } @else if (costLevel() === 'warn') {
          <span class="badge badge--warn" title="Moderate cost">⚠ slow</span>
        }
      </div>

      <!-- Expanded body -->
      @if (expanded()) {
        <div class="plan-node__body">

          <!-- Stats grid -->
          <div class="plan-stats">
            @if (node.actualTotalTime !== undefined) {
              <div class="plan-stat">
                <span class="plan-stat__label">Actual time</span>
                <span class="plan-stat__value">
                  {{ node.actualStartupTime | number:'1.2-2' }}ms → {{ node.actualTotalTime | number:'1.2-2' }}ms
                </span>
              </div>
            }
            @if (node.actualLoops !== undefined) {
              <div class="plan-stat">
                <span class="plan-stat__label">Loops</span>
                <span class="plan-stat__value">{{ node.actualLoops }}</span>
              </div>
            }
            @if (node.planWidth) {
              <div class="plan-stat">
                <span class="plan-stat__label">Row width</span>
                <span class="plan-stat__value">{{ node.planWidth }} bytes</span>
              </div>
            }
            @if (node.sharedHitBlocks !== undefined) {
              <div class="plan-stat">
                <span class="plan-stat__label">Buf hit</span>
                <span class="plan-stat__value">{{ node.sharedHitBlocks }}</span>
              </div>
            }
            @if (node.sharedReadBlocks !== undefined) {
              <div class="plan-stat">
                <span class="plan-stat__label">Buf read</span>
                <span class="plan-stat__value highlight-read"
                  [class.text-warn]="(node.sharedReadBlocks || 0) > 500"
                >{{ node.sharedReadBlocks }}</span>
              </div>
            }
            @if (rowDeviation()) {
              <div class="plan-stat plan-stat--warn">
                <span class="plan-stat__label">Row estimate</span>
                <span class="plan-stat__value text-warn">
                  {{ node.planRows }} planned vs {{ node.actualRows }} actual
                  ({{ rowDeviationFactor() }}×)
                </span>
              </div>
            }
          </div>

          <!-- Extra fields (e.g. Index Name, Filter, etc.) -->
          @if (node.extra) {
            <div class="plan-extra">
              @for (entry of extraEntries(); track entry.key) {
                <div class="plan-extra__row">
                  <span class="plan-extra__key">{{ entry.key }}</span>
                  <span class="plan-extra__val">{{ entry.value }}</span>
                </div>
              }
            </div>
          }

          <!-- Children -->
          @if (node.children?.length) {
            <div class="plan-children">
              @for (child of node.children; track $index) {
                <app-plan-tree [node]="child" [maxCost]="maxCost" />
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .plan-node {
      border-radius: 5px;
      overflow: hidden;
      margin-bottom: 2px;
    }

    .plan-node__header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 5px;
      cursor: pointer;
      user-select: none;
      transition: background 0.1s;
      font-size: 12px;
      flex-wrap: nowrap;
      overflow: hidden;

      &:hover { background: var(--bg-hover); }
    }

    .plan-node--warn > .plan-node__header { border-left: 3px solid #f5a623; }
    .plan-node--crit > .plan-node__header { border-left: 3px solid #e53e3e; }

    .plan-node__toggle {
      color: var(--text-muted);
      display: inline-block;
      transition: transform 0.15s;
      font-size: 14px;
      flex-shrink: 0;

      &--open { transform: rotate(90deg); }
    }

    .plan-node__type {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Colores por tipo de nodo */
    .node-type--scan      { background: rgba(72, 187, 120, 0.15); color: #48bb78; }
    .node-type--index     { background: rgba(91, 106, 245, 0.15); color: #818cf8; }
    .node-type--join      { background: rgba(237, 137, 54, 0.15); color: #ed8936; }
    .node-type--sort      { background: rgba(159, 122, 234, 0.15); color: #9f7aea; }
    .node-type--agg       { background: rgba(80, 200, 220, 0.15); color: #50c8dc; }
    .node-type--hash      { background: rgba(246, 173, 85, 0.15); color: #f6ad55; }
    .node-type--other     { background: rgba(160, 174, 192, 0.12); color: #a0aec0; }

    .plan-node__rel {
      font-size: 12px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .plan-node__schema { color: var(--text-muted); }
    .plan-node__alias  { font-style: italic; color: var(--text-muted); }

    .plan-node__spacer { flex: 1; min-width: 4px; }

    .plan-node__cost {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .plan-node__rows {
      display: flex;
      align-items: center;
      gap: 4px;
      font-family: var(--font-mono);
      font-size: 11px;
      flex-shrink: 0;
    }

    .plan-node__rows-est    { color: var(--text-muted); }
    .plan-node__rows-sep    { color: var(--text-muted); }
    .plan-node__rows-actual { color: var(--text-secondary); }

    .plan-node__time {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .text-warn { color: #f5a623 !important; }
    .text-crit { color: #e53e3e !important; }

    /* Body */
    .plan-node__body {
      padding: 8px 10px 8px 28px;
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 5px 5px;
      background: var(--bg-base);
      animation: slideDown 0.1s ease-out;
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* Stats */
    .plan-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 18px;
      margin-bottom: 8px;
    }

    .plan-stat {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: 11px;
    }

    .plan-stat--warn { background: rgba(245,166,35,0.06); padding: 2px 6px; border-radius: 4px; }

    .plan-stat__label { color: var(--text-muted); text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; white-space: nowrap; }
    .plan-stat__value { color: var(--text-primary); font-family: var(--font-mono); }

    .highlight-read { font-weight: 600; }

    /* Extra */
    .plan-extra {
      margin-bottom: 8px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .plan-extra__row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 11px;
    }

    .plan-extra__key {
      color: var(--text-muted);
      min-width: 120px;
      flex-shrink: 0;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .plan-extra__val {
      color: var(--text-secondary);
      font-family: var(--font-mono);
      word-break: break-all;
    }

    /* Children */
    .plan-children {
      border-left: 2px solid var(--border);
      padding-left: 12px;
      margin-top: 4px;
    }
  `],
})
export class PlanTreeComponent {
  @Input({ required: true }) node!: ExplainPlanNode;
  @Input() maxCost = 0;

  expanded = signal(true);

  costLevel(): 'ok' | 'warn' | 'crit' {
    if (this.node.totalCost >= COST_CRIT) return 'crit';
    if (this.node.totalCost >= COST_WARN) return 'warn';
    return 'ok';
  }

  rowDeviation(): boolean {
    if (this.node.actualRows === undefined || this.node.planRows === 0) return false;
    return this.node.actualRows > this.node.planRows * ROW_DEVIATION ||
           (this.node.actualRows < this.node.planRows / ROW_DEVIATION && this.node.planRows > 10);
  }

  rowDeviationFactor(): string {
    if (this.node.actualRows === undefined || this.node.planRows === 0) return '';
    const factor = this.node.actualRows / this.node.planRows;
    return factor.toFixed(1);
  }

  nodeClass(): string {
    const type = (this.node.nodeType ?? '').toLowerCase();
    if (type.includes('index')) return 'index';
    if (type.includes('scan')) return 'scan';
    if (type.includes('join') || type.includes('nested loop') || type.includes('merge')) return 'join';
    if (type.includes('sort')) return 'sort';
    if (type.includes('aggregate') || type.includes('agg')) return 'agg';
    if (type.includes('hash')) return 'hash';
    return 'other';
  }

  extraEntries(): { key: string; value: string }[] {
    if (!this.node.extra) return [];
    return Object.entries(this.node.extra).map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    }));
  }
}
