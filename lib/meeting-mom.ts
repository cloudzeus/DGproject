/**
 * MoM (Minutes of Meeting) HTML email renderer.
 *
 * Produces a Microsoft Outlook–friendly email matching the existing brand
 * (Segoe UI, Fluent blue #0078D4, soft cards, table-based layout) using the
 * atomic helpers in `email-templates.ts`.
 *
 * Consumes a MeetingNote row + its insights JSON. Returns:
 *   - subject : default email subject
 *   - html    : full <!doctype html>… document
 *   - text    : plain-text fallback
 */

import {
  BRAND,
  emailLayout,
  escapeHtml,
  formatGreekDateTime,
  metaTable,
  pill,
  priorityPill,
  quote,
  statRow,
  sectionHeader,
  infoCard,
  appUrl,
} from './email-templates';
import type { ActionItem, Decision, Risk, OpenQuestion } from './llm/types';

export type MomInput = {
  meetingId: string;
  subject: string;
  startedAt: Date;
  endedAt: Date;
  durationSec: number;
  organizer: { name: string | null; email: string };
  project: { id: string; name: string; color?: string | null };
  summary: string | null;
  decisions: Decision[];
  actionItems: ActionItem[];
  risks: Risk[];
  openQuestions: OpenQuestion[];
};

export type MomRendered = {
  subject: string;
  html: string;
  text: string;
};

export function renderMom(input: MomInput): MomRendered {
  const subject = `Πρακτικά: ${input.subject} — ${input.startedAt.toLocaleDateString('el-GR')}`;
  const html = buildHtml(input);
  const text = buildText(input);
  return { subject, html, text };
}

function buildHtml(input: MomInput): string {
  const accentColor = input.project.color ?? BRAND.primary;
  const meetingUrl = appUrl(`/projects/${input.project.id}/meetings/${input.meetingId}`);

  // ─── Metadata pills (date, duration, organizer) ───────────────────────
  const durationMin = Math.round(input.durationSec / 60);
  const pillsHtml =
    pill(`📅 ${formatGreekDateTime(input.startedAt)}`, { bg: '#EFEFEF' }) +
    pill(`⏱ ${durationMin} λεπτά`, { bg: '#EFEFEF' }) +
    pill(`👤 ${input.organizer.name ?? input.organizer.email}`, { bg: '#EFEFEF' });

  // ─── Stats row ────────────────────────────────────────────────────────
  const statsHtml = statRow([
    { label: 'Αποφάσεις', value: input.decisions.length, tone: 'info' },
    { label: 'Action items', value: input.actionItems.length, tone: 'success' },
    { label: 'Ρίσκα', value: input.risks.length, tone: input.risks.length > 0 ? 'warning' : 'default' },
    { label: 'Ερωτήματα', value: input.openQuestions.length },
  ]);

  // ─── Summary ──────────────────────────────────────────────────────────
  const summaryHtml = input.summary
    ? `${sectionHeader({ label: 'Περίληψη', color: BRAND.primary })}
       <p style="font-size:14px;color:${BRAND.text};line-height:1.6;margin:0 0 20px;white-space:pre-line;">${escapeHtml(input.summary)}</p>`
    : '';

  // ─── Decisions ────────────────────────────────────────────────────────
  const decisionsHtml = input.decisions.length
    ? `${sectionHeader({ label: 'Αποφάσεις', color: BRAND.info, count: input.decisions.length })}
       <table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 20px;">
         ${input.decisions
           .map(
             (d, i) => `
               <tr>
                 <td style="vertical-align:top;padding:6px 12px 6px 0;width:24px;">
                   <span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:999px;background:${BRAND.infoBg};color:${BRAND.primary};font-size:11px;font-weight:700;text-align:center;">${i + 1}</span>
                 </td>
                 <td style="padding:6px 0;font-size:13px;color:${BRAND.text};line-height:1.55;">
                   ${escapeHtml(d.text)}
                   <div style="font-size:11px;color:${BRAND.textDim};margin-top:2px;">στο ${formatSec(d.timestampSec)}${d.participantEmails.length ? ` · ${escapeHtml(d.participantEmails.join(', '))}` : ''}</div>
                 </td>
               </tr>`,
           )
           .join('')}
       </table>`
    : '';

  // ─── Action items ─────────────────────────────────────────────────────
  const actionsHtml = input.actionItems.length
    ? `${sectionHeader({ label: 'Action items', color: BRAND.success, count: input.actionItems.length })}
       ${input.actionItems.map(renderActionItem).join('')}`
    : '';

  // ─── Risks ────────────────────────────────────────────────────────────
  const risksHtml = input.risks.length
    ? `${sectionHeader({ label: 'Ρίσκα', color: BRAND.warning, count: input.risks.length })}
       ${input.risks.map(renderRisk).join('')}`
    : '';

  // ─── Open questions ───────────────────────────────────────────────────
  const questionsHtml = input.openQuestions.length
    ? `${sectionHeader({ label: 'Ανοιχτά ερωτήματα', color: BRAND.warning, count: input.openQuestions.length })}
       <table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 16px;">
         ${input.openQuestions
           .map(
             (q) => `
               <tr>
                 <td style="vertical-align:top;padding:6px 12px 6px 0;width:18px;">
                   <span style="color:${BRAND.warning};font-size:14px;">❓</span>
                 </td>
                 <td style="padding:6px 0;font-size:13px;color:${BRAND.text};line-height:1.55;">
                   ${escapeHtml(q.question)}
                   ${
                     q.askedToEmail || q.askedByEmail
                       ? `<div style="font-size:11px;color:${BRAND.textDim};margin-top:2px;">${
                           q.askedByEmail ? `${escapeHtml(q.askedByEmail)} → ` : '→ '
                         }${q.askedToEmail ? escapeHtml(q.askedToEmail) : '?'}</div>`
                       : ''
                   }
                 </td>
               </tr>`,
           )
           .join('')}
       </table>`
    : '';

  const body = [
    `<div style="margin:0 0 24px;">${pillsHtml}</div>`,
    statsHtml,
    summaryHtml,
    decisionsHtml,
    actionsHtml,
    risksHtml,
    questionsHtml,
  ]
    .filter(Boolean)
    .join('');

  return emailLayout({
    header: {
      kicker: { text: '📋 ΠΡΑΚΤΙΚΑ ΣΥΣΚΕΨΗΣ', tone: 'info' },
      eyebrow: { text: input.project.name, color: accentColor },
      title: input.subject,
    },
    body,
    actions: meetingUrl
      ? [{ label: 'Άνοιγμα στο A-Sisyphus', url: meetingUrl, variant: 'primary' }]
      : [],
    footerNote:
      'Τα πρακτικά παράγονται αυτόματα από LLM ανάλυση του Teams transcript. ' +
      'Παρακαλώ ελέγξτε για ακρίβεια πριν λάβετε αποφάσεις.',
  });
}

function renderActionItem(a: ActionItem): string {
  const confidencePct = Math.round(a.confidence * 100);
  const confidenceColor =
    a.confidence >= 0.85
      ? { bg: BRAND.successBg, fg: BRAND.success }
      : a.confidence >= 0.6
      ? { bg: BRAND.warningBg, fg: BRAND.warning }
      : { bg: '#FCEAEA', fg: BRAND.danger };

  const meta: string[] = [];
  if (a.assigneeEmail) meta.push(`👤 ${escapeHtml(a.assigneeEmail)}`);
  if (a.dueDate) meta.push(`📅 ${escapeHtml(a.dueDate)}`);

  const pills =
    priorityPill(a.priority) +
    pill(`Conf ${confidencePct}%`, { color: confidenceColor.fg, bg: confidenceColor.bg, bold: true });

  return infoCard(
    `
      <div style="font-size:14px;font-weight:600;color:${BRAND.text};margin:0 0 6px;">${escapeHtml(a.title)}</div>
      <div style="margin-bottom:8px;">${pills}</div>
      <p style="font-size:13px;color:${BRAND.text};margin:0 0 8px;line-height:1.55;">${escapeHtml(a.description)}</p>
      ${
        meta.length
          ? `<div style="font-size:11px;color:${BRAND.textSoft};margin-bottom:8px;">${meta.join(' · ')}</div>`
          : ''
      }
      ${quote({
        body: a.sourceQuote,
        tone: 'neutral',
        caption: `Από το transcript στο ${formatSec(a.sourceTimestampSec)}`,
      })}
    `,
    { tone: 'neutral' },
  );
}

function renderRisk(r: Risk): string {
  const toneMap: Record<string, 'warning' | 'danger' | 'info'> = {
    low: 'info',
    medium: 'warning',
    high: 'danger',
  };
  const tone = toneMap[r.severity] ?? 'warning';
  const severityLabels: Record<string, string> = {
    low: 'Χαμηλό',
    medium: 'Μεσαίο',
    high: 'Υψηλό',
  };

  return infoCard(
    `
      <div style="display:flex;align-items:flex-start;gap:8px;">
        <span style="font-size:16px;">${tone === 'danger' ? '🚨' : '⚠️'}</span>
        <div style="flex:1;">
          <div style="margin-bottom:6px;">${pill(severityLabels[r.severity] ?? r.severity, { color: 'white', bg: tone === 'danger' ? BRAND.danger : BRAND.warning, bold: true })}</div>
          <p style="font-size:13px;color:${BRAND.text};margin:0 0 4px;line-height:1.55;">${escapeHtml(r.text)}</p>
          ${
            r.ownerEmail
              ? `<div style="font-size:11px;color:${BRAND.textSoft};">Owner: ${escapeHtml(r.ownerEmail)}</div>`
              : ''
          }
        </div>
      </div>
    `,
    { tone },
  );
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Plain text fallback ─────────────────────────────────────────────────

function buildText(input: MomInput): string {
  const lines: string[] = [];
  lines.push(`ΠΡΑΚΤΙΚΑ ΣΥΣΚΕΨΗΣ`);
  lines.push(`================`);
  lines.push('');
  lines.push(`Project: ${input.project.name}`);
  lines.push(`Θέμα:    ${input.subject}`);
  lines.push(`Ημ/νία:  ${formatGreekDateTime(input.startedAt)}`);
  lines.push(`Διάρκεια: ${Math.round(input.durationSec / 60)} λεπτά`);
  lines.push(`Organizer: ${input.organizer.name ?? input.organizer.email}`);
  lines.push('');

  if (input.summary) {
    lines.push('ΠΕΡΙΛΗΨΗ');
    lines.push('--------');
    lines.push(input.summary);
    lines.push('');
  }

  if (input.decisions.length) {
    lines.push(`ΑΠΟΦΑΣΕΙΣ (${input.decisions.length})`);
    lines.push('---------');
    input.decisions.forEach((d, i) => {
      lines.push(`${i + 1}. ${d.text}  [${formatSec(d.timestampSec)}]`);
    });
    lines.push('');
  }

  if (input.actionItems.length) {
    lines.push(`ACTION ITEMS (${input.actionItems.length})`);
    lines.push('------------');
    input.actionItems.forEach((a, i) => {
      lines.push(`${i + 1}. ${a.title}`);
      lines.push(`   ${a.description}`);
      if (a.assigneeEmail) lines.push(`   → ${a.assigneeEmail}`);
      if (a.dueDate) lines.push(`   📅 ${a.dueDate}`);
      lines.push(`   Conf: ${Math.round(a.confidence * 100)}% · Priority: ${a.priority}`);
      lines.push('');
    });
  }

  if (input.risks.length) {
    lines.push(`ΡΙΣΚΑ (${input.risks.length})`);
    lines.push('-----');
    input.risks.forEach((r, i) => {
      lines.push(`${i + 1}. [${r.severity.toUpperCase()}] ${r.text}`);
      if (r.ownerEmail) lines.push(`   Owner: ${r.ownerEmail}`);
    });
    lines.push('');
  }

  if (input.openQuestions.length) {
    lines.push(`ΑΝΟΙΧΤΑ ΕΡΩΤΗΜΑΤΑ (${input.openQuestions.length})`);
    lines.push('-----------------');
    input.openQuestions.forEach((q, i) => {
      lines.push(`${i + 1}. ${q.question}`);
      if (q.askedByEmail || q.askedToEmail) {
        lines.push(`   ${q.askedByEmail ?? '?'} → ${q.askedToEmail ?? '?'}`);
      }
    });
    lines.push('');
  }

  const url = appUrl(`/projects/${input.project.id}/meetings/${input.meetingId}`);
  if (url) {
    lines.push(`Λεπτομέρειες: ${url}`);
  }

  return lines.join('\n');
}
