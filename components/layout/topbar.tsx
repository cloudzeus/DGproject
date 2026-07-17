'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signOutAction } from '@/app/(app)/profile/actions';
import {
  fetchMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
} from '@/app/(app)/notification-actions';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search20Regular, Alert20Regular, Apps20Regular,
  QuestionCircle20Regular, Add16Filled,
  Person20Regular, Settings20Regular, SignOut20Regular,
  Navigation20Regular, CheckmarkCircle16Regular,
} from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatRelative, cn } from '@/lib/utils';

type TopBarUser = {
  name: string;
  email: string;
  image: string | null;
  microsoftConnected: boolean;
};

export function TopBar({ user, onMenuClick }: { user: TopBarUser; onMenuClick?: () => void }) {
  const [appsOpen, setAppsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const avatarUser = { name: user.name, avatarUrl: user.image ?? undefined };

  // initial fetch + poll every 60s
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetchMyNotifications();
      if (!cancelled) {
        setNotifications(res.items);
        setUnread(res.unread);
      }
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function openNotifications() {
    setNotifOpen(true);
    setAppsOpen(false);
    const res = await fetchMyNotifications();
    setNotifications(res.items);
    setUnread(res.unread);
  }

  function handleMarkRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    void markNotificationRead(id);
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await markAllNotificationsRead();
  }

  return (
    <header className="acrylic h-14 sticky top-0 z-40 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 border-b border-black/5">
      {/* Mobile hamburger */}
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden h-9 w-9 rounded-md flex items-center justify-center text-fluent-neutral-70 hover:bg-black/5 transition-colors"
          aria-label="Άνοιγμα μενού"
        >
          <Navigation20Regular />
        </button>
      )}

      {/* Search (hidden on mobile, toggleable) */}
      <div className="hidden md:flex flex-1 max-w-2xl mx-auto relative">
        <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 text-fluent-neutral-50 pointer-events-none" />
        <input
          type="text"
          placeholder="Αναζήτηση σε εργασίες, έργα, αρχεία ή άτομα..."
          className="w-full h-9 pl-10 pr-16 rounded-md bg-white/70 border border-fluent-neutral-20 text-sm placeholder:text-fluent-neutral-50 focus:bg-white focus:border-fluent-blue-500 focus:outline-none transition-all"
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-fluent-neutral-50 bg-fluent-neutral-8 border border-fluent-neutral-20 px-1.5 py-0.5 rounded">
          ⌘K
        </kbd>
      </div>

      {/* Mobile: search icon expands a row */}
      <button
        type="button"
        onClick={() => setSearchOpen((v) => !v)}
        className="md:hidden h-9 w-9 rounded-md flex items-center justify-center text-fluent-neutral-70 hover:bg-black/5"
        aria-label="Αναζήτηση"
      >
        <Search20Regular />
      </button>

      {/* Spacer on mobile so right cluster pushes right */}
      <div className="md:hidden flex-1" />

      <Button variant="primary" size="sm" icon={<Add16Filled />} className="hidden sm:inline-flex">
        Δημιουργία
      </Button>

      {/* O365 apps launcher — hidden on small */}
      <div className="relative hidden sm:block">
        <button
          onClick={() => { setAppsOpen(!appsOpen); setNotifOpen(false); }}
          className="h-9 w-9 rounded-md flex items-center justify-center text-fluent-neutral-70 hover:bg-black/5 transition-colors relative"
          aria-label="Office apps"
        >
          <Apps20Regular />
        </button>
        <AnimatePresence>
          {appsOpen && (
            <AppsFlyout
              email={user.email}
              connected={user.microsoftConnected}
              onClose={() => setAppsOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* notifications */}
      <div className="relative">
        <button
          onClick={() => {
            if (notifOpen) setNotifOpen(false);
            else void openNotifications();
          }}
          className="h-9 w-9 rounded-md flex items-center justify-center text-fluent-neutral-70 hover:bg-black/5 transition-colors relative"
          aria-label="Ειδοποιήσεις"
        >
          <Alert20Regular />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-fluent-accent-red text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
        <AnimatePresence>
          {notifOpen && (
            <NotificationsFlyout
              notifications={notifications}
              unread={unread}
              onClose={() => setNotifOpen(false)}
              onMarkRead={handleMarkRead}
              onMarkAllRead={handleMarkAllRead}
            />
          )}
        </AnimatePresence>
      </div>

      <button className="hidden md:flex h-9 w-9 rounded-md items-center justify-center text-fluent-neutral-70 hover:bg-black/5">
        <QuestionCircle20Regular />
      </button>

      <div className="pl-1 sm:pl-2 sm:border-l border-fluent-neutral-20 flex items-center gap-2 relative">
        <button
          onClick={() => { setProfileOpen(!profileOpen); setAppsOpen(false); setNotifOpen(false); }}
          className="rounded-full focus:outline-none focus:ring-2 focus:ring-fluent-blue-500"
          aria-label="Μενού λογαριασμού"
        >
          <Avatar user={avatarUser} size="sm" showPresence />
        </button>
        <AnimatePresence>
          {profileOpen && <ProfileFlyout user={user} onClose={() => setProfileOpen(false)} />}
        </AnimatePresence>
      </div>

      {/* Mobile search bar row */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 52 }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden absolute left-0 right-0 top-full bg-white border-b border-black/5 shadow-fluent-8 overflow-hidden z-40"
          >
            <div className="relative px-3 py-2.5">
              <Search20Regular className="absolute left-6 top-1/2 -translate-y-1/2 text-fluent-neutral-50 pointer-events-none" />
              <input
                autoFocus
                type="text"
                placeholder="Αναζήτηση..."
                className="w-full h-9 pl-10 pr-3 rounded-md bg-fluent-neutral-4 border border-fluent-neutral-20 text-sm placeholder:text-fluent-neutral-50 focus:bg-white focus:border-fluent-blue-500 focus:outline-none"
                onBlur={() => setSearchOpen(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function ProfileFlyout({ user, onClose }: { user: TopBarUser; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="absolute right-0 top-full mt-2 w-72 acrylic rounded-lg shadow-fluent-16 z-50 border border-black/5 overflow-hidden"
      >
        <div className="p-4 border-b border-black/5">
          <div className="font-semibold text-sm text-fluent-neutral-90 truncate">{user.name}</div>
          <div className="text-xs text-fluent-neutral-60 truncate">{user.email}</div>
        </div>
        <div className="p-1">
          <Link
            href="/profile"
            onClick={onClose}
            className="flex items-center gap-3 px-3 h-10 rounded-md text-sm text-fluent-neutral-80 hover:bg-black/5"
          >
            <Person20Regular className="text-fluent-neutral-60" />
            Το προφίλ μου
          </Link>
          <Link
            href="/settings"
            onClick={onClose}
            className="flex items-center gap-3 px-3 h-10 rounded-md text-sm text-fluent-neutral-80 hover:bg-black/5"
          >
            <Settings20Regular className="text-fluent-neutral-60" />
            Ρυθμίσεις
          </Link>
        </div>
        <div className="p-1 border-t border-black/5">
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex items-center gap-3 px-3 h-10 rounded-md text-sm text-fluent-neutral-80 hover:bg-black/5 w-full text-left"
            >
              <SignOut20Regular className="text-fluent-neutral-60" />
              Αποσύνδεση
            </button>
          </form>
        </div>
      </motion.div>
    </>
  );
}

function AppsFlyout({
  email,
  connected,
  onClose,
}: {
  email: string;
  connected: boolean;
  onClose: () => void;
}) {
  const apps = [
    { name: 'Outlook',    color: '#0078D4', icon: '✉', url: 'https://outlook.office.com/mail/' },
    { name: 'Teams',      color: '#6264A7', icon: '👥', url: 'https://teams.microsoft.com/' },
    { name: 'OneDrive',   color: '#0364B8', icon: '☁', url: 'https://www.office.com/launch/onedrive' },
    { name: 'SharePoint', color: '#0B7AB3', icon: '🏢', url: 'https://www.office.com/launch/sharepoint' },
    { name: 'Word',       color: '#185ABD', icon: 'W', url: 'https://www.office.com/launch/word' },
    { name: 'Excel',      color: '#107C41', icon: 'X', url: 'https://www.office.com/launch/excel' },
    { name: 'PowerPoint', color: '#C43E1C', icon: 'P', url: 'https://www.office.com/launch/powerpoint' },
    { name: 'OneNote',    color: '#7719AA', icon: 'N', url: 'https://www.office.com/launch/onenote' },
    { name: 'Planner',    color: '#31752F', icon: '✓', url: 'https://tasks.office.com/' },
  ];
  const login = connected ? `?login_hint=${encodeURIComponent(email)}` : '';
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="absolute right-0 top-full mt-2 w-80 acrylic rounded-lg shadow-fluent-16 p-4 z-50 border border-black/5"
      >
        <div className="flex items-start justify-between mb-1 gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-fluent-neutral-90">Microsoft 365</h3>
            <p className="text-[11px] text-fluent-neutral-60 truncate">{email}</p>
          </div>
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap mt-0.5',
              connected ? 'text-fluent-accent-green' : 'text-fluent-neutral-50',
            )}
          >
            {connected ? 'Συνδεδεμένο' : 'Μη συνδεδεμένο'}
          </span>
        </div>
        {!connected && (
          <Link
            href="/auth/signin"
            onClick={onClose}
            className="block mb-3 mt-2 text-center text-xs font-semibold text-fluent-blue-600 bg-fluent-blue-50 hover:bg-fluent-blue-100 rounded-md py-2 transition-colors"
          >
            Σύνδεση με Microsoft 365
          </Link>
        )}
        <div className={cn('grid grid-cols-3 gap-2 mt-3', !connected && 'opacity-60 pointer-events-none')}>
          {apps.map((app) => (
            <a
              key={app.name}
              href={`${app.url}${login}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="flex flex-col items-center gap-1.5 p-3 rounded-md hover:bg-black/5 transition-colors"
            >
              <div
                className="h-10 w-10 rounded-md flex items-center justify-center text-white font-bold text-sm shadow-fluent-2"
                style={{ background: app.color }}
              >
                {app.icon}
              </div>
              <span className="text-[11px] text-fluent-neutral-80">{app.name}</span>
            </a>
          ))}
        </div>
        <a
          href={`https://www.office.com/apps${login}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="block mt-3 text-center text-xs text-fluent-blue-600 hover:underline"
        >
          Όλες οι εφαρμογές →
        </a>
      </motion.div>
    </>
  );
}

function NotificationsFlyout({
  notifications,
  unread,
  onClose,
  onMarkRead,
  onMarkAllRead,
}: {
  notifications: NotificationRow[];
  unread: number;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleClick(n: NotificationRow) {
    if (!n.read) onMarkRead(n.id);
    if (n.link) {
      onClose();
      startTransition(() => router.push(n.link!));
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="absolute right-0 top-full mt-2 w-[22rem] sm:w-96 acrylic rounded-lg shadow-fluent-16 z-50 border border-black/5 overflow-hidden"
      >
        <div className="p-4 border-b border-black/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Ειδοποιήσεις {unread > 0 && <span className="text-fluent-blue-600">({unread})</span>}
          </h3>
          {unread > 0 && (
            <button
              onClick={onMarkAllRead}
              className="text-xs text-fluent-blue-600 hover:underline"
            >
              Όλα ως αναγνωσμένα
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-10 text-center text-sm text-fluent-neutral-60">
              Δεν υπάρχουν ειδοποιήσεις.
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={cn(
                  'w-full text-left p-4 hover:bg-black/5 transition-colors border-b border-black/5 last:border-0 flex gap-3',
                  !n.read && 'bg-fluent-blue-50/50',
                )}
              >
                {n.type === 'approval' ? (
                  <CheckmarkCircle16Regular className="h-4 w-4 text-fluent-blue-600 mt-0.5 shrink-0" />
                ) : !n.read ? (
                  <span className="h-2 w-2 rounded-full bg-fluent-blue-500 mt-1.5 shrink-0" />
                ) : (
                  <span className="h-2 w-2 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-fluent-neutral-90">{n.title}</p>
                  <p className="text-xs text-fluent-neutral-70 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[11px] text-fluent-neutral-50 mt-1">
                    {formatRelative(new Date(n.createdAt))}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </>
  );
}
