export type TransactionType = "income" | "expense" | "transfer" | "unknown";

export type TransactionSource = "manual" | "liff_slip" | "line_slip";

export type TransactionRecord = {
  id: string;
  lineUserId: string;
  source: TransactionSource;
  type: TransactionType;
  amount: number;
  currency: string;
  category?: string;
  note?: string;
  merchantOrCounterparty?: string;
  bank?: string;
  transactionAt?: string;
  recordedAt: string;
  lineMessageId?: string;
  rawText?: string;
  confidence?: number;
  status: "confirmed" | "needs_review" | "rejected";
};

export type SlipExtraction = {
  isSlip: boolean;
  type: TransactionType;
  amount?: number;
  currency?: string;
  bank?: string;
  transactionAt?: string;
  merchantOrCounterparty?: string;
  note?: string;
  rawText: string;
  confidence: number;
  reasons: string[];
  provider?: "ocrspace" | "fallback" | "manual";
};

export type FinanceSummary = {
  periodDays: number;
  income: number;
  expense: number;
  balance: number;
  transactionCount: number;
  topCategories: Array<{ category: string; amount: number }>;
};

export type HermesAnalysis = {
  summary: string;
  score?: number;
  highlights: string[];
  suggestions: string[];
  cached?: boolean;
};
