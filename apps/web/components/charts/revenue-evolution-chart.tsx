"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";

const DATA = [
  { month: "Jan", cumule: 52000, objectif: 60000 },
  { month: "Fév", cumule: 108000, objectif: 120000 },
  { month: "Mar", cumule: 172000, objectif: 180000 },
  { month: "Avr", cumule: 233000, objectif: 240000 },
  { month: "Mai", cumule: 298000, objectif: 300000 },
  { month: "Juin", cumule: 370000, objectif: 360000 },
  { month: "Juil", cumule: 440000, objectif: 420000 },
  { month: "Août", cumule: 507000, objectif: 480000 },
  { month: "Sep", cumule: 581000, objectif: 540000 },
  { month: "Oct", cumule: 659000, objectif: 600000 },
  { month: "Nov", cumule: 735000, objectif: 660000 },
  { month: "Déc", cumule: 812400, objectif: 720000 },
];

function formatK(value: number) {
  return `${Math.round(value / 1000)} k €`;
}

export function RevenueEvolutionChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={DATA} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--fg-subtle)", fontSize: 11, fontFamily: "var(--font-mono)" }}
        />
        <YAxis
          tickFormatter={formatK}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--fg-subtle)", fontSize: 10, fontFamily: "var(--font-mono)" }}
          width={60}
        />
        <Tooltip
          contentStyle={{
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            fontSize: 12,
            boxShadow: "var(--shadow-md)",
          }}
          formatter={(value: number) => formatK(value)}
        />
        <Area
          type="monotone"
          dataKey="cumule"
          stroke="var(--accent)"
          strokeWidth={2}
          fill="url(#revFill)"
          name="Cumulé"
        />
        <Line
          type="monotone"
          dataKey="objectif"
          stroke="var(--fg-subtle)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          name="Objectif"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
