import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DdlService } from '../../../../core/services/ddl.service';
import { MetadataService } from '../../../../core/services/metadata.service';
import { ToastService } from '../../../../core/services/toast.service';
import {
  CreateCheckConstraintRequest,
  CreateForeignKeyRequest,
  CreateIndexRequest,
  CreateTableColumn,
} from '@postgres-web-manager/contracts';

interface ColumnRow extends CreateTableColumn {
  _id: string;
  isPk: boolean;
}

const PG_TYPES = [
  'bigint',
  'bigserial',
  'boolean',
  'bytea',
  'character varying',
  'char',
  'date',
  'double precision',
  'integer',
  'jsonb',
  'json',
  'numeric',
  'real',
  'serial',
  'smallint',
  'text',
  'timestamp',
  'timestamptz',
  'uuid',
];

let uid = 1;
function newId() {
  return `col-${uid++}`;
}

@Component({
  selector: 'app-table-designer',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="designer">
      <div class="designer__header">
        <h3 class="designer__title">
          {{ editMode ? 'Alter Table' : 'New Table' }}
          @if (editMode) {
            <span class="text-accent">{{ schema }}.{{ existingTable }}</span>
          }
        </h3>
        <button class="btn btn--ghost btn--sm" (click)="closeRequested.emit()">
          ✕ Close
        </button>
      </div>

      <!-- Table info -->
      <div class="designer__section">
        <div class="form-row">
          <span class="form-label">Schema</span>
          @if (!editMode) {
            <select class="input" [(ngModel)]="selectedSchema">
              @for (s of schemas(); track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          } @else {
            <span class="form-value">{{ schema }}</span>
          }
        </div>
        @if (!editMode) {
          <div class="form-row">
            <span class="form-label">Table Name</span>
            <input
              class="input"
              [(ngModel)]="tableName"
              placeholder="my_table"
            />
          </div>
          <div class="form-row">
            <span class="form-label">Comment</span>
            <input
              class="input"
              [(ngModel)]="tableComment"
              placeholder="Optional description"
            />
          </div>
        }
      </div>

      <!-- Columns -->
      <div class="designer__section">
        <div class="section-header">
          <span class="section-title">Columns</span>
          <button class="btn btn--ghost btn--sm" (click)="addColumn()">
            + Add Column
          </button>
        </div>

        <div class="col-grid-wrap">
          <table class="col-grid">
            <thead>
              <tr>
                <th class="col-pk" title="Primary Key">🔑</th>
                <th>Name</th>
                <th>Type</th>
                <th class="col-narrow">Length / Precision</th>
                <th class="col-narrow">Scale</th>
                <th class="col-narrow">Nullable</th>
                <th class="col-narrow">Identity</th>
                <th class="col-narrow">Unique</th>
                <th>Default</th>
                <th class="col-action"></th>
              </tr>
            </thead>
            <tbody>
              @for (col of columns(); track col._id) {
                <tr [class.col-row--pk]="col.isPk">
                  <td class="col-pk">
                    <input
                      type="checkbox"
                      [ngModel]="col.isPk"
                      (ngModelChange)="togglePk(col, $event)"
                    />
                  </td>
                  <td>
                    <input
                      class="input input--sm input--mono"
                      [(ngModel)]="col.name"
                      placeholder="column_name"
                    />
                  </td>
                  <td>
                    <select
                      class="input input--sm"
                      [(ngModel)]="col.type"
                      (ngModelChange)="onTypeChange(col)"
                    >
                      @for (t of pgTypes; track t) {
                        <option [value]="t">{{ t }}</option>
                      }
                    </select>
                  </td>
                  <td class="col-narrow">
                    @if (needsLength(col.type)) {
                      <input
                        class="input input--sm"
                        type="number"
                        [(ngModel)]="col.length"
                        placeholder="e.g. 255"
                      />
                    }
                    @if (needsPrecision(col.type)) {
                      <input
                        class="input input--sm"
                        type="number"
                        [(ngModel)]="col.precision"
                        placeholder="prec"
                      />
                    }
                  </td>
                  <td class="col-narrow">
                    @if (needsPrecision(col.type)) {
                      <input
                        class="input input--sm"
                        type="number"
                        [(ngModel)]="col.scale"
                        placeholder="scale"
                      />
                    }
                  </td>
                  <td class="col-narrow center">
                    <input
                      type="checkbox"
                      [ngModel]="col.nullable"
                      (ngModelChange)="col.nullable = $event"
                      [disabled]="!!col.isPk || !!col.identity"
                    />
                  </td>
                  <td class="col-narrow center">
                    <input
                      type="checkbox"
                      [ngModel]="col.identity"
                      (ngModelChange)="toggleIdentity(col, $event)"
                    />
                  </td>
                  <td class="col-narrow center">
                    <input
                      type="checkbox"
                      [ngModel]="col.unique"
                      (ngModelChange)="col.unique = $event"
                      [disabled]="!!col.isPk"
                    />
                  </td>
                  <td>
                    <input
                      class="input input--sm"
                      [(ngModel)]="col.defaultValue"
                      placeholder="e.g. now()"
                      [disabled]="!!col.identity"
                    />
                  </td>
                  <td class="col-action">
                    <button
                      class="btn-icon"
                      (click)="removeColumn(col._id)"
                      title="Remove column"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="10" class="empty-row">
                    No columns yet — click "+ Add Column"
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (!editMode) {
        <!-- Indexes -->
        <div class="designer__section">
          <div class="section-header">
            <span class="section-title">Indexes</span>
            <button class="btn btn--ghost btn--sm" (click)="addIndex()">
              + Add Index
            </button>
          </div>
          @for (idx of indexes(); track $index) {
            <div class="constraint-row">
              <input
                class="input input--sm"
                [(ngModel)]="idx.name"
                placeholder="index name (optional)"
              />
              <input
                class="input input--sm flex-2"
                [(ngModel)]="idxColumnsText[$index]"
                placeholder="col1, col2"
                (ngModelChange)="idx.columns = splitCols($event)"
              />
              <select class="input input--sm" [(ngModel)]="idx.method">
                <option value="">default (btree)</option>
                <option value="btree">btree</option>
                <option value="hash">hash</option>
                <option value="gin">gin</option>
                <option value="gist">gist</option>
                <option value="brin">brin</option>
              </select>
              <label class="check-label"
                ><input type="checkbox" [(ngModel)]="idx.unique" />
                Unique</label
              >
              <button class="btn-icon" (click)="removeIndex($index)">🗑</button>
            </div>
          }
        </div>

        <!-- Foreign Keys -->
        <div class="designer__section">
          <div class="section-header">
            <span class="section-title">Foreign Keys</span>
            <button class="btn btn--ghost btn--sm" (click)="addFk()">
              + Add FK
            </button>
          </div>
          @for (fk of foreignKeys(); track $index) {
            <div class="constraint-row constraint-row--col">
              <div class="fk-row">
                <input
                  class="input input--sm flex-1"
                  [(ngModel)]="fkColsText[$index]"
                  placeholder="local col(s)"
                  (ngModelChange)="fk.columns = splitCols($event)"
                />
                <span class="arrow">→</span>
                <select
                  class="input input--sm"
                  [(ngModel)]="fk.referencedSchema"
                >
                  @for (s of schemas(); track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
                <input
                  class="input input--sm flex-1"
                  [(ngModel)]="fk.referencedTable"
                  placeholder="table"
                />
                <input
                  class="input input--sm flex-1"
                  [(ngModel)]="fkRefColsText[$index]"
                  placeholder="ref col(s)"
                  (ngModelChange)="fk.referencedColumns = splitCols($event)"
                />
              </div>
              <div class="fk-row">
                <span class="form-label-inline">On Delete</span>
                <select class="input input--sm" [(ngModel)]="fk.onDelete">
                  @for (a of fkActions; track a) {
                    <option [value]="a">{{ a }}</option>
                  }
                </select>
                <span class="form-label-inline">On Update</span>
                <select class="input input--sm" [(ngModel)]="fk.onUpdate">
                  @for (a of fkActions; track a) {
                    <option [value]="a">{{ a }}</option>
                  }
                </select>
                <button class="btn-icon" (click)="removeFk($index)">🗑</button>
              </div>
            </div>
          }
        </div>

        <!-- Checks -->
        <div class="designer__section">
          <div class="section-header">
            <span class="section-title">Check Constraints</span>
            <button class="btn btn--ghost btn--sm" (click)="addCheck()">
              + Add Check
            </button>
          </div>
          @for (chk of checks(); track $index) {
            <div class="constraint-row">
              <input
                class="input input--sm"
                [(ngModel)]="chk.name"
                placeholder="constraint name (optional)"
              />
              <input
                class="input input--sm flex-2 input--mono"
                [(ngModel)]="chk.expression"
                placeholder="e.g. age > 0"
              />
              <button class="btn-icon" (click)="removeCheck($index)">🗑</button>
            </div>
          }
        </div>
      }

      <!-- Alter: add columns only (drop/rename via separate panels) -->
      @if (editMode) {
        <div class="designer__section">
          <div class="section-header">
            <span class="section-title">Drop Columns</span>
          </div>
          <div class="form-row">
            <span class="form-label">Column names (comma-separated)</span>
            <input
              class="input"
              [(ngModel)]="dropColumnsText"
              placeholder="col1, col2"
            />
          </div>
        </div>

        <div class="designer__section">
          <div class="section-header">
            <span class="section-title">Rename Columns</span>
            <button class="btn btn--ghost btn--sm" (click)="addRename()">
              + Add
            </button>
          </div>
          @for (r of renames(); track $index) {
            <div class="constraint-row">
              <input
                class="input input--sm flex-1 input--mono"
                [(ngModel)]="r.from"
                placeholder="old name"
              />
              <span class="arrow">→</span>
              <input
                class="input input--sm flex-1 input--mono"
                [(ngModel)]="r.to"
                placeholder="new name"
              />
              <button class="btn-icon" (click)="removeRename($index)">
                🗑
              </button>
            </div>
          }
        </div>
      }

      <!-- Actions -->
      <div class="designer__footer">
        @if (previewSql()) {
          <div class="preview-block">
            <div class="preview-block__header">
              Generated SQL
              @if (warnings().length) {
                <span class="warn-badge"
                  >⚠ {{ warnings().length }} warning{{
                    warnings().length !== 1 ? 's' : ''
                  }}</span
                >
              }
            </div>
            <pre class="preview-sql">{{ previewSql() }}</pre>
            @for (w of warnings(); track $index) {
              <div class="preview-warn">⚠ {{ w }}</div>
            }
          </div>
        }
        <div class="footer-actions">
          <button class="btn btn--ghost" (click)="closeRequested.emit()">
            Cancel
          </button>
          <button
            class="btn btn--secondary"
            (click)="preview()"
            [disabled]="previewLoading()"
          >
            @if (previewLoading()) {
              <span class="spinner"></span>
            }
            Preview SQL
          </button>
          <button
            class="btn btn--primary"
            (click)="execute()"
            [disabled]="!previewSql() || executing()"
          >
            @if (executing()) {
              <span class="spinner"></span> Executing…
            } @else {
              Execute
            }
          </button>
        </div>
      </div>
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

      .designer {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: var(--bg-base);
      }

      .designer__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
        background: var(--bg-elevated);
        flex-shrink: 0;

        h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }
      }

      .designer__section {
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .section-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
      }

      .form-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }

      .form-label {
        font-size: 12px;
        color: var(--text-secondary);
        min-width: 100px;
        flex-shrink: 0;
      }
      .form-label-inline {
        font-size: 12px;
        color: var(--text-secondary);
        flex-shrink: 0;
        white-space: nowrap;
      }
      .form-value {
        font-size: 13px;
        color: var(--text-primary);
        font-family: var(--font-mono);
      }

      .text-accent {
        color: var(--accent);
        font-family: var(--font-mono);
      }

      /* Columns grid */
      .col-grid-wrap {
        overflow-x: auto;
        overflow-y: auto;
        max-height: 260px;
        border: 1px solid var(--border);
        border-radius: 6px;
      }

      .col-grid {
        border-collapse: collapse;
        font-size: 12px;
        width: 100%;
        min-width: 780px;
      }

      .col-grid th {
        position: sticky;
        top: 0;
        background: var(--bg-elevated);
        border-bottom: 1px solid var(--border);
        padding: 5px 8px;
        text-align: left;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
        white-space: nowrap;
      }

      .col-grid td {
        padding: 4px 6px;
        border-bottom: 1px solid var(--border);
        vertical-align: middle;
      }

      .col-row--pk {
        background: rgba(91, 106, 245, 0.06);
      }

      .col-pk {
        width: 32px;
        text-align: center;
      }
      .col-narrow {
        width: 80px;
      }
      .col-action {
        width: 32px;
      }
      .center {
        text-align: center;
      }

      .empty-row {
        text-align: center;
        color: var(--text-muted);
        font-size: 12px;
        padding: 16px;
      }

      /* Constraints */
      .constraint-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
        flex-wrap: wrap;
      }

      .constraint-row--col {
        flex-direction: column;
        align-items: stretch;
      }

      .fk-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .flex-1 {
        flex: 1;
        min-width: 80px;
      }
      .flex-2 {
        flex: 2;
        min-width: 120px;
      }

      .arrow {
        color: var(--text-muted);
        flex-shrink: 0;
      }

      .check-label {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--text-secondary);
        white-space: nowrap;
        flex-shrink: 0;
      }

      /* Footer */
      .designer__footer {
        padding: 12px 16px;
        border-top: 1px solid var(--border);
        background: var(--bg-elevated);
        flex-shrink: 0;
      }

      .preview-block {
        background: var(--bg-base);
        border: 1px solid var(--border);
        border-radius: 6px;
        margin-bottom: 10px;
        overflow: hidden;
      }

      .preview-block__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: var(--bg-elevated);
        border-bottom: 1px solid var(--border);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
      }

      .warn-badge {
        background: rgba(245, 166, 35, 0.15);
        color: #f5a623;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
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
        max-height: 200px;
        overflow-y: auto;
      }

      .preview-warn {
        padding: 4px 12px 6px;
        font-size: 11px;
        color: #f5a623;
        border-top: 1px solid var(--border);
      }

      .footer-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .btn-icon {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 2px 4px;
        font-size: 13px;
        opacity: 0.5;
        border-radius: 3px;
        transition: opacity 0.1s;
        &:hover {
          opacity: 1;
        }
      }
    `,
  ],
})
export class TableDesignerComponent implements OnInit {
  @Input({ required: true }) connectionId!: string;
  /** Pre-fill schema when opening */
  @Input() schema = 'public';
  /** Set for ALTER TABLE mode */
  @Input() editMode = false;
  @Input() existingTable = '';

  @Output() closeRequested = new EventEmitter<void>();
  @Output() executed = new EventEmitter<void>();

  private ddlSvc = inject(DdlService);
  private metaSvc = inject(MetadataService);
  private toast = inject(ToastService);

  // Form state
  schemas = signal<string[]>(['public']);
  selectedSchema = 'public';
  tableName = '';
  tableComment = '';

  columns = signal<ColumnRow[]>([]);
  indexes = signal<(CreateIndexRequest & { name: string })[]>([]);
  foreignKeys = signal<(CreateForeignKeyRequest & { name: string })[]>([]);
  checks = signal<CreateCheckConstraintRequest[]>([]);
  renames = signal<{ from: string; to: string }[]>([]);
  dropColumnsText = '';

  // Track text-bound field mirrors
  idxColumnsText: string[] = [];
  fkColsText: string[] = [];
  fkRefColsText: string[] = [];

  previewSql = signal('');
  warnings = signal<string[]>([]);
  previewLoading = signal(false);
  executing = signal(false);

  pgTypes = PG_TYPES;
  fkActions = ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'];

  ngOnInit() {
    this.metaSvc.getSchemas(this.connectionId).subscribe({
      next: (s) => {
        this.schemas.set(s.map((sc) => sc.name));
        if (this.schema) this.selectedSchema = this.schema;
      },
      error: () => this.schemas.set([this.schema || 'public']),
    });
    // Start with one default column
    if (!this.editMode) {
      this.addColumn();
    }
  }

  // ── Columns ──────────────────────────────────────────────────────────────────

  addColumn() {
    this.columns.update((cols) => [
      ...cols,
      {
        _id: newId(),
        name: '',
        type: 'text',
        nullable: true,
        isPk: false,
        identity: false,
        unique: false,
      },
    ]);
  }

  removeColumn(id: string) {
    this.columns.update((cols) => cols.filter((c) => c._id !== id));
  }

  togglePk(col: ColumnRow, val: boolean) {
    col.isPk = val;
    if (val) {
      col.nullable = false;
    }
  }

  toggleIdentity(col: ColumnRow, val: boolean) {
    col.identity = val;
    if (val) {
      col.type = 'bigserial';
      col.nullable = false;
      col.defaultValue = '';
    }
  }

  onTypeChange(col: ColumnRow) {
    col.length = undefined;
    col.precision = undefined;
    col.scale = undefined;
  }

  needsLength(type: string): boolean {
    return ['character varying', 'varchar', 'char', 'character'].includes(type);
  }

  needsPrecision(type: string): boolean {
    return ['numeric', 'decimal'].includes(type);
  }

  // ── Indexes / FK / Checks ─────────────────────────────────────────────────

  addIndex() {
    this.indexes.update((arr) => [
      ...arr,
      { name: '', columns: [], unique: false },
    ]);
    this.idxColumnsText.push('');
  }

  removeIndex(i: number) {
    this.indexes.update((arr) => arr.filter((_, idx) => idx !== i));
    this.idxColumnsText.splice(i, 1);
  }

  addFk() {
    this.foreignKeys.update((arr) => [
      ...arr,
      {
        name: '',
        columns: [],
        referencedSchema: this.selectedSchema,
        referencedTable: '',
        referencedColumns: [],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    ]);
    this.fkColsText.push('');
    this.fkRefColsText.push('');
  }

  removeFk(i: number) {
    this.foreignKeys.update((arr) => arr.filter((_, idx) => idx !== i));
    this.fkColsText.splice(i, 1);
    this.fkRefColsText.splice(i, 1);
  }

  addCheck() {
    this.checks.update((arr) => [...arr, { name: '', expression: '' }]);
  }

  removeCheck(i: number) {
    this.checks.update((arr) => arr.filter((_, idx) => idx !== i));
  }

  addRename() {
    this.renames.update((arr) => [...arr, { from: '', to: '' }]);
  }

  removeRename(i: number) {
    this.renames.update((arr) => arr.filter((_, idx) => idx !== i));
  }

  splitCols(text: string): string[] {
    return text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // ── Preview / Execute ─────────────────────────────────────────────────────

  preview() {
    this.previewLoading.set(true);
    this.previewSql.set('');
    this.warnings.set([]);

    const obs = this.editMode
      ? this.ddlSvc.previewAlterTable(this.buildAlterDto())
      : this.ddlSvc.previewCreateTable(this.buildCreateDto());
    obs.subscribe({
      next: (res) => {
        this.previewSql.set(res.sql);
        this.warnings.set(res.warnings ?? []);
        this.previewLoading.set(false);
      },
      error: (err) => {
        this.previewLoading.set(false);
        this.toast.error(err?.error?.message ?? 'Preview failed');
      },
    });
  }

  execute() {
    if (!this.previewSql()) {
      this.preview();
      return;
    }
    this.executing.set(true);
    const obs = this.editMode
      ? this.ddlSvc.executeAlterTable(this.buildAlterDto())
      : this.ddlSvc.executeCreateTable(this.buildCreateDto());
    obs.subscribe({
      next: (res) => {
        this.executing.set(false);
        if (res.success) {
          this.toast.success(`DDL executed in ${res.durationMs}ms`);
          this.executed.emit();
        } else {
          this.toast.error(res.error ?? 'DDL execution failed');
        }
      },
      error: (err) => {
        this.executing.set(false);
        this.toast.error(err?.error?.message ?? 'Execution failed');
      },
    });
  }

  // ── DTO builders ──────────────────────────────────────────────────────────

  private buildCreateDto() {
    const cols = this.columns();
    const pkCols = cols.filter((c) => c.isPk).map((c) => c.name);
    return {
      connectionId: this.connectionId,
      schema: this.selectedSchema,
      tableName: this.tableName,
      comment: this.tableComment || undefined,
      columns: cols.map((col) => this.toCreateTableColumn(col)),
      primaryKey: pkCols.length ? pkCols : undefined,
      indexes: this.indexes().length ? this.indexes() : undefined,
      foreignKeys: this.foreignKeys().length ? this.foreignKeys() : undefined,
      checks: this.checks().filter((c) => c.expression).length
        ? this.checks().filter((c) => c.expression)
        : undefined,
    };
  }

  private buildAlterDto() {
    const cols = this.columns();
    const dropCols = this.dropColumnsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      connectionId: this.connectionId,
      schema: this.schema,
      tableName: this.existingTable,
      addColumns: cols.length
        ? cols.map((col) => this.toCreateTableColumn(col))
        : undefined,
      dropColumns: dropCols.length ? dropCols : undefined,
      renameColumns: this.renames().filter((r) => r.from && r.to).length
        ? this.renames().filter((r) => r.from && r.to)
        : undefined,
    };
  }

  private toCreateTableColumn(col: ColumnRow): CreateTableColumn {
    return {
      name: col.name,
      type: col.type,
      length: col.length,
      precision: col.precision,
      scale: col.scale,
      nullable: col.nullable,
      defaultValue: col.defaultValue,
      identity: col.identity,
      unique: col.unique,
      comment: col.comment,
    };
  }
}
