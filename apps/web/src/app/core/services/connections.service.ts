import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, tap } from 'rxjs';

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  database: string;
  ssl: boolean;
  savePassword: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateConnectionDto {
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  database: string;
  ssl?: boolean;
  savePassword?: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs?: number;
  serverVersion?: string;
  error?: string;
}

export interface ConnectionStatus {
  connectionId: string;
  state: 'active' | 'locked' | 'unhealthy';
  active: boolean;
  canAutoUnlock: boolean;
  checkedAt: string;
  message?: string;
  pool?: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
}

const ACTIVE_CONNECTION_ID_KEY = 'pgstudio_active_connection_id';

@Injectable({ providedIn: 'root' })
export class ConnectionsService {
  private http = inject(HttpClient);

  private _connections = new BehaviorSubject<ConnectionProfile[]>([]);
  readonly connections$ = this._connections.asObservable();

  private _active = new BehaviorSubject<ConnectionProfile | null>(null);
  private _activeSignal = signal<ConnectionProfile | null>(null);
  readonly active$ = this._active.asObservable();

  get activeConnection(): ConnectionProfile | null {
    return this._activeSignal();
  }

  loadAll() {
    return this.http.get<ConnectionProfile[]>('/api/connections').pipe(
      tap((list) => {
        this._connections.next(list);
        this.restoreActiveFrom(list);
      }),
    );
  }

  create(dto: CreateConnectionDto) {
    return this.http
      .post<ConnectionProfile>('/api/connections', dto)
      .pipe(
        tap((conn) =>
          this._connections.next([...this._connections.getValue(), conn]),
        ),
      );
  }

  update(id: string, dto: Partial<CreateConnectionDto>) {
    return this.http.put<ConnectionProfile>(`/api/connections/${id}`, dto).pipe(
      tap((updated) => {
        const list = this._connections
          .getValue()
          .map((c) => (c.id === id ? updated : c));
        this._connections.next(list);
      }),
    );
  }

  remove(id: string) {
    return this.http.delete<void>(`/api/connections/${id}`).pipe(
      tap(() => {
        this._connections.next(
          this._connections.getValue().filter((c) => c.id !== id),
        );
        if (this.activeConnection?.id === id) this.clearActive();
      }),
    );
  }

  test(id: string, password?: string) {
    return this.http.post<TestConnectionResult>(`/api/connections/${id}/test`, {
      password,
    });
  }

  status(id: string) {
    return this.http.get<ConnectionStatus>(`/api/connections/${id}/status`);
  }

  unlock(id: string, password?: string) {
    const body = password === undefined ? {} : { password };
    return this.http.post<{ unlocked: boolean }>(
      `/api/connections/${id}/unlock`,
      body,
    );
  }

  setActive(conn: ConnectionProfile) {
    this.writeActiveConnectionId(conn.id);
    this._activeSignal.set(conn);
    this._active.next(conn);
  }

  getSnapshot(): ConnectionProfile[] {
    return this._connections.getValue();
  }

  private clearActive() {
    this.removeActiveConnectionId();
    this._activeSignal.set(null);
    this._active.next(null);
  }

  private restoreActiveFrom(list: ConnectionProfile[]) {
    const current = this.activeConnection;
    if (current) {
      const updated = list.find((conn) => conn.id === current.id);
      if (updated) {
        this._activeSignal.set(updated);
        this._active.next(updated);
        return;
      }
      this.clearActive();
      return;
    }

    const activeId = this.readActiveConnectionId();
    if (!activeId) return;

    const restored = list.find((conn) => conn.id === activeId);
    if (restored) {
      this._activeSignal.set(restored);
      this._active.next(restored);
      this.ensureUnlocked(restored);
    } else {
      this.removeActiveConnectionId();
    }
  }

  private ensureUnlocked(conn: ConnectionProfile) {
    this.unlock(conn.id).subscribe({
      error: () => {
        // If no password is available server-side, the user can unlock manually from Connections.
      },
    });
  }

  private readActiveConnectionId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_CONNECTION_ID_KEY);
    } catch {
      return null;
    }
  }

  private writeActiveConnectionId(id: string) {
    try {
      localStorage.setItem(ACTIVE_CONNECTION_ID_KEY, id);
    } catch {
      // If browser storage is unavailable, keep the in-memory active connection only.
    }
  }

  private removeActiveConnectionId() {
    try {
      localStorage.removeItem(ACTIVE_CONNECTION_ID_KEY);
    } catch {
      // Ignore storage failures.
    }
  }
}
