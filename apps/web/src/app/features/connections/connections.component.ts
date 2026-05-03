import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ConnectionsService,
  ConnectionProfile,
  CreateConnectionDto,
} from '../../core/services/connections.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-connections',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="conn-page">
      <div class="conn-page__header">
        <h2>Connections</h2>
        <button class="btn btn--primary btn--sm" (click)="openNew()">+ New connection</button>
      </div>

      <!-- List -->
      <div class="conn-list">
        @for (c of connections(); track c.id) {
          <div class="conn-card" [class.conn-card--active]="isActive(c)">
            <div class="conn-card__info" (click)="connectTo(c)">
              <div class="conn-card__name">{{ c.name }}</div>
              <div class="conn-card__meta">{{ c.username }}&#64;{{ c.host }}:{{ c.port }}/{{ c.database }}</div>
            </div>
            <div class="conn-card__actions">
              <button class="btn btn--ghost btn--sm" (click)="testConn(c)" [disabled]="testing() === c.id">
                @if (testing() === c.id) { <span class="spinner"></span> } @else { Test }
              </button>
              <button class="btn btn--ghost btn--sm" (click)="editConn(c)">Edit</button>
              <button class="btn btn--danger btn--sm" (click)="deleteConn(c.id)">Delete</button>
            </div>
          </div>
        } @empty {
          <div class="conn-empty">No connections yet. Click <em>New connection</em> to add one.</div>
        }
      </div>

      <!-- Form panel -->
      @if (showForm()) {
        <div class="conn-overlay" (click)="cancelForm()"></div>
        <div class="conn-form-panel">
          <h3>{{ editId() ? 'Edit' : 'New' }} connection</h3>

          <form (ngSubmit)="saveForm()" #f="ngForm">
            <div class="form-row">
              <div class="field">
                <label>Name *</label>
                <input name="name" [(ngModel)]="form.name" required placeholder="My DB" />
              </div>
            </div>

            <div class="form-row form-row--2">
              <div class="field">
                <label>Host *</label>
                <input name="host" [(ngModel)]="form.host" required placeholder="localhost" />
              </div>
              <div class="field field--sm">
                <label>Port</label>
                <input name="port" type="number" [(ngModel)]="form.port" placeholder="5432" />
              </div>
            </div>

            <div class="form-row form-row--2">
              <div class="field">
                <label>Username *</label>
                <input name="username" [(ngModel)]="form.username" required placeholder="postgres" />
              </div>
              <div class="field">
                <label>Password</label>
                <input name="password" type="password" [(ngModel)]="form.password" placeholder="••••" autocomplete="new-password" />
              </div>
            </div>

            <div class="form-row">
              <div class="field">
                <label>Database *</label>
                <input name="database" [(ngModel)]="form.database" required placeholder="postgres" />
              </div>
            </div>

            <div class="form-row form-row--check">
              <label class="check-label">
                <input type="checkbox" name="ssl" [(ngModel)]="form.ssl" />
                Use SSL
              </label>
              <label class="check-label">
                <input type="checkbox" name="savePassword" [(ngModel)]="form.savePassword" />
                Save password (encrypted)
              </label>
            </div>

            @if (formError()) {
              <p class="form-error">{{ formError() }}</p>
            }

            <div class="form-actions">
              <button type="button" class="btn btn--ghost" (click)="cancelForm()">Cancel</button>
              <button type="submit" class="btn btn--primary" [disabled]="saving()">
                @if (saving()) { <span class="spinner"></span> Saving… }
                @if (!saving()) { Save }
              </button>
            </div>
          </form>
        </div>
      }
    </div>
  `,
  styles: [`
    .conn-page {
      padding: 24px;
      max-width: 820px;
      margin: 0 auto;
    }

    .conn-page__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;

      h2 { font-size: 18px; font-weight: 600; }
    }

    .conn-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .conn-card {
      display: flex;
      align-items: center;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 16px;
      transition: border-color 0.15s;

      &--active { border-color: var(--accent); }
      &:hover { border-color: var(--border-focus); }
    }

    .conn-card__info {
      flex: 1;
      cursor: pointer;
    }

    .conn-card__name {
      font-weight: 600;
      font-size: 13px;
    }

    .conn-card__meta {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
      font-family: var(--font-mono);
    }

    .conn-card__actions {
      display: flex;
      gap: 6px;
    }

    .conn-empty {
      color: var(--text-muted);
      font-size: 13px;
      padding: 32px;
      text-align: center;
      border: 1px dashed var(--border);
      border-radius: var(--radius);
    }

    /* Overlay + form panel */
    .conn-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.5);
      z-index: 200;
    }

    .conn-form-panel {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      width: 440px;
      background: var(--bg-surface);
      border-left: 1px solid var(--border);
      padding: 28px 24px;
      z-index: 201;
      overflow-y: auto;

      h3 { font-size: 16px; font-weight: 600; margin-bottom: 20px; }
    }

    .form-row {
      margin-bottom: 14px;

      &--2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      &--check {
        display: flex;
        gap: 20px;
      }
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;

      label { font-size: 12px; color: var(--text-secondary); font-weight: 500; }
      input { width: 100%; }

      &--sm { max-width: 120px; }
    }

    .check-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      input { width: auto; }
    }

    .form-error {
      font-size: 12px;
      color: var(--danger);
      margin-bottom: 10px;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }
  `],
})
export class ConnectionsComponent implements OnInit {
  private svc = inject(ConnectionsService);
  private toast = inject(ToastService);
  private router = inject(Router);

  connections = signal<ConnectionProfile[]>([]);
  showForm = signal(false);
  editId = signal<string | null>(null);
  saving = signal(false);
  testing = signal<string | null>(null);
  formError = signal('');

  form: CreateConnectionDto & { password?: string } = {
    name: '', host: 'localhost', port: 5432,
    username: 'postgres', password: '', database: 'postgres',
    ssl: false, savePassword: false,
  };

  ngOnInit() {
    this.svc.loadAll().subscribe({
      next: (list) => this.connections.set(list),
      error: () => this.toast.error('Failed to load connections'),
    });
  }

  isActive(c: ConnectionProfile) {
    return this.svc.activeConnection?.id === c.id;
  }

  connectTo(c: ConnectionProfile) {
    this.svc.setActive(c);
    this.toast.success(`Connected to ${c.name}`);
    this.router.navigate(['/workspace']);
  }

  openNew() {
    this.editId.set(null);
    this.form = { name: '', host: 'localhost', port: 5432, username: 'postgres', password: '', database: 'postgres', ssl: false, savePassword: false };
    this.formError.set('');
    this.showForm.set(true);
  }

  editConn(c: ConnectionProfile) {
    this.editId.set(c.id);
    this.form = { name: c.name, host: c.host, port: c.port, username: c.username, password: '', database: c.database, ssl: c.ssl, savePassword: c.savePassword };
    this.formError.set('');
    this.showForm.set(true);
  }

  cancelForm() {
    this.showForm.set(false);
  }

  saveForm() {
    this.saving.set(true);
    this.formError.set('');
    const dto = this.form;
    const op = this.editId()
      ? this.svc.update(this.editId()!, dto)
      : this.svc.create(dto);

    op.subscribe({
      next: (c) => {
        this.saving.set(false);
        this.showForm.set(false);
        this.connections.set(this.svc['_connections'].getValue());
        this.toast.success(`Connection "${c.name}" saved`);
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(err?.error?.message ?? 'Save failed');
      },
    });
  }

  testConn(c: ConnectionProfile) {
    this.testing.set(c.id);
    this.svc.test(c.id).subscribe({
      next: (res) => {
        this.testing.set(null);
        if (res.success) this.toast.success(`Connected! ${res.serverVersion ?? ''} (${res.latencyMs}ms)`);
        else this.toast.error(`Test failed: ${res.error}`);
      },
      error: (err) => {
        this.testing.set(null);
        this.toast.error(err?.error?.message ?? 'Test failed');
      },
    });
  }

  deleteConn(id: string) {
    if (!confirm('Delete this connection?')) return;
    this.svc.remove(id).subscribe({
      next: () => {
        this.connections.set(this.svc['_connections'].getValue());
        this.toast.success('Connection deleted');
      },
      error: () => this.toast.error('Delete failed'),
    });
  }
}
