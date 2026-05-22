"use client";

import liff from "@line/liff";
import { ChangeEvent, useEffect, useState } from "react";

export default function UploadPage() {
  const [ready, setReady] = useState(false);
  const [idToken, setIdToken] = useState("");
  const [status, setStatus] = useState("เลือกรูปสลิปเพื่อบันทึก");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ amount?: number; type?: string; bank?: string } | null>(null);
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

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("idToken", idToken);

      const response = await fetch("/api/slips/upload", {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "อ่านสลิปไม่สำเร็จ");

      setResult(data.record);
      setStatus("บันทึกสลิปเรียบร้อยแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setStatus("เลือกรูปสลิปเพื่อบันทึก");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <main className="page">
      <section className="shell stack">
        <div className="header">
          <h1 className="title">บันทึกจากสลิป</h1>
          <p className="subtle">ระบบจะอ่านรูปชั่วคราวและเก็บเฉพาะข้อมูลตัวอักษร</p>
        </div>

        <div className="panel stack">
          <label className="field">
            <span>รูปสลิป</span>
            <input className="input" type="file" accept="image/*" capture="environment" disabled={!ready || uploading || !idToken} onChange={upload} />
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB"
  }).format(value);
}
