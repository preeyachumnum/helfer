"use client";

import liff from "@line/liff";
import { useEffect, useMemo, useState } from "react";

type HealthResponse = {
  summary: {
    periodDays: number;
    income: number;
    expense: number;
    balance: number;
    transactionCount: number;
    topCategories: Array<{ category: string; amount: number }>;
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

        const idToken = liff.getIDToken();
        if (!idToken) throw new Error("ไม่พบ LINE ID token กรุณาตรวจว่า LIFF scope เปิด openid แล้ว");

        const response = await fetch("/api/health/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken, periodDays: 30 })
        });

        const payload = await safeJson(response);
        if (!response.ok) throw new Error(payload?.message || "วิเคราะห์ไม่สำเร็จ");
        setData(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      }
    }

    init();
  }, []);

  const viewModel = useMemo(() => {
    if (!data) return null;
    const score = clamp(data.analysis.score ?? 0, 0, 100);
    const totalFlow = data.summary.income + data.summary.expense;
    const incomeShare = totalFlow > 0 ? (data.summary.income / totalFlow) * 100 : 0;
    const savingRate = data.summary.income > 0 ? (data.summary.balance / data.summary.income) * 100 : 0;
    const topSpend = data.summary.topCategories[0]?.amount ?? 0;

    return {
      score,
      grade: score >= 80 ? "ดีมาก" : score >= 60 ? "ดี" : score >= 40 ? "ต้องระวัง" : "ควรปรับแผน",
      tone: score >= 60 ? "positive" : score >= 40 ? "caution" : "danger",
      incomeShare,
      expenseShare: 100 - incomeShare,
      savingRate,
      topSpend
    };
  }, [data]);

  return (
    <main className="page healthPage">
      <section className="shell healthShell">
        <div className="healthHero">
          <div>
            <p className="eyebrow">Financial Health</p>
            <h1 className="title">สุขภาพเงิน</h1>
            <p className="subtle">สรุปจากรายการ 30 วันล่าสุด</p>
          </div>
          {data && <span className="pill">{data.summary.transactionCount} รายการ</span>}
        </div>

        {error && <div className="status error">{error}</div>}
        {!data && !error && <LoadingState />}

        {data && viewModel && (
          <div className="healthStack">
            <section className={`scorePanel ${viewModel.tone}`}>
              <div>
                <p className="panelLabel">คะแนนรวม</p>
                <strong>{viewModel.grade}</strong>
                <span>{data.analysis.summary}</span>
              </div>
              <div className="scoreRing" style={{ "--score": `${viewModel.score * 3.6}deg` } as React.CSSProperties}>
                <b>{viewModel.score}</b>
                <small>/100</small>
              </div>
            </section>

            <section className="moneyPanel">
              <div className="moneyRow">
                <MoneyStat label="รายรับ" value={data.summary.income} />
                <MoneyStat label="รายจ่าย" value={data.summary.expense} />
                <MoneyStat label="คงเหลือ" value={data.summary.balance} accent={data.summary.balance >= 0 ? "good" : "bad"} />
              </div>

              <div className="flowBar" aria-label="cashflow">
                <span style={{ width: `${viewModel.incomeShare}%` }} />
                <i style={{ width: `${viewModel.expenseShare}%` }} />
              </div>

              <div className="miniMeta">
                <span>อัตราเหลือเก็บ {formatPercent(viewModel.savingRate)}</span>
                <span>{data.analysis.cached ? "ใช้ผลวิเคราะห์ล่าสุด" : "อัปเดตล่าสุด"}</span>
              </div>
            </section>

            <section className="panel proPanel">
              <div className="sectionHead">
                <h2>หมวดรายจ่ายหลัก</h2>
                <span>Top spending</span>
              </div>

              {data.summary.topCategories.length === 0 ? (
                <div className="emptyState">ยังไม่มีรายจ่ายให้เปรียบเทียบ</div>
              ) : (
                <div className="barList">
                  {data.summary.topCategories.map((item) => (
                    <div className="barItem" key={item.category}>
                      <div>
                        <span>{item.category}</span>
                        <strong>{formatMoney(item.amount)}</strong>
                      </div>
                      <div className="barTrack">
                        <i style={{ width: `${viewModel.topSpend > 0 ? (item.amount / viewModel.topSpend) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <InsightPanel title="จุดที่น่าสนใจ" items={data.analysis.highlights} />
            <InsightPanel title="คำแนะนำถัดไป" items={data.analysis.suggestions} variant="advice" />
          </div>
        )}
      </section>
    </main>
  );
}

function LoadingState() {
  return (
    <div className="panel loadingPanel">
      <div className="skeleton wide" />
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  );
}

function MoneyStat({ label, value, accent }: { label: string; value: number; accent?: "good" | "bad" }) {
  return (
    <div className={`moneyStat ${accent ?? ""}`}>
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </div>
  );
}

function InsightPanel({ title, items, variant }: { title: string; items: string[]; variant?: "advice" }) {
  return (
    <section className="panel proPanel">
      <div className="sectionHead">
        <h2>{title}</h2>
        <span>{variant === "advice" ? "Action" : "Insight"}</span>
      </div>
      <div className="insightList">
        {items.length === 0 ? (
          <div className="emptyState">ยังไม่มีข้อมูลในส่วนนี้</div>
        ) : (
          items.map((item) => (
            <div className={`insightItem ${variant ?? ""}`} key={item}>
              <span />
              <p>{item}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}
