import { requireEnv } from "./env";
import { getGoogleAccessToken } from "./googleAuth";
import type { TransactionRecord } from "./types";

const TRANSACTIONS_RANGE = "transactions!A:U";
const TRANSACTIONS_SHEET_NAME = "transactions";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TRANSACTION_HEADERS = [
  "id",
  "lineUserId",
  "source",
  "type",
  "amount",
  "currency",
  "category",
  "note",
  "merchantOrCounterparty",
  "bank",
  "transactionAt",
  "recordedAt",
  "lineMessageId",
  "rawText",
  "confidence",
  "status"
];

export async function appendTransaction(record: TransactionRecord) {
  const spreadsheetId = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  const accessToken = await getGoogleAccessToken([SHEETS_SCOPE]);
  await ensureTransactionsSheet(spreadsheetId, accessToken);

  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(TRANSACTIONS_RANGE)}:append`);
  url.searchParams.set("valueInputOption", "USER_ENTERED");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
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
    })
  });

  if (!response.ok) {
    throw new Error(`Google Sheets append failed: ${response.status} ${(await response.text()).slice(0, 180)}`);
  }
}

export async function listTransactionsForUser(lineUserId: string, periodDays = 30) {
  const spreadsheetId = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  const accessToken = await getGoogleAccessToken([SHEETS_SCOPE]);
  await ensureTransactionsSheet(spreadsheetId, accessToken);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(TRANSACTIONS_RANGE)}`,
    {
      headers: { authorization: `Bearer ${accessToken}` }
    }
  );

  if (!response.ok) {
    throw new Error(`Google Sheets read failed: ${response.status} ${(await response.text()).slice(0, 180)}`);
  }

  const data = (await response.json()) as { values?: unknown[][] };
  const rows = data.values ?? [];
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;

  return rows
    .slice(1)
    .map(rowToTransaction)
    .filter((record): record is TransactionRecord => Boolean(record))
    .filter((record) => record.lineUserId === lineUserId)
    .filter((record) => new Date(record.recordedAt).getTime() >= cutoff);
}

async function ensureTransactionsSheet(spreadsheetId: string, accessToken: string) {
  const metadata = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  if (!metadata.ok) {
    throw new Error(`Google Sheets metadata failed: ${metadata.status} ${(await metadata.text()).slice(0, 180)}`);
  }

  const data = (await metadata.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  const hasTransactionsSheet = data.sheets?.some((sheet) => sheet.properties?.title === TRANSACTIONS_SHEET_NAME);

  if (!hasTransactionsSheet) {
    const createResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: TRANSACTIONS_SHEET_NAME
              }
            }
          }
        ]
      })
    });

    if (!createResponse.ok) {
      throw new Error(`Google Sheets create tab failed: ${createResponse.status} ${(await createResponse.text()).slice(0, 180)}`);
    }
  }

  const headerResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${TRANSACTIONS_SHEET_NAME}!A1:P1`)}`,
    {
      headers: { authorization: `Bearer ${accessToken}` }
    }
  );

  if (!headerResponse.ok) {
    throw new Error(`Google Sheets header read failed: ${headerResponse.status} ${(await headerResponse.text()).slice(0, 180)}`);
  }

  const headerData = (await headerResponse.json()) as { values?: string[][] };
  const currentHeader = headerData.values?.[0] ?? [];
  const headerMatches = TRANSACTION_HEADERS.every((header, index) => currentHeader[index] === header);

  if (headerMatches) return;

  const updateResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${TRANSACTIONS_SHEET_NAME}!A1:P1`)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        values: [TRANSACTION_HEADERS]
      })
    }
  );

  if (!updateResponse.ok) {
    throw new Error(`Google Sheets header update failed: ${updateResponse.status} ${(await updateResponse.text()).slice(0, 180)}`);
  }
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
