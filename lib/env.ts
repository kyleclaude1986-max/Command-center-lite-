import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(16).optional(),

  AUTH_ALLOWED_EMAIL: z.string().email().optional(),
  AUTH_PASSWORD_HASH: z.string().optional(),

  SQLITE_PATH: z.string().default("./data/app.sqlite"),
  ENCRYPTION_KEY: z.string().optional(),
  DISPLAY_TIMEZONE: z.string().default("America/Chicago"),

  MS_TENANT_ID: z.string().default("common"),
  MS_CLIENT_ID: z.string().optional(),
  MS_CLIENT_SECRET: z.string().optional(),

  ICLOUD_A_USERNAME: z.string().optional(),
  ICLOUD_A_APP_PASSWORD: z.string().optional(),
  ICLOUD_A_LABEL: z.string().default("Family A"),
  ICLOUD_A_CALENDAR_NAME: z.string().optional(),
  ICLOUD_B_USERNAME: z.string().optional(),
  ICLOUD_B_APP_PASSWORD: z.string().optional(),
  ICLOUD_B_LABEL: z.string().default("Family B"),
  ICLOUD_B_CALENDAR_NAME: z.string().optional(),

  BLOOM_BASE_URL: z.string().url().default("https://app.bloomgrowth.com"),
  BLOOM_API_KEY: z.string().optional(),
  BLOOM_USER_ID: z.string().optional(),

  NETSUITE_ACCOUNT_ID: z.string().optional(),
  NETSUITE_CONSUMER_KEY: z.string().optional(),
  NETSUITE_CONSUMER_SECRET: z.string().optional(),
  NETSUITE_TOKEN_KEY: z.string().optional(),
  NETSUITE_TOKEN_SECRET: z.string().optional(),
  NETSUITE_SUBSIDIARY_ID: z.string().optional(),
  NETSUITE_DEPARTMENT_ID: z.string().optional(),

  SYNC_CRON: z.string().default("*/15 * * * *"),
});

export const env = schema.parse(process.env);

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${String(key)}`);
  }
  return value as NonNullable<(typeof env)[K]>;
}
