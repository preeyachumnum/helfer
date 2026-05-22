import { createHmac, timingSafeEqual } from "crypto";
import { env, requireEnv } from "./env";

export function verifyLineSignature(body: string, signature: string | null) {
  const secret = requireEnv("LINE_CHANNEL_SECRET");
  if (!signature) return false;

  const digest = createHmac("sha256", secret).update(body).digest("base64");
  const left = Buffer.from(signature);
  const right = Buffer.from(digest);

  return left.length === right.length && timingSafeEqual(left, right);
}

export async function verifyLiffIdToken(idToken: string) {
  const clientId = requireEnv("LINE_LOGIN_CHANNEL_ID");
  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: clientId
    })
  });

  if (!response.ok) {
    throw new Error("Invalid LIFF ID token");
  }

  const payload = (await response.json()) as { sub?: string; name?: string };
  if (!payload.sub) {
    throw new Error("LIFF ID token has no user id");
  }

  return {
    lineUserId: payload.sub,
    displayName: payload.name
  };
}

export function lineIsConfigured() {
  return Boolean(env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_CHANNEL_SECRET);
}
