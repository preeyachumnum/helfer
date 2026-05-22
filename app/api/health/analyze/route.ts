import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { summarizeTransactions } from "@/lib/finance";
import { listTransactionsForUser } from "@/lib/googleSheets";
import { analyzeWithHermes } from "@/lib/hermes";
import { verifyLiffIdToken } from "@/lib/lineAuth";

const schema = z.object({
  idToken: z.string().min(1),
  periodDays: z.coerce.number().int().min(7).max(365).default(30)
});

export async function POST(request: NextRequest) {
  const input = schema.parse(await request.json());
  const { lineUserId } = await verifyLiffIdToken(input.idToken);

  const transactions = await listTransactionsForUser(lineUserId, input.periodDays);
  const summary = summarizeTransactions(transactions, input.periodDays);

  if (summary.transactionCount < 3) {
    return NextResponse.json({
      ok: true,
      summary,
      analysis: {
        summary: "ยังมีข้อมูลน้อยเกินไปสำหรับวิเคราะห์สุขภาพเงิน ลองบันทึกอย่างน้อย 3 รายการก่อนครับ",
        score: 0,
        highlights: [`มีข้อมูล ${summary.transactionCount} รายการ`],
        suggestions: ["เริ่มจากบันทึกรายรับและรายจ่ายประจำวัน", "เมื่อมีข้อมูลมากขึ้น ระบบจะวิเคราะห์แนวโน้มได้แม่นขึ้น"]
      }
    });
  }

  const analysis = await analyzeWithHermes(lineUserId, summary, transactions);
  return NextResponse.json({ ok: true, summary, analysis });
}
