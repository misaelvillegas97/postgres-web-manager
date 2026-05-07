import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { PoolClient } from 'pg';
import type {
  SessionOpenPayload,
  WsMessage,
} from '@postgres-web-manager/contracts';
import { PostgresPoolManager } from '../../postgres/postgres-pool.manager.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionRegistryService } from './session-registry.service.js';

const ROWS_BATCH_SIZE = 200;

interface SessionState {
  connectionId: string;
  client: PoolClient;
  backendPid: number;
  openedAt: string;
  lastActivityAt: string;
  queryRunning: boolean;
}

interface QueryExecutePayload {
  sql: string;
}

@WebSocketGateway({ namespace: '/sessions', cors: { origin: '*' } })
export class SessionsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SessionsGateway.name);
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly poolManager: PostgresPoolManager,
    private readonly authService: AuthService,
    private readonly sessionRegistry: SessionRegistryService,
  ) {}

  handleConnection(client: Socket) {
    // Verify JWT from handshake auth token or Authorization header
    const token =
      (client.handshake.auth as Record<string, string>)?.['token'] ??
      client.handshake.headers['authorization']
        ?.toString()
        .replace('Bearer ', '');

    if (!token) {
      this.logger.warn(`WS rejected (no token): ${client.id}`);
      client.emit('error', { message: 'Authentication required' });
      client.disconnect(true);
      return;
    }

    try {
      this.authService.verifyAccessToken(token);
      this.logger.log(`Client connected: ${client.id}`);
    } catch {
      this.logger.warn(`WS rejected (invalid token): ${client.id}`);
      client.emit('error', { message: 'Invalid or expired token' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    await this.closeSession(client.id);
  }

  @SubscribeMessage('session.open')
  async handleSessionOpen(client: Socket, payload: SessionOpenPayload) {
    // Close any existing session for this socket
    await this.closeSession(client.id);

    const pool = this.poolManager.getPool(payload.connectionId);
    if (!pool) {
      client.emit('session.error', {
        message: `No active connection for id "${payload.connectionId}"`,
      });
      return;
    }

    if (this.sessionRegistry.hasActiveConnection(payload.connectionId)) {
      client.emit('session.error', {
        code: 'SESSION_ALREADY_OPEN',
        message:
          'This database connection is already open in another browser or device. Close that session before opening it here.',
      });
      return;
    }

    try {
      const pgClient = await pool.connect();

      // Set search_path if schema provided
      if (payload.schema && payload.schema !== 'public') {
        await pgClient.query(`SET search_path TO "${payload.schema}", public`);
      }

      // Retrieve backend PID for cancel capability
      const pidResult = await pgClient.query('SELECT pg_backend_pid() AS pid');
      const backendPid: number = pidResult.rows[0].pid;

      const now = new Date().toISOString();
      this.sessions.set(client.id, {
        connectionId: payload.connectionId,
        client: pgClient,
        backendPid,
        openedAt: now,
        lastActivityAt: now,
        queryRunning: false,
      });
      this.sessionRegistry.register({
        socketId: client.id,
        connectionId: payload.connectionId,
        openedAt: now,
        lastActivityAt: now,
      });

      const response: WsMessage = {
        type: 'session.open',
        payload: {
          sessionId: client.id,
          connectionId: payload.connectionId,
          openedAt: now,
          lastActivityAt: now,
        },
      };
      client.emit('session.open', response.payload);
    } catch (err) {
      client.emit('session.error', { message: (err as Error).message });
    }
  }

  @SubscribeMessage('session.close')
  async handleSessionClose(client: Socket) {
    await this.closeSession(client.id);
    client.emit('session.close', { sessionId: client.id });
  }

  @SubscribeMessage('query.execute')
  async handleQueryExecute(client: Socket, payload: QueryExecutePayload) {
    const session = this.sessions.get(client.id);
    if (!session) {
      client.emit('query.error', {
        message: 'No open session. Send session.open first.',
      });
      return;
    }
    if (session.queryRunning) {
      client.emit('query.error', {
        message: 'A query is already running on this session.',
      });
      return;
    }

    session.queryRunning = true;
    session.lastActivityAt = new Date().toISOString();

    const queryId = `${client.id}-${Date.now()}`;
    client.emit('query.start', {
      queryId,
      sql: payload.sql,
      startedAt: session.lastActivityAt,
    });

    try {
      const startMs = Date.now();
      const result = await session.client.query({
        text: payload.sql,
        rowMode: 'array',
      });

      const columns = (result.fields ?? []).map((f) => ({
        name: f.name,
        dataTypeId: f.dataTypeID,
      }));

      const allRows: unknown[][] = Array.isArray(result.rows)
        ? (result.rows as unknown[][])
        : [];

      // Stream rows in batches
      for (let i = 0; i < allRows.length; i += ROWS_BATCH_SIZE) {
        const batch = allRows.slice(i, i + ROWS_BATCH_SIZE);
        client.emit('query.rows', {
          queryId,
          columns: i === 0 ? columns : undefined,
          rows: batch,
          offset: i,
        });
      }

      const durationMs = Date.now() - startMs;
      client.emit('query.done', {
        queryId,
        rowCount: allRows.length,
        durationMs,
        command: result.command,
      });
    } catch (err) {
      const pgErr = err as NodeJS.ErrnoException & {
        code?: string;
        detail?: string;
        hint?: string;
      };
      client.emit('query.error', {
        queryId,
        message: pgErr.message,
        code: pgErr.code,
        detail: pgErr.detail,
        hint: pgErr.hint,
      });
    } finally {
      session.queryRunning = false;
    }
  }

  @SubscribeMessage('query.cancel')
  async handleQueryCancel(client: Socket) {
    const session = this.sessions.get(client.id);
    if (!session) {
      client.emit('query.error', { message: 'No open session.' });
      return;
    }

    if (!session.queryRunning) {
      client.emit('query.cancelled', {
        cancelled: false,
        reason: 'No query running',
      });
      return;
    }

    // Cancel using a separate connection to avoid blocking the session client
    const pool = this.poolManager.getPool(session.connectionId);
    if (!pool) {
      client.emit('query.cancelled', {
        cancelled: false,
        reason: 'Pool not available',
      });
      return;
    }

    let cancelClient: PoolClient | null = null;
    try {
      cancelClient = await pool.connect();
      await cancelClient.query('SELECT pg_cancel_backend($1)', [
        session.backendPid,
      ]);
      client.emit('query.cancelled', { cancelled: true });
    } catch (err) {
      client.emit('query.cancelled', {
        cancelled: false,
        reason: (err as Error).message,
      });
    } finally {
      cancelClient?.release();
    }
  }

  private async closeSession(socketId: string): Promise<void> {
    const session = this.sessions.get(socketId);
    if (!session) return;
    this.sessions.delete(socketId);
    this.sessionRegistry.unregister(socketId);
    try {
      session.client.release();
    } catch {
      // Ignore release errors on disconnect
    }
  }
}
