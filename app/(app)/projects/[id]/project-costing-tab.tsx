'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Add20Regular,
  Delete20Regular,
  Search20Regular,
  Tag20Regular,
  Wrench20Regular,
  ArrowDownload20Regular,
  Edit20Regular,
  Save20Regular,
  Dismiss20Regular,
  Money20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { addCostLines, updateCostLine, deleteCostLine } from './cost-actions';

export type CatalogPickerItem = {
  mtrl: number;
  code: string;
  name: string;
  unitPrice: number;
  vatRate: number | null;
  unitName: string | null;
  groupName: string | null;
  kind: 'product' | 'service';
};

export type CostLine = {
  id: string;
  softoneItemMtrl: number;
  kind: 'product' | 'service';
  quantity: number;
  unitPriceSnapshot: number;
  vatRateSnapshot: number | null;
  notes: string | null;
  itemCode: string;
  itemName: string;
  itemUnitName: string | null;
  createdByName: string;
  createdAt: Date;
};

type Props = {
  projectId: string;
  costLines: CostLine[];
  products: CatalogPickerItem[];
  services: CatalogPickerItem[];
};

export function ProjectCostingTab({ projectId, costLines, products, services }: Props) {
  const [adding, setAdding] = useState(false);

  // Aggregate totals: net (qty × unit price), VAT (per-line rate), gross.
  const totals = useMemo(() => {
    let net = 0;
    let vat = 0;
    let productNet = 0;
    let serviceNet = 0;
    for (const l of costLines) {
      const lineNet = l.quantity * l.unitPriceSnapshot;
      const lineVat = lineNet * ((l.vatRateSnapshot ?? 0) / 100);
      net += lineNet;
      vat += lineVat;
      if (l.kind === 'product') productNet += lineNet;
      else serviceNet += lineNet;
    }
    return { net, vat, gross: net + vat, productNet, serviceNet };
  }, [costLines]);

  return (
    <div className="space-y-4">
      {/* Header + totals */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-fluent-blue-50 flex items-center justify-center">
            <Money20Regular className="h-5 w-5 text-fluent-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-fluent-neutral-90 leading-tight">
              Κοστολόγηση έργου
            </h2>
            <p className="text-xs text-fluent-neutral-60">
              Προϊόντα + υπηρεσίες από τον SoftOne κατάλογο. Τιμές κλειδώνονται
              τη στιγμή της προσθήκης (snapshot).
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<Add20Regular className="h-4 w-4" />}
          onClick={() => setAdding(true)}
        >
          Προσθήκη ειδών
        </Button>
      </header>

      {/* Totals tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TotalsTile label="Καθαρή αξία" value={formatMoney(totals.net)} tone="info" />
        <TotalsTile label="ΦΠΑ" value={formatMoney(totals.vat)} tone="muted" />
        <TotalsTile label="Σύνολο" value={formatMoney(totals.gross)} tone="strong" />
        <TotalsTile
          label="Ανάλυση καθαρής"
          value={`${formatMoney(totals.productNet)} προϊ. + ${formatMoney(totals.serviceNet)} υπηρ.`}
          tone="muted"
          small
        />
      </div>

      {/* Add picker (modal-ish overlay) */}
      <AnimatePresence>
        {adding && (
          <PickerOverlay
            projectId={projectId}
            products={products}
            services={services}
            existingMtrls={new Set(costLines.map((l) => l.softoneItemMtrl))}
            onClose={() => setAdding(false)}
          />
        )}
      </AnimatePresence>

      {/* Lines table */}
      {costLines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-fluent-neutral-20 bg-white px-6 py-12 text-center">
          <Money20Regular className="h-10 w-10 mx-auto text-fluent-neutral-40 mb-3" />
          <p className="text-sm font-semibold text-fluent-neutral-90">Καμία γραμμή κόστους ακόμη</p>
          <p className="text-xs text-fluent-neutral-60 mt-1 max-w-md mx-auto">
            Πάτησε &quot;Προσθήκη ειδών&quot; για να επιλέξεις προϊόντα ή υπηρεσίες από
            τον κατάλογο SoftOne και να ορίσεις ποσότητες.
          </p>
        </div>
      ) : (
        <CostLinesTable projectId={projectId} lines={costLines} />
      )}
    </div>
  );
}

function CostLinesTable({ projectId, lines }: { projectId: string; lines: CostLine[] }) {
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-fluent-neutral-4 border-b border-black/5">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
              <th className="px-3 py-2.5 w-12">Τύπος</th>
              <th className="px-3 py-2.5">Κωδ.</th>
              <th className="px-3 py-2.5">Περιγραφή</th>
              <th className="px-3 py-2.5 text-right">Ποσ.</th>
              <th className="px-3 py-2.5 text-right">Τιμή μον.</th>
              <th className="px-3 py-2.5 text-right">ΦΠΑ%</th>
              <th className="px-3 py-2.5 text-right">Καθαρή</th>
              <th className="px-3 py-2.5 text-right">Σύνολο</th>
              <th className="px-3 py-2.5 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <CostLineRow key={line.id} projectId={projectId} line={line} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CostLineRow({ projectId, line }: { projectId: string; line: CostLine }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [qty, setQty] = useState(line.quantity);
  const [price, setPrice] = useState(line.unitPriceSnapshot);
  const [vat, setVat] = useState<number | null>(line.vatRateSnapshot);
  const [notes, setNotes] = useState(line.notes ?? '');

  const net = qty * price;
  const vatAmt = net * ((vat ?? 0) / 100);
  const total = net + vatAmt;

  function handleSave() {
    startTransition(async () => {
      const res = await updateCostLine(projectId, line.id, {
        quantity: qty,
        unitPriceSnapshot: price,
        vatRateSnapshot: vat,
        notes: notes.trim() || null,
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!confirm('Διαγραφή γραμμής;')) return;
    startTransition(async () => {
      await deleteCostLine(projectId, line.id);
      router.refresh();
    });
  }

  function handleCancel() {
    setQty(line.quantity);
    setPrice(line.unitPriceSnapshot);
    setVat(line.vatRateSnapshot);
    setNotes(line.notes ?? '');
    setEditing(false);
  }

  return (
    <tr className="border-b border-black/5 hover:bg-fluent-neutral-4">
      <td className="px-3 py-2">
        {line.kind === 'product' ? (
          <Tag20Regular className="h-4 w-4 text-fluent-blue-600" />
        ) : (
          <Wrench20Regular className="h-4 w-4 text-fluent-accent-orange" />
        )}
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-fluent-neutral-80 whitespace-nowrap">
        {line.itemCode}
      </td>
      <td className="px-3 py-2 max-w-[420px]">
        <div className="font-medium text-fluent-neutral-90 truncate" title={line.itemName}>
          {line.itemName}
        </div>
        {editing ? (
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Σημείωση…"
            className="mt-1 w-full h-7 px-2 rounded-md border border-fluent-neutral-20 text-xs focus:border-fluent-blue-500 focus:outline-none"
          />
        ) : (
          line.notes && (
            <div className="text-[11px] text-fluent-neutral-60 mt-0.5 italic truncate" title={line.notes}>
              {line.notes}
            </div>
          )
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums w-24">
        {editing ? (
          <input
            type="number"
            step="0.01"
            min="0"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="w-20 h-7 px-2 rounded-md border border-fluent-blue-200 text-xs text-right focus:border-fluent-blue-500 focus:outline-none"
          />
        ) : (
          <>
            {line.quantity}{' '}
            {line.itemUnitName && (
              <span className="text-[10px] text-fluent-neutral-50">{line.itemUnitName}</span>
            )}
          </>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums w-28">
        {editing ? (
          <input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-24 h-7 px-2 rounded-md border border-fluent-blue-200 text-xs text-right focus:border-fluent-blue-500 focus:outline-none"
          />
        ) : (
          formatMoney(line.unitPriceSnapshot)
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums w-20">
        {editing ? (
          <input
            type="number"
            step="0.01"
            min="0"
            value={vat ?? ''}
            onChange={(e) =>
              setVat(e.target.value === '' ? null : Number(e.target.value))
            }
            className="w-16 h-7 px-2 rounded-md border border-fluent-blue-200 text-xs text-right focus:border-fluent-blue-500 focus:outline-none"
          />
        ) : line.vatRateSnapshot != null ? (
          `${line.vatRateSnapshot}%`
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-fluent-neutral-70 w-28">
        {formatMoney(net)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold text-fluent-neutral-90 w-28">
        {formatMoney(total)}
      </td>
      <td className="px-3 py-2 w-20">
        <div className="flex items-center gap-1 justify-end">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={pending}
                className="h-7 w-7 rounded-md hover:bg-fluent-accent-green hover:text-white flex items-center justify-center text-fluent-accent-green"
                aria-label="Αποθήκευση"
                title="Αποθήκευση"
              >
                <Save20Regular className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={pending}
                className="h-7 w-7 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"
                aria-label="Ακύρωση"
                title="Ακύρωση"
              >
                <Dismiss20Regular className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="h-7 w-7 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"
                aria-label="Επεξεργασία"
                title="Επεξεργασία"
              >
                <Edit20Regular className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="h-7 w-7 rounded-md hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-60"
                aria-label="Διαγραφή"
                title="Διαγραφή"
              >
                <Delete20Regular className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function PickerOverlay({
  projectId,
  products,
  services,
  existingMtrls,
  onClose,
}: {
  projectId: string;
  products: CatalogPickerItem[];
  services: CatalogPickerItem[];
  existingMtrls: Set<number>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'product' | 'service'>('product');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<number, number>>(new Map()); // mtrl → quantity
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const list = tab === 'product' ? products : services;
  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return list.filter((it) => {
      if (!s) return true;
      return (it.code + ' ' + it.name + ' ' + (it.groupName ?? '')).toLowerCase().includes(s);
    });
  }, [list, search]);

  function toggle(mtrl: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(mtrl)) next.delete(mtrl);
      else next.set(mtrl, 1);
      return next;
    });
  }

  function setQty(mtrl: number, q: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (q > 0) next.set(mtrl, q);
      else next.delete(mtrl);
      return next;
    });
  }

  function handleSave() {
    setError(null);
    if (selected.size === 0) {
      setError('Δεν επέλεξες κανένα είδος.');
      return;
    }
    const lines = Array.from(selected.entries()).map(([mtrl, quantity]) => ({
      softoneItemMtrl: mtrl,
      quantity,
    }));
    startTransition(async () => {
      const res = await addCostLines(projectId, lines);
      if (!res.ok && res.added === 0) {
        setError(res.errors.join(' · ') || 'Σφάλμα προσθήκης.');
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 8 }}
        className="relative bg-white rounded-2xl shadow-fluent-16 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
          <h3 className="text-lg font-semibold font-display text-fluent-neutral-90">
            Προσθήκη ειδών στο κόστος
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"
            aria-label="Κλείσιμο"
          >
            <Dismiss20Regular className="h-5 w-5" />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-black/5 space-y-3">
          <div className="inline-flex items-center bg-fluent-neutral-4 rounded-lg p-1">
            {(['product', 'service'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`text-sm h-8 px-3 rounded-md font-medium transition-colors inline-flex items-center gap-2 ${
                  tab === k
                    ? 'bg-white text-fluent-blue-700 shadow-fluent-2'
                    : 'text-fluent-neutral-70 hover:bg-white/60'
                }`}
              >
                {k === 'product' ? (
                  <Tag20Regular className="h-4 w-4" />
                ) : (
                  <Wrench20Regular className="h-4 w-4" />
                )}
                {k === 'product' ? `Προϊόντα (${products.length})` : `Υπηρεσίες (${services.length})`}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fluent-neutral-50" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Αναζήτηση…"
              autoFocus
              className="w-full h-9 pl-9 pr-3 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="p-8 text-center text-sm text-fluent-neutral-60">
              {list.length === 0
                ? `Δεν υπάρχουν ${tab === 'product' ? 'προϊόντα' : 'υπηρεσίες'} στο cache. Κάνε πρώτα sync από SoftOne.`
                : 'Καμία εγγραφή με αυτό το search.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-fluent-neutral-4 sticky top-0">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-fluent-neutral-60">
                  <th className="px-3 py-2 w-10"></th>
                  <th className="px-3 py-2">Κωδ.</th>
                  <th className="px-3 py-2">Περιγραφή</th>
                  <th className="px-3 py-2 text-right">Τιμή</th>
                  <th className="px-3 py-2 text-right">ΦΠΑ%</th>
                  <th className="px-3 py-2 w-24 text-right">Ποσότητα</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => {
                  const isAlreadyInProject = existingMtrls.has(it.mtrl);
                  const isSelected = selected.has(it.mtrl);
                  return (
                    <tr
                      key={it.mtrl}
                      className={`border-b border-black/5 ${
                        isSelected ? 'bg-fluent-blue-50' : 'hover:bg-fluent-neutral-4'
                      }`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(it.mtrl)}
                          className="rounded border-fluent-neutral-30"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-fluent-neutral-80">
                        {it.code}
                      </td>
                      <td className="px-3 py-2 max-w-[320px]">
                        <div className="font-medium text-fluent-neutral-90 truncate" title={it.name}>
                          {it.name}
                        </div>
                        <div className="text-[10px] text-fluent-neutral-50 flex items-center gap-1.5">
                          {it.groupName && <span>{it.groupName}</span>}
                          {isAlreadyInProject && (
                            <span className="text-fluent-accent-orange font-semibold">
                              ⚠ ήδη στο έργο
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(it.unitPrice)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-fluent-neutral-70">
                        {it.vatRate != null ? `${it.vatRate}%` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {isSelected && (
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={selected.get(it.mtrl)}
                            onChange={(e) => setQty(it.mtrl, Number(e.target.value))}
                            className="w-20 h-7 px-2 rounded-md border border-fluent-blue-200 text-xs text-right focus:border-fluent-blue-500 focus:outline-none"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-black/5 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-fluent-neutral-70">
            {selected.size > 0
              ? `${selected.size} ${selected.size === 1 ? 'επιλογή' : 'επιλογές'}`
              : 'Καμία επιλογή'}
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-md px-2 py-1">
              {error}
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={pending}>
              Ακύρωση
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<Add20Regular className="h-4 w-4" />}
              onClick={handleSave}
              disabled={pending || selected.size === 0}
            >
              {pending ? 'Προσθήκη…' : `Προσθήκη ${selected.size} ${selected.size === 1 ? 'γραμμής' : 'γραμμών'}`}
            </Button>
          </div>
        </footer>
      </motion.div>
    </motion.div>
  );
}

function TotalsTile({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone: 'info' | 'muted' | 'strong';
  small?: boolean;
}) {
  const toneCls: Record<typeof tone, string> = {
    info: 'bg-fluent-blue-50 text-fluent-blue-700 border-fluent-blue-200',
    muted: 'bg-fluent-neutral-4 text-fluent-neutral-90 border-fluent-neutral-10',
    strong: 'bg-fluent-accent-green/10 text-fluent-accent-green border-fluent-accent-green/30',
  };
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneCls[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80">{label}</div>
      <div className={`${small ? 'text-sm' : 'text-xl'} font-semibold font-display tabular-nums mt-0.5`}>
        {value}
      </div>
    </div>
  );
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n);
}

// Suppress unused import warning — kept for potential future "export to Excel"
// button on the table footer. Not wired yet.
void ArrowDownload20Regular;
