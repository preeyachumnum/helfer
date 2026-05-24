import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appendTransaction } from "@/lib/googleSheets";
import { verifyLiffIdToken } from "@/lib/lineAuth";
import { extractSlipFromImage } from "@/lib/slip/ocr";
import { slipExtractionToTransaction } from "@/lib/slip/transaction";
import type { SlipExtraction } from "@/lib/types";

export const runtime = "nodejs";

const saveSchema = z.object({
  idToken: z.string().min(1),
  extraction: z.object({
    isSlip: z.boolean().default(true),
    type: z.enum(["income", "expense", "transfer", "unknown"]).default("expense"),
    amount: z.coerce.number().positive(),
    currency: z.string().default("THB"),
    bank: z.string().optional(),
    transactionAt: z.string().optional(),
    merchantOrCounterparty: z.string().optional(),
    note: z.string().optional(),
    rawText: z.string().default(""),
    confidence: z.coerce.number().min(0).max(1).default(1),
    reasons: z.array(z.string()).default([]),
    provider: z.enum(["ocrspace", "fallback", "manual"]).optional()
  })
});

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return await saveSlip(await request.json());
    }

    const formData = await request.formData();
    const idToken = String(formData.get("idToken") ?? "");
    const image = formData.get("image");

    if (!idToken) throw new Error("ไม่พบ LINE ID token");
    if (!(image instanceof File)) throw new Error("กรุณาเลือกรูปสลิป");

    await verifyLiffIdToken(idToken);
    const buffer = Buffer.from(await image.arrayBuffer());
    const extraction = await extractSlipFromImage({
      buffer,
      fileName: image.name,
      mimeType: image.type
    });

    return NextResponse.json({ ok: true, extraction });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "slip_upload_failed",
        message: error instanceof Error ? error.message : "อ่านสลิปไม่สำเร็จ"
      },
      { status: 500 }
    );
  }
}

async function saveSlip(payload: unknown) {
  const input = saveSchema.parse(payload);
  const { lineUserId } = await verifyLiffIdToken(input.idToken);
  const extraction = input.extraction as SlipExtraction;
  const record = slipExtractionToTransaction({
    extraction: { ...extraction, provider: extraction.provider ?? "manual" },
    lineUserId,
    source: "liff_slip"
  });

  await appendTransaction(record);
  return NextResponse.json({ ok: true, record });
}
