export interface PostgresError {
  code?: string;
  message: string;
  detail?: string;
  hint?: string;
  position?: string;
  severity?: string;
}

export function mapPostgresError(err: unknown): PostgresError {
  if (err && typeof err === 'object') {
    const pgErr = err as Record<string, unknown>;
    return {
      code: pgErr['code'] as string | undefined,
      message: (pgErr['message'] as string) ?? 'Unknown error',
      detail: pgErr['detail'] as string | undefined,
      hint: pgErr['hint'] as string | undefined,
      position: pgErr['position'] as string | undefined,
      severity: pgErr['severity'] as string | undefined,
    };
  }
  return { message: String(err) };
}
