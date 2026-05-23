import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!env.DEBUG_TOKEN) {
    return NextResponse.json({ ok: false, error: "debug_disabled" }, { status: 404 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.DEBUG_TOKEN}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    checks: {
      lineChannelAccessToken: Boolean(env.LINE_CHANNEL_ACCESS_TOKEN),
      lineChannelSecret: Boolean(env.LINE_CHANNEL_SECRET),
      lineLoginChannelId: Boolean(env.LINE_LOGIN_CHANNEL_ID),
      googleSheetsSpreadsheetId: Boolean(env.GOOGLE_SHEETS_SPREADSHEET_ID),
      googleServiceAccountEmail: Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
      googlePrivateKey: Boolean(env.GOOGLE_PRIVATE_KEY),
      hermesEndpoint: env.HERMES_ENDPOINT || "unset",
      debugToken: Boolean(env.DEBUG_TOKEN)
    }
  });
}
