import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@postgres-web-manager/contracts';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to users with at least one of the specified roles.
 * Usage: @Roles(UserRole.ADMIN, UserRole.OWNER)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
