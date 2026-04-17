import { cn } from '@/lib/utils';

export function Badge({ children, className, variant = 'neutral' }: { children: React.ReactNode; className?: string; variant?: 'neutral'|'blue'|'green'|'orange'|'red'|'purple' }) {
  const variants = {
    neutral: 'bg-fluent-neutral-8 text-fluent-neutral-80 border-fluent-neutral-20',
    blue:    'bg-fluent-blue-50 text-fluent-blue-700 border-fluent-blue-200',
    green:   'bg-green-50 text-fluent-accent-green border-green-200',
    orange:  'bg-orange-50 text-fluent-accent-orange border-orange-200',
    red:     'bg-red-50 text-fluent-accent-red border-red-200',
    purple:  'bg-purple-50 text-fluent-accent-purple border-purple-200',
  };
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
      variants[variant],
      className,
    )}>
      {children}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-fluent-neutral-6 text-fluent-neutral-70 border border-fluent-neutral-10">
      #{children}
    </span>
  );
}
