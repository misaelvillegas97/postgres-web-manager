import { Injectable, signal, computed } from '@angular/core';

export interface QueryTab {
  id: string;
  title: string;
  sql: string;
  isDirty: boolean;
  result: QueryTabResult | null;
}

export interface QueryTabResult {
  columns: { name: string; dataTypeId: number }[];
  rows: unknown[][];
  rowCount: number;
  durationMs: number;
  command?: string;
  error?: { message: string; code?: string; detail?: string; hint?: string };
  notices?: string[];
}

let tabCounter = 1;

@Injectable({ providedIn: 'root' })
export class QueryTabsService {
  private _tabs = signal<QueryTab[]>([this.newTab()]);
  private _activeId = signal<string>(this._tabs()[0].id);

  readonly tabs = this._tabs.asReadonly();
  readonly activeId = this._activeId.asReadonly();
  readonly activeTab = computed(() => this._tabs().find((t) => t.id === this._activeId()) ?? this._tabs()[0]);

  private newTab(sql = ''): QueryTab {
    return {
      id: `tab-${Date.now()}-${tabCounter++}`,
      title: `Query ${tabCounter - 1}`,
      sql,
      isDirty: false,
      result: null,
    };
  }

  addTab(sql = '') {
    const tab = this.newTab(sql);
    this._tabs.update((tabs) => [...tabs, tab]);
    this._activeId.set(tab.id);
    return tab.id;
  }

  closeTab(id: string) {
    const tabs = this._tabs();
    if (tabs.length === 1) return; // keep at least one tab

    const idx = tabs.findIndex((t) => t.id === id);
    const remaining = tabs.filter((t) => t.id !== id);
    this._tabs.set(remaining);

    if (this._activeId() === id) {
      const nextIdx = Math.min(idx, remaining.length - 1);
      this._activeId.set(remaining[nextIdx].id);
    }
  }

  setActive(id: string) {
    this._activeId.set(id);
  }

  updateSql(id: string, sql: string) {
    this._tabs.update((tabs) =>
      tabs.map((t) => (t.id === id ? { ...t, sql, isDirty: true } : t)),
    );
  }

  setResult(id: string, result: QueryTabResult) {
    this._tabs.update((tabs) =>
      tabs.map((t) => (t.id === id ? { ...t, result } : t)),
    );
  }

  renameTab(id: string, title: string) {
    this._tabs.update((tabs) =>
      tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    );
  }

  duplicateTab(id: string) {
    const tab = this._tabs().find((t) => t.id === id);
    if (!tab) return;
    this.addTab(tab.sql);
  }
}
