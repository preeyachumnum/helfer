import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { summarizeTransactions } from "@/lib/finance";
import { listTransactionsForUser } from "@/lib/googleSheets";
import { analyzeWithHermes } from "@/lib/hermes";
import { verifyLiffIdToken } from "@/lib/lineAuth";

export const runtime = "nodejs";

const schema = z.object({
  idToken: z.string().min(1),
  periodDays: z.coerce.number().int().min(7).max(365).default(30)
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const { lineUserId } = await verifyLiffIdToken(input.idToken);

    const transactions = await listTransactionsForUser(lineUserId, input.periodDays);
    const summary = summarizeTransactions(transactions, input.periodDays);

    if (summary.transactionCount < 3) {
      return NextResponse.json({
        ok: true,
        summary,
        analysis: {
          summary: "ยังมีข้อมูลน้อยเกินไปสำหรับวิเคราะห์สุขภาพเงิน",
          score: Math.min(35, summary.transactionCount * 10),
          highlights: [`มีข้อมูล ${summary.transactionCount} รายการในช่วง ${summary.periodDays} วัน`],
          suggestions: ["ลองบันทึกอย่างน้อย 3 รายการก่อน", "เริ่มจากรายรับประจำและรายจ่ายที่เกิดบ่อย"]
        }
      });
    }

    const analysis = await analyzeWithHermes(lineUserId, summary, transactions);
    return NextResponse.json({ ok: true, summary, analysis });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "health_analysis_failed",
        message: error instanceof Error ? error.message : "วิเคราะห์สุขภาพเงินไม่สำเร็จ"
      },
      { status: 500 }
    );
  }
}
