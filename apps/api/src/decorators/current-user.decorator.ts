import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { UserRole } from '@postgres-web-manager/contracts';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  workspaceId: string;
  role: UserRole;
}

/**
 * Extracts the authenticated user from request.user (set by JwtAuthGuard).
 * Usage: @CurrentUser() user: AuthenticatedUser
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    return request.user;
  },
);
