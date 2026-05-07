import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom, forkJoin, Subscription } from 'rxjs';
import {
  ConnectionsService,
  ConnectionStatus,
} from '../../core/services/connections.service';
import { QueryService } from '../../core/services/query.service';
import { MetadataService } from '../../core/services/metadata.service';
import {
  SessionService,
  WsQueryRows,
} from '../../core/services/session.service';
import { ToastService } from '../../core/services/toast.service';
import {
  QueryTabResult,
  QueryTabsService,
} from '../../core/services/query-tabs.service';
import { ViewportService } from '../../core/services/viewport.service';
import {
  LocalQueryHistoryEntry,
  LocalQueryHistoryService,
} from '../../core/services/local-query-history.service';
import {
  MetadataTreeComponent,
  TreeNode,
} from './components/metadata-tree/metadata-tree.component';
import {
  ResultColumn,
  ResultTableComponent,
} from './components/result-table/result-table.component';
import {
  CompletionSchema,
  SqlEditorComponent,
} from './components/query-editor/sql-editor.component';
import { QueryTabsBarComponent } from './components/query-editor/query-tabs-bar.component';
import { TableBrowserComponent } from './components/table-browser/table-browser.component';
import { TableDesignerComponent } from './components/table-designer/table-designer.component';
import { QueryAnalyzerComponent } from './components/query-analyzer/query-analyzer.component';

type ResultTab = 'results' | 'history' | 'notices' | 'explain';

export function mergeQueryRowsResult(
  current: QueryTabResult | null,
  payload: WsQueryRows,
): QueryTabResult {
  return {
    ...(current ?? { rowCount: 0, durationMs: 0, rows: [], columns: [] }),
    columns: payload.columns ?? current?.columns ?? [],
    rows: [...(current?.rows ?? []), ...payload.rows],
  };
}

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    SlicePipe,
    MetadataTreeComponent,
    ResultTableComponent,
    SqlEditorComponent,
    QueryTabsBarComponent,
    TableBrowserComponent,
    TableDesignerComponent,
    QueryAnalyzerComponent,
  ],
  template: `
    <div
      class="workspace"
      [class.workspace--objects-open]="mobileObjectsOpen()"
      [class.workspace--mobile-editor]="mobilePanel() === 'editor'"
      [class.workspace--mobile-results]="mobilePanel() === 'results'"
    >
      <div class="mobile-workspace-nav">
        <button
          type="button"
          class="mobile-mode-btn"
          [class.mobile-mode-btn--active]="mobileObjectsOpen()"
          (click)="openMobileObjects()"
        >
          <span>Objects</span>
        </button>
        <button
          type="button"
          class="mobile-mode-btn"
          [class.mobile-mode-btn--active]="
            mainView() === 'editor' && mobilePanel() === 'editor'
          "
          (click)="showMobileEditor()"
        >
          <span>Editor</span>
        </button>
        <button
          type="button"
          class="mobile-mode-btn"
          [class.mobile-mode-btn--active]="
            mainView() === 'editor' && mobilePanel() === 'results'
          "
          (click)="showMobileResults()"
        >
          <span>Results</span>
          @if (tabsSvc.activeTab().result?.rowCount !== undefined) {
            <small>{{ tabsSvc.activeTab().result?.rowCount }}</small>
          }
        </button>
        @if (browserTarget()) {
          <button
            type="button"
            class="mobile-mode-btn"
            [class.mobile-mode-btn--active]="mainView() === 'browser'"
            (click)="showMobileTable()"
          >
            <span>Table</span>
          </button>
        }
      </div>

      @if (mobileObjectsOpen()) {
        <button
          type="button"
          class="mobile-objects-backdrop"
          aria-label="Close objects"
          (click)="mobileObjectsOpen.set(false)"
        ></button>
      }

      <!-- Left sidebar: metadata tree -->
      <aside class="workspace__sidebar">
        <div class="mobile-drawer-header">
          <span>Database Objects</span>
          <button
            type="button"
            class="mobile-drawer-close"
            (click)="mobileObjectsOpen.set(false)"
          >
            ×
          </button>
        </div>
        @if (connectionId() && connectionReady()) {
          <app-metadata-tree
            [connectionId]="connectionId()!"
            (tableSelected)="openTableBrowser($event)"
          />
        } @else if (connectionId()) {
          <div class="ws-no-conn">
            <p>Connection needs reconnect</p>
            <button
              class="btn btn--primary btn--sm"
              (click)="reconnectDialogOpen.set(true)"
            >
              Reconnect
            </button>
          </div>
        } @else {
          <div class="ws-no-conn">
            <p>No connection selected</p>
            <button class="btn btn--primary btn--sm" (click)="goConnections()">
              Connect
            </button>
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
          >
            SQL Editor
          </button>
          @if (browserTarget()) {
            <div
              class="view-btn"
              role="tab"
              tabindex="0"
              [attr.aria-selected]="mainView() === 'browser'"
              [class.view-btn--active]="mainView() === 'browser'"
              (click)="mainView.set('browser')"
              (keydown.enter)="mainView.set('browser')"
              (keydown.space)="mainView.set('browser'); $event.preventDefault()"
            >
              📋 {{ browserTarget()!.schema }}.{{ browserTarget()!.table }}
              <button
                type="button"
                class="view-btn__close"
                (click)="closeBrowser($event)"
              >
                ×
              </button>
            </div>
          }
          @if (designerMode() === 'create') {
            <div
              class="view-btn"
              role="tab"
              tabindex="0"
              [attr.aria-selected]="mainView() === 'designer'"
              [class.view-btn--active]="mainView() === 'designer'"
              (click)="mainView.set('designer')"
              (keydown.enter)="mainView.set('designer')"
              (keydown.space)="
                mainView.set('designer'); $event.preventDefault()
              "
            >
              🛠 New Table
              <button
                type="button"
                class="view-btn__close"
                (click)="closeDesigner($event)"
              >
                ×
              </button>
            </div>
          }
          @if (designerMode() === 'alter' && alterTarget()) {
            <div
              class="view-btn"
              role="tab"
              tabindex="0"
              [attr.aria-selected]="mainView() === 'designer'"
              [class.view-btn--active]="mainView() === 'designer'"
              (click)="mainView.set('designer')"
              (keydown.enter)="mainView.set('designer')"
              (keydown.space)="
                mainView.set('designer'); $event.preventDefault()
              "
            >
              ✏ {{ alterTarget()!.schema }}.{{ alterTarget()!.table }}
              <button
                type="button"
                class="view-btn__close"
                (click)="closeDesigner($event)"
              >
                ×
              </button>
            </div>
          }
          @if (connectionReady()) {
            <button
              class="view-btn view-btn--new"
              (click)="openNewTableDesigner()"
            >
              + New Table
            </button>
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
                @if (tabsSvc.activeTab().isDirty) {
                  <span class="dirty-dot"></span>
                }
              </span>
              <div class="editor-pane__actions">
                <button
                  class="btn btn--primary btn--sm"
                  (click)="runActiveQuery()"
                  [disabled]="running() || !connectionReady()"
                  title="Run selection or all (Ctrl+Enter)"
                >
                  @if (running()) {
                    <span class="spinner"></span> Running…
                  } @else {
                    ▶ Run
                  }
                </button>
                @if (running()) {
                  <button
                    class="btn btn--danger btn--sm"
                    (click)="cancelQuery()"
                  >
                    ■ Cancel
                  </button>
                }
                <button
                  class="btn btn--ghost btn--sm"
                  (click)="formatSql()"
                  title="Format SQL (Ctrl+Shift+F)"
                >
                  Format
                </button>
                <button class="btn btn--ghost btn--sm" (click)="clearEditor()">
                  Clear
                </button>
                <button
                  class="btn btn--ghost btn--sm"
                  (click)="openExplain()"
                  [disabled]="!connectionReady()"
                  title="Explain query plan"
                >
                  🔍 Explain
                </button>
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
                  <span class="badge badge--neutral ml-1">{{
                    tabsSvc.activeTab().result?.rowCount
                  }}</span>
                }
              </button>
              <button
                class="tab-btn"
                [class.tab-btn--active]="activeResultTab() === 'history'"
                (click)="loadHistory(); activeResultTab.set('history')"
              >
                History
              </button>
              @if (tabsSvc.activeTab().result?.notices?.length) {
                <button
                  class="tab-btn"
                  [class.tab-btn--active]="activeResultTab() === 'notices'"
                  (click)="activeResultTab.set('notices')"
                >
                  Messages
                  <span class="badge badge--warn ml-1">{{
                    tabsSvc.activeTab().result!.notices!.length
                  }}</span>
                </button>
              }
              <button
                class="tab-btn"
                [class.tab-btn--active]="activeResultTab() === 'explain'"
                (click)="activeResultTab.set('explain')"
              >
                🔍 Explain
              </button>
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
                <div class="history-panel">
                  <div class="history-panel__toolbar">
                    <span>Local encrypted history</span>
                    <button
                      type="button"
                      class="btn btn--ghost btn--sm"
                      [disabled]="history().length === 0"
                      (click)="clearHistory()"
                    >
                      Clear
                    </button>
                  </div>
                  <div class="history-list">
                    @for (entry of history(); track entry.id) {
                      <button
                        type="button"
                        class="history-item"
                        (click)="loadFromHistory(entry.sql)"
                      >
                        <div class="history-item__sql">
                          {{ entry.sql | slice: 0 : 120 }}
                        </div>
                        <div class="history-item__meta">
                          <span
                            [class]="
                              'badge badge--' +
                              (entry.status === 'success'
                                ? 'success'
                                : entry.status === 'cancelled'
                                  ? 'warn'
                                  : 'danger')
                            "
                          >
                            {{ entry.status }}
                          </span>
                          @if (entry.rowCount !== undefined) {
                            <span class="text-muted"
                              >{{ entry.rowCount }} rows</span
                            >
                          }
                          @if (entry.durationMs !== undefined) {
                            <span class="text-muted"
                              >{{ entry.durationMs }}ms</span
                            >
                          }
                          <span class="text-muted">{{
                            entry.startedAt | date: 'HH:mm:ss'
                          }}</span>
                        </div>
                      </button>
                    } @empty {
                      <div class="history-empty">No query history yet</div>
                    }
                  </div>
                </div>
              }
              @if (activeResultTab() === 'notices') {
                <div class="notices-list">
                  @for (
                    notice of tabsSvc.activeTab().result?.notices ?? [];
                    track $index
                  ) {
                    <div class="notice-item">
                      <span class="notice-icon">ℹ</span>
                      <span>{{ notice }}</span>
                    </div>
                  }
                </div>
              }
              @if (activeResultTab() === 'explain' && connectionReady()) {
                <app-query-analyzer
                  [connectionId]="connectionId()!"
                  [sql]="explainSql()"
                />
              }
            </div>
          </div>
        }

        <!-- Table Browser view -->
        @if (mainView() === 'browser' && browserTarget() && connectionReady()) {
          <app-table-browser
            class="tb-host"
            [connectionId]="connectionId()!"
            [schema]="browserTarget()!.schema"
            [table]="browserTarget()!.table"
          />
        }

        <!-- Table Designer view (create) -->
        @if (
          mainView() === 'designer' &&
          designerMode() === 'create' &&
          connectionReady()
        ) {
          <app-table-designer
            class="tb-host"
            [connectionId]="connectionId()!"
            [schema]="activeSchema()"
            [editMode]="false"
            (closeRequested)="closeDesigner()"
            (executed)="onDesignerDone()"
          />
        }

        <!-- Table Designer view (alter) -->
        @if (
          mainView() === 'designer' &&
          designerMode() === 'alter' &&
          alterTarget() &&
          connectionReady()
        ) {
          <app-table-designer
            class="tb-host"
            [connectionId]="connectionId()!"
            [schema]="alterTarget()!.schema"
            [editMode]="true"
            [existingTable]="alterTarget()!.table"
            (closeRequested)="closeDesigner()"
            (executed)="onDesignerDone()"
          />
        }
      </div>
    </div>

    @if (reconnectDialogOpen()) {
      <button
        type="button"
        class="reconnect-backdrop"
        aria-label="Keep connection dialog open"
      ></button>
      <section
        class="reconnect-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reconnect-title"
      >
        <div class="reconnect-dialog__header">
          <div>
            <h2 id="reconnect-title">Reconnect database</h2>
            @if (connSvc.activeConnection; as active) {
              <p>{{ active.name }} · {{ active.database }}</p>
            }
          </div>
          <span
            [class]="
              'reconnect-state reconnect-state--' +
              (connectionStatus()?.state ?? 'locked')
            "
          >
            {{ connectionStatus()?.state ?? 'locked' }}
          </span>
        </div>

        <p class="reconnect-dialog__copy">
          This browser remembers the active connection, but the gateway needs an
          active pool before metadata or queries can run.
        </p>

        @if (requiresReconnectPassword()) {
          <label class="reconnect-field">
            <span>Password</span>
            <input
              name="reconnectPassword"
              type="password"
              autocomplete="current-password"
              [(ngModel)]="reconnectPassword"
              (keydown.enter)="unlockActiveConnection()"
            />
          </label>
        }

        @if (reconnectError()) {
          <p class="reconnect-error">{{ reconnectError() }}</p>
        }

        <div class="reconnect-dialog__actions">
          <button
            type="button"
            class="btn btn--ghost"
            (click)="goConnections()"
          >
            Connections
          </button>
          <button
            type="button"
            class="btn btn--primary"
            [disabled]="
              reconnecting() ||
              (requiresReconnectPassword() && !reconnectPassword.trim())
            "
            (click)="unlockActiveConnection()"
          >
            @if (reconnecting()) {
              <span class="spinner"></span> Reconnecting…
            } @else {
              Reconnect
            }
          </button>
        </div>
      </section>
    }
  `,
  styles: [
    `
      .workspace {
        display: flex;
        height: 100%;
        overflow: hidden;
        min-height: 0;
      }

      .workspace__sidebar {
        width: var(--sidebar-w, 260px);
        flex-shrink: 0;
        border-right: 1px solid var(--border);
        background: var(--bg-surface);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
      }

      .workspace__sidebar app-metadata-tree {
        display: flex;
        flex: 1;
        min-height: 0;
        min-width: 0;
      }

      .ws-no-conn {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        p {
          color: var(--text-muted);
          font-size: 13px;
        }
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
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: thin;
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
        transition:
          color 0.15s,
          border-color 0.15s;
        outline: none;
        border-top: none;
        border-left: none;
        border-right: none;
        font: inherit;
        min-width: 0;
        max-width: 260px;
        white-space: nowrap;

        &:hover {
          color: var(--text-primary);
        }
        &--active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }
      }

      .view-btn--new {
        margin-left: auto;
        color: var(--accent);
        font-weight: 600;
        flex: 0 0 auto;
      }

      .view-btn__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border: 0;
        border-radius: 2px;
        background: transparent;
        font-size: 14px;
        line-height: 1;
        color: var(--text-muted);
        cursor: pointer;
        transition:
          background 0.1s,
          color 0.1s;

        &:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-primary);
        }
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

      .editor-pane__actions {
        display: flex;
        gap: 6px;
      }

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
        transition:
          color 0.15s,
          border-color 0.15s;
        outline: none;
        border-top: none;
        border-left: none;
        border-right: none;

        &:hover {
          color: var(--text-primary);
        }
        &--active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }
      }

      .ml-1 {
        margin-left: 2px;
      }

      .result-pane__body {
        flex: 1;
        overflow: hidden;
        min-height: 0;
      }

      /* History */
      .history-panel {
        height: 100%;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .history-panel__toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 10px;
        border-bottom: 1px solid var(--border);
        color: var(--text-muted);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        flex-shrink: 0;
      }

      .history-list {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }

      .history-item {
        display: block;
        width: 100%;
        padding: 8px 14px;
        border: 0;
        border-bottom: 1px solid var(--border);
        background: transparent;
        cursor: pointer;
        text-align: left;
        transition: background 0.1s;

        &:hover {
          background: var(--bg-hover);
        }
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
        min-height: 0;
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

      .notice-icon {
        flex-shrink: 0;
        color: var(--accent);
      }
    `,
  ],
})
export class WorkspaceComponent implements OnInit, OnDestroy {
  history = signal<LocalQueryHistoryEntry[]>([]);
  private querySvc = inject(QueryService);
  private metaSvc = inject(MetadataService);
  private sessionSvc = inject(SessionService);
  connectionStatus = signal<ConnectionStatus | null>(null);
  private toast = inject(ToastService);
  private router = inject(Router);
  reconnectDialogOpen = signal(false);
  private subs = new Subscription();

  @ViewChild('sqlEditor') sqlEditorRef?: SqlEditorComponent;

  tabsSvc = inject(QueryTabsService);

  running = signal(false);
  activeResultTab = signal<ResultTab>('results');
  completionSchema = signal<CompletionSchema | null>(null);
  reconnecting = signal(false);
  reconnectError = signal('');
  reconnectPassword = '';
  mobilePanel = signal<'editor' | 'results'>('editor');
  mobileObjectsOpen = signal(false);
  connectionReady = computed(() => this.connectionStatus()?.active === true);
  currentDone = computed(() => {
    const r = this.tabsSvc.activeTab().result;
    if (!r || r.error) return null;
    return {
      rowCount: r.rowCount,
      durationMs: r.durationMs,
      command: r.command,
    };
  });
  protected connSvc = inject(ConnectionsService);
  protected viewport = inject(ViewportService);

  // View switching: 'editor' | 'browser' | 'designer'
  mainView = signal<'editor' | 'browser' | 'designer'>('editor');
  browserTarget = signal<{ schema: string; table: string } | null>(null);
  designerMode = signal<'create' | 'alter' | null>(null);
  alterTarget = signal<{ schema: string; table: string } | null>(null);
  activeSchema = signal('public');
  private localHistory = inject(LocalQueryHistoryService);
  private connectionInitToken = 0;

  // Explain: sql snapshot sent to analyzer
  explainSql = signal('');

  connectionId = computed(() => this.connSvc.activeConnection?.id ?? null);
  private pendingQueries = new Map<
    string,
    { connectionId: string; sql: string; startedAt: string }
  >();

  // Derived signals from active tab result
  currentResult = computed(() => {
    const r = this.tabsSvc.activeTab().result;
    if (!r || r.error) return null;
    return { columns: r.columns as ResultColumn[], rows: r.rows };
  });
  private pendingSubmittedQuery: {
    connectionId: string;
    sql: string;
    startedAt: string;
  } | null = null;

  currentError = computed(() => {
    const r = this.tabsSvc.activeTab().result;
    return r?.error ?? null;
  });

  constructor() {
    effect(() => {
      const connId = this.connectionId();
      if (connId) {
        void this.ensureConnectionReady(connId);
      } else {
        this.connectionStatus.set(null);
        this.reconnectDialogOpen.set(false);
        this.completionSchema.set(null);
      }
    });
  }

  ngOnInit() {
    // Subscribe to WebSocket events — stream rows into active tab
    this.subs.add(
      this.sessionSvc.on('query.start').subscribe((e) => {
        const pending = this.pendingSubmittedQuery;
        const connId = pending?.connectionId ?? this.connectionId();
        if (!connId) return;

        this.pendingQueries.set(e.payload.queryId, {
          connectionId: connId,
          sql: e.payload.sql ?? pending?.sql ?? this.tabsSvc.activeTab().sql,
          startedAt:
            e.payload.startedAt ??
            pending?.startedAt ??
            new Date().toISOString(),
        });
        this.pendingSubmittedQuery = null;
      }),
    );

    this.subs.add(
      this.sessionSvc.on('query.rows').subscribe((e) => {
        const payload = e.payload;
        const tabId = this.tabsSvc.activeTab().id;
        const current = this.tabsSvc.activeTab().result;
        this.tabsSvc.setResult(tabId, mergeQueryRowsResult(current, payload));
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
        void this.saveLocalHistory({
          queryId: e.payload.queryId,
          status: 'success',
          rowCount: e.payload.rowCount,
          durationMs: e.payload.durationMs,
        });
      }),
    );

    this.subs.add(
      this.sessionSvc.on('query.notice').subscribe((e) => {
        const tabId = this.tabsSvc.activeTab().id;
        const r = this.tabsSvc.activeTab().result ?? {
          columns: [],
          rows: [],
          rowCount: 0,
          durationMs: 0,
        };
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
          error: {
            message: e.payload.message,
            code: e.payload.code,
            detail: e.payload.detail,
            hint: e.payload.hint,
          },
        });
        void this.saveLocalHistory({
          queryId: e.payload.queryId,
          status: 'error',
          rowCount: 0,
          durationMs: 0,
          error: e.payload.message,
        });
      }),
    );

    this.subs.add(
      this.sessionSvc.on('query.cancelled').subscribe((e) => {
        this.running.set(false);
        this.toast.info('Query cancelled');
        if (e.payload.cancelled) {
          void this.saveLocalHistory({
            status: 'cancelled',
            rowCount: 0,
            durationMs: 0,
          });
        }
      }),
    );

    this.subs.add(
      this.sessionSvc.on('session.error').subscribe((e) => {
        const connId = this.connectionId();
        const message = e.payload.message ?? 'Failed to open database session';
        this.sessionSvc.disconnect();
        if (connId) {
          this.connectionStatus.set({
            connectionId: connId,
            state: 'unhealthy',
            active: false,
            canAutoUnlock: false,
            checkedAt: new Date().toISOString(),
            message,
          });
        }
        this.reconnectError.set(message);
        this.reconnectDialogOpen.set(true);
        this.toast.warning(message);
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
    const sql =
      this.sqlEditorRef?.getActiveSelection() ?? this.tabsSvc.activeTab().sql;
    this.runQueryText(sql);
  }

  runQueryText(sql: string) {
    const text = sql.trim();
    const connId = this.connectionId();
    if (!text || !connId || this.running()) return;
    if (!this.connectionReady()) {
      this.reconnectDialogOpen.set(true);
      void this.ensureConnectionReady(connId);
      return;
    }

    this.running.set(true);
    const tabId = this.tabsSvc.activeTab().id;
    const startedAt = new Date().toISOString();
    this.pendingSubmittedQuery = { connectionId: connId, sql: text, startedAt };
    // Clear previous result
    this.tabsSvc.setResult(tabId, {
      columns: [],
      rows: [],
      rowCount: 0,
      durationMs: 0,
    });
    this.activeResultTab.set('results');
    if (this.viewport.isMobile()) {
      this.mobilePanel.set('results');
      this.mainView.set('editor');
    }

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
          void this.saveLocalHistory({
            status: res.status === 'error' ? 'error' : 'success',
            rowCount: res.rowCount,
            durationMs: res.durationMs,
            error: res.error?.message,
          });
        },
        error: (err) => {
          this.running.set(false);
          this.tabsSvc.setResult(tabId, {
            columns: [],
            rows: [],
            rowCount: 0,
            durationMs: 0,
            error: {
              message: err?.error?.message ?? 'Query failed',
              code: err?.error?.code,
            },
          });
          void this.saveLocalHistory({
            status: 'error',
            rowCount: 0,
            durationMs: Date.now() - Date.parse(startedAt),
            error: err?.error?.message ?? 'Query failed',
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

  async loadHistory() {
    const connId = this.connectionId();
    if (!connId) return;
    try {
      this.history.set(await this.localHistory.getHistory(connId));
    } catch {
      this.history.set([]);
    }
  }

  async clearHistory() {
    const connId = this.connectionId();
    if (!connId) return;
    await this.localHistory.clear(connId);
    this.history.set([]);
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

  async unlockActiveConnection() {
    const connId = this.connectionId();
    if (!connId || this.reconnecting()) return;
    const password = this.reconnectPassword.trim() || undefined;
    await this.unlockConnection(connId, password, ++this.connectionInitToken);
  }

  openTableBrowser(node: TreeNode) {
    if (
      (node.type === 'table' ||
        node.type === 'view' ||
        node.type === 'matview') &&
      node.schema &&
      node.table
    ) {
      this.browserTarget.set({ schema: node.schema, table: node.table });
      this.mainView.set('browser');
      this.mobileObjectsOpen.set(false);
    }
  }

  closeBrowser(event: MouseEvent) {
    event.stopPropagation();
    this.browserTarget.set(null);
    this.mainView.set('editor');
    this.mobilePanel.set('editor');
  }

  openNewTableDesigner() {
    this.designerMode.set('create');
    this.alterTarget.set(null);
    this.mainView.set('designer');
    this.mobileObjectsOpen.set(false);
  }

  openExplain() {
    const sql =
      this.sqlEditorRef?.getActiveSelection() ?? this.tabsSvc.activeTab().sql;
    this.explainSql.set(sql.trim());
    this.activeResultTab.set('explain');
  }

  openAlterTable(schema: string, table: string) {
    this.alterTarget.set({ schema, table });
    this.designerMode.set('alter');
    this.mainView.set('designer');
    this.mobileObjectsOpen.set(false);
  }

  closeDesigner(event?: MouseEvent) {
    event?.stopPropagation();
    this.designerMode.set(null);
    this.alterTarget.set(null);
    this.mainView.set('editor');
    this.mobilePanel.set('editor');
  }

  onDesignerDone() {
    this.toast.success('DDL applied successfully');
    this.closeDesigner();
  }

  openMobileObjects() {
    this.mobileObjectsOpen.set(true);
  }

  showMobileEditor() {
    this.mainView.set('editor');
    this.mobilePanel.set('editor');
    this.mobileObjectsOpen.set(false);
  }

  showMobileResults() {
    this.mainView.set('editor');
    this.mobilePanel.set('results');
    this.mobileObjectsOpen.set(false);
  }

  showMobileTable() {
    if (!this.browserTarget()) return;
    this.mainView.set('browser');
    this.mobileObjectsOpen.set(false);
  }

  requiresReconnectPassword(): boolean {
    const status = this.connectionStatus();
    return (
      !status?.canAutoUnlock ||
      this.isPasswordAuthenticationMessage(status.message) ||
      this.isPasswordAuthenticationMessage(this.reconnectError())
    );
  }

  private async ensureConnectionReady(connId: string) {
    const token = ++this.connectionInitToken;
    this.reconnectError.set('');

    try {
      const status = await firstValueFrom(this.connSvc.status(connId));
      if (token !== this.connectionInitToken) return;

      if (status.active) {
        this.markConnectionReady(status);
        return;
      }

      this.connectionStatus.set(status);
      if (status.canAutoUnlock) {
        await this.unlockConnection(connId, undefined, token);
        return;
      }

      this.reconnectDialogOpen.set(true);
    } catch (err) {
      if (token !== this.connectionInitToken) return;
      const message = this.errorMessage(
        err,
        'Failed to check connection status',
      );
      this.connectionStatus.set({
        connectionId: connId,
        state: 'unhealthy',
        active: false,
        canAutoUnlock: false,
        checkedAt: new Date().toISOString(),
        message,
      });
      this.reconnectError.set(message);
      this.reconnectDialogOpen.set(true);
    }
  }

  private async unlockConnection(
    connId: string,
    password: string | undefined,
    token: number,
  ) {
    this.reconnecting.set(true);
    this.reconnectError.set('');
    try {
      await firstValueFrom(this.connSvc.unlock(connId, password));
      const status = await firstValueFrom(this.connSvc.status(connId));
      if (token !== this.connectionInitToken) return;

      if (status.active) {
        this.markConnectionReady(status);
      } else {
        this.connectionStatus.set(status);
        this.reconnectError.set(status.message ?? 'Connection is not active');
        this.reconnectDialogOpen.set(true);
      }
    } catch (err) {
      if (token !== this.connectionInitToken) return;
      const current = this.connectionStatus();
      if (current) {
        this.connectionStatus.set({ ...current, canAutoUnlock: false });
      }
      this.reconnectPassword = '';
      this.reconnectError.set(this.errorMessage(err, 'Failed to reconnect'));
      this.reconnectDialogOpen.set(true);
    } finally {
      if (token === this.connectionInitToken) {
        this.reconnecting.set(false);
      }
    }
  }

  private markConnectionReady(status: ConnectionStatus) {
    const connId = status.connectionId;
    this.connectionStatus.set(status);
    this.reconnectDialogOpen.set(false);
    this.reconnectPassword = '';
    this.reconnectError.set('');
    this.loadCompletionSchema(connId);

    if (
      !this.sessionSvc.connected() ||
      this.sessionSvc.sessionInfo()?.connectionId !== connId
    ) {
      this.sessionSvc.connect(connId);
    }
  }

  private isPasswordAuthenticationMessage(message?: string): boolean {
    return (message ?? '')
      .toLowerCase()
      .includes('password authentication failed');
  }

  private errorMessage(err: unknown, fallback: string): string {
    if (err && typeof err === 'object' && 'error' in err) {
      const body = (err as { error?: { message?: string } }).error;
      if (body?.message) return body.message;
    }
    return err instanceof Error ? err.message : fallback;
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
                  functions: fns.map((f) => ({
                    schema: f.schema,
                    name: f.name,
                    returnType: f.returnType,
                  })),
                });
              },
              error: () => {
                this.completionSchema.set({
                  schemas: schemaNames,
                  tables,
                  columns: [],
                  functions: [],
                });
              },
            });
          },
          error: () => {
            this.completionSchema.set({
              schemas: schemaNames,
              tables: [],
              columns: [],
              functions: [],
            });
          },
        });
      },
      error: () => {
        this.completionSchema.set({
          schemas: [],
          tables: [],
          columns: [],
          functions: [],
        });
      },
    });
  }

  private async saveLocalHistory(entry: {
    queryId?: string;
    status: LocalQueryHistoryEntry['status'];
    rowCount?: number;
    durationMs?: number;
    error?: string;
  }) {
    const pending = this.resolvePendingQuery(entry.queryId);
    const connId = pending?.connectionId ?? this.connectionId();
    const sql = pending?.sql ?? this.tabsSvc.activeTab().sql;
    if (!connId || !sql.trim()) return;

    try {
      await this.localHistory.save({
        connectionId: connId,
        sql,
        status: entry.status,
        rowCount: entry.rowCount,
        durationMs: entry.durationMs,
        error: entry.error,
        startedAt: pending?.startedAt ?? this.pendingSubmittedQuery?.startedAt,
      });
    } catch {
      // Query execution should not fail if local browser storage is unavailable.
    }

    if (entry.queryId) {
      this.pendingQueries.delete(entry.queryId);
    } else if (this.pendingQueries.size === 1) {
      this.pendingQueries.clear();
    }
    this.pendingSubmittedQuery = null;
    await this.refreshHistoryIfOpen(connId);
  }

  private resolvePendingQuery(queryId?: string) {
    if (queryId) {
      return this.pendingQueries.get(queryId) ?? this.pendingSubmittedQuery;
    }
    if (this.pendingQueries.size === 1) {
      return [...this.pendingQueries.values()][0];
    }
    return this.pendingSubmittedQuery;
  }

  private async refreshHistoryIfOpen(connectionId: string) {
    if (
      this.activeResultTab() === 'history' &&
      this.connectionId() === connectionId
    ) {
      await this.loadHistory();
    }
  }
}
