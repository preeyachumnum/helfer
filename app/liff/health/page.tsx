"use client";

import liff from "@line/liff";
import { useEffect, useState } from "react";

type HealthResponse = {
  summary: {
    income: number;
    expense: number;
    balance: number;
    transactionCount: number;
  };
  analysis: {
    summary: string;
    score?: number;
    highlights: string[];
    suggestions: string[];
    cached?: boolean;
  };
};

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState("");

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

        const response = await fetch("/api/health/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idToken: liff.getIDToken(),
            periodDays: 30
          })
        });

        if (!response.ok) throw new Error("วิเคราะห์ไม่สำเร็จ");
        setData(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      }
    }

    init();
  }, []);

  return (
    <main className="page">
      <section className="shell stack">
        <div className="header">
          <h1 className="title">สุขภาพเงิน</h1>
          <p className="subtle">สรุปจากข้อมูลที่บันทึกไว้ใน 30 วันล่าสุด</p>
        </div>

        {error && <div className="status error">{error}</div>}
        {!data && !error && <div className="status">กำลังโหลดข้อมูล...</div>}

        {data && (
          <>
            <div className="metricGrid">
              <Metric label="รายรับ" value={data.summary.income} />
              <Metric label="รายจ่าย" value={data.summary.expense} />
              <Metric label="คงเหลือ" value={data.summary.balance} />
              <div className="metric">
                <span>จำนวนรายการ</span>
                <strong>{data.summary.transactionCount}</strong>
              </div>
            </div>

            <div className="panel stack">
              <div>
                <p>{data.analysis.summary}</p>
                {typeof data.analysis.score === "number" && <p className="subtle">คะแนนสุขภาพเงิน {data.analysis.score}/100</p>}
              </div>

              <div className="stack">
                {data.analysis.highlights.map((item) => (
                  <div className="status" key={item}>{item}</div>
                ))}
              </div>

              <div className="stack">
                {data.analysis.suggestions.map((item) => (
                  <div className="status warn" key={item}>{item}</div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0
  }).format(value);
}
