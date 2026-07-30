'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Home24Regular,
  Folder24Regular,
  TicketDiagonal24Regular,
  Add16Regular,
} from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/**
 * Trimmed shell για το portal πελατών: ίδιο design system με το (app), αλλά
 * top-bar nav αντί για sidebar — τρεις προορισμοί δεν δικαιολογούν πλαϊνή στήλη.
 */

const NAV = [
  { href: '/portal', label: 'Αρχική', Icon: Home24Regular },
  { href: '/portal/projects', label: 'Έργα', Icon: Folder24Regular },
  { href: '/portal/tickets', label: 'Αιτήματα', Icon: TicketDiagonal24Regular },
];

export function PortalShell({
  companyName,
  user,
  children,
}: {
  companyName: string | null;
  user: { name: string; email: string; avatarUrl?: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-fluent-neutral-4 bg-mesh">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-acrylic backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center gap-3 sm:gap-4">
          <Link href="/portal" className="flex items-center gap-2.5 shrink-0">
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-fluent-blue-500 to-fluent-blue-700 p-1.5 shadow-fluent-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/sisyphus-icon.svg" alt="" className="h-full w-full object-contain" />
            </div>
            <span className="hidden sm:inline font-display font-semibold text-[15px] tracking-tight">
              A-Sisyphus
            </span>
          </Link>

          <nav className="flex-1 flex items-center gap-0.5">
            {NAV.map(({ href, label, Icon }) => {
              const active = href === '/portal' ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2 px-2.5 sm:px-3 h-9 rounded-md text-sm font-medium transition-colors',
                    active
                      ? 'bg-fluent-blue-50 text-fluent-blue-700'
                      : 'text-fluent-neutral-80 hover:bg-black/5',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}
          </nav>

          <Link
            href="/portal/tickets/new"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-fluent-blue-600 text-white text-sm font-medium hover:bg-fluent-blue-700 shrink-0"
          >
            <Add16Regular />
            <span className="hidden sm:inline">Νέο αίτημα</span>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden lg:block text-right">
              <p className="text-xs font-medium text-fluent-neutral-90 leading-tight">{user.name}</p>
              {companyName && (
                <p className="text-[11px] text-fluent-neutral-60 leading-tight truncate max-w-[180px]">
                  {companyName}
                </p>
              )}
            </div>
            <Avatar user={{ name: user.name, avatarUrl: user.avatarUrl }} size="sm" />
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="text-xs text-fluent-neutral-60 hover:text-fluent-neutral-90"
            >
              Έξοδος
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
