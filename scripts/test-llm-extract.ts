/**
 * Standalone end-to-end test of the meeting-intelligence pipeline.
 *
 * Bypasses Next.js, Auth, and Prisma — reads a VTT file from disk, runs it
 * through pseudonymize → DeepSeek → de-pseudonymize, prints insights JSON.
 *
 * Run:
 *   npx ts-node --transpile-only scripts/test-llm-extract.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Minimal .env loader so we don't add the dotenv dependency just for a script.
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf-8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnv();

import { parseVtt } from '../lib/microsoft-graph';
import { extractMeetingInsights } from '../lib/llm';

async function main() {
  const vttPath = join(process.cwd(), 'test/fixtures/real-kolleris-meeting.vtt');
  const vtt = readFileSync(vttPath, 'utf-8');

  const segments = parseVtt(vtt);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('TRANSCRIPT PARSING');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Segments parsed: ${segments.length}`);
  console.log(`Speakers:        ${[...new Set(segments.map((s) => s.speaker))].join(', ')}`);
  if (segments.length > 0) {
    console.log(`Duration:        ${Math.round(segments[segments.length - 1].endSec)}s`);
    console.log(`First segment:   [${segments[0].speaker}] "${segments[0].text.slice(0, 80)}…"`);
  }
  console.log('');

  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('❌ DEEPSEEK_API_KEY missing in .env / .env.local');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('CALLING DEEPSEEK API');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Provider: ${process.env.LLM_PROVIDER || 'deepseek (default)'}`);
  console.log(`Model:    ${process.env.DEEPSEEK_MODEL || 'deepseek-chat (default)'}`);
  console.log('');

  const result = await extractMeetingInsights({
    transcriptSegments: segments,
    projectContext: {
      projectName: 'Milwaukee Data Integration',
      projectDescription:
        'Συγχρονισμός δεδομένων προϊόντων Milwaukee από τον προμηθευτή Παπαθεοδοσίου προς το e-Shop του Κολλέρη. Κύρια προβλήματα: ελλιπής κατηγοριοποίηση, λάθος ονόματα προϊόντων, λείπουν χαρακτηριστικά, νεκρά image links.',
      members: [
        { email: 'gkozyris@i4ria.com', name: 'Giannis Koziris' },
        { email: 'dimitris@kolleris.gr', name: 'Δημήτρης' },
        { email: 'chronis@kolleris.gr', name: 'Χρόνης' },
        { email: 'kolleris@kolleris.gr', name: 'Kolleris Communications' },
        { email: 'admin@kolleris.gr', name: 'administrators' },
      ],
      openTaskTitles: [],
    },
    meetingEndDate: new Date('2026-05-11T12:00:00Z'),
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('LLM META');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Provider:       ${result.insights.meta.provider}`);
  console.log(`Model:          ${result.insights.meta.model}`);
  console.log(`Input tokens:   ${result.insights.meta.inputTokens}`);
  console.log(`Output tokens:  ${result.insights.meta.outputTokens}`);
  console.log(`Duration:       ${result.insights.meta.durationMs}ms`);
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PSEUDONYMIZED TRANSCRIPT (what the LLM actually saw)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(result.pseudonymizedPreview.slice(0, 600) + '…');
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('INSIGHTS (de-pseudonymized — real names restored)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(JSON.stringify(result.insights, null, 2));
}

main().catch((err) => {
  console.error('\n❌ Pipeline error:');
  console.error(err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
