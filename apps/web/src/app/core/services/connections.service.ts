import { Injectable, inject } from '@angular/core';
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

@Injectable({ providedIn: 'root' })
export class ConnectionsService {
  private http = inject(HttpClient);

  private _connections = new BehaviorSubject<ConnectionProfile[]>([]);
  readonly connections$ = this._connections.asObservable();

  private _active = new BehaviorSubject<ConnectionProfile | null>(null);
  readonly active$ = this._active.asObservable();

  get activeConnection(): ConnectionProfile | null {
    return this._active.getValue();
  }

  loadAll() {
    return this.http.get<ConnectionProfile[]>('/api/connections').pipe(
      tap((list) => this._connections.next(list)),
    );
  }

  create(dto: CreateConnectionDto) {
    return this.http.post<ConnectionProfile>('/api/connections', dto).pipe(
      tap((conn) => this._connections.next([...this._connections.getValue(), conn])),
    );
  }

  update(id: string, dto: Partial<CreateConnectionDto>) {
    return this.http.patch<ConnectionProfile>(`/api/connections/${id}`, dto).pipe(
      tap((updated) => {
        const list = this._connections.getValue().map((c) => (c.id === id ? updated : c));
        this._connections.next(list);
      }),
    );
  }

  remove(id: string) {
    return this.http.delete<void>(`/api/connections/${id}`).pipe(
      tap(() => {
        this._connections.next(this._connections.getValue().filter((c) => c.id !== id));
        if (this._active.getValue()?.id === id) this._active.next(null);
      }),
    );
  }

  test(id: string, password?: string) {
    return this.http.post<TestConnectionResult>(`/api/connections/${id}/test`, { password });
  }

  unlock(id: string, password: string) {
    return this.http.post<void>(`/api/connections/${id}/unlock`, { password });
  }

  setActive(conn: ConnectionProfile) {
    this._active.next(conn);
  }
}
