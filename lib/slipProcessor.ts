import { execFile } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import jsQR from "jsqr";
import sharp from "sharp";
import { promisify } from "util";
import { env } from "./env";
import { getGoogleAccessToken } from "./googleAuth";
import type { SlipExtraction, TransactionType } from "./types";

const execFileAsync = promisify(execFile);

export async function processSlipImage(imageBuffer: Buffer): Promise<SlipExtraction> {
  const jsResult = await processWithNode(imageBuffer);
  if (jsResult.isSlip || env.SLIP_WORKER_COMMAND === "disabled" || process.env.NODE_ENV === "production") {
    return jsResult;
  }

  const pythonResult = await processWithWorker(imageBuffer);
  if (pythonResult.isSlip) {
    return pythonResult;
  }

  return {
    ...jsResult,
    reasons: [...jsResult.reasons, ...pythonResult.reasons]
  };
}

async function processWithNode(imageBuffer: Buffer): Promise<SlipExtraction> {
  try {
    const qrText = await readQr(imageBuffer);
    const qrResult = extractSlip(qrText);
    if (qrResult.isSlip && qrResult.amount) {
      return qrResult;
    }

    if (env.GOOGLE_VISION_OCR === "enabled") {
      const visionText = await readTextWithGoogleVision(imageBuffer);
      return extractSlip([visionText, qrText].filter(Boolean).join("\n"));
    }

    if (process.env.NODE_ENV === "production") {
      return qrResult;
    }

    return qrResult;
  } catch (error) {
    return emptyResult(error instanceof Error ? error.message : "Node slip processor failed");
  }
}

async function readQr(imageBuffer: Buffer) {
  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .resize({ width: 1800, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return code?.data ?? "";
}

async function readTextWithGoogleVision(imageBuffer: Buffer) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error("Google Vision OCR is enabled but Google service account credentials are missing");
  }

  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/cloud-platform"]);

  const response = await fetch("https://vision.googleapis.com/v1/images:annotate", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBuffer.toString("base64") },
          features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
          imageContext: { languageHints: ["th", "en"] }
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Vision OCR failed: ${response.status} ${detail.slice(0, 180)}`);
  }

  const data = (await response.json()) as {
    responses?: Array<{ fullTextAnnotation?: { text?: string }; error?: { message?: string } }>;
  };
  const first = data.responses?.[0];
  if (first?.error?.message) {
    throw new Error(`Google Vision OCR failed: ${first.error.message}`);
  }

  return first?.fullTextAnnotation?.text ?? "";
}

async function processWithWorker(imageBuffer: Buffer): Promise<SlipExtraction> {
  const dir = await mkdtemp(path.join(tmpdir(), "helfer-slip-"));
  const imagePath = path.join(dir, "slip-image");

  try {
    await writeFile(imagePath, imageBuffer);
    const [command, ...args] = splitCommand(env.SLIP_WORKER_COMMAND);
    const { stdout } = await execFileAsync(command, [...args, imagePath], {
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });

    return JSON.parse(stdout) as SlipExtraction;
  } catch (error) {
    return emptyResult(error instanceof Error ? error.message : "External slip worker failed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function splitCommand(command: string) {
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [command];
}

function extractSlip(text: string): SlipExtraction {
  const normalized = normalize(text);
  const amount = extractAmount(normalized);
  const bank = extractBank(normalized);
  const transactionAt = extractDateTime(normalized);
  const reasons = validateSlip(normalized, amount, bank);

  return {
    isSlip: reasons.length >= 2,
    type: inferType(normalized),
    amount,
    currency: "THB",
    bank,
    transactionAt,
    merchantOrCounterparty: extractCounterparty(text),
    note: "",
    rawText: text,
    confidence: confidence(normalized, amount, bank, transactionAt),
    reasons
  };
}

function normalize(text: string) {
  return text.replace(/\s+/g, " ").toLowerCase();
}

function extractAmount(text: string) {
  const moneyHints = /amount|thb|baht|total|transfer|payment|paid|withdraw|deposit/;
  const candidates: Array<{ value: number; index: number; hinted: boolean }> = [];

  for (const match of text.matchAll(/(?<!\d)(\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d{2}))?(?!\d)/g)) {
    const raw = match[0].replace(/,/g, "");
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 1 || value > 10_000_000) continue;

    const index = match.index ?? 0;
    const nearby = text.slice(Math.max(0, index - 40), index + 60);
    candidates.push({ value, index, hinted: moneyHints.test(nearby) });
  }

  const hinted = candidates.filter((item) => item.hinted);
  const pool = hinted.length ? hinted : candidates;
  return pool.sort((a, b) => b.value - a.value)[0]?.value;
}

function extractBank(text: string) {
  const banks: Record<string, string> = {
    kasikorn: "KBank",
    kbank: "KBank",
    scb: "SCB",
    "siam commercial": "SCB",
    krungthai: "KTB",
    ktb: "KTB",
    krungsri: "BAY",
    bangkok: "BBL",
    ttb: "TTB",
    promptpay: "PromptPay"
  };

  for (const [keyword, bank] of Object.entries(banks)) {
    if (text.includes(keyword)) return bank;
  }

  return undefined;
}

function extractDateTime(text: string) {
  const patterns = [
    /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s+(\d{1,2})[:.](\d{2})/,
    /(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2})[:.](\d{2})/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parts = match.slice(1).map(Number);

    try {
      if (String(parts[0]).length === 4) {
        const [year, month, day, hour, minute] = parts;
        return new Date(year, month - 1, day, hour, minute).toISOString();
      }

      let [day, month, year, hour, minute] = parts;
      if (year < 100) year += 2000;
      if (year > 2400) year -= 543;
      return new Date(year, month - 1, day, hour, minute).toISOString();
    } catch {
      continue;
    }
  }

  return undefined;
}

function extractCounterparty(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /mr|mrs|ms|company|co\.|ltd|promptpay/i.test(line))
    ?.slice(0, 120);
}

function inferType(text: string): TransactionType {
  if (/received|deposit|credited|money in/.test(text)) return "income";
  if (/transfer|payment|paid|withdraw|debit|money out/.test(text)) return "expense";
  return "unknown";
}

function validateSlip(text: string, amount: number | undefined, bank: string | undefined) {
  const reasons: string[] = [];
  if (amount) reasons.push("matched amount");
  if (bank) reasons.push("matched bank");
  if (/transfer|transaction|successful|success|amount|payment|promptpay|ref|reference|thb|baht/.test(text)) {
    reasons.push("matched slip keywords");
  }
  return reasons;
}

function confidence(text: string, amount: number | undefined, bank: string | undefined, transactionAt: string | undefined) {
  let score = 0;
  if (amount) score += 0.4;
  if (bank) score += 0.2;
  if (transactionAt) score += 0.15;
  if (/transfer|transaction|successful|amount|payment|promptpay|reference/.test(text)) score += 0.25;
  return Math.min(1, Number(score.toFixed(2)));
}

function emptyResult(reason: string): SlipExtraction {
  return {
    isSlip: false,
    type: "unknown",
    rawText: "",
    confidence: 0,
    reasons: [reason]
  };
}
