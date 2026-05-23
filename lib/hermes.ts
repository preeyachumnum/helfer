import { env } from "./env";
import type { FinanceSummary, HermesAnalysis, TransactionRecord } from "./types";

type CacheEntry = {
  expiresAt: number;
  value: HermesAnalysis;
};

const cache = new Map<string, CacheEntry>();

export async function analyzeWithHermes(
  lineUserId: string,
  summary: FinanceSummary,
  transactions: TransactionRecord[]
): Promise<HermesAnalysis> {
  const cacheKey = `${lineUserId}:${summary.periodDays}:${summary.transactionCount}:${summary.income}:${summary.expense}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, cached: true };
  }

  if (!env.HERMES_ENDPOINT || env.HERMES_ENDPOINT === "disabled") {
    const fallback = fallbackAnalysis(summary);
    cache.set(cacheKey, {
      value: fallback,
      expiresAt: Date.now() + env.HERMES_CACHE_TTL_SECONDS * 1000
    });
    return fallback;
  }

  const response = await fetch(env.HERMES_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.HERMES_API_KEY ? { authorization: `Bearer ${env.HERMES_API_KEY}` } : {})
    },
    body: JSON.stringify({
      lineUserId,
      summary,
      transactions: transactions.slice(-100).map((record) => ({
        type: record.type,
        amount: record.amount,
        category: record.category,
        note: record.note,
        transactionAt: record.transactionAt || record.recordedAt
      }))
    })
  });

  if (!response.ok) {
    throw new Error(`Hermes returned ${response.status}`);
  }

  const data = (await response.json()) as Partial<HermesAnalysis>;
  const analysis: HermesAnalysis = {
    summary: data.summary || "วิเคราะห์ข้อมูลการเงินเรียบร้อยแล้ว",
    score: data.score,
    highlights: data.highlights ?? [],
    suggestions: data.suggestions ?? []
  };

  cache.set(cacheKey, {
    value: analysis,
    expiresAt: Date.now() + env.HERMES_CACHE_TTL_SECONDS * 1000
  });

  return analysis;
}

function fallbackAnalysis(summary: FinanceSummary): HermesAnalysis {
  const savingRate = summary.income > 0 ? Math.round(((summary.income - summary.expense) / summary.income) * 100) : 0;
  const balancePositive = summary.balance >= 0;
  const topCategory = summary.topCategories[0];

  return {
    summary:
      summary.transactionCount === 0
        ? "ยังไม่มีข้อมูลเพียงพอสำหรับวิเคราะห์"
        : `คงเหลือสุทธิ ${formatMoney(summary.balance)} (ออมได้ ${savingRate}%)`,
    score: Math.max(0, Math.min(100, 55 + savingRate)),
    highlights: [
      `รายรับ: ${formatMoney(summary.income)}`,
      `รายจ่าย: ${formatMoney(summary.expense)}`,
      topCategory ? `จ่ายหลัก: ${topCategory.category} (${formatMoney(topCategory.amount)})` : `รายการ: ${summary.transactionCount} รายการ`
    ],
    suggestions: balancePositive
      ? ["รักษาระดับรายจ่าย", "หักออมทันทีเมื่อรายได้เข้า"]
      : ["เริ่มลดรายจ่ายหมวดหลัก", "ตั้งเพดานการใช้จ่ายรายสัปดาห์"]
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0
  }).format(value);
}
