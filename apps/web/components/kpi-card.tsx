import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  delta?: {
    value: string;
    trend: "up" | "down" | "flat";
  };
  sub?: ReactNode;
}

/**
 * KPI card — follows the `.card > .kpi` pattern from @bomatech/ui/app.css.
 * The `.kpi` container is the card body: label on top, large serif value,
 * footer with delta + sub-text.
 */
export function KpiCard({ label, value, unit, delta, sub }: KpiCardProps) {
  const deltaClass =
    delta?.trend === "up" ? "delta up" : delta?.trend === "down" ? "delta down" : "delta";

  return (
    <article className="card">
      <div className="kpi">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value serif">
          {value}
          {unit && <span className="unit">{unit}</span>}
        </div>
        <div className="kpi-sub">
          {delta && (
            <span className={deltaClass}>
              {delta.trend === "up" ? "↑" : delta.trend === "down" ? "↓" : "→"} {delta.value}
            </span>
          )}
          {sub && <span>{sub}</span>}
        </div>
      </div>
    </article>
  );
}
