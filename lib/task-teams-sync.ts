import { prisma } from '@/lib/prisma';
import {
  graphIsConfigured,
  postTeamsChannelMessage,
  updateTeamsChannelMessage,
  softDeleteTeamsChannelMessage,
} from '@/lib/microsoft-graph';

const APP_URL = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Επείγουσα',
  high: 'Υψηλή',
  medium: 'Μεσαία',
  low: 'Χαμηλή',
};
const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#C50F1F',
  high: '#D83B01',
  medium: '#0078D4',
  low: '#8A8A8A',
};

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Προς εκτέλεση',
  in_progress: 'Σε εξέλιξη',
  review: 'Προς έλεγχο',
  done: 'Ολοκληρωμένο',
};

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('el-GR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildCardHtml(task: {
  title: string;
  description: string | null;
  priority: string;
  status: string;
  startDate: Date | null;
  dueDate: Date | null;
  project: { name: string; color: string };
  creator: { name: string | null; email: string };
}): string {
  const taskLink = APP_URL ? `${APP_URL.replace(/\/$/, '')}/board` : '';
  const priorityLabel = PRIORITY_LABEL[task.priority] ?? task.priority;
  const priorityColor = PRIORITY_COLOR[task.priority] ?? '#8A8A8A';
  const statusLabel = STATUS_LABEL[task.status] ?? task.status;
  const creator = task.creator.name ?? task.creator.email;

  const desc = task.description?.trim()
    ? `<blockquote style="margin:8px 0 0;padding:8px 12px;border-left:3px solid #E5E5E5;color:#424242;white-space:pre-wrap;">${escapeHtml(task.description)}</blockquote>`
    : '';

  return `
<div>
  <div style="font-size:12px;font-weight:600;color:${task.project.color};text-transform:uppercase;letter-spacing:0.05em;">📁 ${escapeHtml(task.project.name)}</div>
  <div style="font-size:16px;font-weight:600;color:#242424;margin-top:4px;">${escapeHtml(task.title)}</div>
  <div style="margin-top:8px;">
    <span style="display:inline-block;font-size:11px;font-weight:600;color:white;background:${priorityColor};padding:2px 10px;border-radius:999px;margin-right:6px;">${escapeHtml(priorityLabel)}</span>
    <span style="display:inline-block;font-size:11px;color:#424242;background:#EEE;padding:2px 10px;border-radius:999px;margin-right:6px;">${escapeHtml(statusLabel)}</span>
    ${task.dueDate ? `<span style="display:inline-block;font-size:11px;color:#424242;background:#EEE;padding:2px 10px;border-radius:999px;">⏰ Λήξη ${escapeHtml(formatDate(task.dueDate))}</span>` : ''}
  </div>
  ${desc}
  <div style="font-size:11px;color:#9E9E9E;margin-top:10px;">Δημιούργησε: ${escapeHtml(creator)}</div>
  ${taskLink ? `<div style="margin-top:8px;"><a href="${taskLink}" style="font-size:12px;color:#0078D4;">Άνοιγμα στο A-Sisyphus →</a></div>` : ''}
</div>`.trim();
}

type SyncTeamsResult = { ok: boolean; reason?: string };

export async function syncTaskTeams(taskId: string): Promise<SyncTeamsResult> {
  if (!graphIsConfigured()) return { ok: false, reason: 'graph-not-configured' };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      startDate: true,
      dueDate: true,
      addToTeams: true,
      teamsMessageId: true,
      project: { select: { name: true, color: true, teamsChannelId: true } },
      creator: { select: { email: true, name: true } },
    },
  });
  if (!task) return { ok: false, reason: 'task-not-found' };
  if (!task.addToTeams) {
    // Flag turned off: if a message exists, soft-delete it and clear the id.
    if (task.teamsMessageId && task.project.teamsChannelId) {
      try {
        await softDeleteTeamsChannelMessage(task.project.teamsChannelId, task.teamsMessageId);
      } catch (e) {
        console.warn('[teams sync] soft-delete failed', e);
      }
      await prisma.task.update({ where: { id: taskId }, data: { teamsMessageId: null } });
    }
    return { ok: false, reason: 'addToTeams-disabled' };
  }
  if (!task.project.teamsChannelId) return { ok: false, reason: 'no-teams-channel' };

  const html = buildCardHtml(task);
  const subject = `[A-Sisyphus] ${task.title}`;

  try {
    if (task.teamsMessageId) {
      await updateTeamsChannelMessage(task.project.teamsChannelId, task.teamsMessageId, {
        contentHtml: html,
        subject,
      });
    } else {
      const id = await postTeamsChannelMessage(task.project.teamsChannelId, {
        contentHtml: html,
        subject,
      });
      await prisma.task.update({ where: { id: taskId }, data: { teamsMessageId: id } });
    }
    return { ok: true };
  } catch (e) {
    console.warn('[teams sync] failed', e);
    return { ok: false, reason: 'graph-error' };
  }
}

export async function removeTaskTeams(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      teamsMessageId: true,
      project: { select: { teamsChannelId: true } },
    },
  });
  if (!task?.teamsMessageId || !task.project.teamsChannelId) return;
  try {
    await softDeleteTeamsChannelMessage(task.project.teamsChannelId, task.teamsMessageId);
  } catch (e) {
    console.warn('[teams sync] remove failed', e);
  }
}
