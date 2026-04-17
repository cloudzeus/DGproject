'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search20Regular, Grid20Regular, List20Regular, ArrowUpload20Regular,
  FolderOpen20Regular, Document20Regular, MoreHorizontal16Regular,
  Share20Regular, Star16Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { mockUsers } from '@/lib/mock-data';
import { cn, formatRelative } from '@/lib/utils';

type Source = 'all' | 'onedrive' | 'sharepoint' | 'local';

const mockFiles = [
  { id: 'f1', name: 'Q2 Launch Strategy.docx',   app: 'Word',       color: '#185ABD', size: '2.4 MB',  source: 'sharepoint', modifiedAt: new Date(Date.now() - 1*3600*1000),  modifiedById: 'u2', starred: true },
  { id: 'f2', name: 'Revenue Projections.xlsx',  app: 'Excel',      color: '#107C41', size: '1.1 MB',  source: 'onedrive',   modifiedAt: new Date(Date.now() - 3*3600*1000),  modifiedById: 'u1', starred: false },
  { id: 'f3', name: 'Brand Guidelines v2.pdf',   app: 'PDF',        color: '#D83B01', size: '8.7 MB',  source: 'sharepoint', modifiedAt: new Date(Date.now() - 24*3600*1000), modifiedById: 'u5', starred: true },
  { id: 'f4', name: 'Launch-Deck.pptx',          app: 'PowerPoint', color: '#C43E1C', size: '12.3 MB', source: 'onedrive',   modifiedAt: new Date(Date.now() - 2*24*3600*1000), modifiedById: 'u2', starred: false },
  { id: 'f5', name: 'Meeting Notes — Weekly.docx', app: 'Word',     color: '#185ABD', size: '340 KB',  source: 'sharepoint', modifiedAt: new Date(Date.now() - 3*24*3600*1000), modifiedById: 'u3', starred: false },
  { id: 'f6', name: 'User Research Findings.docx', app: 'Word',     color: '#185ABD', size: '4.8 MB',  source: 'sharepoint', modifiedAt: new Date(Date.now() - 4*24*3600*1000), modifiedById: 'u3', starred: true },
  { id: 'f7', name: 'Product Roadmap.xlsx',       app: 'Excel',     color: '#107C41', size: '890 KB',  source: 'onedrive',   modifiedAt: new Date(Date.now() - 5*24*3600*1000), modifiedById: 'u1', starred: false },
  { id: 'f8', name: 'Design System Audit.pdf',    app: 'PDF',       color: '#D83B01', size: '5.2 MB',  source: 'local',      modifiedAt: new Date(Date.now() - 6*24*3600*1000), modifiedById: 'u5', starred: false },
];

export default function FilesPage() {
  const [source, setSource] = useState<Source>('all');
  const [view, setView] = useState<'grid'|'list'>('list');

  const filtered = source === 'all' ? mockFiles : mockFiles.filter(f => f.source === source);

  const sourceTabs: { id: Source; label: string; count: number; tint?: string }[] = [
    { id: 'all',        label: 'All files',  count: mockFiles.length },
    { id: 'onedrive',   label: 'OneDrive',   count: mockFiles.filter(f => f.source === 'onedrive').length,   tint: '#0364B8' },
    { id: 'sharepoint', label: 'SharePoint', count: mockFiles.filter(f => f.source === 'sharepoint').length, tint: '#0B7AB3' },
    { id: 'local',      label: 'Uploaded',   count: mockFiles.filter(f => f.source === 'local').length },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fluent-neutral-95">Files</h1>
          <p className="text-fluent-neutral-60 mt-1">All files across OneDrive, SharePoint, and attachments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" icon={<FolderOpen20Regular />}>Browse OneDrive</Button>
          <Button variant="primary" size="md" icon={<ArrowUpload20Regular />}>Upload</Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-lg">
        <Search20Regular className="absolute left-3 top-1/2 -translate-y-1/2 text-fluent-neutral-50" />
        <input
          type="text"
          placeholder="Search files..."
          className="w-full h-10 pl-10 pr-4 rounded-md bg-white border border-fluent-neutral-20 text-sm placeholder:text-fluent-neutral-50 focus:border-fluent-blue-500 focus:outline-none"
        />
      </div>

      {/* Tabs + view switcher */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 p-1 bg-white rounded-lg border border-black/5 shadow-fluent-2">
          {sourceTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setSource(t.id)}
              className={cn(
                'flex items-center gap-2 px-3 h-8 rounded-md text-sm font-medium transition-colors',
                source === t.id
                  ? 'bg-fluent-blue-50 text-fluent-blue-700'
                  : 'text-fluent-neutral-70 hover:bg-fluent-neutral-6',
              )}
            >
              {t.tint && <span className="h-2 w-2 rounded-full" style={{ background: t.tint }} />}
              {t.label}
              <span className="text-[11px] font-medium text-fluent-neutral-50">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-white rounded-lg border border-black/5 shadow-fluent-2">
          <button onClick={() => setView('grid')} className={cn('h-8 w-8 rounded-md flex items-center justify-center', view === 'grid' ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'text-fluent-neutral-60')}>
            <Grid20Regular />
          </button>
          <button onClick={() => setView('list')} className={cn('h-8 w-8 rounded-md flex items-center justify-center', view === 'list' ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'text-fluent-neutral-60')}>
            <List20Regular />
          </button>
        </div>
      </div>

      {view === 'list' && (
        <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_140px_120px_100px_50px] gap-4 px-5 h-10 items-center text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-50 border-b border-black/5 bg-fluent-neutral-4">
            <span>Name</span>
            <span>Modified</span>
            <span>Modified by</span>
            <span>Source</span>
            <span>Size</span>
            <span />
          </div>
          {filtered.map((f, i) => {
            const user = mockUsers.find(u => u.id === f.modifiedById)!;
            return (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className="grid grid-cols-[1fr_140px_140px_120px_100px_50px] gap-4 px-5 h-14 items-center border-b border-black/5 last:border-0 hover:bg-fluent-neutral-4 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-md flex items-center justify-center text-white font-bold text-sm shadow-fluent-2 shrink-0" style={{ background: f.color }}>
                    {f.app[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-sm text-fluent-neutral-90 truncate">{f.name}</p>
                      {f.starred && <Star16Regular className="text-fluent-accent-yellow shrink-0" />}
                    </div>
                  </div>
                </div>
                <span className="text-sm text-fluent-neutral-70">{formatRelative(f.modifiedAt)}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar user={user} size="xs" />
                  <span className="text-sm text-fluent-neutral-70 truncate">{user.name}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-fluent-neutral-8 text-fluent-neutral-70 w-fit capitalize">{f.source}</span>
                <span className="text-sm text-fluent-neutral-70">{f.size}</span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="h-7 w-7 rounded hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"><Share20Regular className="h-4 w-4" /></button>
                  <button className="h-7 w-7 rounded hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-60"><MoreHorizontal16Regular /></button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {view === 'grid' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {filtered.map((f, i) => {
            const user = mockUsers.find(u => u.id === f.modifiedById)!;
            return (
              <motion.button
                key={f.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.03 }}
                className="bg-white rounded-xl border border-black/5 shadow-fluent-2 hover:shadow-fluent-8 transition-all overflow-hidden text-left group"
              >
                <div className="h-32 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${f.color}15, ${f.color}05)` }}>
                  <div className="h-14 w-14 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-fluent-4" style={{ background: f.color }}>
                    {f.app[0]}
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-fluent-neutral-90 truncate mb-1">{f.name}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-fluent-neutral-60">
                    <Avatar user={user} size="xs" />
                    <span className="truncate">{formatRelative(f.modifiedAt)}</span>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
