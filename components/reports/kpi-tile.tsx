'use client';
import { ArrowUp16Filled, ArrowDown16Filled } from '@fluentui/react-icons';
import { DELTA, SINGLE_SERIES } from '@/lib/reports/chart-theme';

/**
 * KPI tile με προαιρετικό δείκτη σύγκρισης και sparkline.
 * `invert`: όταν η ΑΥΞΗΣΗ είναι κακό νέο (π.χ. overdue) — αντιστρέφει τα χρώματα, όχι τα βέλη.
 * `delta` null ⇒ δεν εμφανίζεται δείκτης (prev περίοδος χωρίς δεδομένα).
 */
export function KpiTile({
  label, value, unit, delta, invert = false, spark, subtitle,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number | null;
  invert?: boolean;
  spark?: number[];
  subtitle?: string;
}) {
  const showDelta = delta !== undefined && delta !== null;
  const good = showDelta && (invert ? delta! < 0 : delta! > 0);
  const deltaColor = !showDelta || delta === 0 ? DELTA.neutral : good ? DELTA.good : DELTA.bad;
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-4">
      <p className="text-xs text-fluent-neutral-60 mb-1">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-[32px] leading-9 font-semibold text-fluent-neutral-90">
          {value}
          {unit && <span className="text-sm font-normal text-fluent-neutral-60 ml-1">{unit}</span>}
        </p>
        {spark && spark.length > 1 && <Sparkline data={spark} />}
      </div>
      <div className="mt-1.5 flex items-center gap-2 min-h-[16px]">
        {showDelta && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: deltaColor }}>
            {delta! > 0 ? <ArrowUp16Filled className="h-3 w-3" /> : delta! < 0 ? <ArrowDown16Filled className="h-3 w-3" /> : null}
            {delta === 0 ? '±0%' : `${delta! > 0 ? '+' : ''}${delta}%`}
          </span>
        )}
        {showDelta && <span className="text-[11px] text-fluent-neutral-50">vs προηγ. περίοδο</span>}
        {subtitle && <span className="text-[11px] text-fluent-neutral-50">{subtitle}</span>}
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 72, h = 28, pad = 2;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${pad + (i * (w - pad * 2)) / (data.length - 1)},${h - pad - ((v - min) / span) * (h - pad * 2)}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={SINGLE_SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
