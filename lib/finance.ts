import type { FinanceSummary, TransactionRecord } from "./types";

export function summarizeTransactions(records: TransactionRecord[], periodDays: number): FinanceSummary {
  const income = records
    .filter((record) => record.type === "income")
    .reduce((sum, record) => sum + record.amount, 0);

  const expense = records
    .filter((record) => record.type === "expense")
    .reduce((sum, record) => sum + record.amount, 0);

  const categoryTotals = new Map<string, number>();
  for (const record of records) {
    if (record.type !== "expense") continue;
    const category = record.category || "ไม่ระบุ";
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + record.amount);
  }

  return {
    periodDays,
    income,
    expense,
    balance: income - expense,
    transactionCount: records.length,
    topCategories: [...categoryTotals.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  };
}
