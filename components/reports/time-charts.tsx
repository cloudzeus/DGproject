'use client';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { INK, SINGLE_SERIES, FLOW } from '@/lib/reports/chart-theme';

const fmtDay = (k: string) => {
  const d = new Date(`${k}T12:00:00`);
  return new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' }).format(d);
};

const axisProps = {
  stroke: INK.axis,
  tick: { fill: INK.axis, fontSize: 10, fontVariantNumeric: 'tabular-nums' as const },
  tickLine: false,
  axisLine: { stroke: INK.grid },
};

function VizTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white border border-black/10 shadow-fluent-8 px-3 py-2 text-xs">
      <p className="font-semibold text-fluent-neutral-90 mb-1">{label ? fmtDay(label) : ''}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-fluent-neutral-70">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="tabular-nums font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Trend μίας σειράς (area). data: [{ day:'YYYY-MM-DD', value }]. */
export function TrendArea({ data, name, color = SINGLE_SERIES, height = 200 }: {
  data: { day: string; value: number }[];
  name: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid stroke={INK.grid} vertical={false} />
        <XAxis dataKey="day" tickFormatter={fmtDay} {...axisProps} minTickGap={28} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip content={<VizTooltip />} cursor={{ stroke: INK.axis, strokeWidth: 1 }} />
        <Area type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.12} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Δύο σειρές grouped bars ανά ημέρα/εβδομάδα (π.χ. εισερχόμενα vs επιλυμένα).
 * ≥2 σειρές ⇒ legend πάντα παρόν.
 */
export function DualBars({ data, aName, bName, aColor = FLOW.incoming, bColor = FLOW.resolved, height = 200 }: {
  data: { day: string; a: number; b: number }[];
  aName: string;
  bName: string;
  aColor?: string;
  bColor?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barGap={2}>
        <CartesianGrid stroke={INK.grid} vertical={false} />
        <XAxis dataKey="day" tickFormatter={fmtDay} {...axisProps} minTickGap={28} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip content={<VizTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
        <Bar dataKey="a" name={aName} fill={aColor} radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="b" name={bName} fill={bColor} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Μπάρες μίας σειράς ανά εβδομάδα (throughput). */
export function WeeklyBars({ data, name, color = SINGLE_SERIES, height = 180 }: {
  data: { week: string; count: number }[];
  name: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid stroke={INK.grid} vertical={false} />
        <XAxis dataKey="week" tickFormatter={fmtDay} {...axisProps} minTickGap={16} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip content={<VizTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
        <Bar dataKey="count" name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
