import { AuditLogEntity } from './audit-log.entity';
import { AuthEmailOtpEntity } from './auth-email-otp.entity';
import { AuthRefreshTokenEntity } from './auth-refresh-token.entity';
import { ConnectionProfileEntity } from './connection-profile.entity';
import { UserEntity } from './user.entity';
import { WorkspaceEntity } from './workspace.entity';

export { AuditLogEntity } from './audit-log.entity';
export { AuthEmailOtpEntity } from './auth-email-otp.entity';
export { AuthRefreshTokenEntity } from './auth-refresh-token.entity';
export {
  ConnectionProfileEntity,
  type ConnectionAccessMode,
  type ConnectionSslMode,
} from './connection-profile.entity';
export { UserEntity } from './user.entity';
export { WorkspaceEntity } from './workspace.entity';

export const INTERNAL_DATABASE_ENTITIES = [
  AuditLogEntity,
  AuthEmailOtpEntity,
  AuthRefreshTokenEntity,
  ConnectionProfileEntity,
  UserEntity,
  WorkspaceEntity,
];
