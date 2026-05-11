import type { TranscriptSegment } from './types';

/**
 * Pseudonymization layer — strips personally-identifying tokens from a transcript
 * before it leaves our infrastructure. The mapping is kept in memory only and is
 * used to restore the real values in the LLM's response.
 *
 * NOTE: This is *pseudonymization* per GDPR Art. 4(5), not full anonymization.
 * The transcript still contains business context that may indirectly identify
 * people. Use alongside an EU-region LLM provider for best compliance posture.
 */

export type PseudonymMapping = {
  /** SPEAKER_A → "Γιάννης Κοζύρης" */
  speakers: Map<string, string>;
  /** email_1@example.com → "gkozyris@i4ria.com" */
  emails: Map<string, string>;
  /** phone_1 → "+30 210 1234567" */
  phones: Map<string, string>;
  /** afm_1 → "094123456" */
  afms: Map<string, string>;
};

export type PseudonymizedOutput = {
  text: string;
  segments: TranscriptSegment[];
  mapping: PseudonymMapping;
};

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3}[\s-]?\d{3,4}(?:[\s-]?\d{2,4})?/g;
const AFM_RE = /\b\d{9}\b/g; // Greek tax ID, 9 digits

function getOrAssign(
  map: Map<string, string>,
  realValue: string,
  prefix: string,
): string {
  for (const [placeholder, real] of map.entries()) {
    if (real === realValue) return placeholder;
  }
  const placeholder = `${prefix}_${map.size + 1}`;
  map.set(placeholder, realValue);
  return placeholder;
}

function maskScalars(input: string, mapping: PseudonymMapping): string {
  let out = input.replace(EMAIL_RE, (match) => {
    const placeholder = getOrAssign(mapping.emails, match, 'email');
    return `${placeholder}@example.com`;
  });

  // AFM must run before generic phone match (both digit sequences).
  out = out.replace(AFM_RE, (match) => getOrAssign(mapping.afms, match, 'afm'));

  out = out.replace(PHONE_RE, (match) => {
    // Avoid masking very short numerics (line numbers, etc.)
    const digits = match.replace(/\D/g, '');
    if (digits.length < 7) return match;
    return getOrAssign(mapping.phones, match, 'phone');
  });

  return out;
}

export type KnownPerson = { name: string; email: string };

/** Pseudonym tokens for a single known person (project member). */
export type MemberPseudonym = {
  speaker: string;        // e.g. "SPEAKER_A"  — the label the LLM will see for this person
  emailToken: string;     // e.g. "email_1@example.com" — what to use in the prompt as their email
  realName: string;
  realEmail: string;
};

/**
 * Build a SPEAKER_* mapping from VTT segments and replace speaker names everywhere.
 *
 * If `knownPersons` is supplied (project members), each is pre-assigned a deterministic
 * SPEAKER_* + email_*@example.com pair, BEFORE the transcript is scanned. Then any
 * transcript segment whose speaker name fuzzy-matches a known person reuses that
 * pre-assigned label. Unknown speakers in the transcript get auto-assigned labels
 * starting after the known persons.
 *
 * This way the LLM never sees a real name or email — neither in the transcript nor
 * in the project member list embedded in the prompt.
 */
export function pseudonymize(
  segments: TranscriptSegment[],
  knownPersons: KnownPerson[] = [],
): PseudonymizedOutput & { members: MemberPseudonym[] } {
  const mapping: PseudonymMapping = {
    speakers: new Map(),
    emails: new Map(),
    phones: new Map(),
    afms: new Map(),
  };

  // 1. Pre-seed pseudonyms for project members (in deterministic order).
  const members: MemberPseudonym[] = knownPersons.map((p, idx) => {
    const speaker = `SPEAKER_${speakerLetter(idx)}`;
    const emailKey = `email_${idx + 1}`;
    mapping.speakers.set(speaker, p.name);
    mapping.emails.set(emailKey, p.email);
    return {
      speaker,
      emailToken: `${emailKey}@example.com`,
      realName: p.name,
      realEmail: p.email,
    };
  });

  // 2. Walk the transcript. Speakers that fuzzy-match a known person reuse that
  //    member's label; new speakers get the next available SPEAKER_* letter.
  let nextIdx = knownPersons.length;
  const masked: TranscriptSegment[] = segments.map((seg) => {
    let pseudoSpeaker = findExistingPseudonym(mapping.speakers, seg.speaker);
    if (!pseudoSpeaker) {
      pseudoSpeaker = `SPEAKER_${speakerLetter(nextIdx)}`;
      nextIdx += 1;
      mapping.speakers.set(pseudoSpeaker, seg.speaker);
    }
    return {
      ...seg,
      speaker: pseudoSpeaker,
      text: maskScalars(seg.text, mapping),
    };
  });

  const text = masked
    .map((s) => `[${formatTime(s.startSec)}] ${s.speaker}: ${s.text}`)
    .join('\n');

  return { text, segments: masked, mapping, members };
}

function speakerLetter(idx: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (idx < 26) return letters[idx];
  return `${letters[Math.floor(idx / 26) - 1]}${letters[idx % 26]}`;
}

/**
 * Match a real speaker name to an existing pseudonym entry. Tries exact (case-insensitive,
 * accent-insensitive) match first, then substring containment. Returns null if no match.
 */
function findExistingPseudonym(
  speakerMap: Map<string, string>,
  realName: string,
): string | null {
  const target = normalizeName(realName);
  // Exact match
  for (const [pseudo, real] of speakerMap.entries()) {
    if (normalizeName(real) === target) return pseudo;
  }
  // Substring match (e.g. transcript says "Giannis Koziris", member is "Γιάννης Κοζύρης")
  for (const [pseudo, real] of speakerMap.entries()) {
    const r = normalizeName(real);
    if (r.includes(target) || target.includes(r)) return pseudo;
  }
  return null;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Walk a JSON value recursively and replace any pseudonym placeholders with
 * their real values. Used on the LLM response.
 */
export function depseudonymize<T>(value: T, mapping: PseudonymMapping): T {
  if (value == null) return value;

  if (typeof value === 'string') {
    return restoreString(value, mapping) as T;
  }

  if (Array.isArray(value)) {
    return value.map((v) => depseudonymize(v, mapping)) as T;
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = depseudonymize(v, mapping);
    }
    return out as T;
  }

  return value;
}

function restoreString(s: string, mapping: PseudonymMapping): string {
  let out = s;

  // Speakers — replace SPEAKER_A with real name. Match longest first to avoid
  // SPEAKER_A matching inside SPEAKER_AB.
  const speakers = Array.from(mapping.speakers.entries()).sort(
    ([a], [b]) => b.length - a.length,
  );
  for (const [placeholder, real] of speakers) {
    out = out.split(placeholder).join(real);
  }

  // Emails — placeholder appears as "email_1@example.com" in the text we sent.
  // The model may write it back the same way or just "email_1".
  for (const [placeholder, real] of mapping.emails.entries()) {
    out = out.split(`${placeholder}@example.com`).join(real);
    out = out.split(placeholder).join(real);
  }

  for (const [placeholder, real] of mapping.phones.entries()) {
    out = out.split(placeholder).join(real);
  }
  for (const [placeholder, real] of mapping.afms.entries()) {
    out = out.split(placeholder).join(real);
  }

  return out;
}

/**
 * Resolve speaker pseudonyms against the project member list using fuzzy
 * matching on display name. Returns a map: SPEAKER_A → email, when matched.
 *
 * The LLM is asked to use SPEAKER_* labels when assigning action items; this
 * function converts those labels to real emails before returning to the caller.
 */
export function resolveSpeakersToEmails(
  mapping: PseudonymMapping,
  members: Array<{ email: string; name: string }>,
): Map<string, string> {
  const out = new Map<string, string>();

  for (const [pseudoSpeaker, realName] of mapping.speakers.entries()) {
    const norm = normalizeName(realName);
    const matched = members.find((m) => {
      const nm = normalizeName(m.name);
      return nm === norm || nm.includes(norm) || norm.includes(nm);
    });
    if (matched) out.set(pseudoSpeaker, matched.email);
  }

  return out;
}
