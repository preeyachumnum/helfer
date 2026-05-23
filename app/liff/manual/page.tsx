"use client";

import liff from "@line/liff";
import { FormEvent, useEffect, useMemo, useState } from "react";

type TxnType = "income" | "expense";

const expenseCategories = ["อาหาร", "เดินทาง", "ของใช้", "บิล/ค่าสาธารณูปโภค", "สุขภาพ", "อื่น ๆ"];
const incomeCategories = ["เงินเดือน", "รายได้เสริม", "คืนเงิน", "โบนัส", "ขายของ", "อื่น ๆ"];

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

  const categories = type === "expense" ? expenseCategories : incomeCategories;
  const previewAmount = useMemo(() => Number(amount || 0), [amount]);

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

  function changeType(nextType: TxnType) {
    setType(nextType);
    setCategory(nextType === "expense" ? expenseCategories[0] : incomeCategories[0]);
  }

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

      const data = await safeJson(response);
      if (!response.ok) throw new Error(data?.message || "บันทึกไม่สำเร็จ กรุณาลองใหม่");

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
    <main className={`page entryPage ${type}`}>
      <section className="shell entryShell">
        <div className="entryHero">
          <div>
            <p className="eyebrow">New Transaction</p>
            <h1 className="title">บันทึกรายการ</h1>
            <p className="subtle">เพิ่มรายรับรายจ่ายลง Google Sheet</p>
          </div>
          <span className={`entryBadge ${type}`}>{type === "expense" ? "รายจ่าย" : "รายรับ"}</span>
        </div>

        <form className="entryCard" onSubmit={submit}>
          <div className="amountPanel">
            <span>จำนวนเงิน</span>
            <div className="amountInputRow">
              <b>฿</b>
              <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />
            </div>
            <small>{previewAmount > 0 ? formatMoney(previewAmount) : "พร้อมบันทึกรายการใหม่"}</small>
          </div>

          <div className="typeSwitch" role="group" aria-label="transaction type">
            <button className={type === "expense" ? "active" : ""} type="button" onClick={() => changeType("expense")}>
              รายจ่าย
            </button>
            <button className={type === "income" ? "active" : ""} type="button" onClick={() => changeType("income")}>
              รายรับ
            </button>
          </div>

          <section className="formSection">
            <div className="sectionHead">
              <h2>หมวดหมู่</h2>
              <span>{type === "expense" ? "Expense" : "Income"}</span>
            </div>
            <div className="categoryGrid">
              {categories.map((item) => (
                <button className={category === item ? "active" : ""} type="button" key={item} onClick={() => setCategory(item)}>
                  {item}
                </button>
              ))}
            </div>
          </section>

          <section className="formSection">
            <label className="field">
              <span>โน้ต</span>
              <textarea className="textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น ค่าอาหารกลางวัน" />
            </label>
          </section>

          {status && <div className="status success">{status}</div>}
          {error && <div className="status error">{error}</div>}

          <button className="button saveButton" disabled={!ready || saving || !amount || !idToken}>
            {saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
          </button>
        </form>
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
