"use client";

import liff from "@line/liff";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

type SlipExtraction = {
  isSlip: boolean;
  type: "income" | "expense" | "transfer" | "unknown";
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

export default function UploadPage() {
  const [ready, setReady] = useState(false);
  const [idToken, setIdToken] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [extraction, setExtraction] = useState<SlipExtraction | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) throw new Error("ยังไม่ได้ตั้งค่า LIFF ID");
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const token = liff.getIDToken() ?? "";
        if (!token) throw new Error("ไม่พบ LINE ID token กรุณาตรวจว่า LIFF scope เปิด openid แล้ว");

        setIdToken(token);
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "เปิด LIFF ไม่สำเร็จ");
      }
    }

    init();
  }, []);

  async function onImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setStatus("");
    setExtraction(null);
    setLoading(true);

    try {
      const compressed = await compressImage(file);
      setPreviewUrl(URL.createObjectURL(compressed));

      const formData = new FormData();
      formData.set("idToken", idToken);
      formData.set("image", compressed, compressed.name);

      const response = await fetch("/api/slips/upload", { method: "POST", body: formData });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data?.message || "อ่านสลิปไม่สำเร็จ");

      setExtraction(data.extraction);
      setStatus("อ่านสลิปแล้ว กรุณาตรวจข้อมูลก่อนบันทึก");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!extraction) return;

    setSaving(true);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/slips/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken, extraction: { ...extraction, provider: extraction.provider ?? "manual" } })
      });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data?.message || "บันทึกไม่สำเร็จ");

      setStatus("บันทึกสลิปลง Google Sheet แล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page slipUploadPage">
      <section className="shell">
        <header className="header">
          <p className="eyebrow">Slip OCR</p>
          <h1 className="title">แนบสลิป</h1>
          <p className="subtle">เลือกรูปสลิป ระบบจะอ่านด้วย OCR แล้วให้คุณตรวจข้อมูลก่อนบันทึก</p>
        </header>

        <section className="panel stack">
          <label className="uploadDrop">
            <input type="file" accept="image/*" capture="environment" disabled={!ready || loading} onChange={onImageChange} />
            <strong>{loading ? "กำลังอ่านสลิป..." : "เลือกรูป / ถ่ายรูปสลิป"}</strong>
            <span>รูปจะถูกย่อขนาดในเครื่องก่อนส่ง เพื่อให้เร็วและประหยัดข้อมูล</span>
          </label>

          {previewUrl && <img className="slipPreview" src={previewUrl} alt="slip preview" />}
        </section>

        {extraction && (
          <form className="panel stack" onSubmit={save}>
            <div className="grid2">
              <label className="field">
                <span>ประเภท</span>
                <select className="select" value={extraction.type} onChange={(event) => setExtraction({ ...extraction, type: event.target.value as SlipExtraction["type"] })}>
                  <option value="expense">รายจ่าย</option>
                  <option value="income">รายรับ</option>
                </select>
              </label>
              <label className="field">
                <span>จำนวนเงิน</span>
                <input className="input" inputMode="decimal" value={extraction.amount ?? ""} onChange={(event) => setExtraction({ ...extraction, amount: Number(event.target.value) })} required />
              </label>
            </div>

            <label className="field">
              <span>วันเวลา</span>
              <input className="input" value={extraction.transactionAt ?? ""} onChange={(event) => setExtraction({ ...extraction, transactionAt: event.target.value })} placeholder="เช่น 2026-05-22T10:10:37+07:00" />
            </label>

            <label className="field">
              <span>ผู้รับ / ร้านค้า</span>
              <input className="input" value={extraction.merchantOrCounterparty ?? ""} onChange={(event) => setExtraction({ ...extraction, merchantOrCounterparty: event.target.value })} />
            </label>

            <label className="field">
              <span>โน้ต</span>
              <input className="input" value={extraction.note ?? ""} onChange={(event) => setExtraction({ ...extraction, note: event.target.value })} />
            </label>

            <div className="status warn">
              ความมั่นใจ {Math.round(extraction.confidence * 100)}% · {extraction.provider ?? "manual"}
            </div>

            <button className="button" disabled={saving || !extraction.amount}>{saving ? "กำลังบันทึก..." : "ยืนยันและบันทึก"}</button>
          </form>
        )}

        {status && <div className="status success">{status}</div>}
        {error && <div className="status error">{error}</div>}
      </section>
    </main>
  );
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function compressImage(file: File) {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}
