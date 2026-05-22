import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appendTransaction } from "@/lib/googleSheets";
import { createId } from "@/lib/id";
import { verifyLiffIdToken } from "@/lib/lineAuth";
import type { TransactionRecord } from "@/lib/types";

const schema = z.object({
  idToken: z.string().min(1),
  type: z.enum(["income", "expense"]),
  amount: z.coerce.number().positive(),
  category: z.string().trim().min(1),
  note: z.string().trim().optional(),
  transactionAt: z.string().optional()
});

export async function POST(request: NextRequest) {
  const input = schema.parse(await request.json());
  const { lineUserId } = await verifyLiffIdToken(input.idToken);

  const record: TransactionRecord = {
    id: createId("txn"),
    lineUserId,
    source: "manual",
    type: input.type,
    amount: input.amount,
    currency: "THB",
    category: input.category,
    note: input.note,
    transactionAt: input.transactionAt,
    recordedAt: new Date().toISOString(),
    confidence: 1,
    status: "confirmed"
  };

  await appendTransaction(record);

  return NextResponse.json({ ok: true, record });
}
