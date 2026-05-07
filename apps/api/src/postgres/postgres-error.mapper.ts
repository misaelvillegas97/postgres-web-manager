export interface PostgresError {
  code: string;
  message: string;
  detail?: string;
  hint?: string;
  position?: number;
  severity?: string;
}

export function mapPostgresError(err: unknown): PostgresError {
  if (err && typeof err === 'object') {
    const pgErr = err as Record<string, unknown>;
    const position =
      typeof pgErr['position'] === 'number'
        ? pgErr['position']
        : Number.parseInt(String(pgErr['position'] ?? ''), 10);
    return {
      code: (pgErr['code'] as string | undefined) ?? 'POSTGRES_ERROR',
      message: (pgErr['message'] as string) ?? 'Unknown error',
      detail: pgErr['detail'] as string | undefined,
      hint: pgErr['hint'] as string | undefined,
      position: Number.isNaN(position) ? undefined : position,
      severity: pgErr['severity'] as string | undefined,
    };
  }
  return { code: 'POSTGRES_ERROR', message: String(err) };
}
