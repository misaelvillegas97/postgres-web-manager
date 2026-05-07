import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import {
  MetadataService,
  TableInfo,
} from '../../../../core/services/metadata.service';
import { ToastService } from '../../../../core/services/toast.service';

export interface TreeNode {
  label: string;
  icon: string;
  type:
    | 'schema'
    | 'tables-group'
    | 'views-group'
    | 'table'
    | 'view'
    | 'matview';
  expanded: boolean;
  loading: boolean;
  children: TreeNode[];
  schema?: string;
  table?: string;
  tableType?: TableInfo['type'];
}

// ─── Recursive row (declared first so MetadataTreeComponent can import it) ────

@Component({
  selector: 'app-tree-node-row',
  standalone: true,
  template: `
    <button
      type="button"
      class="tree-node"
      [class.tree-node--table]="isTableLike()"
      [style.padding-left.px]="16 + depth * 14"
      (click)="nodeToggle.emit(node)"
      (dblclick)="dblclickNode.emit(node)"
    >
      <span
        class="tree-node__chevron"
        [class.tree-node__chevron--open]="node.expanded"
      >
        {{ hasKids() ? '▶' : ' ' }}
      </span>
      <span class="tree-node__icon">{{ node.icon }}</span>
      <span class="tree-node__label">{{ node.label }}</span>
      @if (node.loading) {
        <span class="spinner" style="margin-left:auto;flex-shrink:0"></span>
      }
    </button>

    @if (node.expanded) {
      @for (child of node.children; track child.label) {
        <app-tree-node-row
          [node]="child"
          [depth]="depth + 1"
          (nodeToggle)="nodeToggle.emit($event)"
          (dblclickNode)="dblclickNode.emit($event)"
        />
      }
    }
  `,
  styles: [
    `
      .tree-node {
        display: flex;
        align-items: center;
        gap: 5px;
        width: 100%;
        border: 0;
        background: transparent;
        text-align: left;
        font: inherit;
        height: 26px;
        cursor: pointer;
        font-size: 12px;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        &:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        &--table:hover {
          color: var(--accent);
        }
      }
      .tree-node__chevron {
        font-size: 8px;
        width: 10px;
        display: inline-block;
        color: var(--text-muted);
        transition: transform 0.15s;
        &--open {
          transform: rotate(90deg);
        }
      }
      .tree-node__icon {
        font-size: 13px;
      }
      .tree-node__label {
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ],
})
export class TreeNodeRowComponent {
  @Input() node!: TreeNode;
  @Input() depth = 0;
  @Output() nodeToggle = new EventEmitter<TreeNode>();
  @Output() dblclickNode = new EventEmitter<TreeNode>();

  isTableLike() {
    return (
      this.node.type === 'table' ||
      this.node.type === 'view' ||
      this.node.type === 'matview'
    );
  }

  hasKids() {
    return (
      this.node.type === 'schema' ||
      this.node.type === 'tables-group' ||
      this.node.type === 'views-group'
    );
  }
}

// ─── Main tree component ───────────────────────────────────────────────────────

@Component({
  selector: 'app-metadata-tree',
  standalone: true,
  imports: [TreeNodeRowComponent],
  template: `
    <div class="tree">
      <div class="tree__header">
        <span class="tree__title">Database</span>
        <button
          class="btn btn--ghost btn--sm"
          (click)="refresh()"
          title="Refresh"
        >
          ↺
        </button>
      </div>

      @if (loading()) {
        <div class="tree__loading"><span class="spinner"></span></div>
      } @else {
        <div class="tree__nodes">
          @for (node of roots(); track node.label) {
            <app-tree-node-row
              [node]="node"
              [depth]="0"
              (nodeToggle)="toggleNode($event)"
              (dblclickNode)="tableSelected.emit($event)"
            />
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex: 1;
        min-height: 0;
        min-width: 0;
      }

      .tree {
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        flex: 1;
        min-height: 0;
        min-width: 0;
      }
      .tree__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }
      .tree__loading {
        display: flex;
        justify-content: center;
        padding: 16px;
      }
      .tree__nodes {
        overflow: auto;
        flex: 1;
        min-height: 0;
        min-width: 0;
        scrollbar-width: thin;
      }
      .tree__title {
      }
    `,
  ],
})
export class MetadataTreeComponent implements OnInit {
  @Input() connectionId!: string;
  @Output() tableSelected = new EventEmitter<TreeNode>();

  private meta = inject(MetadataService);
  private toast = inject(ToastService);

  loading = signal(true);
  roots = signal<TreeNode[]>([]);

  ngOnInit() {
    this.loadSchemas();
  }

  refresh() {
    this.loading.set(true);
    this.roots.set([]);
    this.loadSchemas();
  }

  toggleNode(node: TreeNode) {
    const hasKids =
      node.type === 'schema' ||
      node.type === 'tables-group' ||
      node.type === 'views-group';
    if (!hasKids) return;
    node.expanded = !node.expanded;

    if (node.expanded && node.children.length === 0 && node.type === 'schema') {
      const schema = node.schema;
      if (!schema) return;
      node.loading = true;
      this.meta.getTables(this.connectionId, schema).subscribe({
        next: (tables) => {
          const bases = tables.filter((t: TableInfo) => t.type === 'table');
          const views = tables.filter((t: TableInfo) => t.type !== 'table');
          node.children = [
            {
              label: `Tables (${bases.length})`,
              icon: '📋',
              type: 'tables-group' as const,
              expanded: false,
              loading: false,
              schema,
              children: bases.map((t: TableInfo) => this.tableNode(t)),
            },
            {
              label: `Views (${views.length})`,
              icon: '👁',
              type: 'views-group' as const,
              expanded: false,
              loading: false,
              schema,
              children: views.map((t: TableInfo) => this.tableNode(t)),
            },
          ];
          node.loading = false;
          this.roots.update((r) => [...r]);
        },
        error: () => {
          node.loading = false;
          this.roots.update((r) => [...r]);
        },
      });
    } else {
      this.roots.update((r) => [...r]);
    }
  }

  private loadSchemas() {
    this.meta.getSchemas(this.connectionId).subscribe({
      next: (schemas) => {
        this.roots.set(
          schemas.map((s) => ({
            label: s.name,
            icon: '🗂',
            type: 'schema' as const,
            expanded: false,
            loading: false,
            children: [],
            schema: s.name,
          })),
        );
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load schemas');
        this.loading.set(false);
      },
    });
  }

  private tableNode(t: TableInfo): TreeNode {
    const icon =
      t.type === 'table' ? '📄' : t.type === 'materialized_view' ? '📊' : '👁';
    return {
      label: t.name,
      icon,
      type:
        t.type === 'table'
          ? 'table'
          : t.type === 'materialized_view'
            ? 'matview'
            : 'view',
      expanded: false,
      loading: false,
      children: [],
      schema: t.schema,
      table: t.name,
      tableType: t.type,
    };
  }
}
