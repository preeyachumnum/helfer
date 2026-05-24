import { createId } from "@/lib/id";
import type { SlipExtraction, TransactionRecord, TransactionSource } from "@/lib/types";

export function slipExtractionToTransaction(input: {
  extraction: SlipExtraction;
  lineUserId: string;
  source: TransactionSource;
  lineMessageId?: string;
}): TransactionRecord {
  const amount = Number(input.extraction.amount ?? 0);

  return {
    id: createId("txn"),
    lineUserId: input.lineUserId,
    source: input.source,
    type: input.extraction.type === "income" ? "income" : "expense",
    amount,
    currency: input.extraction.currency ?? "THB",
    category: input.extraction.type === "income" ? "เงินเข้า" : "สลิปโอนเงิน",
    note: input.extraction.note,
    merchantOrCounterparty: input.extraction.merchantOrCounterparty,
    bank: input.extraction.bank,
    transactionAt: input.extraction.transactionAt,
    recordedAt: new Date().toISOString(),
    lineMessageId: input.lineMessageId,
    rawText: input.extraction.rawText,
    confidence: input.extraction.confidence,
    status: input.extraction.confidence >= 0.75 && input.extraction.amount ? "confirmed" : "needs_review"
  };
}

export function formatSlipReply(extraction: SlipExtraction, saved: boolean) {
  const lines = [
    saved ? "บันทึกจากสลิปแล้ว" : "อ่านสลิปแล้ว แต่ยังไม่ได้บันทึก",
    "",
    `จำนวนเงิน: ${extraction.amount ? formatMoney(extraction.amount) : "ไม่พบ"}`,
    `วันเวลา: ${formatDateTime(extraction.transactionAt)}`,
    `ผู้รับ: ${extraction.merchantOrCounterparty || "ไม่พบ"}`,
    `โน้ต: ${extraction.note || "-"}`
  ];

  if (!saved || extraction.confidence < 0.75) {
    lines.push("", "ถ้าข้อมูลไม่ครบ กรุณาเปิดเมนูกรอก/แนบสลิปเพื่อแก้ไขก่อนบันทึก");
  }

  return lines.join("\n");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(value);
}

function formatDateTime(value: string | undefined) {
  if (!value) return "ไม่พบ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Bangkok"
  }).format(date);
}
