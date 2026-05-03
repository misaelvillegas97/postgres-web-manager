import { Injectable, inject, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject, filter } from 'rxjs';
import { AuthService } from './auth.service';

export interface WsQueryRows {
  queryId: string;
  columns?: { name: string; dataTypeId: number }[];
  rows: unknown[][];
  offset: number;
}

export interface WsQueryDone {
  queryId: string;
  rowCount: number;
  durationMs: number;
  command?: string;
}

export interface WsQueryError {
  queryId?: string;
  message: string;
  code?: string;
  detail?: string;
  hint?: string;
}

export interface WsQueryNotice {
  message: string;
}

export interface WsSessionInfo {
  sessionId: string;
  connectionId: string;
  openedAt: string;
}

type WsEvent =
  | { type: 'session.open'; payload: WsSessionInfo }
  | { type: 'query.start'; payload: { queryId: string } }
  | { type: 'query.rows'; payload: WsQueryRows }
  | { type: 'query.done'; payload: WsQueryDone }
  | { type: 'query.error'; payload: WsQueryError }
  | { type: 'query.notice'; payload: WsQueryNotice }
  | { type: 'query.cancelled'; payload: { cancelled: boolean } }
  | { type: 'session.close'; payload: unknown }
  | { type: 'session.error'; payload: { message: string } };

@Injectable({ providedIn: 'root' })
export class SessionService {
  private authService = inject(AuthService);
  private socket: Socket | null = null;

  private _events = new Subject<WsEvent>();
  readonly events$ = this._events.asObservable();

  readonly connected = signal(false);
  readonly sessionInfo = signal<WsSessionInfo | null>(null);

  connect(connectionId: string, schema = 'public') {
    this.disconnect();

    const token = this.authService.getAccessToken();
    this.socket = io('/sessions', {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
    });

    this.socket.on('connect', () => {
      this.connected.set(true);
      this.socket!.emit('session.open', { connectionId, database: '', schema });
    });

    this.socket.on('disconnect', () => {
      this.connected.set(false);
      this.sessionInfo.set(null);
    });

    this.socket.on('session.open', (payload: WsSessionInfo) => {
      this.sessionInfo.set(payload);
      this._events.next({ type: 'session.open', payload });
    });

    (
      [
        'query.start',
        'query.rows',
        'query.done',
        'query.error',
        'query.cancelled',
        'session.close',
        'session.error',
      ] as const
    ).forEach((evt) => {
      this.socket!.on(evt, (payload: unknown) => {
        this._events.next({ type: evt, payload } as WsEvent);
      });
    });
  }

  executeQuery(sql: string) {
    this.socket?.emit('query.execute', { sql });
  }

  cancelQuery() {
    this.socket?.emit('query.cancel', {});
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected.set(false);
      this.sessionInfo.set(null);
    }
  }

  /** Helper to filter events by type */
  on<T extends WsEvent['type']>(type: T) {
    return this.events$.pipe(
      filter((e): e is Extract<WsEvent, { type: T }> => e.type === type),
    );
  }
}
