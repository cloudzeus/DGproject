'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckmarkCircle16Filled, ArrowSync20Regular } from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { currentUser } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const sections = ['Profile', 'Integrations', 'Notifications', 'Appearance', 'Workspace', 'Billing'] as const;
type Section = typeof sections[number];

const integrations = [
  { name: 'Outlook Calendar',  desc: 'Sync task due dates to your Outlook calendar',    color: '#0078D4', icon: '📅', connected: true,  account: 'sarah.chen@contoso.com' },
  { name: 'OneDrive',           desc: 'Attach files from OneDrive to tasks',              color: '#0364B8', icon: '☁',  connected: true,  account: 'sarah.chen@contoso.com' },
  { name: 'SharePoint',         desc: 'Link projects to SharePoint sites',                color: '#0B7AB3', icon: '🏢', connected: true,  account: 'contoso.sharepoint.com' },
  { name: 'Microsoft Teams',    desc: 'Post task updates to a Teams channel',             color: '#6264A7', icon: '👥', connected: false, account: '' },
  { name: 'Outlook Email',      desc: 'Convert emails to tasks from your inbox',          color: '#0078D4', icon: '✉',  connected: true,  account: 'sarah.chen@contoso.com' },
  { name: 'Planner',            desc: 'Two-way sync with Microsoft Planner boards',       color: '#31752F', icon: '✓',  connected: false, account: '' },
];

export default function SettingsPage() {
  const [section, setSection] = useState<Section>('Integrations');

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95 mb-6">Settings</h1>

      <div className="flex gap-8">
        {/* Sidebar nav */}
        <nav className="w-48 shrink-0">
          <div className="space-y-0.5">
            {sections.map(s => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={cn(
                  'w-full text-left px-3 h-9 rounded-md text-sm font-medium transition-colors',
                  section === s ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'text-fluent-neutral-70 hover:bg-black/5',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 min-w-0"
        >
          {section === 'Profile' && (
            <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6">
              <h2 className="font-display text-xl font-semibold mb-1">Profile</h2>
              <p className="text-sm text-fluent-neutral-60 mb-6">Your personal information and preferences</p>
              <div className="flex items-center gap-4 mb-6">
                <Avatar user={currentUser} size="lg" />
                <div>
                  <Button variant="secondary" size="sm">Change photo</Button>
                  <p className="text-xs text-fluent-neutral-60 mt-2">JPG, PNG or GIF. Max 2MB.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 max-w-xl">
                <Field label="Display name" value={currentUser.name} />
                <Field label="Email" value={currentUser.email} />
                <Field label="Role" value={currentUser.role} />
                <Field label="Timezone" value="(UTC-08:00) Pacific Time" />
              </div>
            </div>
          )}

          {section === 'Integrations' && (
            <div>
              <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6 mb-5">
                <h2 className="font-display text-xl font-semibold mb-1">Microsoft 365 integrations</h2>
                <p className="text-sm text-fluent-neutral-60">
                  Connect your Microsoft 365 account to enable seamless workflows.
                </p>
                <div className="mt-4 flex items-center gap-3 p-3 bg-fluent-blue-50 border border-fluent-blue-200 rounded-lg">
                  <div className="h-9 w-9 rounded-md bg-fluent-blue-500 text-white flex items-center justify-center font-bold text-sm">M</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-fluent-neutral-90">Connected as sarah.chen@contoso.com</p>
                    <p className="text-xs text-fluent-neutral-60">Admin consent granted · Azure AD tenant: contoso.onmicrosoft.com</p>
                  </div>
                  <Button variant="secondary" size="sm" icon={<ArrowSync20Regular />}>Refresh</Button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
                {integrations.map((int, i) => (
                  <div
                    key={int.name}
                    className={cn(
                      'flex items-center gap-4 p-5',
                      i !== integrations.length - 1 && 'border-b border-black/5',
                    )}
                  >
                    <div
                      className="h-10 w-10 rounded-md flex items-center justify-center text-white font-bold shrink-0"
                      style={{ background: int.color }}
                    >
                      {int.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-fluent-neutral-90">{int.name}</p>
                        {int.connected && <CheckmarkCircle16Filled className="text-fluent-accent-green" />}
                      </div>
                      <p className="text-xs text-fluent-neutral-60">{int.desc}</p>
                      {int.connected && int.account && (
                        <p className="text-[11px] text-fluent-neutral-50 mt-0.5">Connected: {int.account}</p>
                      )}
                    </div>
                    <Button variant={int.connected ? 'secondary' : 'primary'} size="sm">
                      {int.connected ? 'Manage' : 'Connect'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === 'Notifications' && (
            <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6">
              <h2 className="font-display text-xl font-semibold mb-4">Notifications</h2>
              <div className="space-y-4">
                {['Task assigned to me', 'Mentioned in a comment', 'Due date approaching', 'Project status changes', 'Weekly summary email'].map((label, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <span className="text-sm text-fluent-neutral-80">{label}</span>
                    <Toggle defaultOn={i < 3} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {(section === 'Appearance' || section === 'Workspace' || section === 'Billing') && (
            <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-12 text-center">
              <p className="text-fluent-neutral-60">The {section} settings are not part of this mockup yet.</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-60 mb-1 block">{label}</label>
      <input
        defaultValue={value}
        className="w-full h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm bg-white focus:border-fluent-blue-500 focus:outline-none capitalize"
      />
    </div>
  );
}

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      onClick={() => setOn(!on)}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors',
        on ? 'bg-fluent-blue-500' : 'bg-fluent-neutral-20',
      )}
    >
      <motion.div
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
        animate={{ left: on ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
