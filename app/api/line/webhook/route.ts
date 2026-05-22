import { NextRequest, NextResponse } from "next/server";
import { appendTransaction } from "@/lib/googleSheets";
import { createId } from "@/lib/id";
import { verifyLineSignature } from "@/lib/lineAuth";
import { processSlipImage } from "@/lib/slipProcessor";
import { requireEnv } from "@/lib/env";
import type { SlipExtraction, TransactionRecord } from "@/lib/types";

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { id: string; type: string };
  postback?: { data?: string };
};

export async function POST(request: NextRequest) {
  const body = await request.text();

  if (!verifyLineSignature(body, request.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body) as { events?: LineEvent[] };
  await Promise.all((payload.events ?? []).map(handleEvent));

  return NextResponse.json({ ok: true });
}

async function handleEvent(event: LineEvent) {
  if (event.type === "message" && event.message?.type === "image") {
    await handleImageMessage(event);
    return;
  }

  if (event.type === "postback" && event.postback?.data === "health") {
    await replyText(
      event.replyToken,
      "เปิดหน้าเช็คสุขภาพเงินจากเมนูได้เลยครับ ระบบจะวิเคราะห์จากรายการที่บันทึกไว้เท่านั้น"
    );
  }
}

async function handleImageMessage(event: LineEvent) {
  const lineUserId = event.source?.userId;
  const messageId = event.message?.id;

  if (!lineUserId || !messageId) {
    await replyText(event.replyToken, "ไม่สามารถระบุตัวผู้ใช้หรือรูปภาพได้ กรุณาลองใหม่อีกครั้ง");
    return;
  }

  const image = await getLineMessageContent(messageId);
  const result = await processSlipImage(image);

  if (!result.isSlip || !result.amount) {
    await replyText(event.replyToken, "รูปนี้ดูเหมือนไม่ใช่สลิปโอนเงิน กรุณาอัปโหลดสลิปใหม่ หรือใช้เมนูกรอกเอง");
    return;
  }

  const record = slipToTransaction(result, {
    lineUserId,
    source: "line_slip",
    lineMessageId: messageId
  });

  await appendTransaction(record);
  await replyText(
    event.replyToken,
    `บันทึกสลิปแล้ว: ${record.type === "income" ? "รายรับ" : "รายจ่าย"} ${formatMoney(record.amount)}`
  );
}

async function getLineMessageContent(messageId: string) {
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: {
      authorization: `Bearer ${requireEnv("LINE_CHANNEL_ACCESS_TOKEN")}`
    }
  });

  if (!response.ok) {
    throw new Error(`LINE content API returned ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function slipToTransaction(
  slip: SlipExtraction,
  context: Pick<TransactionRecord, "lineUserId" | "source" | "lineMessageId">
): TransactionRecord {
  return {
    id: createId("txn"),
    lineUserId: context.lineUserId,
    source: context.source,
    type: slip.type === "unknown" ? "expense" : slip.type,
    amount: slip.amount ?? 0,
    currency: slip.currency ?? "THB",
    category: "สลิปโอนเงิน",
    note: slip.note,
    merchantOrCounterparty: slip.merchantOrCounterparty,
    bank: slip.bank,
    transactionAt: slip.transactionAt,
    recordedAt: new Date().toISOString(),
    lineMessageId: context.lineMessageId,
    rawText: slip.rawText,
    confidence: slip.confidence,
    status: slip.confidence >= 0.65 ? "confirmed" : "needs_review"
  };
}

async function replyText(replyToken: string | undefined, text: string) {
  if (!replyToken) return;

  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireEnv("LINE_CHANNEL_ACCESS_TOKEN")}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }]
    })
  });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB"
  }).format(value);
}
