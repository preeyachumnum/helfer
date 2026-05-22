"use client";

import liff from "@line/liff";
import { FormEvent, useEffect, useState } from "react";

type TxnType = "income" | "expense";

export default function ManualPage() {
  const [ready, setReady] = useState(false);
  const [idToken, setIdToken] = useState("");
  const [type, setType] = useState<TxnType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("อาหาร");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
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
        setIdToken(liff.getIDToken() ?? "");
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "เปิด LIFF ไม่สำเร็จ");
      }
    }

    init();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/transactions/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idToken,
          type,
          amount,
          category,
          note,
          transactionAt: new Date().toISOString()
        })
      });

      if (!response.ok) throw new Error("บันทึกไม่สำเร็จ กรุณาลองใหม่");

      setAmount("");
      setNote("");
      setStatus("บันทึกรายการเรียบร้อยแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <section className="shell stack">
        <div className="header">
          <h1 className="title">กรอกจำนวนเงิน</h1>
          <p className="subtle">บันทึกรายรับหรือรายจ่ายลงระบบ</p>
        </div>

        <form className="panel stack" onSubmit={submit}>
          <div className="segmented">
            <button className={`segment ${type === "expense" ? "active" : ""}`} type="button" onClick={() => setType("expense")}>
              รายจ่าย
            </button>
            <button className={`segment ${type === "income" ? "active" : ""}`} type="button" onClick={() => setType("income")}>
              รายรับ
            </button>
          </div>

          <div className="field">
            <label>จำนวนเงิน</label>
            <input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />
          </div>

          <div className="field">
            <label>หมวดหมู่</label>
            <select className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option>อาหาร</option>
              <option>เดินทาง</option>
              <option>ของใช้</option>
              <option>บิล/ค่าสาธารณูปโภค</option>
              <option>เงินเดือน</option>
              <option>รายได้เสริม</option>
              <option>อื่น ๆ</option>
            </select>
          </div>

          <div className="field">
            <label>โน้ต</label>
            <textarea className="textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น ค่าอาหารกลางวัน" />
          </div>

          {status && <div className="status">{status}</div>}
          {error && <div className="status error">{error}</div>}

          <button className="button" disabled={!ready || saving || !amount || !idToken}>
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </form>
      </section>
    </main>
  );
}
