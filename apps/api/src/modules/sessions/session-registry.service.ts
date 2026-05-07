import { Injectable } from '@nestjs/common';

interface RegisteredSession {
  socketId: string;
  connectionId: string;
  openedAt: string;
  lastActivityAt: string;
}

@Injectable()
export class SessionRegistryService {
  private readonly sessionsBySocket = new Map<string, RegisteredSession>();
  private readonly socketsByConnection = new Map<string, Set<string>>();

  register(session: RegisteredSession): void {
    this.unregister(session.socketId);
    this.sessionsBySocket.set(session.socketId, session);

    const sockets =
      this.socketsByConnection.get(session.connectionId) ?? new Set<string>();
    sockets.add(session.socketId);
    this.socketsByConnection.set(session.connectionId, sockets);
  }

  unregister(socketId: string): void {
    const existing = this.sessionsBySocket.get(socketId);
    if (!existing) return;

    this.sessionsBySocket.delete(socketId);
    const sockets = this.socketsByConnection.get(existing.connectionId);
    if (!sockets) return;

    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.socketsByConnection.delete(existing.connectionId);
    }
  }

  hasActiveConnection(connectionId: string): boolean {
    return (this.socketsByConnection.get(connectionId)?.size ?? 0) > 0;
  }

  countForConnection(connectionId: string): number {
    return this.socketsByConnection.get(connectionId)?.size ?? 0;
  }
}
