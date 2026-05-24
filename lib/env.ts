import { z } from "zod";

const blankToUndefined = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const optionalString = z.preprocess(blankToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(
  blankToUndefined,
  z.union([z.string().url(), z.literal("disabled")]).optional()
);

const schema = z.object({
  LINE_CHANNEL_ACCESS_TOKEN: optionalString,
  LINE_CHANNEL_SECRET: optionalString,
  LINE_LOGIN_CHANNEL_ID: optionalString,
  GOOGLE_SHEETS_SPREADSHEET_ID: optionalString,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.preprocess(blankToUndefined, z.string().email().optional()),
  GOOGLE_PRIVATE_KEY: optionalString,
  HERMES_ENDPOINT: optionalUrl,
  HERMES_API_KEY: optionalString,
  HERMES_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(21600),
  OCRSPACE_API_KEY: optionalString,
  OCRSPACE_ENDPOINT: optionalUrl,
  OCRSPACE_LANGUAGE: z.preprocess(blankToUndefined, z.string().min(2).default("tha")),
  OCRSPACE_ENGINE: z.coerce.number().int().min(1).max(5).default(2),
  OCRSPACE_MAX_BYTES: z.coerce.number().int().positive().default(950000),
  SLIP_OCR_FALLBACK_URL: optionalUrl,
  SLIP_OCR_FALLBACK_TOKEN: optionalString,
  DEBUG_TOKEN: optionalString
});

export const env = schema.parse(process.env);

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (!value || value === "disabled") {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return value as NonNullable<(typeof env)[K]>;
}
