import { z } from 'zod';

/**
 * 12-factor env schema validated at boot ( Documentation §19.4).
 * Secrets must not be committed; use .env.example as the template (§20).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  SERVICE_NAME: z.string().min(1),

  // PostgreSQL (via PgBouncer in non-local; direct in local compose)
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),

  // Redis Cluster / local Redis
  REDIS_URL: z.string().min(1),

  // Kafka brokers (comma-separated)
  KAFKA_BROKERS: z.string().min(1),
  KAFKA_CLIENT_ID: z.string().min(1),

  // JWT (RS256 keys loaded from files/secrets manager in later milestones)
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),

  // S3-compatible object storage (MinIO locally) —  Documentation §13 media seam
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('food-ordering-media'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),

  // HTTP / gRPC ports (per service)
  HTTP_PORT: z.coerce.number().int().positive().optional(),
  GRPC_PORT: z.coerce.number().int().positive().optional(),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}
