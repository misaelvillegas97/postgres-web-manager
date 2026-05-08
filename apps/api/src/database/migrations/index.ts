import { AuthEmailOtp20260503000006 } from './20260503000006-auth-email-otp';
import { DropQueryHistory20260503000005 } from './20260503000005-drop-query-history';
import { InitialSchema20260503000001 } from './20260503000001-initial-schema';
import { RefreshTokens20260503000004 } from './20260503000004-refresh-tokens';
import { SeedDevWorkspace20260503000002 } from './20260503000002-seed-dev-workspace';
import { UserPasswordHashes20260503000003 } from './20260503000003-user-password-hashes';

export const INTERNAL_DATABASE_MIGRATIONS = [
  InitialSchema20260503000001,
  SeedDevWorkspace20260503000002,
  UserPasswordHashes20260503000003,
  RefreshTokens20260503000004,
  DropQueryHistory20260503000005,
  AuthEmailOtp20260503000006,
];
