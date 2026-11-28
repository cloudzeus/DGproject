import type { ProjectReportAnalytics } from './project-report-analytics';
import type { ProjectReportNarrative } from './project-report-ai';
import { BRAND, escapeHtml, infoCard, sectionHeader, statRow } from './email-templates';

const STATUS_COLORS: Record<string, string> = {
  done: '#107C41',
  in_progress: '#D83B01',
  review: '#8764B8',
  todo: '#0078D4',
  backlog: '#8A8A8A',
};

function paragraph(text: string): string {
  return `<p style="font-size:14px;line-height:1.65;color:${BRAND.text};margin:0 0 12px;">${escapeHtml(text)}</p>`;
}

function days(value: number | null): string {
  return value === null ? '—' : `${value} ημ.`;
}

function horizontalBar(value: number, max: number, color: string): string {
  const percentage = max > 0 ? Math.max(value > 0 ? 4 : 0, Math.round((value / max) * 100)) : 0;
  return `<div style="height:8px;background:#EFEFEF;border-radius:999px;overflow:hidden;"><div style="height:8px;width:${percentage}%;background:${color};border-radius:999px;"></div></div>`;
}

export function buildNarrativeSection(
  narrative: ProjectReportNarrative,
  aiGenerated: boolean,
): string {
  const journey = narrative.journey.length > 0
    ? `<div style="margin:18px 0 20px;border-left:2px solid #BEE2FA;padding-left:18px;">
        ${narrative.journey.map((item) => `
          <div style="position:relative;margin:0 0 18px;">
            <div style="position:absolute;left:-24px;top:4px;width:10px;height:10px;border-radius:999px;background:${BRAND.primary};border:2px solid #FFFFFF;"></div>
            <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.primary};margin-bottom:3px;">${escapeHtml(item.date)}</div>
            <div style="font-size:14px;font-weight:700;color:${BRAND.text};margin-bottom:4px;">${escapeHtml(item.title)}</div>
            <div style="font-size:13px;line-height:1.6;color:${BRAND.textSoft};">${escapeHtml(item.text)}</div>
          </div>`).join('')}
      </div>`
    : '';
  const highlights = narrative.highlights.length > 0
    ? `<table role="presentation" style="border-collapse:collapse;width:100%;margin:4px 0 14px;"><tbody>
        ${narrative.highlights.map((highlight) => `<tr>
          <td style="width:20px;padding:5px 0;vertical-align:top;color:${BRAND.success};font-size:14px;">✓</td>
          <td style="padding:5px 0;font-size:13px;line-height:1.5;color:${BRAND.text};">${escapeHtml(highlight)}</td>
        </tr>`).join('')}
      </tbody></table>`
    : '';

  return `
    ${sectionHeader({ label: 'Η πορεία του έργου, από την αρχή έως σήμερα', color: BRAND.primary })}
    <div style="margin:0 0 20px;padding:18px 20px;background:${BRAND.infoBg};border:1px solid #BEE2FA;border-radius:10px;">
      <h2 style="font-size:20px;line-height:1.35;color:${BRAND.primaryDark};margin:0 0 12px;font-weight:700;">${escapeHtml(narrative.headline)}</h2>
      ${paragraph(narrative.executiveSummary)}
      ${highlights}
      <div style="font-size:10px;line-height:1.5;color:${BRAND.textDim};margin-top:10px;">
        ${aiGenerated
          ? 'Η αφήγηση παράχθηκε με AI από το πλήρες ιστορικό του έργου. Οι αριθμοί στα γραφήματα υπολογίστηκαν απευθείας από τα δεδομένα.'
          : 'Η AI αφήγηση δεν ήταν διαθέσιμη αυτή τη φορά. Εμφανίζεται αυτόματη σύνοψη από τα ίδια πραγματικά δεδομένα.'}
      </div>
    </div>
    ${journey}`;
}

export function buildStatusChart(analytics: ProjectReportAnalytics): string {
  if (analytics.totalTasks === 0) return '';
  const segments = analytics.status.filter((item) => item.count > 0);
  return `
    ${sectionHeader({ label: 'Πού βρίσκονται οι εργασίες', color: BRAND.primary, count: analytics.totalTasks })}
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 10px;">
      <tr>${segments.map((item) => `<td width="${(item.count / analytics.totalTasks) * 100}%" height="16" style="background:${STATUS_COLORS[item.status]};font-size:0;line-height:0;">&nbsp;</td>`).join('')}</tr>
    </table>
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 18px;">
      <tr>${segments.map((item) => `<td style="padding:4px 8px 4px 0;vertical-align:top;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${STATUS_COLORS[item.status]};margin-right:4px;"></span>
        <span style="font-size:11px;color:${BRAND.textSoft};">${escapeHtml(item.label)} <strong style="color:${BRAND.text};">${item.count}</strong></span>
      </td>`).join('')}</tr>
    </table>`;
}

export function buildMonthlyChart(analytics: ProjectReportAnalytics): string {
  if (analytics.monthly.length === 0) return '';
  const max = Math.max(1, ...analytics.monthly.flatMap((month) => [month.opened, month.closed]));
  return `
    ${sectionHeader({ label: 'Τι άνοιξε και τι έκλεισε κάθε μήνα', color: BRAND.primary })}
    <div style="font-size:11px;color:${BRAND.textDim};margin:0 0 10px;">
      <span style="color:${BRAND.primary};">■</span> Νέα tasks &nbsp; <span style="color:${BRAND.success};">■</span> Ολοκληρωμένα tasks
    </div>
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
      <tbody>${analytics.monthly.map((month) => `
        <tr>
          <td style="width:74px;padding:7px 10px 7px 0;vertical-align:middle;font-size:11px;font-weight:600;color:${BRAND.textSoft};white-space:nowrap;">${escapeHtml(month.label)}</td>
          <td style="padding:7px 0;vertical-align:middle;">
            <table role="presentation" width="100%" style="border-collapse:collapse;"><tbody>
              <tr><td style="padding:0 0 5px;">${horizontalBar(month.opened, max, BRAND.primary)}</td><td width="28" style="padding:0 0 5px 7px;text-align:right;font-size:10px;color:${BRAND.textSoft};">${month.opened}</td></tr>
              <tr><td>${horizontalBar(month.closed, max, BRAND.success)}</td><td width="28" style="padding-left:7px;text-align:right;font-size:10px;color:${BRAND.textSoft};">${month.closed}</td></tr>
            </tbody></table>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

export function buildCustomerSection(
  analytics: ProjectReportAnalytics,
  narrative: ProjectReportNarrative,
): string {
  const customerName = analytics.customer.companyName ?? 'Πελάτης';
  return `
    ${sectionHeader({ label: `Η συμμετοχή του πελάτη · ${customerName}`, color: BRAND.info })}
    ${paragraph(narrative.customerParagraph)}
    ${statRow([
      { label: 'Άνοιξε ο πελάτης', value: analytics.customer.openedTasks, tone: 'info' },
      { label: 'Ολοκληρώθηκαν', value: analytics.customer.completedTasks, tone: 'success' },
      { label: 'Μέσο κλείσιμο', value: days(analytics.customer.averageCloseDays), tone: 'default' },
      { label: 'Διάμεσο κλείσιμο', value: days(analytics.customer.medianCloseDays), tone: 'default' },
    ])}
    <div style="font-size:10px;color:${BRAND.textDim};line-height:1.5;margin:0 0 18px;">Ο χρόνος κλεισίματος μετράται από τη δημιουργία του task έως την ολοκλήρωσή του. «Άνοιξε ο πελάτης» σημαίνει ότι δημιουργός είναι χρήστης πελάτη ή μέλος της εταιρίας του έργου.</div>`;
}

export function buildUserContributionSection(
  analytics: ProjectReportAnalytics,
  narrative: ProjectReportNarrative,
): string {
  const contributors = analytics.users.filter((user) =>
    user.requestedTasks > 0 || user.assignedTasks > 0 || user.completedTasks > 0 ||
    user.comments > 0 || user.activities > 0,
  );
  const maxCompleted = Math.max(1, ...contributors.map((user) => user.completedTasks));
  return `
    ${sectionHeader({ label: 'Η δουλειά της ομάδας, ανά χρήστη', color: BRAND.success })}
    ${paragraph(narrative.teamParagraph)}
    ${contributors.length > 0 ? `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 12px;"><tbody>
      ${contributors.map((user) => `<tr>
          <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};vertical-align:top;">
            <table role="presentation" width="100%" style="border-collapse:collapse;"><tr>
              <td style="vertical-align:top;">
                <div style="font-size:13px;font-weight:700;color:${BRAND.text};">${escapeHtml(user.name)}</div>
                <div style="font-size:10px;color:${BRAND.textDim};margin-top:2px;">${user.isAIAgent ? 'AI agent' : user.isCustomer ? 'Πελάτης' : user.isDGSmart ? 'DGSmart' : 'Συνεργάτης'} · Ζήτησε ${user.requestedTasks} · Ανέλαβε ${user.assignedTasks} (${user.openTasks} ανοιχτά) · ${user.comments} σχόλια · ${user.trackedHoursOnAssignedTasks} ώρες στα ανατεθημένα tasks</div>
              </td>
              <td width="112" align="right" style="vertical-align:top;font-size:12px;font-weight:700;color:${BRAND.success};">Ολοκλήρωσε ${user.completedTasks}</td>
            </tr></table>
            <div style="margin-top:7px;">${horizontalBar(user.completedTasks, maxCompleted, BRAND.success)}</div>
          </td>
        </tr>`).join('')}
    </tbody></table>` : `<div style="font-size:13px;color:${BRAND.textSoft};margin-bottom:16px;">Δεν υπάρχουν ακόμη καταχωρισμένες συνεισφορές χρηστών.</div>`}
    <div style="font-size:10px;color:${BRAND.textDim};line-height:1.5;margin:0 0 18px;">«Ζήτησε» μετράει τα tasks που δημιούργησε ο χρήστης, «Ανέλαβε» τις τρέχουσες αναθέσεις και «Ολοκλήρωσε» μόνο τα completion events που κατέγραψε ο ίδιος. Οι ώρες αφορούν ανατεθημένα tasks και δεν προστίθενται μεταξύ χρηστών.</div>`;
}

export function buildDGSmartSection(
  analytics: ProjectReportAnalytics,
  narrative: ProjectReportNarrative,
): string {
  return `
    ${sectionHeader({ label: 'Η συνεισφορά της DGSmart', color: BRAND.success })}
    ${infoCard(`
      ${paragraph(narrative.dgsmartParagraph)}
      <table role="presentation" width="100%" style="border-collapse:collapse;"><tr>
        <td style="padding:6px 10px 6px 0;"><div style="font-size:20px;font-weight:700;color:${BRAND.success};">${analytics.dgsmart.completedTasks}/${analytics.dgsmart.assignedTasks}</div><div style="font-size:10px;color:${BRAND.textDim};">ΟΛΟΚΛΗΡΩΜΕΝΑ / ΑΝΑΤΕΘΕΙΜΕΝΑ</div></td>
        <td style="padding:6px 10px;"><div style="font-size:20px;font-weight:700;color:${BRAND.primary};">${analytics.dgsmart.trackedHours}</div><div style="font-size:10px;color:${BRAND.textDim};">ΩΡΕΣ ΣΕ TASKS ΣΥΜΜΕΤΟΧΗΣ</div></td>
        <td style="padding:6px 10px;"><div style="font-size:20px;font-weight:700;color:${BRAND.text};">${analytics.dgsmart.comments}</div><div style="font-size:10px;color:${BRAND.textDim};">ΣΧΟΛΙΑ</div></td>
        <td style="padding:6px 0;"><div style="font-size:20px;font-weight:700;color:${BRAND.text};">${analytics.dgsmart.activities}</div><div style="font-size:10px;color:${BRAND.textDim};">ΕΝΕΡΓΕΙΕΣ</div></td>
      </tr></table>
      <div style="font-size:11px;line-height:1.6;color:${BRAND.textSoft};margin-top:10px;">AI-αναθέσεις: <strong>${analytics.dgsmart.aiAssignedTasks}</strong> · Tasks από συναντήσεις: <strong>${analytics.dgsmart.meetingGeneratedTasks}</strong> · Tasks από πρόταση: <strong>${analytics.dgsmart.proposalGeneratedTasks}</strong> · Εγκεκριμένες AI λύσεις: <strong>${analytics.dgsmart.approvedResolutions}</strong></div>
    `, { tone: 'success' })}`;
}

export function buildClosingSection(narrative: ProjectReportNarrative): string {
  if (!narrative.closingParagraph) return '';
  return `
    ${sectionHeader({ label: 'Το επόμενο βήμα', color: BRAND.primary })}
    ${infoCard(paragraph(narrative.closingParagraph), { tone: 'info' })}`;
}
