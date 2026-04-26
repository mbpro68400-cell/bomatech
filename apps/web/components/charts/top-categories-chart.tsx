"use client";

const CATEGORIES = [
  { label: "Salaires & charges sociales", amount: 38400, share: 0.61, color: "oklch(0.55 0.16 285)" },
  { label: "Sous-traitance", amount: 9800, share: 0.155, color: "oklch(0.62 0.13 200)" },
  { label: "Loyer & charges", amount: 5600, share: 0.089, color: "oklch(0.62 0.13 155)" },
  { label: "Logiciels & SaaS", amount: 4200, share: 0.067, color: "oklch(0.7 0.13 130)" },
  { label: "Marketing", amount: 2900, share: 0.046, color: "oklch(0.72 0.14 65)" },
  { label: "Autres", amount: 2100, share: 0.033, color: "var(--fg-subtle)" },
];

function formatEur(amount: number) {
  return `${amount.toLocaleString("fr-FR")} €`;
}

export function TopCategoriesChart() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {CATEGORIES.map((cat) => (
        <div key={cat.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 500 }}>{cat.label}</span>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {formatEur(cat.amount)} · {Math.round(cat.share * 100)} %
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: "var(--warm-100)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${cat.share * 100}%`,
                background: cat.color,
                borderRadius: 3,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
