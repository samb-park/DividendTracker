"use client";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface HoldingData {
  ticker: string;
  name: string | null;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
}

const COLORS = [
  "hsl(142, 69%, 58%)",
  "hsl(38, 92%, 55%)",
  "hsl(196, 80%, 60%)",
  "hsl(270, 60%, 65%)",
  "hsl(0, 70%, 70%)",
  "hsl(180, 60%, 50%)",
];

const RETRO_TOOLTIP_STYLE = {
  backgroundColor: "#161616",
  border: "1px solid #333",
  borderRadius: "0",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: "11px",
  color: "#e8e6d9",
};

export function PortfolioCharts({ holdings }: { holdings: HoldingData[] }) {
  const pieData = holdings
    .filter((h) => h.marketValue > 0)
    .map((h) => ({
      name: h.ticker,
      value: Math.round(h.marketValue * 100) / 100,
    }));

  const barData = holdings
    .filter((h) => h.marketValue > 0)
    .sort((a, b) => b.unrealizedPnLPct - a.unrealizedPnLPct)
    .map((h) => ({
      ticker: h.ticker,
      pnl: Math.round(h.unrealizedPnLPct * 100) / 100,
    }));

  if (holdings.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4 mt-6">
      <div className="border border-border p-4 bg-card">
        <div className="text-accent text-xs tracking-widest mb-4">▶ ALLOCATION</div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ name, percent }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
              labelLine={false}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={RETRO_TOOLTIP_STYLE}
              formatter={(v: number) => [`$${v.toFixed(2)}`, "Value"]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="border border-border p-4 bg-card">
        <div className="text-accent text-xs tracking-widest mb-4">▶ P&amp;L %</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#222" />
            <XAxis
              dataKey="ticker"
              tick={{ fontSize: 9, fill: "#666", fontFamily: "monospace" }}
              axisLine={{ stroke: "#333" }}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#666", fontFamily: "monospace" }}
              axisLine={{ stroke: "#333" }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={RETRO_TOOLTIP_STYLE}
              formatter={(v: number) => [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "P&L"]}
            />
            <Bar dataKey="pnl" maxBarSize={40} radius={[0, 0, 0, 0]}>
              {barData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.pnl >= 0 ? "hsl(142, 69%, 58%)" : "hsl(0, 70%, 70%)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
