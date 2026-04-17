'use client';
import Link from 'next/link';
import { useState } from 'react';
import { signOutAction } from '@/app/(app)/profile/actions';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search20Regular, Alert20Regular, Apps20Regular,
  QuestionCircle20Regular, Add16Filled,
  Person20Regular, Settings20Regular, SignOut20Regular,
} from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { mockNotifications } from '@/lib/mock-data';
import { formatRelative, cn } from '@/lib/utils';

type TopBarUser = { name: string; email: string; image: string | null };

export function TopBar({ user }: { user: TopBarUser }) {
  const [appsOpen, setAppsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const unread = mockNotifications.filter(n => !n.read).length;
  const avatarUser = { name: user.name, avatarUrl: user.image ?? undefined };

  return (
    <header className="acrylic h-14 sticky top-0 z-40 flex items-center px-4 gap-3 border-b border-black/5">
      {/* search */}
      <div className="flex-1 max-w-2xl mx-auto relative">
        <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 text-fluent-neutral-50 pointer-events-none" />
        <input
          type="text"
          placeholder="Search tasks, projects, files, or people..."
          className="w-full h-9 pl-10 pr-16 rounded-md bg-white/70 border border-fluent-neutral-20 text-sm placeholder:text-fluent-neutral-50 focus:bg-white focus:border-fluent-blue-500 focus:outline-none transition-all"
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-fluent-neutral-50 bg-fluent-neutral-8 border border-fluent-neutral-20 px-1.5 py-0.5 rounded">
          ⌘K
        </kbd>
      </div>

      <Button variant="primary" size="sm" icon={<Add16Filled />}>
        Create
      </Button>

      {/* O365 apps launcher */}
      <div className="relative">
        <button
          onClick={() => { setAppsOpen(!appsOpen); setNotifOpen(false); }}
          className="h-9 w-9 rounded-md flex items-center justify-center text-fluent-neutral-70 hover:bg-black/5 transition-colors relative"
          aria-label="Office apps"
        >
          <Apps20Regular />
        </button>
        <AnimatePresence>
          {appsOpen && <AppsFlyout onClose={() => setAppsOpen(false)} />}
        </AnimatePresence>
      </div>

      {/* notifications */}
      <div className="relative">
        <button
          onClick={() => { setNotifOpen(!notifOpen); setAppsOpen(false); }}
          className="h-9 w-9 rounded-md flex items-center justify-center text-fluent-neutral-70 hover:bg-black/5 transition-colors relative"
          aria-label="Notifications"
        >
          <Alert20Regular />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-fluent-accent-red ring-2 ring-white" />
          )}
        </button>
        <AnimatePresence>
          {notifOpen && <NotificationsFlyout onClose={() => setNotifOpen(false)} />}
        </AnimatePresence>
      </div>

      <button className="h-9 w-9 rounded-md flex items-center justify-center text-fluent-neutral-70 hover:bg-black/5">
        <QuestionCircle20Regular />
      </button>

      <div className="pl-2 border-l border-fluent-neutral-20 flex items-center gap-2 relative">
        <button
          onClick={() => { setProfileOpen(!profileOpen); setAppsOpen(false); setNotifOpen(false); }}
          className="rounded-full focus:outline-none focus:ring-2 focus:ring-fluent-blue-500"
          aria-label="Account menu"
        >
          <Avatar user={avatarUser} size="sm" showPresence />
        </button>
        <AnimatePresence>
          {profileOpen && <ProfileFlyout user={user} onClose={() => setProfileOpen(false)} />}
        </AnimatePresence>
      </div>
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

function AppsFlyout({ onClose }: { onClose: () => void }) {
  const apps = [
    { name: 'Outlook',    color: '#0078D4', icon: '✉' },
    { name: 'Teams',      color: '#6264A7', icon: '👥' },
    { name: 'OneDrive',   color: '#0364B8', icon: '☁' },
    { name: 'SharePoint', color: '#0B7AB3', icon: '🏢' },
    { name: 'Word',       color: '#185ABD', icon: 'W' },
    { name: 'Excel',      color: '#107C41', icon: 'X' },
    { name: 'PowerPoint', color: '#C43E1C', icon: 'P' },
    { name: 'OneNote',    color: '#7719AA', icon: 'N' },
    { name: 'Planner',    color: '#31752F', icon: '✓' },
  ];
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-fluent-neutral-90">Microsoft 365</h3>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fluent-accent-green">Connected</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {apps.map((app) => (
            <button
              key={app.name}
              className="flex flex-col items-center gap-1.5 p-3 rounded-md hover:bg-black/5 transition-colors"
            >
              <div
                className="h-10 w-10 rounded-md flex items-center justify-center text-white font-bold text-sm shadow-fluent-2"
                style={{ background: app.color }}
              >
                {app.icon}
              </div>
              <span className="text-[11px] text-fluent-neutral-80">{app.name}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}

function NotificationsFlyout({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="absolute right-0 top-full mt-2 w-96 acrylic rounded-lg shadow-fluent-16 z-50 border border-black/5 overflow-hidden"
      >
        <div className="p-4 border-b border-black/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Notifications</h3>
          <button className="text-xs text-fluent-blue-600 hover:underline">Mark all read</button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {mockNotifications.map((n) => (
            <button
              key={n.id}
              className={cn(
                'w-full text-left p-4 hover:bg-black/5 transition-colors border-b border-black/5 last:border-0 flex gap-3',
                !n.read && 'bg-fluent-blue-50/50',
              )}
            >
              {!n.read && <span className="h-2 w-2 rounded-full bg-fluent-blue-500 mt-1.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-fluent-neutral-90">{n.title}</p>
                <p className="text-xs text-fluent-neutral-70 mt-0.5 truncate">{n.message}</p>
                <p className="text-[11px] text-fluent-neutral-50 mt-1">{formatRelative(n.createdAt)}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}
