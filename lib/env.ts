import { z } from "zod";

const schema = z.object({
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1).optional(),
  LINE_CHANNEL_SECRET: z.string().min(1).optional(),
  LINE_LOGIN_CHANNEL_ID: z.string().min(1).optional(),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1).optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GOOGLE_PRIVATE_KEY: z.string().min(1).optional(),
  HERMES_ENDPOINT: z.string().url().optional(),
  HERMES_API_KEY: z.string().min(1).optional(),
  HERMES_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(21600),
  SLIP_WORKER_COMMAND: z.string().default("python scripts/slip_worker.py")
});

export const env = schema.parse(process.env);

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return value as NonNullable<(typeof env)[K]>;
}
