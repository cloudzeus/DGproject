'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Home24Regular, Home24Filled,
  Board24Regular, Board24Filled,
  Folder24Regular, Folder24Filled,
  Calendar24Regular, Calendar24Filled,
  CalendarLtr24Regular, CalendarLtr24Filled,
  People24Regular, People24Filled,
  DocumentMultiple24Regular, DocumentMultiple24Filled,
  Settings24Regular, Settings24Filled,
  PeopleTeam24Regular, PeopleTeam24Filled,
  BuildingMultiple24Regular, BuildingMultiple24Filled,
  DataBarVertical24Regular, DataBarVertical24Filled,
  ChevronRight16Regular,
  Add16Regular,
} from '@fluentui/react-icons';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/dashboard', label: 'Αρχική', Regular: Home24Regular, Filled: Home24Filled },
  { href: '/board', label: 'Οι εργασίες μου', Regular: Board24Regular, Filled: Board24Filled },
  { href: '/projects', label: 'Έργα', Regular: Folder24Regular, Filled: Folder24Filled },
  { href: '/timeline', label: 'Χρονοδιάγραμμα', Regular: CalendarLtr24Regular, Filled: CalendarLtr24Filled },
  { href: '/calendar', label: 'Ημερολόγιο', Regular: Calendar24Regular, Filled: Calendar24Filled },
  { href: '/files', label: 'Αρχεία', Regular: DocumentMultiple24Regular, Filled: DocumentMultiple24Filled },
  { href: '/team', label: 'Ομάδα', Regular: People24Regular, Filled: People24Filled },
  { href: '/reports', label: 'Αναφορές', Regular: DataBarVertical24Regular, Filled: DataBarVertical24Filled },
];

type UserRole = 'admin' | 'manager' | 'member' | 'viewer' | undefined;

type ProjectLink = { id: string; name: string; color: string };

export function Sidebar({ userRole, projects = [] }: { userRole?: UserRole; projects?: ProjectLink[] }) {
  const pathname = usePathname();
  const isAdmin = userRole === 'admin';

  return (
    <aside className="mica w-64 flex flex-col border-r border-black/5 h-screen sticky top-0">
      {/* logo */}
      <div className="h-14 flex items-center px-5 border-b border-black/5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-fluent-blue-500 to-fluent-blue-700 flex items-center justify-center shadow-fluent-2 p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://dgsoft.b-cdn.net/company/sisyphusIconWhite.svg"
              alt="A-Sisyphus"
              className="h-full w-full object-contain"
            />
          </div>
          <span className="font-display font-semibold text-[15px] tracking-tight">A-Sisyphus</span>
        </div>
      </div>

      {/* main nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-0.5">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = active ? item.Filled : item.Regular;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 px-3 h-9 rounded-md text-sm font-medium transition-all relative',
                  active
                    ? 'bg-fluent-blue-50 text-fluent-blue-700'
                    : 'text-fluent-neutral-80 hover:bg-black/5',
                )}
              >
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-fluent-blue-600 rounded-r-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className={cn('h-5 w-5', active ? 'text-fluent-blue-600' : 'text-fluent-neutral-60')} />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* projects list */}
        <div className="mt-6">
          <div className="flex items-center justify-between px-3 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-50">
              Έργα
            </span>
            <button className="p-0.5 rounded hover:bg-black/5 text-fluent-neutral-60">
              <Add16Regular />
            </button>
          </div>
          <div className="space-y-0.5">
            {projects.length === 0 && (
              <div className="px-3 py-2 text-xs text-fluent-neutral-50">Δεν υπάρχουν έργα.</div>
            )}
            {projects.map((p) => {
              const active = pathname === `/projects/${p.id}`;
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className={cn(
                    'group flex items-center gap-2.5 px-3 h-8 rounded-md text-sm transition-all',
                    active ? 'bg-black/5 text-fluent-neutral-90' : 'text-fluent-neutral-70 hover:bg-black/5',
                  )}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="truncate flex-1">{p.name}</span>
                  <ChevronRight16Regular className="opacity-0 group-hover:opacity-100 text-fluent-neutral-50" />
                </Link>
              );
            })}
          </div>
        </div>

        {isAdmin && (
          <div className="mt-6">
            <div className="px-3 mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-50">
                Διαχείριση
              </span>
            </div>
            <div className="space-y-0.5">
              {[
                { href: '/admin/users', label: 'Χρήστες', Regular: PeopleTeam24Regular, Filled: PeopleTeam24Filled },
                { href: '/admin/departments', label: 'Τμήματα', Regular: BuildingMultiple24Regular, Filled: BuildingMultiple24Filled },
              ].map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = active ? item.Filled : item.Regular;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-3 px-3 h-9 rounded-md text-sm font-medium transition-all relative',
                      active
                        ? 'bg-fluent-blue-50 text-fluent-blue-700'
                        : 'text-fluent-neutral-80 hover:bg-black/5',
                    )}
                  >
                    {active && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-fluent-blue-600 rounded-r-full"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <Icon className={cn('h-5 w-5', active ? 'text-fluent-blue-600' : 'text-fluent-neutral-60')} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* settings at bottom */}
      <div className="px-3 py-3 border-t border-black/5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 h-9 rounded-md text-sm font-medium text-fluent-neutral-80 hover:bg-black/5"
        >
          {pathname.startsWith('/settings') ? <Settings24Filled className="h-5 w-5 text-fluent-blue-600" /> : <Settings24Regular className="h-5 w-5 text-fluent-neutral-60" />}
          Ρυθμίσεις
        </Link>
      </div>
    </aside>
  );
}
