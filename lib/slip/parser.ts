import type { SlipExtraction, TransactionType } from "@/lib/types";

const THAI_MONTHS: Record<string, string> = {
  "ม.ค.": "01",
  "มค": "01",
  "มกราคม": "01",
  "ก.พ.": "02",
  "กพ": "02",
  "กุมภาพันธ์": "02",
  "มี.ค.": "03",
  "มีค": "03",
  "มีนาคม": "03",
  "เม.ย.": "04",
  "เมย": "04",
  "เมษายน": "04",
  "พ.ค.": "05",
  "พค": "05",
  "พฤษภาคม": "05",
  "มิ.ย.": "06",
  "มิย": "06",
  "มิถุนายน": "06",
  "ก.ค.": "07",
  "กค": "07",
  "กรกฎาคม": "07",
  "ส.ค.": "08",
  "สค": "08",
  "สิงหาคม": "08",
  "ก.ย.": "09",
  "กย": "09",
  "กันยายน": "09",
  "ต.ค.": "10",
  "ตค": "10",
  "ตุลาคม": "10",
  "พ.ย.": "11",
  "พย": "11",
  "พฤศจิกายน": "11",
  "ธ.ค.": "12",
  "ธค": "12",
  "ธันวาคม": "12"
};

const SLIP_WORDS = ["โอน", "รับเงิน", "จ่าย", "พร้อมเพย์", "promptpay", "เลขที่รายการ", "reference", "transaction", "จำนวนเงิน", "amount"];
const RECEIVER_LABELS = /(?:ผู้รับ|ไปยัง|เข้าบัญชี|receiver|recipient|to account)[:：\s-]*(.+)/i;
const NOTE_LABELS = /(?:บันทึก|โน้ต|โน๊ต|note|memo|หมายเหตุ)[:：\s-]*(.+)/i;
const MASKED_ACCOUNT = /(?:x{2,}|\*{2,}|[Xx*]{2,}|\d{2,3}[-\s]?[xX*]{2,})/;

export function parseSlipText(rawText: string): SlipExtraction {
  const normalized = normalizeText(rawText);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const amount = extractAmount(lines);
  const transactionAt = extractDateTime(lines);
  const merchantOrCounterparty = extractReceiver(lines);
  const note = extractNote(lines);
  const bank = extractBank(normalized);
  const type = inferType(normalized);
  const isSlip = inferIsSlip(normalized, amount);
  const reasons = buildReasons({ amount, transactionAt, merchantOrCounterparty, isSlip });
  const confidence = scoreExtraction({ isSlip, amount, transactionAt, merchantOrCounterparty, note });

  return {
    isSlip,
    type,
    amount,
    currency: "THB",
    bank,
    transactionAt,
    merchantOrCounterparty,
    note: note || "-",
    rawText: normalized,
    confidence,
    reasons
  };
}

export function normalizeText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|]+/g, " ")
    .replace(/[๐]/g, "0")
    .replace(/[๑]/g, "1")
    .replace(/[๒]/g, "2")
    .replace(/[๓]/g, "3")
    .replace(/[๔]/g, "4")
    .replace(/[๕]/g, "5")
    .replace(/[๖]/g, "6")
    .replace(/[๗]/g, "7")
    .replace(/[๘]/g, "8")
    .replace(/[๙]/g, "9")
    .replace(/[Oo]/g, "0")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function extractAmount(lines: string[]) {
  const amountLabelIndex = lines.findIndex((line) => /จำนวน\s*เงิน|ยอด\s*เงิน|amount|total/i.test(line));
  if (amountLabelIndex >= 0) {
    for (let offset = 0; offset <= 4; offset += 1) {
      const line = lines[amountLabelIndex + offset] ?? "";
      const values = moneyValues(line).filter((value) => value > 0 && value < 10000000);
      if (values.length) return values[0];
    }
  }

  const candidates: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const combined = [line, lines[index + 1] ?? ""].join(" ");
    if (/จำนวน\s*เงิน|ยอด\s*เงิน|amount|total|thb|บาท/i.test(combined)) {
      candidates.push(...moneyValues(combined));
    }
  }

  if (candidates.length === 0) {
    for (const line of lines) {
      if (/\d+[,.]\d{2}/.test(line) || /บาท|thb/i.test(line)) candidates.push(...moneyValues(line));
    }
  }

  return candidates.filter((value) => value > 0 && value < 10000000).sort((a, b) => b - a)[0];
}

function moneyValues(text: string) {
  const matches = text.match(/(?:฿|THB|บาท)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:฿|THB|บาท)?/gi) ?? [];
  return matches
    .map((match) => Number(match.replace(/[^0-9.]/g, "")))
    .filter((value) => Number.isFinite(value));
}

function extractDateTime(lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const combined = [lines[index], lines[index + 1] ?? ""].join(" ");
    const match = combined.match(/(\d{1,2})\s*([ก-ฮ.]{2,12})\s*(\d{2,4})(?:\s*(\d{1,2}:\d{2}(?::\d{2})?))?/);
    if (!match) continue;
    const month = THAI_MONTHS[match[2].replace(/\s/g, "")];
    if (!month) continue;
    const buddhistOrYear = Number(match[3]);
    const year = buddhistOrYear > 2400 ? buddhistOrYear - 543 : buddhistOrYear < 100 ? buddhistOrYear + 2000 : buddhistOrYear;
    const day = match[1].padStart(2, "0");
    return `${year}-${month}-${day}T${match[4] ?? "00:00:00"}+07:00`;
  }

  const numeric = lines.join(" ").match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s*(\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (!numeric) return undefined;
  const yearNumber = Number(numeric[3]);
  const year = yearNumber > 2400 ? yearNumber - 543 : yearNumber < 100 ? yearNumber + 2000 : yearNumber;
  return `${year}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}T${numeric[4] ?? "00:00:00"}+07:00`;
}

function extractReceiver(lines: string[]) {
  for (const line of lines) {
    const match = line.match(RECEIVER_LABELS);
    const candidate = cleanParty(match?.[1]);
    if (candidate) return candidate;
  }

  const maskedIndexes = lines.map((line, index) => (MASKED_ACCOUNT.test(line) ? index : -1)).filter((index) => index >= 0);
  const receiverAccountIndex = maskedIndexes[1] ?? maskedIndexes[0];
  if (receiverAccountIndex === undefined) return undefined;

  const nearby = [lines[receiverAccountIndex - 2], lines[receiverAccountIndex - 1]].filter(Boolean).join(" ");
  return cleanParty(nearby);
}

function cleanParty(value: string | undefined) {
  if (!value) return undefined;
  const cleaned = value
    .replace(MASKED_ACCOUNT, "")
    .replace(/(?:ธนาคาร|bank|บัญชี|account|พร้อมเพย์|promptpay).*/i, "")
    .replace(/[^\p{L}\p{N}\s.()&-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (cleaned.length < 3 || /จำนวนเงิน|amount|วันที่|เลขที่รายการ/i.test(cleaned)) return undefined;
  return cleaned;
}

function extractNote(lines: string[]) {
  for (const line of lines) {
    const match = line.match(NOTE_LABELS);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function extractBank(text: string) {
  const banks: Array<[string, string]> = [
    ["กสิกร|kbank|kasikorn", "KBank"],
    ["ไทยพาณิชย์|scb|s[i1]am", "SCB"],
    ["กรุงไทย|krungthai|ktb", "KTB"],
    ["กรุงเทพ|bangkok bank|bbl", "BBL"],
    ["กรุงศรี|krungsri|bay", "BAY"],
    ["ทหารไทย|ttb|tmb", "TTB"]
  ];
  return banks.find(([pattern]) => new RegExp(pattern, "i").test(text))?.[1];
}

function inferType(text: string): TransactionType {
  if (/รับเงิน|ได้รับ|เงินเข้า|received/i.test(text)) return "income";
  if (/จ่าย|ชำระ|โอนเงิน|transfer|paid|payment/i.test(text)) return "expense";
  return "expense";
}

function inferIsSlip(text: string, amount: number | undefined) {
  const lower = text.toLowerCase();
  const wordHits = SLIP_WORDS.filter((word) => lower.includes(word.toLowerCase())).length;
  return Boolean(amount && wordHits >= 1) || wordHits >= 2;
}

function buildReasons(input: { amount?: number; transactionAt?: string; merchantOrCounterparty?: string; isSlip: boolean }) {
  const reasons: string[] = [];
  if (!input.isSlip) reasons.push("ไม่พบคำสำคัญของสลิปชัดเจน");
  if (!input.amount) reasons.push("ไม่พบจำนวนเงิน");
  if (!input.transactionAt) reasons.push("ไม่พบวันเวลา");
  if (!input.merchantOrCounterparty) reasons.push("ไม่พบผู้รับ");
  if (reasons.length === 0) reasons.push("อ่านข้อมูลหลักจากสลิปได้ครบ");
  return reasons;
}

function scoreExtraction(input: { isSlip: boolean; amount?: number; transactionAt?: string; merchantOrCounterparty?: string; note?: string }) {
  let score = input.isSlip ? 0.35 : 0;
  if (input.amount) score += 0.3;
  if (input.transactionAt) score += 0.15;
  if (input.merchantOrCounterparty) score += 0.15;
  if (input.note && input.note !== "-") score += 0.05;
  return Math.min(1, Number(score.toFixed(2)));
}
