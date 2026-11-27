/**
 * Optional live smoke test for the AI project report. It reads one real project,
 * generates the report without sending email, and prints only aggregate results.
 *
 * TS_NODE_TRANSPILE_ONLY=1 \
 * TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","verbatimModuleSyntax":false}' \
 * npx ts-node -r tsconfig-paths/register scripts/test-project-report-ai.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../lib/prisma';
import { loadProjectForReport, buildProjectReportHtml } from '../lib/project-report';
import { buildProjectReportAnalytics } from '../lib/project-report-analytics';
import { generateProjectReportNarrative } from '../lib/project-report-ai';

for (const filename of ['.env.local', '.env']) {
  const path = join(process.cwd(), filename);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

async function main() {
  const reference = await prisma.project.findFirst({
    where: { tasks: { some: { mergedIntoId: null } } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, projectCode: true },
  });
  if (!reference) {
    console.log('Δεν υπάρχει έργο για live smoke test.');
    return;
  }
  const project = await loadProjectForReport(reference.id);
  assert.ok(project);
  const analytics = buildProjectReportAnalytics(project);
  const generated = await generateProjectReportNarrative(project, analytics);
  const html = buildProjectReportHtml({
    project,
    analytics,
    narrative: generated.narrative,
    aiGenerated: generated.aiGenerated,
  });

  assert.ok(html.includes('Η συνεισφορά της DGSmart'));
  assert.ok(html.includes('Η δουλειά της ομάδας, ανά χρήστη'));
  assert.ok(html.includes('Τι άνοιξε και τι έκλεισε κάθε μήνα'));
  console.log(JSON.stringify({
    projectCode: reference.projectCode,
    tasks: analytics.totalTasks,
    completed: analytics.completedTasks,
    customerOpened: analytics.customer.openedTasks,
    aiGenerated: generated.aiGenerated,
    provider: generated.provider,
    model: generated.model,
    htmlCharacters: html.length,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
