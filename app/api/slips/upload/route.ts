import { NextRequest, NextResponse } from "next/server";
import { appendTransaction } from "@/lib/googleSheets";
import { createId } from "@/lib/id";
import { verifyLiffIdToken } from "@/lib/lineAuth";
import { processSlipImage } from "@/lib/slipProcessor";
import type { SlipExtraction, TransactionRecord } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const idToken = formData.get("idToken");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "missing_file", message: "ไม่พบไฟล์รูปภาพ" }, { status: 400 });
    }

    if (typeof idToken !== "string" || !idToken) {
      return NextResponse.json({ error: "missing_id_token", message: "ไม่พบข้อมูลยืนยันตัวตน LINE" }, { status: 401 });
    }

    const { lineUserId } = await verifyLiffIdToken(idToken);
    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const result = await withTimeout(processSlipImage(imageBuffer), 45000);

    if (!result.isSlip || !result.amount) {
      return NextResponse.json(
        {
          ok: false,
          error: "not_slip",
          message: "ไม่พบ QR/Barcode ที่อ่านข้อมูลสลิปได้ กรุณาใช้เมนูกรอกเอง",
          result
        },
        { status: 422 }
      );
    }

    const record = slipToTransaction(result, lineUserId);
    await appendTransaction(record);

    return NextResponse.json({ ok: true, record, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดระหว่างอ่านสลิป";
    return NextResponse.json(
      {
        ok: false,
        error: "upload_failed",
        message,
        result: {
          isSlip: false,
          type: "unknown",
          rawText: "",
          confidence: 0,
          reasons: [message]
        }
      },
      { status: message.includes("timed out") ? 504 : 500 }
    );
  }
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

async function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Slip OCR timed out")), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
