'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowSync20Regular,
  Search20Regular,
  CheckmarkCircle20Filled,
  DismissCircle20Filled,
  Tag20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { manualSyncSoftoneItems } from './sync-action';

export type CatalogItem = {
  mtrl: number;
  code: string;
  code1: string | null;
  name: string;
  unitPrice: number;
  retailPrice: number | null;
  wholesalePrice: number | null;
  vatRate: number | null;
  unitName: string | null;
  groupName: string | null;
  brandName: string | null;
  isActive: boolean;
  lastSyncedAt: Date;
};

type Props = {
  kind: 'product' | 'service';
  items: CatalogItem[];
  lastSyncedAt: Date | null;
};

const KIND_LABEL: Record<'product' | 'service', string> = {
  product: 'Προϊόντα',
  service: 'Υπηρεσίες',
};

export function CatalogTable({ kind, items, lastSyncedAt }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items
      .filter((it) => (showInactive ? true : it.isActive))
      .filter((it) => {
        if (!s) return true;
        const hay = (
          it.code +
          ' ' +
          (it.code1 ?? '') +
          ' ' +
          it.name +
          ' ' +
          (it.groupName ?? '') +
          ' ' +
          (it.brandName ?? '')
        ).toLowerCase();
        return hay.includes(s);
      });
  }, [items, search, showInactive]);

  function handleSync() {
    setLastResult(null);
    startTransition(async () => {
      const res = await manualSyncSoftoneItems();
      if (res.ok) {
        setLastResult({
          ok: true,
          message: `Συγχρονίστηκαν ${res.upserted} είδη (συνολικά είδαμε ${res.totalSeen}, ${res.deactivated} απενεργοποιήθηκαν). Χρόνος: ${(res.durationMs / 1000).toFixed(1)}s`,
        });
        router.refresh();
      } else {
        setLastResult({
          ok: false,
          message: res.errors.join(' · ') || 'Σφάλμα κατά τον συγχρονισμό.',
        });
      }
    });
  }

  const stats = useMemo(() => {
    const active = items.filter((i) => i.isActive).length;
    const inactive = items.length - active;
    return { total: items.length, active, inactive };
  }, [items]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-fluent-blue-50 flex items-center justify-center">
            <Tag20Regular className="h-5 w-5 text-fluent-blue-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-fluent-neutral-95">
              {KIND_LABEL[kind]}
            </h1>
            <p className="text-xs text-fluent-neutral-60 mt-0.5">
              {stats.active} ενεργά · {stats.inactive} ανενεργά ·{' '}
              {lastSyncedAt
                ? `Τελευταίο sync: ${formatRelative(lastSyncedAt)}`
                : 'Δεν έχει γίνει sync ακόμα'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-fluent-neutral-70">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-fluent-neutral-30"
            />
            Εμφάνιση ανενεργών
          </label>
          <Button
            variant="primary"
            size="md"
            icon={<ArrowSync20Regular className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />}
            onClick={handleSync}
            disabled={pending}
          >
            {pending ? 'Συγχρονισμός…' : 'Sync από SoftOne'}
          </Button>
        </div>
      </header>

      {/* Sync result banner */}
      {lastResult && (
        <div
          className={`rounded-lg px-3 py-2 text-sm inline-flex items-center gap-2 ${
            lastResult.ok
              ? 'bg-fluent-accent-green/10 text-fluent-accent-green'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {lastResult.ok ? (
            <CheckmarkCircle20Filled className="h-4 w-4" />
          ) : (
            <DismissCircle20Filled className="h-4 w-4" />
          )}
          {lastResult.message}
        </div>
      )}

      {/* Search */}
      <div className="relative w-full sm:max-w-md">
        <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fluent-neutral-50" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Αναζήτηση κωδικού, ονόματος, ομάδας, μάρκας…"
          className="w-full h-9 pl-9 pr-3 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white px-6 py-12 text-center">
          <Tag20Regular className="h-10 w-10 mx-auto text-fluent-neutral-40 mb-3" />
          <p className="text-sm font-semibold text-fluent-neutral-90">
            {items.length === 0
              ? `Δεν υπάρχουν ${KIND_LABEL[kind].toLowerCase()} στο cache.`
              : 'Καμία εγγραφή με αυτά τα φίλτρα.'}
          </p>
          <p className="text-xs text-fluent-neutral-60 mt-1 max-w-md mx-auto">
            {items.length === 0
              ? 'Πάτησε "Sync από SoftOne" για να τραβήξεις τον κατάλογο.'
              : 'Καθάρισε την αναζήτηση ή ενεργοποίησε "Εμφάνιση ανενεργών".'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-fluent-neutral-4 border-b border-black/5">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
                  <th className="px-3 py-2.5">Κωδ.</th>
                  <th className="px-3 py-2.5">Περιγραφή</th>
                  <th className="px-3 py-2.5">Ομάδα</th>
                  <th className="px-3 py-2.5">Μάρκα</th>
                  <th className="px-3 py-2.5 text-right">Χονδρ.</th>
                  <th className="px-3 py-2.5 text-right">Λιαν.</th>
                  <th className="px-3 py-2.5 text-right">ΦΠΑ%</th>
                  <th className="px-3 py-2.5">Μ.Μ.</th>
                  <th className="px-3 py-2.5">Κατάσταση</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => (
                  <tr
                    key={it.mtrl}
                    className={`border-b border-black/5 ${
                      !it.isActive ? 'bg-fluent-neutral-4/30 text-fluent-neutral-50' : 'hover:bg-fluent-neutral-4'
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-fluent-neutral-80">
                      {it.code}
                      {it.code1 && (
                        <div className="text-[10px] text-fluent-neutral-50">{it.code1}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-fluent-neutral-90 max-w-[420px]">
                      <span className="block truncate" title={it.name}>
                        {it.name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-fluent-neutral-70">
                      {it.groupName ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-fluent-neutral-70">
                      {it.brandName ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPrice(it.wholesalePrice)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-fluent-neutral-70">
                      {formatPrice(it.retailPrice)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-fluent-neutral-70">
                      {it.vatRate != null ? `${it.vatRate}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-fluent-neutral-70">
                      {it.unitName ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      {it.isActive ? (
                        <Badge variant="green">Ενεργό</Badge>
                      ) : (
                        <Badge variant="neutral">Ανενεργό</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-black/5 bg-fluent-neutral-4 text-[11px] text-fluent-neutral-60">
            {visible.length} {visible.length === 1 ? 'εγγραφή' : 'εγγραφές'}{' '}
            {visible.length !== items.length && `(από ${items.length} σύνολο)`}
          </div>
        </div>
      )}
    </div>
  );
}

function formatPrice(p: number | null): string {
  if (p == null) return '—';
  return new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(p);
}

function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'μόλις τώρα';
  if (diffMin < 60) return `${diffMin}′ πριν`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h πριν`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d πριν`;
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' });
}
