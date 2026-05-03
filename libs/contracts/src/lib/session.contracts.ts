export type GatewayEvent =
  | 'session.open'
  | 'session.close'
  | 'query.start'
  | 'query.rows'
  | 'query.notice'
  | 'query.error'
  | 'query.done'
  | 'query.cancelled';

export interface SessionOpenPayload {
  connectionId: string;
  database: string;
  schema: string;
}

export interface SessionInfo {
  sessionId: string;
  connectionId: string;
  openedAt: string;
  lastActivityAt: string;
}

export interface WsMessage<T = unknown> {
  type: GatewayEvent | string;
  payload: T;
}
