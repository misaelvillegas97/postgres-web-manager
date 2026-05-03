import { Component, Input, signal, computed } from '@angular/core';

export interface ResultColumn {
  name: string;
  dataTypeId?: number;
}

@Component({
  selector: 'app-result-table',
  standalone: true,
  template: `
    <div class="result">
      @if (!columns().length && !error()) {
        <div class="result__empty">Run a query to see results</div>
      }

      @if (error()) {
        <div class="result__error">
          <span class="result__error-icon">✕</span>
          <div>
            <div class="result__error-msg">{{ error() }}</div>
            @if (errorCode()) { <div class="result__error-code">Code: {{ errorCode() }}</div> }
          </div>
        </div>
      }

      @if (columns().length && !error()) {
        <div class="result__meta">
          <span>{{ rowCount() }} row{{ rowCount() !== 1 ? 's' : '' }}</span>
          @if (duration()) {
            <span class="result__duration">{{ duration() }}ms</span>
          }
          @if (command()) {
            <span class="result__command">{{ command() }}</span>
          }
        </div>

        <div class="result__table-wrap">
          <table class="result-table">
            <thead>
              <tr>
                <th class="result-table__rownum">#</th>
                @for (col of columns(); track col.name) {
                  <th>{{ col.name }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of visibleRows(); track $index; let i = $index) {
                <tr>
                  <td class="result-table__rownum">{{ i + 1 }}</td>
                  @for (val of row; track $index) {
                    <td [class.result-table__null]="val === null">
                      {{ val === null ? 'NULL' : formatVal(val) }}
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (rows().length > MAX_VISIBLE) {
          <div class="result__truncated">
            Showing {{ MAX_VISIBLE }} of {{ rows().length }} rows.
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .result {
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .result__empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      font-size: 13px;
    }

    .result__error {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 16px;
      background: var(--danger-dim);
      border: 1px solid var(--danger);
      border-radius: var(--radius);
      margin: 8px;
    }

    .result__error-icon {
      color: var(--danger);
      font-weight: bold;
      margin-top: 1px;
    }

    .result__error-msg {
      font-size: 13px;
      color: var(--text-primary);
      font-family: var(--font-mono);
    }

    .result__error-code {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .result__meta {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px 10px;
      font-size: 11px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .result__duration { color: var(--success); }
    .result__command  { color: var(--accent); }

    .result__table-wrap {
      flex: 1;
      overflow: auto;
    }

    .result-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      font-family: var(--font-mono);

      th, td {
        padding: 5px 10px;
        text-align: left;
        white-space: nowrap;
        border-right: 1px solid var(--border);
      }

      th {
        background: var(--bg-elevated);
        color: var(--text-secondary);
        font-size: 11px;
        font-weight: 600;
        position: sticky;
        top: 0;
        border-bottom: 1px solid var(--border);
      }

      tr:hover td { background: var(--bg-hover); }

      &__rownum {
        color: var(--text-muted);
        font-size: 10px;
        min-width: 36px;
        text-align: right;
        user-select: none;
      }

      &__null {
        color: var(--text-muted);
        font-style: italic;
      }
    }

    .result__truncated {
      padding: 4px 10px;
      font-size: 11px;
      color: var(--warning);
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }
  `],
})
export class ResultTableComponent {
  readonly MAX_VISIBLE = 2000;

  @Input() set result(v: { columns: ResultColumn[]; rows: unknown[][] } | null) {
    this._columns.set(v?.columns ?? []);
    this._rows.set(v?.rows ?? []);
    this._error.set(null);
    this._errorCode.set(null);
    this._duration.set(null);
    this._command.set(null);
    this._rowCount.set(v?.rows?.length ?? 0);
  }

  @Input() set queryDone(v: { rowCount: number; durationMs: number; command?: string } | null) {
    if (v) {
      this._duration.set(v.durationMs);
      this._command.set(v.command ?? null);
      this._rowCount.set(v.rowCount);
    }
  }

  @Input() set queryError(v: { message: string; code?: string } | null) {
    if (v) {
      this._error.set(v.message);
      this._errorCode.set(v.code ?? null);
      this._columns.set([]);
      this._rows.set([]);
    }
  }

  private _columns = signal<ResultColumn[]>([]);
  private _rows = signal<unknown[][]>([]);
  private _error = signal<string | null>(null);
  private _errorCode = signal<string | null>(null);
  private _duration = signal<number | null>(null);
  private _command = signal<string | null>(null);
  private _rowCount = signal<number>(0);

  columns = this._columns.asReadonly();
  rows = this._rows.asReadonly();
  error = this._error.asReadonly();
  errorCode = this._errorCode.asReadonly();
  duration = this._duration.asReadonly();
  command = this._command.asReadonly();
  rowCount = this._rowCount.asReadonly();

  visibleRows = computed(() => this._rows().slice(0, this.MAX_VISIBLE));

  formatVal(v: unknown): string {
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
}
