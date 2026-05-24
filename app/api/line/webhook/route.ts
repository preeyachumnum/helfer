import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature } from "@/lib/lineAuth";
import { requireEnv } from "@/lib/env";
import { appendTransaction } from "@/lib/googleSheets";
import { extractSlipFromImage } from "@/lib/slip/ocr";
import { formatSlipReply, slipExtractionToTransaction } from "@/lib/slip/transaction";

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
      "เปิดหน้าเช็คสุขภาพเงินจากเมนูได้เลยค่ะ ระบบจะวิเคราะห์จากรายการที่บันทึกไว้เท่านั้น"
    );
  }
}

async function handleImageMessage(event: LineEvent) {
  try {
    if (!event.source?.userId) throw new Error("ไม่พบ LINE user id");
    if (!event.message?.id) throw new Error("ไม่พบ LINE message id");

    const image = await downloadLineImage(event.message.id);
    const extraction = await extractSlipFromImage({
      buffer: image.buffer,
      fileName: `${event.message.id}.jpg`,
      mimeType: image.mimeType
    });

    const canSave = extraction.isSlip && Boolean(extraction.amount);
    if (!canSave) {
      await replyText(event.replyToken, formatSlipReply(extraction, false));
      return;
    }

    const record = slipExtractionToTransaction({
      extraction,
      lineUserId: event.source.userId,
      source: "line_slip",
      lineMessageId: event.message.id
    });
    await appendTransaction(record);
    await replyText(event.replyToken, formatSlipReply(extraction, true));
  } catch (error) {
    await replyText(
      event.replyToken,
      `อ่านสลิปไม่สำเร็จค่ะ\n${error instanceof Error ? error.message : "กรุณาลองใหม่หรือใช้เมนูกรอกเอง"}`
    );
  }
}

async function downloadLineImage(messageId: string) {
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: {
      authorization: `Bearer ${requireEnv("LINE_CHANNEL_ACCESS_TOKEN")}`
    }
  });

  if (!response.ok) {
    throw new Error(`ดาวน์โหลดรูปจาก LINE ไม่สำเร็จ: ${response.status}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") ?? "image/jpeg"
  };
}

async function replyText(replyToken: string | undefined, text: string) {
  if (!replyToken) return;

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireEnv("LINE_CHANNEL_ACCESS_TOKEN")}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: text.slice(0, 4900) }]
    })
  });

  if (!response.ok) {
    console.error("LINE reply failed", response.status, await response.text());
  }
}
