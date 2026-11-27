'use client';

import { Checkmark20Regular, Mail20Regular, Warning20Regular } from '@fluentui/react-icons';

export type EmailTrackingInfo = {
  status: 'sent' | 'delivered' | 'opened' | 'failed';
  deliveredAt: Date | null;
  openedAt: Date | null;
  openCount: number;
  error?: string | null;
};

const STYLE: Record<EmailTrackingInfo['status'], { label: string; className: string }> = {
  sent: { label: 'Στάλθηκε', className: 'bg-fluent-blue-50 text-fluent-blue-700 border-fluent-blue-200' },
  delivered: { label: 'Παραδόθηκε', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  opened: { label: 'Ανοίχτηκε', className: 'bg-green-50 text-green-700 border-green-200' },
  failed: { label: 'Απέτυχε', className: 'bg-red-50 text-red-700 border-red-200' },
};

function date(value: Date | null): string | null {
  return value ? new Date(value).toLocaleString('el-GR') : null;
}

export function EmailTrackingBadge({ tracking }: { tracking: EmailTrackingInfo | null | undefined }) {
  if (!tracking) return null;
  const style = STYLE[tracking.status];
  const details = [
    date(tracking.deliveredAt) ? `Παραδόθηκε: ${date(tracking.deliveredAt)}` : null,
    date(tracking.openedAt) ? `Ανοίχτηκε: ${date(tracking.openedAt)}` : null,
    tracking.openCount > 1 ? `Ανοίγματα: ${tracking.openCount}` : null,
    tracking.error ?? null,
    'Το άνοιγμα καταγράφεται όταν ο email client φορτώνει το tracking pixel.',
  ].filter(Boolean).join('\n');
  const Icon = tracking.status === 'failed'
    ? Warning20Regular
    : tracking.status === 'sent' ? Mail20Regular : Checkmark20Regular;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-4 ${style.className}`}
      title={details}
    >
      <Icon className="h-3 w-3" />
      {style.label}
    </span>
  );
}
