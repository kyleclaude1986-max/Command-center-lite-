import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(16).optional(),

  AUTH_ALLOWED_EMAIL: z.string().email().optional(),
  AUTH_PASSWORD_HASH: z.string().optional(),

  SQLITE_PATH: z.string().default("./data/gym.sqlite"),
  PHOTO_DIR: z.string().default("./data/photos"),
  ENCRYPTION_KEY: z.string().optional(),
  DISPLAY_TIMEZONE: z.string().default("America/Chicago"),

  HEALTH_INGEST_TOKEN: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),

  ICLOUD_USERNAME: z.string().optional(),
  ICLOUD_APP_PASSWORD: z.string().optional(),
  ICLOUD_WORKOUT_CALENDAR_NAME: z.string().default("Workouts"),

  USDA_FDC_API_KEY: z.string().optional(),
  OFF_USER_AGENT: z.string().default("ZDesignGymTracker/0.1 (personal use)"),

  SYNC_CRON: z.string().default("*/30 * * * *"),
  DISABLE_SCHEDULER: z.string().optional(),
});

export const env = schema.parse(process.env);

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

if (env.AUTH_PASSWORD_HASH && !BCRYPT_HASH.test(env.AUTH_PASSWORD_HASH)) {
  throw new Error(
    "AUTH_PASSWORD_HASH is not a valid bcrypt hash. A bcrypt hash is 60 characters " +
      "and starts with $2b$12$. If you pasted one into a .env file, the dollar signs " +
      "were most likely eaten as variable references — escape each one as \\$, " +
      "or copy the ready-to-paste line that `npm run hash-password` prints."
  );
}

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${String(key)}`);
  }
  return value as NonNullable<(typeof env)[K]>;
}
