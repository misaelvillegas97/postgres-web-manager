import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@postgres-web-manager/contracts';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Role-based access guard — applied globally via APP_GUARD.
 * If a route has @Roles(...), the authenticated user must have one of those roles.
 * Role hierarchy: OWNER > ADMIN > DEVELOPER > READ_ONLY
 */
const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.OWNER]: 4,
  [UserRole.ADMIN]: 3,
  [UserRole.DEVELOPER]: 2,
  [UserRole.READ_ONLY]: 1,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const userRank = ROLE_RANK[user.role] ?? 0;
    const hasRole = required.some((r) => ROLE_RANK[r] <= userRank);

    if (!hasRole) {
      throw new ForbiddenException(
        `Role '${user.role}' is not permitted. Required: ${required.join(' or ')}`,
      );
    }

    return true;
  }
}
