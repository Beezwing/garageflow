"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export function RevenueChart({
  data,
  currency,
}: {
  data: { date: string; amount: number }[];
  currency: string;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-text-muted">No payments in this period.</p>;
  }
  const fmt = (n: number) =>
    new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fontSize: 11, fill: "var(--text-subtle)" }}
            stroke="var(--border)"
          />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: "var(--text-subtle)" }} stroke="var(--border)" width={44} />
          <Tooltip
            formatter={(v) => [`${currency} ${Number(v).toLocaleString()}`, "Revenue"]}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="amount" fill="var(--brand)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
