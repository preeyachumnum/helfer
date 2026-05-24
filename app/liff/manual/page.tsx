"use client";

import liff from "@line/liff";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState, useRef } from "react";

type TxnType = "income" | "expense";

const categories: Record<TxnType, string[]> = {
  expense: ["อาหาร", "เดินทาง", "ของใช้", "บิล", "สุขภาพ", "อื่น ๆ"],
  income: ["เงินเดือน", "รายได้เสริม", "คืนเงิน", "โบนัส", "ขายของ", "อื่น ๆ"]
};

const categoryEmojis: Record<string, string> = {
  "อาหาร": "🍔",
  "เดินทาง": "🚗",
  "ของใช้": "🧺",
  "บิล": "🧾",
  "สุขภาพ": "💊",
  "อื่น ๆ": "✨",
  "เงินเดือน": "💼",
  "รายได้เสริม": "📈",
  "คืนเงิน": "🔄",
  "โบนัส": "🎁",
  "ขายของ": "🛒"
};

export default function ManualPage() {
  const [ready, setReady] = useState(false);
  const [idToken, setIdToken] = useState("");
  const [type, setType] = useState<TxnType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(categories.expense[0]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [slipReading, setSlipReading] = useState(false);
  const [showNote, setShowNote] = useState(false);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const slipInputRef = useRef<HTMLInputElement>(null);

  const presets = [50, 100, 500, 1000];

  const today = useMemo(
    () =>
      new Intl.DateTimeFormat("th-TH", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(new Date()),
    []
  );

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

  useEffect(() => {
    if (ready) {
      amountInputRef.current?.focus();
    }
  }, [ready]);

  function selectCategory(nextType: TxnType, nextCategory: string) {
    setType(nextType);
    setCategory(nextCategory);
    setStatus("");
    setError("");
  }

  async function readSlip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSlipReading(true);
    setError("");
    setStatus("");

    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.set("idToken", idToken);
      formData.set("image", compressed, compressed.name);

      const response = await fetch("/api/slips/upload", { method: "POST", body: formData });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data?.message || "อ่านสลิปไม่สำเร็จ");

      const extraction = data.extraction;
      if (extraction?.amount) setAmount(String(extraction.amount));
      if (extraction?.type === "income") {
        setType("income");
        setCategory("เงินเข้า");
      } else {
        setType("expense");
        setCategory("สลิปโอนเงิน");
      }
      if (extraction?.merchantOrCounterparty || extraction?.note) {
        setNote([extraction.merchantOrCounterparty, extraction.note]
          .filter((item) => item && item !== "-")
          .join(" - "));
        setShowNote(true);
      }
      setStatus("อ่านสลิปแล้ว ตรวจข้อมูลแล้วกดบันทึกได้เลย");
    } catch (err) {
      setError(err instanceof Error ? err.message : "อ่านสลิปไม่สำเร็จ");
    } finally {
      setSlipReading(false);
      event.target.value = "";
    }
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
      setStatus("บันทึกข้อมูลแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={`page entryV2 ${type}`}>
      <section className="entryV2Shell">
        <header className="entryV2Header">
          <div>
            <span>Transaction</span>
            <h1>บันทึกรายการ</h1>
          </div>
          <time>{today}</time>
        </header>

        <button
          type="button"
          className="slipShortcut"
          disabled={!ready || slipReading || !idToken}
          onClick={() => slipInputRef.current?.click()}
        >
          {slipReading ? "กำลังอ่านสลิป..." : "📷 แนบสลิป / อ่านจากรูป"}
        </button>
        <input
          ref={slipInputRef}
          className="hiddenFileInput"
          type="file"
          accept="image/*"
          onChange={readSlip}
        />

        <form className="entryV2Form" onSubmit={submit}>
          <section className="entryBlock amountBlock">
            <div className="amountField">
              <input
                ref={amountInputRef}
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                required
              />
              <span>THB</span>
            </div>
            <div className="amountPresets">
              {presets.map((p) => (
                <button type="button" key={p} onClick={() => setAmount(String(p))}>
                  {p}
                </button>
              ))}
            </div>
          </section>

          <section className="entryBlock">
            <div className="blockHead">
              <label>💸 รายจ่าย</label>
              <span>Expense</span>
            </div>
            <div className="categoryPills">
              {categories.expense.map((item) => (
                <button
                  type="button"
                  className={type === "expense" && category === item ? "active" : ""}
                  key={item}
                  onClick={() => selectCategory("expense", item)}
                >
                  <span>{categoryEmojis[item] || "✨"}</span> {item}
                </button>
              ))}
            </div>
          </section>

          <section className="entryBlock">
            <div className="blockHead">
              <label>💰 รายรับ</label>
              <span>Income</span>
            </div>
            <div className="categoryPills">
              {categories.income.map((item) => (
                <button
                  type="button"
                  className={type === "income" && category === item ? "active" : ""}
                  key={item}
                  onClick={() => selectCategory("income", item)}
                >
                  <span>{categoryEmojis[item] || "✨"}</span> {item}
                </button>
              ))}
            </div>
          </section>

          {!showNote ? (
            <button type="button" className="addNoteBtn" onClick={() => setShowNote(true)}>
              + เพิ่มบันทึก (โน้ต)
            </button>
          ) : (
            <section className="entryBlock">
              <label htmlFor="note">รายละเอียด</label>
              <textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น ค่าอาหารกลางวัน" />
            </section>
          )}

          {status && <div className="status success">{status}</div>}
          {error && <div className="status error">{error}</div>}

          <button className="entrySubmit" disabled={!ready || saving || !amount || !idToken}>
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </form>
      </section>
    </main>
  );
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
