import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  HeadingLevel,
  WidthType,
  AlignmentType,
  BorderStyle,
} from 'docx';
import { auth } from '@/auth';
import {
  buildReportsData,
  STATUS_LABELS_EL,
  PRIORITY_LABELS_EL,
  ROLE_LABELS_EL,
  type ReportsData,
} from '@/lib/reports';
import { resolveRange } from '@/lib/reports/shared';
import { buildOverviewReport } from '@/lib/reports/overview';
import { buildProjectsReport } from '@/lib/reports/projects';
import { buildTasksReport } from '@/lib/reports/tasks';
import { buildTicketsReport } from '@/lib/reports/tickets';
import { buildUsersReport } from '@/lib/reports/users';

function csvResponse(filename: string, headers: string[], rows: (string | number | null)[][]): NextResponse {
  const esc = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // UTF-8 BOM ώστε το Excel να διαβάζει σωστά τα ελληνικά.
  const body = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

type Tab = 'overview' | 'projects' | 'users';

function parseTab(v: string | null): Tab {
  if (v === 'projects' || v === 'users' || v === 'overview') return v;
  return 'overview';
}

const BLUE_FILL = 'FF0078D4';
const LIGHT_FILL = 'FFF3F2F1';
const BORDER = { style: 'thin' as const, color: { argb: 'FFE1E1E1' } };

function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function buildXlsx(tab: Tab, data: ReportsData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'A-Sisyphus';
  wb.created = new Date();

  if (tab === 'overview' || tab === 'projects') {
    addProjectsSheet(wb, data);
  }
  if (tab === 'overview' || tab === 'users') {
    addUsersSheet(wb, data);
  }
  if (tab === 'overview') {
    addSummarySheet(wb, data);
  }

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_FILL } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
  });
  row.height = 22;
}

function styleDataRow(row: ExcelJS.Row, zebra: boolean) {
  row.eachCell((cell) => {
    cell.alignment = { vertical: 'middle' };
    cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
    if (zebra) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_FILL } };
    }
  });
}

function addSummarySheet(wb: ExcelJS.Workbook, data: ReportsData) {
  const ws = wb.addWorksheet('Επισκόπηση');
  ws.columns = [
    { header: 'Μετρική', key: 'metric', width: 36 },
    { header: 'Τιμή', key: 'value', width: 16 },
  ];
  styleHeader(ws.getRow(1));

  const summary: Array<[string, number]> = [
    ['Συνολικά έργα', data.totals.projects],
    ['Συνολικές εργασίες', data.totals.tasks],
    ['Ολοκληρωμένες εργασίες', data.totals.completed],
    ['Εκπρόθεσμες εργασίες', data.totals.overdue],
  ];
  summary.forEach((s, i) => {
    const r = ws.addRow(s);
    styleDataRow(r, i % 2 === 1);
  });

  ws.addRow([]);
  const hdr = ws.addRow(['Εργασίες ανά κατάσταση', 'Αριθμός']);
  styleHeader(hdr);
  Object.entries(data.statusBreakdown).forEach(([k, v], i) => {
    const r = ws.addRow([STATUS_LABELS_EL[k] ?? k, v]);
    styleDataRow(r, i % 2 === 1);
  });

  ws.addRow([]);
  const hdr2 = ws.addRow(['Εργασίες ανά προτεραιότητα', 'Αριθμός']);
  styleHeader(hdr2);
  Object.entries(data.priorityBreakdown).forEach(([k, v], i) => {
    const r = ws.addRow([PRIORITY_LABELS_EL[k] ?? k, v]);
    styleDataRow(r, i % 2 === 1);
  });

  ws.addRow([]);
  const hdr3 = ws.addRow(['Έργα ανά κατάσταση', 'Αριθμός']);
  styleHeader(hdr3);
  Object.entries(data.projectStatusBreakdown).forEach(([k, v], i) => {
    const r = ws.addRow([STATUS_LABELS_EL[k] ?? k, v]);
    styleDataRow(r, i % 2 === 1);
  });
}

function addProjectsSheet(wb: ExcelJS.Workbook, data: ReportsData) {
  const ws = wb.addWorksheet('Έργα');
  ws.columns = [
    { header: 'Έργο', key: 'name', width: 34 },
    { header: 'Κατάσταση', key: 'status', width: 18 },
    { header: 'Ιδιοκτήτης', key: 'owner', width: 26 },
    { header: 'Μέλη', key: 'members', width: 8 },
    { header: 'Σύνολο', key: 'total', width: 10 },
    { header: 'Done', key: 'done', width: 8 },
    { header: 'Ανοιχτές', key: 'open', width: 10 },
    { header: 'Εκπρόθεσμες', key: 'overdue', width: 14 },
    { header: 'Αυτή την εβδομάδα', key: 'week', width: 20 },
    { header: 'Ολοκλήρωση %', key: 'pct', width: 14 },
  ];
  styleHeader(ws.getRow(1));

  data.projects.forEach((p, i) => {
    const r = ws.addRow({
      name: p.name,
      status: STATUS_LABELS_EL[p.status] ?? p.status,
      owner: p.ownerName,
      members: p.memberCount,
      total: p.total,
      done: p.done,
      open: p.open,
      overdue: p.overdue,
      week: p.dueThisWeek,
      pct: p.completionPct / 100,
    });
    styleDataRow(r, i % 2 === 1);
    r.getCell('pct').numFmt = '0%';
    if (p.overdue > 0) {
      r.getCell('overdue').font = { color: { argb: 'FFC50F1F' }, bold: true };
    }
  });

  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function addUsersSheet(wb: ExcelJS.Workbook, data: ReportsData) {
  const ws = wb.addWorksheet('Χρήστες');
  ws.columns = [
    { header: 'Όνομα', key: 'name', width: 30 },
    { header: 'Email', key: 'email', width: 34 },
    { header: 'Ρόλος', key: 'role', width: 18 },
    { header: 'Σύνολο', key: 'total', width: 10 },
    { header: 'Ανοιχτές', key: 'open', width: 10 },
    { header: 'Σε εξέλιξη', key: 'inProgress', width: 14 },
    { header: 'Ολοκληρωμένες', key: 'done', width: 16 },
    { header: 'Εκπρόθεσμες', key: 'overdue', width: 14 },
  ];
  styleHeader(ws.getRow(1));

  data.users.forEach((u, i) => {
    const r = ws.addRow({
      name: u.name,
      email: u.email,
      role: ROLE_LABELS_EL[u.role] ?? u.role,
      total: u.total,
      open: u.open,
      inProgress: u.inProgress,
      done: u.done,
      overdue: u.overdue,
    });
    styleDataRow(r, i % 2 === 1);
    if (u.overdue > 0) {
      r.getCell('overdue').font = { color: { argb: 'FFC50F1F' }, bold: true };
    }
  });

  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function docxCell(text: string, opts: { bold?: boolean; shaded?: boolean; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shaded ? { fill: '0078D4' } : undefined,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: opts.bold,
            color: opts.shaded ? 'FFFFFF' : undefined,
            size: 18,
          }),
        ],
      }),
    ],
  });
}

function docxTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h) => docxCell(h, { bold: true, shaded: true })),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((v) => docxCell(v)),
          }),
      ),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'E1E1E1' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E1E1E1' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'E1E1E1' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'E1E1E1' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E1E1E1' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E1E1E1' },
    },
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    alignment: AlignmentType.LEFT,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true })],
  });
}

async function buildDocx(tab: Tab, data: ReportsData): Promise<Buffer> {
  const sections: Array<Paragraph | Table> = [];

  sections.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: 'A-Sisyphus — Αναφορά', bold: true, size: 36 })],
    }),
  );
  sections.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `Δημιουργήθηκε: ${new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
          italics: true,
          size: 18,
        }),
      ],
    }),
  );

  if (tab === 'overview') {
    sections.push(heading('Επισκόπηση'));
    sections.push(
      docxTable(
        ['Μετρική', 'Τιμή'],
        [
          ['Συνολικά έργα', String(data.totals.projects)],
          ['Συνολικές εργασίες', String(data.totals.tasks)],
          ['Ολοκληρωμένες', String(data.totals.completed)],
          ['Εκπρόθεσμες', String(data.totals.overdue)],
        ],
      ),
    );

    sections.push(heading('Εργασίες ανά κατάσταση', HeadingLevel.HEADING_2));
    sections.push(
      docxTable(
        ['Κατάσταση', 'Αριθμός'],
        Object.entries(data.statusBreakdown).map(([k, v]) => [STATUS_LABELS_EL[k] ?? k, String(v)]),
      ),
    );

    sections.push(heading('Εργασίες ανά προτεραιότητα', HeadingLevel.HEADING_2));
    sections.push(
      docxTable(
        ['Προτεραιότητα', 'Αριθμός'],
        Object.entries(data.priorityBreakdown).map(([k, v]) => [PRIORITY_LABELS_EL[k] ?? k, String(v)]),
      ),
    );

    sections.push(heading('Έργα ανά κατάσταση', HeadingLevel.HEADING_2));
    sections.push(
      docxTable(
        ['Κατάσταση', 'Αριθμός'],
        Object.entries(data.projectStatusBreakdown).map(([k, v]) => [STATUS_LABELS_EL[k] ?? k, String(v)]),
      ),
    );
  }

  if (tab === 'overview' || tab === 'projects') {
    sections.push(heading('Έργα'));
    if (data.projects.length === 0) {
      sections.push(new Paragraph({ children: [new TextRun({ text: 'Κανένα έργο.' })] }));
    } else {
      sections.push(
        docxTable(
          ['Έργο', 'Κατάσταση', 'Ιδιοκτήτης', 'Σύνολο', 'Done', 'Εκπρόθ.', '% Ολοκλ.'],
          data.projects.map((p) => [
            p.name,
            STATUS_LABELS_EL[p.status] ?? p.status,
            p.ownerName,
            String(p.total),
            String(p.done),
            String(p.overdue),
            `${p.completionPct}%`,
          ]),
        ),
      );
    }
  }

  if (tab === 'overview' || tab === 'users') {
    sections.push(heading('Χρήστες'));
    if (data.users.length === 0) {
      sections.push(new Paragraph({ children: [new TextRun({ text: 'Κανένας χρήστης.' })] }));
    } else {
      sections.push(
        docxTable(
          ['Όνομα', 'Email', 'Ρόλος', 'Σύνολο', 'Ανοιχτές', 'Done', 'Εκπρόθ.'],
          data.users.map((u) => [
            u.name,
            u.email,
            ROLE_LABELS_EL[u.role] ?? u.role,
            String(u.total),
            String(u.open),
            String(u.done),
            String(u.overdue),
          ]),
        ),
      );
    }
  }

  const doc = new Document({
    creator: 'A-Sisyphus',
    title: 'A-Sisyphus Report',
    sections: [{ properties: {}, children: sections }],
  });

  const buf = await Packer.toBuffer(doc);
  return buf;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const rawTab = sp.get('tab') ?? 'overview';
  const isPrivilegedForCsv = session.user.role === 'admin' || session.user.role === 'manager';
  const stampForCsv = todayStamp();
  const explicitLegacyFormat = sp.get('format') === 'xlsx' || sp.get('format') === 'docx';

  if (!explicitLegacyFormat) {
    const { range, prev } = resolveRange({
      period: sp.get('period') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
    });
    const scope = { range, prev, userId: session.user.id, isPrivileged: isPrivilegedForCsv };

    if (rawTab === 'tasks') {
      const d = await buildTasksReport(scope);
      return csvResponse(
        `tasks-report-${stampForCsv}.csv`,
        ['Εβδομάδα', 'Ολοκληρώσεις'],
        d.throughputByWeek.map((w) => [w.week, w.count]),
      );
    }
    if (rawTab === 'tickets') {
      if (!isPrivilegedForCsv) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      const d = await buildTicketsReport(scope);
      return csvResponse(
        `tickets-report-${stampForCsv}.csv`,
        ['Πηγή', 'Tickets'],
        d.volume.bySource.map((s) => [s.label, s.value]),
      );
    }
    if (rawTab === 'projects') {
      const d = await buildProjectsReport(scope);
      return csvResponse(
        `projects-report-${stampForCsv}.csv`,
        ['Έργο', 'Κατάσταση', 'Ολοκλ. περιόδου', 'Velocity/εβδ', 'Net flow', 'Ώρες tracked', 'Ώρες εκτίμηση', 'Μ.ό. cycle (h)', 'Εκπρόθεσμα'],
        d.rows.map((p) => [p.name, p.status, p.completedInPeriod, p.velocityPerWeek, p.netFlow, p.trackedHours, p.estimatedHours, p.avgCycleHours, p.overdue]),
      );
    }
    if (rawTab === 'users') {
      if (!isPrivilegedForCsv) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      const d = await buildUsersReport(scope);
      return csvResponse(
        `users-report-${stampForCsv}.csv`,
        ['Χρήστης', 'Email', 'Ολοκλ. περιόδου', 'Δ%', 'Ώρες tracked', 'Μ.ό. cycle (h)', 'Εντός προθεσμίας %', 'Ενεργός φόρτος', 'Εκπρόθεσμα', 'Tickets'],
        d.rows.map((u) => [u.name, u.email, u.completedInPeriod, u.completedDelta, u.trackedHours, u.avgCycleHours, u.onTimePct, u.activeLoad, u.overdue, u.ticketsResolved]),
      );
    }
    // rawTab === 'overview' (και οτιδήποτε άλλο) — default CSV
    const d = await buildOverviewReport(scope);
    return csvResponse(
      `overview-report-${stampForCsv}.csv`,
      ['Ημέρα', 'Ολοκληρώσεις tasks', 'Εισερχόμενα tickets', 'Επιλυμένα tickets'],
      d.taskCompletionsByDay.map((row, i) => [row.day, row.value, d.ticketFlowByDay[i]?.a ?? 0, d.ticketFlowByDay[i]?.b ?? 0]),
    );
  }

  // Fallthrough: παλιό xlsx/docx path — μόνο με ρητό format=xlsx|docx.
  const url = new URL(req.url);
  const format = url.searchParams.get('format');
  const tab = parseTab(url.searchParams.get('tab'));

  if (tab === 'users' && !isPrivilegedForCsv) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (format !== 'xlsx' && format !== 'docx') {
    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  }

  const isPrivileged = session.user.role === 'admin' || session.user.role === 'manager';
  const data = await buildReportsData({ userId: session.user.id, isPrivileged });

  const stamp = todayStamp();
  const filename = `a-sisyphus-${tab}-${stamp}.${format}`;

  if (format === 'xlsx') {
    const buf = await buildXlsx(tab, data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const buf = await buildDocx(tab, data);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
