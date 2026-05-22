import { NextRequest, NextResponse } from "next/server";
import { appendTransaction } from "@/lib/googleSheets";
import { createId } from "@/lib/id";
import { verifyLiffIdToken } from "@/lib/lineAuth";
import { processSlipImage } from "@/lib/slipProcessor";
import type { SlipExtraction, TransactionRecord } from "@/lib/types";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  const idToken = formData.get("idToken");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }

  if (typeof idToken !== "string") {
    return NextResponse.json({ error: "missing idToken" }, { status: 401 });
  }

  const { lineUserId } = await verifyLiffIdToken(idToken);
  const result = await processSlipImage(Buffer.from(await file.arrayBuffer()));

  if (!result.isSlip || !result.amount) {
    return NextResponse.json(
      {
        ok: false,
        error: "not_slip",
        message: "รูปนี้ดูเหมือนไม่ใช่สลิปโอนเงิน กรุณาอัปโหลดสลิปใหม่ หรือใช้เมนูกรอกเอง",
        result
      },
      { status: 422 }
    );
  }

  const record = slipToTransaction(result, lineUserId);
  await appendTransaction(record);

  return NextResponse.json({ ok: true, record, result });
}

function slipToTransaction(slip: SlipExtraction, lineUserId: string): TransactionRecord {
  return {
    id: createId("txn"),
    lineUserId,
    source: "liff_slip",
    type: slip.type === "unknown" ? "expense" : slip.type,
    amount: slip.amount ?? 0,
    currency: slip.currency ?? "THB",
    category: "สลิปโอนเงิน",
    note: slip.note,
    merchantOrCounterparty: slip.merchantOrCounterparty,
    bank: slip.bank,
    transactionAt: slip.transactionAt,
    recordedAt: new Date().toISOString(),
    rawText: slip.rawText,
    confidence: slip.confidence,
    status: slip.confidence >= 0.65 ? "confirmed" : "needs_review"
  };
}
