'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Search20Regular, Folder20Regular, TaskListLtr20Regular, ChatBubblesQuestion20Regular } from '@fluentui/react-icons';
import type { SearchIndexItem } from '@/app/api/search-index/route';

const TYPE_LABELS: Record<SearchIndexItem['type'], string> = {
  project: 'Έργα',
  task: 'Εργασίες',
  ticket: 'Tickets',
};

const TYPE_ORDER: SearchIndexItem['type'][] = ['project', 'task', 'ticket'];

function TypeIcon({ type }: { type: SearchIndexItem['type'] }) {
  if (type === 'project') return <Folder20Regular className="h-4 w-4 shrink-0 text-fluent-neutral-50" />;
  if (type === 'task') return <TaskListLtr20Regular className="h-4 w-4 shrink-0 text-fluent-neutral-50" />;
  return <ChatBubblesQuestion20Regular className="h-4 w-4 shrink-0 text-fluent-neutral-50" />;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchIndexItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadIndex = useCallback(() => {
    if (items !== null || loading) return;
    setLoading(true);
    fetch('/api/search-index')
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [items, loading]);

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery('');
    setActiveIndex(0);
    loadIndex();
  }, [loadIndex]);

  const closePalette = useCallback(() => {
    setOpen(false);
  }, []);

  // Global ⌘K / Ctrl+K listener.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) {
            setQuery('');
            setActiveIndex(0);
            loadIndex();
          }
          return !prev;
        });
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [loadIndex]);

  // Autofocus the input whenever the overlay opens.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Click-outside closes.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePalette();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, closePalette]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = items ?? [];
    if (!q) return source.slice(0, 40);
    const starts: SearchIndexItem[] = [];
    const includes: SearchIndexItem[] = [];
    for (const item of source) {
      const label = item.label.toLowerCase();
      if (label.startsWith(q)) starts.push(item);
      else if (label.includes(q)) includes.push(item);
    }
    return [...starts, ...includes].slice(0, 40);
  }, [items, query]);

  const grouped = useMemo(() => {
    const groups: { type: SearchIndexItem['type']; items: SearchIndexItem[] }[] = [];
    for (const type of TYPE_ORDER) {
      const group = filtered.filter((i) => i.type === type);
      if (group.length > 0) groups.push({ type, items: group });
    }
    return groups;
  }, [filtered]);

  // Flat list mirrors the rendered (grouped) order, so ↑↓ navigation and
  // activeIndex line up with what's actually on screen.
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, items]);

  function handleSelect(item: SearchIndexItem) {
    closePalette();
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[activeIndex];
      if (item) handleSelect(item);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[25vh] px-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-lg bg-white rounded-xl shadow-fluent-16 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 h-12 border-b border-black/5">
              <Search20Regular className="h-4 w-4 text-fluent-neutral-50 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Αναζήτηση έργων, εργασιών, tickets…"
                className="flex-1 h-full bg-transparent text-sm outline-none placeholder:text-fluent-neutral-40"
              />
              <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded bg-fluent-neutral-8 text-fluent-neutral-60">
                Esc
              </kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-2">
              {loading && items === null && (
                <div className="px-4 py-6 text-sm text-fluent-neutral-60 text-center">Φόρτωση…</div>
              )}
              {!loading && flat.length === 0 && (
                <div className="px-4 py-6 text-sm text-fluent-neutral-60 text-center">Δεν βρέθηκαν αποτελέσματα.</div>
              )}
              {grouped.map((group) => (
                <div key={group.type} className="mb-1 last:mb-0">
                  <div className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-fluent-neutral-50">
                    {TYPE_LABELS[group.type]}
                  </div>
                  {group.items.map((item) => {
                    const index = flat.indexOf(item);
                    const active = index === activeIndex;
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => handleSelect(item)}
                        className={`w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
                          active ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'text-fluent-neutral-90 hover:bg-fluent-neutral-6'
                        }`}
                      >
                        <TypeIcon type={item.type} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
