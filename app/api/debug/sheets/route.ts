import { NextRequest, NextResponse } from "next/server";
import { appendTransaction } from "@/lib/googleSheets";
import { createId } from "@/lib/id";
import { env } from "@/lib/env";
import type { TransactionRecord } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!env.DEBUG_TOKEN) {
    return NextResponse.json({ ok: false, error: "debug_disabled" }, { status: 404 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.DEBUG_TOKEN}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const record: TransactionRecord = {
    id: createId("debug"),
    lineUserId: "debug-user",
    source: "manual",
    type: "expense",
    amount: 1,
    currency: "THB",
    category: "debug",
    note: "sheet write test",
    recordedAt: new Date().toISOString(),
    confidence: 1,
    status: "confirmed"
  };

  try {
    await appendTransaction(record);
    return NextResponse.json({ ok: true, id: record.id });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "sheet_write_failed",
        message: error instanceof Error ? error.message : "unknown error"
      },
      { status: 500 }
    );
  }
}
