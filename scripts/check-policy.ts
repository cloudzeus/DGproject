/**
 * Quick check whether the Teams Application Access Policy has propagated for
 * a given organizer. Run with:
 *   npx tsx scripts/check-policy.ts
 *
 * Loads .env from the project root, then attempts to fetch one transcript's
 * meeting metadata. If the policy is active, prints the meeting subject.
 * If not yet propagated, prints the Graph error verbatim.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = join(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const rawLine of readFileSync(p, 'utf-8').split('\n')) {
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

const ORG = process.argv[2] || 'gkozyris@dgsmart.gr';

async function main() {
  const { listAllTranscripts, getOnlineMeetingById } = await import('../lib/microsoft-graph');

  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  console.log(`Checking policy propagation for ${ORG}…\n`);

  const transcripts = await listAllTranscripts(ORG, start, end);
  if (!transcripts.length) {
    console.log('No transcripts found in the last 30 days — try a different organizer.');
    return;
  }

  console.log(`Found ${transcripts.length} transcript(s). Testing meta access…\n`);

  try {
    const meta = await getOnlineMeetingById(ORG, transcripts[0].meetingId);
    console.log('✅ POLICY ACTIVE');
    console.log(`   subject: ${meta.subject ?? '(no subject)'}`);
    console.log(`   started: ${meta.startDateTime ?? 'unknown'}`);
    console.log('\nYou can now process meetings from /teams-meetings.');
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('No application access policy')) {
      console.log('⏳ Still propagating — Graph says no policy yet for this user.');
      console.log('   Try again in 10-20 minutes.');
    } else {
      console.log('❌ Different error:');
      console.log(`   ${msg.slice(0, 200)}`);
    }
  }
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
