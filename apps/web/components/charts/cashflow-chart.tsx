"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

const DATA = [
  { month: "Jan", revenusN: 52000, revenusN1: 47000, charges: 38000 },
  { month: "Fév", revenusN: 56000, revenusN1: 49000, charges: 41000 },
  { month: "Mar", revenusN: 64000, revenusN1: 53000, charges: 43000 },
  { month: "Avr", revenusN: 61000, revenusN1: 55000, charges: 42000 },
  { month: "Mai", revenusN: 65000, revenusN1: 57000, charges: 44000 },
  { month: "Juin", revenusN: 72000, revenusN1: 60000, charges: 47000 },
  { month: "Juil", revenusN: 70000, revenusN1: 62000, charges: 48000 },
  { month: "Août", revenusN: 67000, revenusN1: 60000, charges: 46000 },
  { month: "Sep", revenusN: 74000, revenusN1: 64000, charges: 49000 },
  { month: "Oct", revenusN: 78000, revenusN1: 66000, charges: 51000 },
  { month: "Nov", revenusN: 76000, revenusN1: 65000, charges: 50000 },
  { month: "Déc", revenusN: 82000, revenusN1: 70000, charges: 53000 },
];

function formatK(value: number) {
  return `${(value / 1000).toFixed(1)} k €`;
}

export function CashflowChart() {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart
        data={DATA}
        margin={{ top: 10, right: 16, bottom: 0, left: 0 }}
        barCategoryGap={14}
        barGap={2}
      >
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
          cursor={{ fill: "var(--warm-100)", opacity: 0.5 }}
          contentStyle={{
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            fontSize: 12,
            boxShadow: "var(--shadow-md)",
          }}
          formatter={(value: number) => formatK(value)}
        />
        <Legend
          iconSize={8}
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
        />
        <Bar dataKey="revenusN" name="Revenus N" fill="var(--success)" radius={[3, 3, 0, 0]} />
        <Bar
          dataKey="revenusN1"
          name="Revenus N-1"
          fill="var(--success-soft)"
          radius={[3, 3, 0, 0]}
        />
        <Bar dataKey="charges" name="Charges N" fill="var(--danger)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
