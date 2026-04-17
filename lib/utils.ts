import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric' });
}

export function formatRelative(date: Date | string | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0 && diffDays < 7) return `In ${diffDays} days`;
  if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)} days ago`;
  return formatDate(d);
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

export function priorityColor(p: string): string {
  return {
    urgent: 'text-fluent-accent-red bg-red-50 border-red-200',
    high:   'text-fluent-accent-orange bg-orange-50 border-orange-200',
    medium: 'text-fluent-blue-600 bg-fluent-blue-50 border-fluent-blue-200',
    low:    'text-fluent-neutral-60 bg-fluent-neutral-8 border-fluent-neutral-20',
  }[p] ?? '';
}

export function statusLabel(s: string): string {
  return {
    backlog: 'Backlog', todo: 'Προς εκτέλεση', in_progress: 'Σε εξέλιξη',
    review: 'Προς έλεγχο', done: 'Ολοκληρωμένο',
    planning: 'Σχεδιασμός', active: 'Ενεργό', on_hold: 'Σε αναμονή',
    completed: 'Ολοκληρωμένο', archived: 'Αρχειοθετημένο',
  }[s] ?? s;
}
