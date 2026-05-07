import {
  Component,
  computed,
  inject,
  Input,
  OnChanges,
  signal,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, JsonPipe } from '@angular/common';
import {
  TableChange,
  TableDataFormat,
  TableDataService,
} from '../../../../core/services/table-data.service';
import { MetadataService } from '../../../../core/services/metadata.service';
import { ToastService } from '../../../../core/services/toast.service';

interface ColumnDef {
  name: string;
  dataTypeId: number;
  dataTypeName?: string;
  isPk?: boolean;
}

interface PendingChange {
  id: string; // local unique id
  change: TableChange;
}

interface ActiveFilter {
  column: string;
  operator: string;
  value: string;
}

interface SortState {
  column: string;
  direction: 'ASC' | 'DESC';
}

const FILTER_OPS = [
  '=',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  'LIKE',
  'ILIKE',
  'IS NULL',
  'IS NOT NULL',
  'IN',
];
const PAGE_SIZES = [25, 50, 100, 250, 500];

@Component({
  selector: 'app-table-browser',
  standalone: true,
  imports: [FormsModule, DecimalPipe, JsonPipe],
  template: `
    <div class="tb">
      <!-- Toolbar -->
      <div class="tb__toolbar">
        <div class="tb__breadcrumb">
          <span class="tb__schema">{{ schema }}</span>
          <span class="tb__sep">.</span>
          <span class="tb__table">{{ table }}</span>
          @if (totalCount() >= 0) {
            <span class="tb__count text-muted"
              >{{ totalCount() | number }} rows</span
            >
          }
        </div>
        <div class="tb__actions">
          <button
            class="btn btn--ghost btn--sm"
            (click)="downloadExport('csv')"
            [disabled]="exportLoading()"
            title="Export visible query as CSV"
          >
            Export CSV
          </button>
          <button
            class="btn btn--ghost btn--sm"
            (click)="downloadExport('json')"
            [disabled]="exportLoading()"
            title="Export visible query as JSON"
          >
            JSON
          </button>
          <input
            #importInput
            class="tb__file-input"
            type="file"
            accept=".csv,.json,text/csv,application/json"
            (change)="importFromFile($event)"
          />
          <button
            class="btn btn--ghost btn--sm"
            (click)="importInput.click()"
            [disabled]="importLoading()"
            title="Import CSV or JSON"
          >
            @if (importLoading()) {
              <span class="spinner"></span> Importing…
            } @else {
              Import
            }
          </button>
          <button
            class="btn btn--ghost btn--sm"
            (click)="showFilterBar.set(!showFilterBar())"
            title="Toggle filters"
          >
            ⚙ Filters{{
              activeFilters().length ? ' (' + activeFilters().length + ')' : ''
            }}
          </button>
          <button
            class="btn btn--ghost btn--sm"
            (click)="addRow()"
            [disabled]="!pkColumns().length"
            title="Add new row"
          >
            + Row
          </button>
          @if (pendingChanges().length) {
            <button class="btn btn--accent btn--sm" (click)="openPreview()">
              Review {{ pendingChanges().length }} change{{
                pendingChanges().length !== 1 ? 's' : ''
              }}
            </button>
            <button class="btn btn--ghost btn--sm" (click)="discardAll()">
              Discard
            </button>
          }
          <button
            class="btn btn--ghost btn--sm"
            (click)="reload()"
            title="Refresh"
          >
            ↺
          </button>
        </div>
      </div>

      <!-- Filter bar -->
      @if (showFilterBar()) {
        <div class="tb__filterbar">
          @for (f of activeFilters(); track $index) {
            <div class="filter-row">
              <select
                class="input input--sm"
                [ngModel]="f.column"
                (ngModelChange)="f.column = $event"
              >
                @for (col of columns(); track col.name) {
                  <option [value]="col.name">{{ col.name }}</option>
                }
              </select>
              <select
                class="input input--sm"
                [ngModel]="f.operator"
                (ngModelChange)="f.operator = $event"
              >
                @for (op of filterOps; track op) {
                  <option [value]="op">{{ op }}</option>
                }
              </select>
              @if (f.operator !== 'IS NULL' && f.operator !== 'IS NOT NULL') {
                <input
                  class="input input--sm"
                  [ngModel]="f.value"
                  (ngModelChange)="f.value = $event"
                  placeholder="value"
                />
              }
              <button
                class="btn btn--ghost btn--sm btn--icon"
                (click)="removeFilter($index)"
              >
                ×
              </button>
            </div>
          }
          <div class="filter-row">
            <button class="btn btn--ghost btn--sm" (click)="addFilter()">
              + Add filter
            </button>
            @if (activeFilters().length) {
              <button class="btn btn--primary btn--sm" (click)="applyFilters()">
                Apply
              </button>
            }
          </div>
        </div>
      }

      <!-- Loading/empty states -->
      @if (loading()) {
        <div class="tb__state"><span class="spinner"></span> Loading…</div>
      } @else if (error()) {
        <div class="tb__state tb__state--error">{{ error() }}</div>
      } @else if (!rows().length && !loading()) {
        <div class="tb__state text-muted">No rows found.</div>
      }

      <!-- Data grid -->
      @if (!loading() && rows().length) {
        <div class="tb__grid-wrap">
          <table class="tb__grid">
            <thead>
              <tr>
                <th class="tb__col-action"></th>
                @for (col of columns(); track col.name) {
                  <th
                    class="tb__col-header"
                    [class.tb__col-header--sorted]="
                      sortState()?.column === col.name
                    "
                    [class.tb__col-pk]="col.isPk"
                    (click)="toggleSort(col.name)"
                    title="{{ col.name }} ({{
                      col.dataTypeName ?? col.dataTypeId
                    }})"
                  >
                    @if (col.isPk) {
                      <span class="pk-badge" title="Primary key">🔑</span>
                    }
                    {{ col.name }}
                    @if (sortState()?.column === col.name) {
                      <span class="sort-icon">{{
                        sortState()!.direction === 'ASC' ? '↑' : '↓'
                      }}</span>
                    }
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of displayRows(); track trackRow(row, $index)) {
                <tr
                  class="tb__row"
                  [class.tb__row--pending]="hasPending(row)"
                  [class.tb__row--new]="isNewRow(row)"
                  [class.tb__row--deleted]="isDeleted(row)"
                >
                  <td class="tb__cell-action">
                    @if (!isDeleted(row)) {
                      <button
                        class="btn-icon"
                        title="Delete row"
                        (click)="deleteRow(row)"
                        [disabled]="!pkColumns().length"
                      >
                        🗑
                      </button>
                    } @else {
                      <button
                        class="btn-icon"
                        title="Restore row"
                        (click)="undeleteRow(row)"
                      >
                        ↩
                      </button>
                    }
                  </td>
                  @for (col of columns(); track col.name) {
                    <td
                      class="tb__cell"
                      [class.tb__cell--pk]="col.isPk"
                      [class.tb__cell--edited]="isCellEdited(row, col.name)"
                      (dblclick)="startEdit(row, col)"
                    >
                      @if (isEditing(row, col.name) && !isDeleted(row)) {
                        <input
                          class="cell-input"
                          [ngModel]="getCellValue(row, col.name)"
                          (ngModelChange)="setCellEdit(row, col.name, $event)"
                          (blur)="commitEdit(row, col.name)"
                          (keydown.enter)="commitEdit(row, col.name)"
                          (keydown.escape)="cancelEdit(row, col.name)"
                        />
                      } @else {
                        <span class="cell-value">{{
                          formatCell(getCellValue(row, col.name))
                        }}</span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Pagination -->
      @if (totalCount() > 0) {
        <div class="tb__pagination">
          <div class="tb__page-info">
            Showing {{ pageStart() }}–{{ pageEnd() }} of
            {{ totalCount() | number }}
          </div>
          <div class="tb__page-controls">
            <button
              class="btn btn--ghost btn--sm btn--icon"
              (click)="goPage(1)"
              [disabled]="page() === 1"
            >
              «
            </button>
            <button
              class="btn btn--ghost btn--sm btn--icon"
              (click)="goPage(page() - 1)"
              [disabled]="page() === 1"
            >
              ‹
            </button>
            <span class="tb__page-num"
              >Page {{ page() }} / {{ totalPages() }}</span
            >
            <button
              class="btn btn--ghost btn--sm btn--icon"
              (click)="goPage(page() + 1)"
              [disabled]="page() >= totalPages()"
            >
              ›
            </button>
            <button
              class="btn btn--ghost btn--sm btn--icon"
              (click)="goPage(totalPages())"
              [disabled]="page() >= totalPages()"
            >
              »
            </button>
            <select
              class="input input--sm"
              [ngModel]="pageSize()"
              (ngModelChange)="setPageSize($event)"
            >
              @for (ps of pageSizes; track ps) {
                <option [value]="ps">{{ ps }} / page</option>
              }
            </select>
          </div>
        </div>
      }

      <!-- Preview / Confirm modal -->
      @if (showPreviewModal()) {
        <button
          type="button"
          class="modal-backdrop"
          (click)="showPreviewModal.set(false)"
          aria-label="Close review changes dialog"
        ></button>
        <div
          class="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-changes-title"
        >
          <div class="modal__header">
            <h3 id="review-changes-title">Review Changes</h3>
            <button
              class="btn btn--ghost btn--sm btn--icon"
              (click)="showPreviewModal.set(false)"
            >
              ×
            </button>
          </div>
          <div class="modal__body">
            @if (previewLoading()) {
              <div class="modal-state">
                <span class="spinner"></span> Generating preview…
              </div>
            } @else if (previewStatements().length) {
              <div class="preview-list">
                @for (stmt of previewStatements(); track $index) {
                  <div class="preview-stmt">
                    <pre class="preview-sql">{{ stmt.sql }}</pre>
                    @if (stmt.params.length) {
                      <div class="preview-params text-muted">
                        Params: {{ stmt.params | json }}
                      </div>
                    }
                  </div>
                }
              </div>
            } @else {
              <div class="modal-state text-muted">
                No SQL statements generated.
              </div>
            }
          </div>
          <div class="modal__footer">
            <button
              class="btn btn--ghost"
              (click)="showPreviewModal.set(false)"
            >
              Cancel
            </button>
            <button
              class="btn btn--danger"
              (click)="applyChanges()"
              [disabled]="applyLoading() || !previewStatements().length"
            >
              @if (applyLoading()) {
                <span class="spinner"></span> Applying…
              } @else {
                Apply {{ pendingChanges().length }} change{{
                  pendingChanges().length !== 1 ? 's' : ''
                }}
              }
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .tb {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: var(--bg-base);
      }

      /* Toolbar */
      .tb__toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 12px;
        border-bottom: 1px solid var(--border);
        background: var(--bg-elevated);
        flex-shrink: 0;
        min-width: 0;
      }

      .tb__breadcrumb {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        min-width: 0;
        overflow: hidden;
      }

      .tb__schema {
        color: var(--text-secondary);
      }
      .tb__sep {
        color: var(--text-muted);
      }
      .tb__table {
        font-weight: 600;
        color: var(--text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tb__count {
        font-size: 11px;
        margin-left: 8px;
        flex: 0 0 auto;
      }

      .tb__actions {
        display: flex;
        gap: 6px;
        align-items: center;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: thin;
        flex: 0 1 auto;
        min-width: 0;
        padding-bottom: 1px;
      }

      .tb__actions .btn {
        flex: 0 0 auto;
        white-space: nowrap;
      }

      .tb__file-input {
        display: none;
      }

      /* Filter bar */
      .tb__filterbar {
        padding: 8px 12px;
        border-bottom: 1px solid var(--border);
        background: var(--bg-surface);
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex-shrink: 0;
      }

      .filter-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      /* States */
      .tb__state {
        padding: 32px;
        text-align: center;
        font-size: 13px;
        flex-shrink: 0;
      }

      .tb__state--error {
        color: var(--danger);
      }

      /* Grid */
      .tb__grid-wrap {
        flex: 1;
        overflow: auto;
        min-height: 0;
        min-width: 0;
      }

      .tb__grid {
        border-collapse: collapse;
        font-size: 12px;
        width: max-content;
        min-width: 100%;
      }

      .tb__col-header {
        position: sticky;
        top: 0;
        background: var(--bg-elevated);
        border-bottom: 2px solid var(--border);
        padding: 6px 10px;
        text-align: left;
        white-space: nowrap;
        font-weight: 600;
        color: var(--text-secondary);
        cursor: pointer;
        user-select: none;
        z-index: 1;

        &:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }
        &--sorted {
          color: var(--accent);
        }
        &--sorted {
        }
      }

      .tb__col-action {
        position: sticky;
        top: 0;
        width: 32px;
        background: var(--bg-elevated);
        border-bottom: 2px solid var(--border);
        z-index: 1;
      }

      .tb__col-pk {
      }

      .pk-badge {
        font-size: 10px;
        margin-right: 3px;
      }
      .sort-icon {
        font-size: 10px;
        margin-left: 3px;
      }

      .tb__row {
        border-bottom: 1px solid var(--border);
        transition: background 0.08s;

        &:hover {
          background: var(--bg-hover);
        }
        &--pending {
          background: rgba(91, 106, 245, 0.06);
        }
        &--new {
          background: rgba(76, 175, 125, 0.08);
        }
        &--deleted {
          background: rgba(235, 87, 87, 0.08);
          opacity: 0.6;
        }
      }

      .tb__cell {
        padding: 5px 10px;
        max-width: 280px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        vertical-align: middle;
        cursor: default;

        &--pk {
          color: var(--accent);
          font-weight: 500;
        }
        &--edited {
          background: rgba(91, 106, 245, 0.12);
        }
      }

      .tb__cell-action {
        padding: 0 4px;
        vertical-align: middle;
        text-align: center;
      }

      .cell-value {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cell-input {
        width: 100%;
        min-width: 80px;
        padding: 2px 6px;
        font-size: 12px;
        font-family: var(--font-mono);
        background: var(--bg-base);
        color: var(--text-primary);
        border: 1px solid var(--accent);
        border-radius: 3px;
        outline: none;
      }

      .btn-icon {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 2px 4px;
        font-size: 13px;
        opacity: 0.5;
        border-radius: 3px;
        transition:
          opacity 0.1s,
          background 0.1s;

        &:hover {
          opacity: 1;
          background: var(--bg-hover);
        }
        &:disabled {
          cursor: not-allowed;
          opacity: 0.2;
        }
      }

      /* Pagination */
      .tb__pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        border-top: 1px solid var(--border);
        background: var(--bg-elevated);
        flex-shrink: 0;
        font-size: 12px;
      }

      .tb__page-info {
        color: var(--text-secondary);
      }

      .tb__page-controls {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .tb__page-num {
        padding: 0 8px;
        color: var(--text-secondary);
      }

      /* Modal */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        border: 0;
        padding: 0;
        z-index: 1000;
      }

      .modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        width: 680px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 1001;
      }

      .modal__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        border-bottom: 1px solid var(--border);
        h3 {
          font-size: 15px;
          font-weight: 600;
          margin: 0;
        }
      }

      .modal__body {
        flex: 1;
        overflow-y: auto;
        padding: 14px 18px;
      }

      .modal__footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 18px;
        border-top: 1px solid var(--border);
      }

      .modal-state {
        text-align: center;
        padding: 24px;
        font-size: 13px;
      }

      .preview-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .preview-stmt {
        background: var(--bg-base);
        border: 1px solid var(--border);
        border-radius: 6px;
        overflow: hidden;
      }

      .preview-sql {
        font-family: var(--font-mono);
        font-size: 12px;
        padding: 10px 14px;
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--text-primary);
        line-height: 1.6;
      }

      .preview-params {
        padding: 4px 14px 8px;
        font-size: 11px;
        font-family: var(--font-mono);
        border-top: 1px solid var(--border);
      }
    `,
  ],
})
export class TableBrowserComponent implements OnChanges {
  @Input({ required: true }) connectionId!: string;
  @Input({ required: true }) schema!: string;
  @Input({ required: true }) table!: string;

  private tdSvc = inject(TableDataService);
  private metaSvc = inject(MetadataService);
  private toast = inject(ToastService);

  // State
  columns = signal<ColumnDef[]>([]);
  rows = signal<Record<string, unknown>[]>([]);
  totalCount = signal(-1);
  loading = signal(false);
  exportLoading = signal(false);
  importLoading = signal(false);
  error = signal<string | null>(null);

  page = signal(1);
  pageSize = signal(50);
  sortState = signal<SortState | null>(null);
  activeFilters = signal<ActiveFilter[]>([]);
  showFilterBar = signal(false);

  // Pending changes: map rowKey → {before, edits, deleted, isNew}
  private _edits = signal<Map<string, Record<string, unknown>>>(new Map());
  private _deleted = signal<Set<string>>(new Set());
  private _newRows = signal<Record<string, unknown>[]>([]);
  // Currently editing cell
  private _editingCell = signal<{ rowKey: string; col: string } | null>(null);

  pkColumns = signal<string[]>([]);

  showPreviewModal = signal(false);
  previewLoading = signal(false);
  previewStatements = signal<{ sql: string; params: unknown[] }[]>([]);
  applyLoading = signal(false);

  filterOps = FILTER_OPS;
  pageSizes = PAGE_SIZES;

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalCount() / this.pageSize())),
  );
  pageStart = computed(() =>
    Math.min((this.page() - 1) * this.pageSize() + 1, this.totalCount()),
  );
  pageEnd = computed(() =>
    Math.min(this.page() * this.pageSize(), this.totalCount()),
  );

  pendingChanges = computed((): PendingChange[] => {
    const changes: PendingChange[] = [];
    const edits = this._edits();
    const deleted = this._deleted();
    const newRows = this._newRows();
    const cols = this.columns();
    const pkCols = this.pkColumns();

    // Updates
    for (const [rowKey, editsMap] of edits.entries()) {
      if (deleted.has(rowKey)) continue;
      const before = this.rowByKey(rowKey);
      if (!before) continue;
      const primaryKey: Record<string, unknown> = {};
      pkCols.forEach((pk) => {
        primaryKey[pk] = before[pk];
      });
      const after: Record<string, unknown> = {};
      for (const col of cols) {
        if (editsMap[col.name] !== undefined) {
          after[col.name] = editsMap[col.name];
        }
      }
      if (Object.keys(after).length) {
        changes.push({
          id: `update-${rowKey}`,
          change: {
            type: 'update',
            schema: this.schema,
            table: this.table,
            primaryKey,
            after,
          },
        });
      }
    }

    // Deletes
    for (const rowKey of deleted) {
      const row = this.rowByKey(rowKey);
      if (!row) continue;
      const primaryKey: Record<string, unknown> = {};
      pkCols.forEach((pk) => {
        primaryKey[pk] = row[pk];
      });
      changes.push({
        id: `delete-${rowKey}`,
        change: {
          type: 'delete',
          schema: this.schema,
          table: this.table,
          primaryKey,
        },
      });
    }

    // Inserts
    newRows.forEach((row, i) => {
      changes.push({
        id: `insert-${i}`,
        change: {
          type: 'insert',
          schema: this.schema,
          table: this.table,
          after: row,
        },
      });
    });

    return changes;
  });

  displayRows = computed((): Record<string, unknown>[] => {
    return [...this.rows(), ...this._newRows()];
  });

  ngOnChanges(changes: SimpleChanges) {
    if (changes['connectionId'] || changes['schema'] || changes['table']) {
      this.resetState();
      this.loadPkInfo();
      this.loadPage();
    }
  }

  private resetState() {
    this.page.set(1);
    this.sortState.set(null);
    this.activeFilters.set([]);
    this._edits.set(new Map());
    this._deleted.set(new Set());
    this._newRows.set([]);
    this._editingCell.set(null);
    this.showFilterBar.set(false);
  }

  loadPage() {
    this.loading.set(true);
    this.error.set(null);

    this.tdSvc
      .read({
        connectionId: this.connectionId,
        schema: this.schema,
        table: this.table,
        page: this.page(),
        pageSize: this.pageSize(),
        orderBy: this.currentOrderBy(),
        filters: this.currentFilters(),
      })
      .subscribe({
        next: (res) => {
          const pkCols = this.pkColumns();
          this.columns.set(
            res.columns.map((c) => ({ ...c, isPk: pkCols.includes(c.name) })),
          );
          this.rows.set(res.rows);
          this.totalCount.set(res.totalCount);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Failed to load table data');
        },
      });
  }

  downloadExport(format: TableDataFormat) {
    this.exportLoading.set(true);
    this.tdSvc
      .exportData({
        connectionId: this.connectionId,
        schema: this.schema,
        table: this.table,
        format,
        orderBy: this.currentOrderBy(),
        filters: this.currentFilters(),
      })
      .subscribe({
        next: (res) => {
          this.exportLoading.set(false);
          this.downloadBlob(res.content, res.fileName, res.mimeType);
          this.toast.success(
            `Exported ${res.rowCount} row${res.rowCount !== 1 ? 's' : ''}`,
          );
        },
        error: (err) => {
          this.exportLoading.set(false);
          this.toast.error(err?.error?.message ?? 'Export failed');
        },
      });
  }

  reload() {
    this._edits.set(new Map());
    this._deleted.set(new Set());
    this._newRows.set([]);
    this.loadPage();
  }

  importFromFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const format = this.detectImportFormat(file.name);
    const reader = new FileReader();
    this.importLoading.set(true);
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      this.tdSvc
        .importData({
          connectionId: this.connectionId,
          schema: this.schema,
          table: this.table,
          format,
          content,
          mode: 'insert',
        })
        .subscribe({
          next: (res) => {
            this.importLoading.set(false);
            if (res.status === 'success') {
              this.toast.success(
                `Imported ${res.affectedRows} row${res.affectedRows !== 1 ? 's' : ''}`,
              );
              this.reload();
            } else {
              this.toast.error(res.error ?? 'Import failed');
            }
          },
          error: (err) => {
            this.importLoading.set(false);
            this.toast.error(err?.error?.message ?? 'Import failed');
          },
        });
    };
    reader.onerror = () => {
      this.importLoading.set(false);
      this.toast.error('Failed to read import file');
    };
    reader.readAsText(file);
    input.value = '';
  }

  toggleSort(col: string) {
    const current = this.sortState();
    if (current?.column === col) {
      this.sortState.set({
        column: col,
        direction: current.direction === 'ASC' ? 'DESC' : 'ASC',
      });
    } else {
      this.sortState.set({ column: col, direction: 'ASC' });
    }
    this.page.set(1);
    this.loadPage();
  }

  goPage(p: number) {
    const clamped = Math.max(1, Math.min(p, this.totalPages()));
    if (clamped === this.page()) return;
    this.page.set(clamped);
    this.loadPage();
  }

  setPageSize(ps: number) {
    this.pageSize.set(Number(ps));
    this.page.set(1);
    this.loadPage();
  }

  deleteRow(row: Record<string, unknown>) {
    if (!this.pkColumns().length) {
      this.toast.error('Cannot delete: no primary key detected');
      return;
    }
    if (this.isNewRow(row)) {
      this._newRows.update((rs) => rs.filter((r) => r !== row));
      return;
    }
    const key = this.rowKey(row);
    this._deleted.update((s) => {
      const next = new Set(s);
      next.add(key);
      return next;
    });
  }

  addFilter() {
    const cols = this.columns();
    this.activeFilters.update((fs) => [
      ...fs,
      { column: cols[0]?.name ?? '', operator: '=', value: '' },
    ]);
  }

  removeFilter(idx: number) {
    this.activeFilters.update((fs) => fs.filter((_, i) => i !== idx));
  }

  applyFilters() {
    this.page.set(1);
    this.loadPage();
  }

  // ── Row Key ─────────────────────────────────────────────────────────────────
  rowKey(row: Record<string, unknown>): string {
    const pkCols = this.pkColumns();
    if (pkCols.length) {
      return pkCols.map((pk) => String(row[pk] ?? '')).join('|');
    }
    // Fallback: use all column values (no edit support without PK)
    return JSON.stringify(row);
  }

  private rowByKey(key: string): Record<string, unknown> | undefined {
    return this.rows().find((r) => this.rowKey(r) === key);
  }

  trackRow(row: Record<string, unknown>, idx: number): string {
    const pk = this.rowKey(row);
    return pk || String(idx);
  }

  // ── Editing ──────────────────────────────────────────────────────────────────
  hasPending(row: Record<string, unknown>): boolean {
    const key = this.rowKey(row);
    return this._edits().has(key) || this._deleted().has(key);
  }

  isNewRow(row: Record<string, unknown>): boolean {
    return this._newRows().includes(row);
  }

  isDeleted(row: Record<string, unknown>): boolean {
    return this._deleted().has(this.rowKey(row));
  }

  isEditing(row: Record<string, unknown>, col: string): boolean {
    const ec = this._editingCell();
    return ec?.rowKey === this.rowKey(row) && ec?.col === col;
  }

  isCellEdited(row: Record<string, unknown>, col: string): boolean {
    const key = this.rowKey(row);
    return this._edits().get(key)?.[col] !== undefined;
  }

  getCellValue(row: Record<string, unknown>, col: string): unknown {
    const key = this.rowKey(row);
    const edits = this._edits().get(key);
    return edits?.[col] !== undefined ? edits[col] : row[col];
  }

  startEdit(row: Record<string, unknown>, col: ColumnDef) {
    if (this.isDeleted(row)) return;
    if (!this.pkColumns().length && !this.isNewRow(row)) return; // no PK — can't safely update
    this._editingCell.set({ rowKey: this.rowKey(row), col: col.name });
  }

  setCellEdit(row: Record<string, unknown>, col: string, value: string) {
    const key = this.rowKey(row);
    this._edits.update((m) => {
      const next = new Map(m);
      const current = next.get(key) ?? {};
      next.set(key, { ...current, [col]: value });
      return next;
    });
  }

  commitEdit(row: Record<string, unknown>, col: string) {
    this._editingCell.set(null);
    // Check if the value equals original — remove from edits if so
    const key = this.rowKey(row);
    const edits = this._edits().get(key);
    if (edits && edits[col] === String(row[col] ?? '')) {
      this._edits.update((m) => {
        const next = new Map(m);
        const current = { ...(next.get(key) ?? {}) };
        delete current[col];
        if (Object.keys(current).length === 0) next.delete(key);
        else next.set(key, current);
        return next;
      });
    }
  }

  cancelEdit(row: Record<string, unknown>, col: string) {
    const key = this.rowKey(row);
    this._edits.update((m) => {
      const next = new Map(m);
      const current = { ...(next.get(key) ?? {}) };
      delete current[col];
      if (Object.keys(current).length === 0) next.delete(key);
      else next.set(key, current);
      return next;
    });
    this._editingCell.set(null);
  }

  undeleteRow(row: Record<string, unknown>) {
    const key = this.rowKey(row);
    this._deleted.update((s) => {
      const next = new Set(s);
      next.delete(key);
      return next;
    });
  }

  addRow() {
    const empty: Record<string, unknown> = {};
    for (const col of this.columns()) {
      empty[col.name] = null;
    }
    // Give new row a temporary unique key
    empty['__newRowId__'] = `new-${Date.now()}`;
    this._newRows.update((rs) => [...rs, empty]);
  }

  // ── Preview & Apply ─────────────────────────────────────────────────────────
  openPreview() {
    this.showPreviewModal.set(true);
    this.previewLoading.set(true);
    this.previewStatements.set([]);

    const changes = this.pendingChanges().map((pc) => pc.change);
    this.tdSvc
      .previewChanges({ connectionId: this.connectionId, changes })
      .subscribe({
        next: (res) => {
          this.previewStatements.set(res.statements);
          this.previewLoading.set(false);
        },
        error: (err) => {
          this.previewLoading.set(false);
          this.toast.error(err?.error?.message ?? 'Failed to generate preview');
          this.showPreviewModal.set(false);
        },
      });
  }

  discardAll() {
    this._edits.set(new Map());
    this._deleted.set(new Set());
    this._newRows.set([]);
  }

  applyChanges() {
    this.applyLoading.set(true);
    const changes = this.pendingChanges().map((pc) => pc.change);
    this.tdSvc
      .applyChanges({ connectionId: this.connectionId, changes })
      .subscribe({
        next: (res) => {
          this.applyLoading.set(false);
          this.showPreviewModal.set(false);
          if (res.status === 'success') {
            this.toast.success(
              `Applied ${res.affectedRows} row change${res.affectedRows !== 1 ? 's' : ''}`,
            );
            this.discardAll();
            this.loadPage();
          } else {
            this.toast.error(res.error ?? 'Apply failed');
          }
        },
        error: (err) => {
          this.applyLoading.set(false);
          this.toast.error(err?.error?.message ?? 'Apply failed');
        },
      });
  }

  private loadPkInfo() {
    this.metaSvc
      .getTableDetail(this.connectionId, this.schema, this.table)
      .subscribe({
        next: (detail) => {
          const pkCols = detail.columns
            .filter((c) => c.isPrimaryKey)
            .map((c) => c.name);
          this.pkColumns.set(pkCols);
          // Mark PK columns in column defs
          this.columns.update((cols) =>
            cols.map((c) => ({ ...c, isPk: pkCols.includes(c.name) })),
          );
        },
        error: () => this.pkColumns.set([]),
      });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  formatCell(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private parseFilterValue(f: ActiveFilter): unknown {
    if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') return null;
    if (f.operator === 'IN' || f.operator === 'NOT IN') {
      return f.value.split(',').map((v) => v.trim());
    }
    return f.value;
  }

  private currentOrderBy():
    | { column: string; direction: 'ASC' | 'DESC' }[]
    | undefined {
    const sort = this.sortState();
    return sort
      ? [{ column: sort.column, direction: sort.direction }]
      : undefined;
  }

  private currentFilters():
    | { column: string; operator: string; value: unknown }[]
    | undefined {
    const filters = this.activeFilters();
    return filters.length
      ? filters.map((f) => ({
          column: f.column,
          operator: f.operator,
          value: this.parseFilterValue(f),
        }))
      : undefined;
  }

  private detectImportFormat(fileName: string): TableDataFormat {
    return fileName.toLowerCase().endsWith('.json') ? 'json' : 'csv';
  }

  private downloadBlob(content: string, fileName: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}
