import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SessionOpenPayload, WsMessage } from '@postgres-web-manager/contracts';

@WebSocketGateway({ cors: { origin: '*' } })
export class SessionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('session.open')
  handleSessionOpen(client: Socket, payload: SessionOpenPayload): WsMessage {
    return {
      type: 'session.open',
      payload: {
        sessionId: client.id,
        connectionId: payload.connectionId,
        openedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      },
    };
  }
}
