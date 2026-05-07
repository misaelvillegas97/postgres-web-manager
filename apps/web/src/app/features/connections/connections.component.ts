import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import {
  ConnectionProfile,
  ConnectionsService,
  CreateConnectionDto,
} from '../../core/services/connections.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-connections',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './connections.component.html',
  styleUrl: './connections.component.scss',
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
  connecting = signal<string | null>(null);
  formError = signal('');

  form: CreateConnectionDto & { password?: string } = {
    name: '',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: '',
    database: 'postgres',
    ssl: false,
    savePassword: false,
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
    if (this.connecting()) return;
    if (this.isActive(c)) {
      this.router.navigate(['/workspace']);
      return;
    }

    const password = c.savePassword
      ? undefined
      : prompt(`Password for ${c.name}`);
    if (!c.savePassword && password === null) return;

    this.connecting.set(c.id);
    this.svc
      .unlock(c.id, password ?? undefined)
      .pipe(
        timeout({ first: 15000 }),
        finalize(() => this.connecting.set(null)),
      )
      .subscribe({
        next: () => {
          this.svc.setActive(c);
          this.toast.success(`Connected to ${c.name}`);
          this.router.navigate(['/workspace']);
        },
        error: (err) => {
          const message =
            err?.error?.message ??
            err?.message ??
            'Failed to unlock connection';
          this.toast.error(
            message.includes('Timeout')
              ? 'Opening timed out. The connection may still be open in another session.'
              : message,
          );
        },
      });
  }

  openNew() {
    this.editId.set(null);
    this.form = {
      name: '',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: '',
      database: 'postgres',
      ssl: false,
      savePassword: false,
    };
    this.formError.set('');
    this.showForm.set(true);
  }

  editConn(c: ConnectionProfile) {
    this.editId.set(c.id);
    this.form = {
      name: c.name,
      host: c.host,
      port: c.port,
      username: c.username,
      password: '',
      database: c.database,
      ssl: c.ssl,
      savePassword: c.savePassword,
    };
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
    const editId = this.editId();
    const op = editId ? this.svc.update(editId, dto) : this.svc.create(dto);

    op.subscribe({
      next: (c) => {
        this.saving.set(false);
        this.showForm.set(false);
        this.connections.set(this.svc.getSnapshot());
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
        if (res.success)
          this.toast.success(
            `Connected! ${res.serverVersion ?? ''} (${res.latencyMs}ms)`,
          );
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
        this.connections.set(this.svc.getSnapshot());
        this.toast.success('Connection deleted');
      },
      error: () => this.toast.error('Delete failed'),
    });
  }
}
