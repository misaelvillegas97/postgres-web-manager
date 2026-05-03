import {
  Component,
  inject,
  signal,
  OnInit,
  OnDestroy,
  computed,
  effect,
  ViewChild,
} from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { ConnectionsService } from '../../core/services/connections.service';
import { QueryService } from '../../core/services/query.service';
import { MetadataService } from '../../core/services/metadata.service';
import { SessionService } from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import { QueryTabsService } from '../../core/services/query-tabs.service';
import { MetadataTreeComponent } from './components/metadata-tree/metadata-tree.component';
import { ResultTableComponent, ResultColumn } from './components/result-table/result-table.component';
import { SqlEditorComponent, CompletionSchema } from './components/query-editor/sql-editor.component';
import { QueryTabsBarComponent } from './components/query-editor/query-tabs-bar.component';
import { TableBrowserComponent } from './components/table-browser/table-browser.component';
import { TableDesignerComponent } from './components/table-designer/table-designer.component';
import { QueryAnalyzerComponent } from './components/query-analyzer/query-analyzer.component';
import { TreeNode } from './components/metadata-tree/metadata-tree.component';

type ResultTab = 'results' | 'history' | 'notices' | 'explain';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [DatePipe, SlicePipe, MetadataTreeComponent, ResultTableComponent, SqlEditorComponent, QueryTabsBarComponent, TableBrowserComponent, TableDesignerComponent, QueryAnalyzerComponent],
  template: `
    <div class="workspace">
      <!-- Left sidebar: metadata tree -->
      <aside class="workspace__sidebar">
        @if (connectionId()) {
          <app-metadata-tree
            [connectionId]="connectionId()!"
            (tableSelected)="openTableBrowser($event)"
          />
        } @else {
          <div class="ws-no-conn">
            <p>No connection selected</p>
            <button class="btn btn--primary btn--sm" (click)="goConnections()">Connect</button>
          </div>
        }
      </aside>

      <!-- Main area -->
      <div class="workspace__main">

        <!-- Main view switcher -->
        <div class="view-switcher">
          <button
            class="view-btn"
            [class.view-btn--active]="mainView() === 'editor'"
            (click)="mainView.set('editor')"
          >SQL Editor</button>
          @if (browserTarget()) {
            <button
              class="view-btn"
              [class.view-btn--active]="mainView() === 'browser'"
              (click)="mainView.set('browser')"
            >
              📋 {{ browserTarget()!.schema }}.{{ browserTarget()!.table }}
              <span class="view-btn__close" (click)="closeBrowser($event)">×</span>
            </button>
          }
          @if (designerMode() === 'create') {
            <button
              class="view-btn"
              [class.view-btn--active]="mainView() === 'designer'"
              (click)="mainView.set('designer')"
            >
              🛠 New Table
              <span class="view-btn__close" (click)="closeDesigner($event)">×</span>
            </button>
          }
          @if (designerMode() === 'alter' && alterTarget()) {
            <button
              class="view-btn"
              [class.view-btn--active]="mainView() === 'designer'"
              (click)="mainView.set('designer')"
            >
              ✏ {{ alterTarget()!.schema }}.{{ alterTarget()!.table }}
              <span class="view-btn__close" (click)="closeDesigner($event)">×</span>
            </button>
          }
          @if (connectionId()) {
            <button class="view-btn view-btn--new" (click)="openNewTableDesigner()">+ New Table</button>
          }
        </div>

        <!-- SQL Editor view -->
        @if (mainView() === 'editor') {
          <div class="editor-pane">
            <!-- Tab bar -->
            <app-query-tabs-bar />

            <!-- Toolbar -->
            <div class="editor-pane__toolbar">
              <span class="editor-pane__label">
                {{ tabsSvc.activeTab().title }}
                @if (tabsSvc.activeTab().isDirty) {<span class="dirty-dot"></span>}
              </span>
              <div class="editor-pane__actions">
                <button
                  class="btn btn--primary btn--sm"
                  (click)="runActiveQuery()"
                  [disabled]="running() || !connectionId()"
                  title="Run selection or all (Ctrl+Enter)"
                >
                  @if (running()) { <span class="spinner"></span> Running… }
                  @else { ▶ Run }
                </button>
                @if (running()) {
                  <button class="btn btn--danger btn--sm" (click)="cancelQuery()">■ Cancel</button>
                }
                <button class="btn btn--ghost btn--sm" (click)="formatSql()" title="Format SQL (Ctrl+Shift+F)">Format</button>
                <button class="btn btn--ghost btn--sm" (click)="clearEditor()">Clear</button>
                <button class="btn btn--ghost btn--sm" (click)="openExplain()" [disabled]="!connectionId()" title="Explain query plan">🔍 Explain</button>
              </div>
            </div>

            <!-- Monaco Editor -->
            <app-sql-editor
              #sqlEditor
              class="editor-pane__monaco"
              [value]="tabsSvc.activeTab().sql"
              [completionSchema]="completionSchema()"
              (valueChange)="onSqlChange($event)"
              (runQuery)="runQueryText($event)"
              (formatRequest)="formatSql()"
            />
          </div>

          <!-- Result panel -->
          <div class="result-pane">
            <div class="result-pane__tabs">
              <button
                class="tab-btn"
                [class.tab-btn--active]="activeResultTab() === 'results'"
                (click)="activeResultTab.set('results')"
              >
                Results
                @if (tabsSvc.activeTab().result?.rowCount !== undefined) {
                  <span class="badge badge--neutral ml-1">{{ tabsSvc.activeTab().result?.rowCount }}</span>
                }
              </button>
              <button
                class="tab-btn"
                [class.tab-btn--active]="activeResultTab() === 'history'"
                (click)="loadHistory(); activeResultTab.set('history')"
              >History</button>
              @if (tabsSvc.activeTab().result?.notices?.length) {
                <button
                  class="tab-btn"
                  [class.tab-btn--active]="activeResultTab() === 'notices'"
                  (click)="activeResultTab.set('notices')"
                >
                  Messages <span class="badge badge--warn ml-1">{{ tabsSvc.activeTab().result!.notices!.length }}</span>
                </button>
              }
              <button
                class="tab-btn"
                [class.tab-btn--active]="activeResultTab() === 'explain'"
                (click)="activeResultTab.set('explain')"
              >🔍 Explain</button>
            </div>

            <div class="result-pane__body">
              @if (activeResultTab() === 'results') {
                <app-result-table
                  [result]="currentResult()"
                  [queryDone]="currentDone()"
                  [queryError]="currentError()"
                />
              }
              @if (activeResultTab() === 'history') {
                <div class="history-list">
                  @for (entry of history(); track entry.id) {
                    <div class="history-item" (click)="loadFromHistory(entry.sql)">
                      <div class="history-item__sql">{{ entry.sql | slice:0:120 }}</div>
                      <div class="history-item__meta">
                        <span [class]="'badge badge--' + (entry.status === 'success' ? 'success' : 'danger')">
                          {{ entry.status }}
                        </span>
                        <span class="text-muted">{{ entry.durationMs }}ms</span>
                        <span class="text-muted">{{ entry.startedAt | date:'HH:mm:ss' }}</span>
                      </div>
                    </div>
                  } @empty {
                    <div class="history-empty">No query history yet</div>
                  }
                </div>
              }
              @if (activeResultTab() === 'notices') {
                <div class="notices-list">
                  @for (notice of tabsSvc.activeTab().result?.notices ?? []; track $index) {
                    <div class="notice-item">
                      <span class="notice-icon">ℹ</span>
                      <span>{{ notice }}</span>
                    </div>
                  }
                </div>
              }
              @if (activeResultTab() === 'explain' && connectionId()) {
                <app-query-analyzer
                  [connectionId]="connectionId()!"
                  [sql]="explainSql()"
                />
              }
            </div>
          </div>
        }

        <!-- Table Browser view -->
        @if (mainView() === 'browser' && browserTarget() && connectionId()) {
          <app-table-browser
            class="tb-host"
            [connectionId]="connectionId()!"
            [schema]="browserTarget()!.schema"
            [table]="browserTarget()!.table"
          />
        }

        <!-- Table Designer view (create) -->
        @if (mainView() === 'designer' && designerMode() === 'create' && connectionId()) {
          <app-table-designer
            class="tb-host"
            [connectionId]="connectionId()!"
            [schema]="activeSchema()"
            [editMode]="false"
            (cancel)="closeDesigner()"
            (executed)="onDesignerDone()"
          />
        }

        <!-- Table Designer view (alter) -->
        @if (mainView() === 'designer' && designerMode() === 'alter' && alterTarget() && connectionId()) {
          <app-table-designer
            class="tb-host"
            [connectionId]="connectionId()!"
            [schema]="alterTarget()!.schema"
            [editMode]="true"
            [existingTable]="alterTarget()!.table"
            (cancel)="closeDesigner()"
            (executed)="onDesignerDone()"
          />
        }

      </div>
    </div>
    `,
  styles: [`
    .workspace {
      display: flex;
      height: 100%;
      overflow: hidden;
    }

    .workspace__sidebar {
      width: var(--sidebar-w, 260px);
      flex-shrink: 0;
      border-right: 1px solid var(--border);
      background: var(--bg-surface);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .ws-no-conn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      p { color: var(--text-muted); font-size: 13px; }
    }

    .workspace__main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-width: 0;
    }

    /* Editor */
    .editor-pane {
      flex-shrink: 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      height: 280px;
    }

    /* View switcher */
    .view-switcher {
      display: flex;
      align-items: stretch;
      gap: 0;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .view-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 16px;
      font-size: 12px;
      color: var(--text-muted);
      border-bottom: 2px solid transparent;
      background: transparent;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      outline: none;
      border-top: none;
      border-left: none;
      border-right: none;

      &:hover { color: var(--text-primary); }
      &--active { color: var(--accent); border-bottom-color: var(--accent); }
    }

    .view-btn--new {
      margin-left: auto;
      color: var(--accent);
      font-weight: 600;
    }

    .view-btn__close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border-radius: 2px;
      font-size: 14px;
      line-height: 1;
      color: var(--text-muted);
      transition: background 0.1s, color 0.1s;

      &:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
    }

    /* Table browser host */
    .tb-host {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .editor-pane__toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 10px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .editor-pane__label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .dirty-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
    }

    .editor-pane__actions { display: flex; gap: 6px; }

    .editor-pane__monaco {
      flex: 1;
      min-height: 0;
      display: block;
    }

    /* Result */
    .result-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }

    .result-pane__tabs {
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 16px;
      font-size: 12px;
      color: var(--text-muted);
      border-bottom: 2px solid transparent;
      background: transparent;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      outline: none;
      border-top: none;
      border-left: none;
      border-right: none;

      &:hover { color: var(--text-primary); }
      &--active { color: var(--accent); border-bottom-color: var(--accent); }
    }

    .ml-1 { margin-left: 2px; }

    .result-pane__body {
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    /* History */
    .history-list {
      height: 100%;
      overflow-y: auto;
    }

    .history-item {
      padding: 8px 14px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.1s;

      &:hover { background: var(--bg-hover); }
    }

    .history-item__sql {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .history-item__meta {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 4px;
      font-size: 11px;
    }

    .history-empty {
      color: var(--text-muted);
      font-size: 13px;
      padding: 32px;
      text-align: center;
    }

    /* Notices */
    .notices-list {
      height: 100%;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .notice-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-elevated);
      border-radius: 6px;
      font-size: 12px;
      border-left: 3px solid var(--accent);
    }

    .notice-icon { flex-shrink: 0; color: var(--accent); }
  `],
})
export class WorkspaceComponent implements OnInit, OnDestroy {
  private connSvc = inject(ConnectionsService);
  private querySvc = inject(QueryService);
  private metaSvc = inject(MetadataService);
  private sessionSvc = inject(SessionService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private subs = new Subscription();

  @ViewChild('sqlEditor') sqlEditorRef?: SqlEditorComponent;

  tabsSvc = inject(QueryTabsService);

  running = signal(false);
  activeResultTab = signal<ResultTab>('results');
  completionSchema = signal<CompletionSchema | null>(null);
  history = signal<import('../../core/services/query.service').QueryHistoryEntry[]>([]);

  // View switching: 'editor' | 'browser' | 'designer'
  mainView = signal<'editor' | 'browser' | 'designer'>('editor');
  browserTarget = signal<{ schema: string; table: string } | null>(null);
  designerMode = signal<'create' | 'alter' | null>(null);
  alterTarget = signal<{ schema: string; table: string } | null>(null);
  activeSchema = signal('public');

  // Explain: sql snapshot sent to analyzer
  explainSql = signal('');

  connectionId = computed(() => this.connSvc.activeConnection?.id ?? null);

  // Derived signals from active tab result
  currentResult = computed(() => {
    const r = this.tabsSvc.activeTab().result;
    if (!r || r.error) return null;
    return { columns: r.columns as ResultColumn[], rows: r.rows };
  });

  currentDone = computed(() => {
    const r = this.tabsSvc.activeTab().result;
    if (!r || r.error) return null;
    return { rowCount: r.rowCount, durationMs: r.durationMs, command: r.command };
  });

  currentError = computed(() => {
    const r = this.tabsSvc.activeTab().result;
    return r?.error ?? null;
  });

  constructor() {
    // When connection changes, reload completion schema
    effect(() => {
      const connId = this.connectionId();
      if (connId) {
        this.loadCompletionSchema(connId);
        if (!this.sessionSvc.connected()) {
          this.sessionSvc.connect(connId);
        }
      }
    });
  }

  ngOnInit() {
    // Subscribe to WebSocket events — stream rows into active tab
    this.subs.add(
      this.sessionSvc.on('query.rows').subscribe((e) => {
        const payload = e.payload;
        const tabId = this.tabsSvc.activeTab().id;
        const current = this.tabsSvc.activeTab().result;
        if (payload.columns && !current) {
          this.tabsSvc.setResult(tabId, {
            columns: payload.columns,
            rows: [],
            rowCount: 0,
            durationMs: 0,
          });
        }
        const r = this.tabsSvc.activeTab().result;
        if (r) {
          this.tabsSvc.setResult(tabId, { ...r, rows: [...r.rows, ...payload.rows] });
        }
      }),
    );

    this.subs.add(
      this.sessionSvc.on('query.done').subscribe((e) => {
        this.running.set(false);
        const tabId = this.tabsSvc.activeTab().id;
        const r = this.tabsSvc.activeTab().result;
        this.tabsSvc.setResult(tabId, {
          columns: r?.columns ?? [],
          rows: r?.rows ?? [],
          rowCount: e.payload.rowCount,
          durationMs: e.payload.durationMs,
          command: e.payload.command,
          notices: r?.notices,
        });
      }),
    );

    this.subs.add(
      this.sessionSvc.on('query.notice').subscribe((e) => {
        const tabId = this.tabsSvc.activeTab().id;
        const r = this.tabsSvc.activeTab().result ?? { columns: [], rows: [], rowCount: 0, durationMs: 0 };
        const notices = [...(r.notices ?? []), String(e.payload.message)];
        this.tabsSvc.setResult(tabId, { ...r, notices });
      }),
    );

    this.subs.add(
      this.sessionSvc.on('query.error').subscribe((e) => {
        this.running.set(false);
        const tabId = this.tabsSvc.activeTab().id;
        this.tabsSvc.setResult(tabId, {
          columns: [],
          rows: [],
          rowCount: 0,
          durationMs: 0,
          error: { message: e.payload.message, code: e.payload.code, detail: e.payload.detail, hint: e.payload.hint },
        });
      }),
    );

    this.subs.add(
      this.sessionSvc.on('query.cancelled').subscribe(() => {
        this.running.set(false);
        this.toast.info('Query cancelled');
      }),
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  onSqlChange(sql: string) {
    this.tabsSvc.updateSql(this.tabsSvc.activeTab().id, sql);
  }

  runActiveQuery() {
    const sql = this.sqlEditorRef?.getActiveSelection() ?? this.tabsSvc.activeTab().sql;
    this.runQueryText(sql);
  }

  runQueryText(sql: string) {
    const text = sql.trim();
    const connId = this.connectionId();
    if (!text || !connId || this.running()) return;

    this.running.set(true);
    const tabId = this.tabsSvc.activeTab().id;
    // Clear previous result
    this.tabsSvc.setResult(tabId, { columns: [], rows: [], rowCount: 0, durationMs: 0 });
    this.activeResultTab.set('results');

    if (this.sessionSvc.connected()) {
      this.sessionSvc.executeQuery(text);
    } else {
      this.querySvc.execute({ connectionId: connId, sql: text }).subscribe({
        next: (res) => {
          this.running.set(false);
          this.tabsSvc.setResult(tabId, {
            columns: res.columns,
            rows: res.rows as unknown[][],
            rowCount: res.rowCount,
            durationMs: res.durationMs,
            command: res.command,
          });
        },
        error: (err) => {
          this.running.set(false);
          this.tabsSvc.setResult(tabId, {
            columns: [],
            rows: [],
            rowCount: 0,
            durationMs: 0,
            error: { message: err?.error?.message ?? 'Query failed', code: err?.error?.code },
          });
        },
      });
    }
  }

  cancelQuery() {
    this.sessionSvc.cancelQuery();
  }

  clearEditor() {
    const tabId = this.tabsSvc.activeTab().id;
    this.tabsSvc.updateSql(tabId, '');
    if (this.sqlEditorRef) this.sqlEditorRef.setValue('');
  }

  formatSql() {
    const tabId = this.tabsSvc.activeTab().id;
    const sql = this.tabsSvc.activeTab().sql;
    const connId = this.connectionId();
    if (!sql.trim() || !connId) return;
    this.querySvc.format(sql).subscribe({
      next: (res) => {
        this.tabsSvc.updateSql(tabId, res.sql);
        if (this.sqlEditorRef) this.sqlEditorRef.setValue(res.sql);
      },
      error: () => this.toast.error('Failed to format SQL'),
    });
  }

  loadHistory() {
    const connId = this.connectionId();
    if (!connId) return;
    this.querySvc.getHistory(connId).subscribe({
      next: (h) => this.history.set(h),
      error: () => {},
    });
  }

  loadFromHistory(sql: string) {
    const tabId = this.tabsSvc.activeTab().id;
    this.tabsSvc.updateSql(tabId, sql);
    if (this.sqlEditorRef) this.sqlEditorRef.setValue(sql);
    this.activeResultTab.set('results');
  }

  goConnections() {
    this.router.navigate(['/connections']);
  }

  openTableBrowser(node: TreeNode) {
    if ((node.type === 'table' || node.type === 'view' || node.type === 'matview') && node.schema && node.table) {
      this.browserTarget.set({ schema: node.schema, table: node.table });
      this.mainView.set('browser');
    }
  }

  closeBrowser(event: MouseEvent) {
    event.stopPropagation();
    this.browserTarget.set(null);
    this.mainView.set('editor');
  }

  openNewTableDesigner() {
    this.designerMode.set('create');
    this.alterTarget.set(null);
    this.mainView.set('designer');
  }

  openExplain() {
    const sql = this.sqlEditorRef?.getActiveSelection() ?? this.tabsSvc.activeTab().sql;
    this.explainSql.set(sql.trim());
    this.activeResultTab.set('explain');
  }

  openAlterTable(schema: string, table: string) {
    this.alterTarget.set({ schema, table });
    this.designerMode.set('alter');
    this.mainView.set('designer');
  }

  closeDesigner(event?: MouseEvent) {
    event?.stopPropagation();
    this.designerMode.set(null);
    this.alterTarget.set(null);
    this.mainView.set('editor');
  }

  onDesignerDone() {
    this.toast.success('DDL applied successfully');
    this.closeDesigner();
  }

  private loadCompletionSchema(connId: string) {
    this.metaSvc.getSchemas(connId).subscribe({
      next: (schemas) => {
        const schemaNames = schemas.map((s) => s.name);
        // Load tables for all schemas
        const tableObservables = schemaNames.map((s) =>
          this.metaSvc.getTables(connId, s),
        );
        forkJoin(tableObservables).subscribe({
          next: (tablesBySchema) => {
            const tables = tablesBySchema.flat().map((t) => ({
              schema: t.schema,
              name: t.name,
              type: t.type,
            }));
            // Load functions for public schema  
            this.metaSvc.getFunctions(connId, 'public').subscribe({
              next: (fns) => {
                this.completionSchema.set({
                  schemas: schemaNames,
                  tables,
                  columns: [], // loaded lazily if needed
                  functions: fns.map((f) => ({ schema: f.schema, name: f.name, returnType: f.returnType })),
                });
              },
              error: () => {
                this.completionSchema.set({ schemas: schemaNames, tables, columns: [], functions: [] });
              },
            });
          },
          error: () => {
            this.completionSchema.set({ schemas: schemaNames, tables: [], columns: [], functions: [] });
          },
        });
      },
      error: () => {},
    });
  }
}
