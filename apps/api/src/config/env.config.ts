import { z } from 'zod';

const envSchema = z.object({
  PORT: z.preprocess(
    (value) => (value === undefined || value === '' ? 3000 : value),
    z.coerce
      .number()
      .int('PORT must be an integer')
      .min(1, 'PORT must be greater than 0')
      .max(65535, 'PORT must be less than or equal to 65535'),
  ),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .optional()
    .default('development'),

  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid PostgreSQL connection string')
    .optional(),

  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .min(32, 'CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters')
    .optional(),

  JWT_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),

  CORS_ORIGIN: z.string().optional().default('*'),
});

export type AppEnv = z.infer<typeof envSchema>;

let _env: AppEnv;

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
}

/**
 * Validates and returns the parsed environment configuration.
 * In production, DATABASE_URL and CREDENTIALS_ENCRYPTION_KEY are required.
 * Call this once at bootstrap time.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const isProduction = env['NODE_ENV'] === 'production';

  if (isProduction) {
    const productionSchema = envSchema.extend({
      DATABASE_URL: z
        .string()
        .url('DATABASE_URL must be a valid PostgreSQL connection string'),
      CREDENTIALS_ENCRYPTION_KEY: z
        .string()
        .min(32, 'CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters'),
      JWT_SECRET: z
        .string()
        .min(32, 'JWT_SECRET must be at least 32 characters'),
      JWT_REFRESH_SECRET: z
        .string()
        .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
      CORS_ORIGIN: z
        .string()
        .min(1, 'CORS_ORIGIN must not be empty')
        .refine(
          (value) => value !== '*',
          'CORS_ORIGIN must be explicit in production',
        ),
    });
    const result = productionSchema.safeParse(env);
    if (!result.success) {
      throw new Error(
        `Invalid environment configuration:\n${formatZodIssues(result.error)}`,
      );
    }
    _env = result.data as AppEnv;
  } else {
    const result = envSchema.safeParse(env);
    if (!result.success) {
      throw new Error(
        `Invalid environment configuration:\n${formatZodIssues(result.error)}`,
      );
    }
    _env = result.data;
  }

  return _env;
}

/** Returns the already-validated environment. Call validateEnv() first. */
export function getEnv(): AppEnv {
  if (!_env) {
    return validateEnv();
  }
  return _env;
}
