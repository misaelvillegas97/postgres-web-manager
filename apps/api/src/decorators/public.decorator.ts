import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as public — skips JwtAuthGuard.
 * Usage: @Public() on controller method or class.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
