import { google } from "googleapis";
import { requireEnv } from "./env";
import type { TransactionRecord } from "./types";

const TRANSACTIONS_RANGE = "transactions!A:U";

function getAuth() {
  const email = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const key = requireEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

export async function appendTransaction(record: TransactionRecord) {
  const sheets = getSheets();
  const spreadsheetId = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: TRANSACTIONS_RANGE,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        record.id,
        record.lineUserId,
        record.source,
        record.type,
        record.amount,
        record.currency,
        record.category ?? "",
        record.note ?? "",
        record.merchantOrCounterparty ?? "",
        record.bank ?? "",
        record.transactionAt ?? "",
        record.recordedAt,
        record.lineMessageId ?? "",
        record.rawText ?? "",
        record.confidence ?? "",
        record.status
      ]]
    }
  });
}

export async function listTransactionsForUser(lineUserId: string, periodDays = 30) {
  const sheets = getSheets();
  const spreadsheetId = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: TRANSACTIONS_RANGE
  });

  const rows = response.data.values ?? [];
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;

  return rows
    .slice(1)
    .map(rowToTransaction)
    .filter((record): record is TransactionRecord => Boolean(record))
    .filter((record) => record.lineUserId === lineUserId)
    .filter((record) => new Date(record.recordedAt).getTime() >= cutoff);
}

function rowToTransaction(row: unknown[]): TransactionRecord | null {
  if (!row[0] || !row[1]) return null;

  return {
    id: String(row[0]),
    lineUserId: String(row[1]),
    source: String(row[2] || "manual") as TransactionRecord["source"],
    type: String(row[3] || "unknown") as TransactionRecord["type"],
    amount: Number(row[4] || 0),
    currency: String(row[5] || "THB"),
    category: String(row[6] || ""),
    note: String(row[7] || ""),
    merchantOrCounterparty: String(row[8] || ""),
    bank: String(row[9] || ""),
    transactionAt: String(row[10] || ""),
    recordedAt: String(row[11] || ""),
    lineMessageId: String(row[12] || ""),
    rawText: String(row[13] || ""),
    confidence: row[14] ? Number(row[14]) : undefined,
    status: String(row[15] || "confirmed") as TransactionRecord["status"]
  };
}
