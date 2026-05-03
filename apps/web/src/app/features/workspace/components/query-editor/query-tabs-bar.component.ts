import { Component, inject } from '@angular/core';
import { QueryTabsService } from '../../../../core/services/query-tabs.service';

@Component({
  selector: 'app-query-tabs-bar',
  standalone: true,
  template: `
    <div class="tabs-bar">
      @for (tab of tabsSvc.tabs(); track tab.id) {
        <button
          class="tab-item"
          [class.tab-item--active]="tab.id === tabsSvc.activeId()"
          [title]="tab.title"
          (click)="tabsSvc.setActive(tab.id)"
          (auxclick)="onAuxClick($event, tab.id)"
        >
          <span class="tab-item__title">{{ tab.title }}</span>
          @if (tab.isDirty) {
            <span class="tab-item__dirty" title="Unsaved changes"></span>
          }
          <span
            class="tab-item__close"
            title="Close tab"
            (click)="closeTab($event, tab.id)"
          >×</span>
        </button>
      }
      <button class="tab-add" title="New tab (Ctrl+T)" (click)="tabsSvc.addTab()">+</button>
    </div>
  `,
  styles: [`
    .tabs-bar {
      display: flex;
      align-items: stretch;
      gap: 2px;
      background: var(--surface-2, #1a1d27);
      border-bottom: 1px solid var(--border, #2e3347);
      padding: 4px 4px 0;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
      flex-shrink: 0;
    }

    .tab-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px 6px 12px;
      border: none;
      border-radius: 6px 6px 0 0;
      background: var(--surface-3, #22263a);
      color: var(--text-secondary, #9da3c1);
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
      min-width: 80px;
      max-width: 180px;
      transition: background 0.15s, color 0.15s;
      position: relative;
      outline: none;
    }

    .tab-item:hover {
      background: var(--surface-4, #2e3347);
      color: var(--text-primary, #e8eaf6);
    }

    .tab-item--active {
      background: var(--surface-1, #0f1117);
      color: var(--text-primary, #e8eaf6);
      border-top: 2px solid var(--accent, #5b6af5);
      padding-top: 4px;
    }

    .tab-item__title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tab-item__dirty {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent, #5b6af5);
      flex-shrink: 0;
    }

    .tab-item__close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 3px;
      font-size: 14px;
      line-height: 1;
      flex-shrink: 0;
      color: var(--text-tertiary, #555d80);
      transition: background 0.12s, color 0.12s;
    }

    .tab-item__close:hover {
      background: rgba(255,255,255,0.1);
      color: var(--text-primary, #e8eaf6);
    }

    .tab-add {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--text-secondary, #9da3c1);
      font-size: 18px;
      cursor: pointer;
      flex-shrink: 0;
      align-self: center;
      transition: background 0.15s, color 0.15s;
      outline: none;
    }

    .tab-add:hover {
      background: var(--surface-4, #2e3347);
      color: var(--text-primary, #e8eaf6);
    }
  `],
})
export class QueryTabsBarComponent {
  tabsSvc = inject(QueryTabsService);

  closeTab(event: MouseEvent, id: string) {
    event.stopPropagation();
    this.tabsSvc.closeTab(id);
  }

  onAuxClick(event: MouseEvent, id: string) {
    if (event.button === 1) {
      event.preventDefault();
      this.tabsSvc.closeTab(id);
    }
  }
}
