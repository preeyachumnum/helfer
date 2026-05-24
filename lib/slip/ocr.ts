import { env, requireEnv } from "@/lib/env";
import type { SlipExtraction } from "@/lib/types";
import { parseSlipText } from "./parser";

export type SlipImageInput = {
  buffer: Buffer;
  fileName?: string;
  mimeType?: string;
};

type OcrSpaceResponse = {
  ParsedResults?: Array<{ ParsedText?: string }>;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ErrorDetails?: string;
};

export async function extractSlipFromImage(input: SlipImageInput): Promise<SlipExtraction> {
  const errors: string[] = [];

  if (env.OCRSPACE_API_KEY) {
    try {
      const extraction = await extractWithOcrSpace(input);
      extraction.provider = "ocrspace";
      return extraction;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "OCR.space failed");
    }
  }

  if (env.SLIP_OCR_FALLBACK_URL && env.SLIP_OCR_FALLBACK_URL !== "disabled") {
    try {
      const extraction = await extractWithFallback(input);
      extraction.provider = "fallback";
      if (errors.length) extraction.reasons = [...extraction.reasons, `OCR.space fallback reason: ${errors.join("; ")}`];
      return extraction;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Fallback OCR failed");
    }
  }

  if (!env.OCRSPACE_API_KEY && !env.SLIP_OCR_FALLBACK_URL) {
    throw new Error("ยังไม่ได้ตั้งค่า OCRSPACE_API_KEY หรือ SLIP_OCR_FALLBACK_URL");
  }

  throw new Error(`อ่านสลิปไม่สำเร็จ: ${errors.join("; ")}`);
}

async function extractWithOcrSpace(input: SlipImageInput) {
  const endpoint = env.OCRSPACE_ENDPOINT && env.OCRSPACE_ENDPOINT !== "disabled" ? env.OCRSPACE_ENDPOINT : "https://api.ocr.space/parse/image";
  const form = new FormData();
  form.set("apikey", requireEnv("OCRSPACE_API_KEY"));
  form.set("language", env.OCRSPACE_LANGUAGE);
  form.set("OCREngine", String(env.OCRSPACE_ENGINE));
  form.set("scale", "true");
  form.set("detectOrientation", "true");
  form.set("isTable", "false");
  form.set("file", new Blob([new Uint8Array(input.buffer)], { type: input.mimeType ?? "image/jpeg" }), input.fileName ?? "slip.jpg");

  const response = await fetch(endpoint, { method: "POST", body: form });
  if (!response.ok) throw new Error(`OCR.space HTTP ${response.status}: ${(await response.text()).slice(0, 180)}`);

  const data = (await response.json()) as OcrSpaceResponse;
  if (data.IsErroredOnProcessing) {
    const message = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join("; ") : data.ErrorMessage;
    throw new Error(message || data.ErrorDetails || "OCR.space processing error");
  }

  const text = data.ParsedResults?.map((result) => result.ParsedText ?? "").join("\n").trim() ?? "";
  if (!text) throw new Error("OCR.space returned empty text");
  return parseSlipText(text);
}

async function extractWithFallback(input: SlipImageInput) {
  const endpoint = requireEnv("SLIP_OCR_FALLBACK_URL");
  const form = new FormData();
  form.set("image", new Blob([new Uint8Array(input.buffer)], { type: input.mimeType ?? "image/jpeg" }), input.fileName ?? "slip.jpg");

  const headers: HeadersInit = {};
  if (env.SLIP_OCR_FALLBACK_TOKEN) headers.authorization = `Bearer ${env.SLIP_OCR_FALLBACK_TOKEN}`;

  const response = await fetch(endpoint, { method: "POST", headers, body: form });
  if (!response.ok) throw new Error(`Fallback OCR HTTP ${response.status}: ${(await response.text()).slice(0, 180)}`);

  const data = (await response.json()) as Partial<SlipExtraction> & { text?: string; raw_text?: string };
  if (data.rawText || data.raw_text || data.text) {
    return {
      ...parseSlipText(String(data.rawText ?? data.raw_text ?? data.text)),
      ...data,
      rawText: String(data.rawText ?? data.raw_text ?? data.text)
    } as SlipExtraction;
  }

  return data as SlipExtraction;
}
