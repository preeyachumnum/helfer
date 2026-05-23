import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature } from "@/lib/lineAuth";
import { requireEnv } from "@/lib/env";

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
  await replyText(event.replyToken, "ตอนนี้ปิดการอ่านสลิปอัตโนมัติแล้ว กรุณาใช้เมนูกรอกเอง");
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
