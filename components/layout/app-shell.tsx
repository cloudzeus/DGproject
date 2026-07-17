'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './sidebar';
import { TopBar } from './topbar';

type UserRole = 'admin' | 'manager' | 'member' | 'viewer' | undefined;
type UserType = 'employee' | 'customer' | 'supplier' | undefined;
type ProjectLink = { id: string; name: string; color: string };
type TopBarUser = {
  name: string;
  email: string;
  image: string | null;
  microsoftConnected: boolean;
};

interface Props {
  userRole: UserRole;
  userType?: UserType;
  projects: ProjectLink[];
  user: TopBarUser;
  badges?: { questions?: number; tickets?: number };
  children: React.ReactNode;
}

export function AppShell({ userRole, userType, projects, user, badges, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer open
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen bg-mesh">
      {/* Desktop sidebar — always visible */}
      <div className="hidden lg:block">
        <Sidebar userRole={userRole} userType={userType} projects={projects} badges={badges} />
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 lg:hidden"
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 z-50 lg:hidden"
            >
              <Sidebar userRole={userRole} userType={userType} projects={projects} badges={badges} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
