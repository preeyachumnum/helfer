"use client";

import liff from "@line/liff";
import { ChangeEvent, useEffect, useState } from "react";

type UploadResult = {
  amount?: number;
  type?: string;
  bank?: string;
  confidence?: number;
};

export default function UploadPage() {
  const [ready, setReady] = useState(false);
  const [idToken, setIdToken] = useState("");
  const [status, setStatus] = useState("เลือกรูปสลิปเพื่อบันทึก");
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);

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
        setIdToken(liff.getIDToken() ?? "");
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "เปิด LIFF ไม่สำเร็จ");
      }
    }

    init();
  }, []);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    setResult(null);
    setStatus("กำลังอ่านข้อมูลจากสลิป...");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 55000);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("idToken", idToken);

      const response = await fetch("/api/slips/upload", {
        method: "POST",
        body: formData,
        signal: controller.signal
      });

      const data = await safeJson(response);
      if (!response.ok) {
        const reason = data?.result?.reasons?.[0] ? ` (${data.result.reasons[0]})` : "";
        throw new Error(`${data?.message || "อ่านสลิปไม่สำเร็จ"}${reason}`);
      }

      setResult(data.record);
      setStatus("บันทึกสลิปเรียบร้อยแล้ว");
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "อ่านสลิปนานเกินไป กรุณาลองรูปที่ชัดขึ้น หรือใช้เมนูกรอกเอง"
          : err instanceof Error
            ? err.message
            : "เกิดข้อผิดพลาด";
      setError(message);
      setStatus("เลือกรูปสลิปเพื่อบันทึก");
    } finally {
      window.clearTimeout(timeoutId);
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <main className="page">
      <section className="shell stack">
        <div className="header">
          <h1 className="title">บันทึกจากสลิป</h1>
          <p className="subtle">ระบบอ่านรูปชั่วคราวและเก็บเฉพาะข้อความ</p>
        </div>

        <div className="panel stack">
          <label className="field">
            <span>รูปสลิป</span>
            <input className="input" type="file" accept="image/*" disabled={!ready || uploading || !idToken} onChange={upload} />
          </label>

          <div className={`status ${error ? "error" : ""}`}>{error || status}</div>

          {result && (
            <div className="metricGrid">
              <div className="metric">
                <span>ประเภท</span>
                <strong>{result.type === "income" ? "รายรับ" : "รายจ่าย"}</strong>
              </div>
              <div className="metric">
                <span>จำนวนเงิน</span>
                <strong>{formatMoney(result.amount ?? 0)}</strong>
              </div>
            </div>
          )}
        </div>
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB"
  }).format(value);
}
