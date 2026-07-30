# Companies & Contacts (Φάση Α) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Να προστίθεται εταιρία με ΑΦΜ (στοιχεία από την υπηρεσία ΑΑΔΕ `vat.wwa.gr/afm2info`), να εισάγονται μαζικά όλοι οι πελάτες από το SoftOne, να διαχειρίζονται με τις επαφές τους από admin σελίδα, και να συσχετίζονται με χρήστες και έργα.

**Architecture:** Νέα models `Company`, `CompanyActivity`, `Contact`, `ProjectCompany`, με το σχήμα του `Trdr`/`Contact` της εφαρμογής **damask** (`cloudzeus/damask`, `prisma/schema.prisma:269-376`). Τα πεδία που προέρχονται από SoftOne κρατούν τα ονόματα του SoftOne αυτούσια (`TRDR`, `NAME`, `AFM`, `ADDRESS`, `ZIP`, `CITY`, `PHONE01`, `ISACTIVE`) — το sync γίνεται απευθείας αντιγραφή χωρίς μεταφραστικό στρώμα. Τα app-only και ΑΑΔΕ πεδία μένουν camelCase. Το `TRDR` είναι το unique κλειδί· **το `AFM` ΔΕΝ είναι unique** γιατί το SoftOne κρατά νόμιμα πολλαπλές γραμμές ανά ΑΦΜ.

**Tech Stack:** Next.js App Router (server components + server actions), Prisma/MySQL (**shadow DB ΣΠΑΣΜΕΝΟ** → `prisma migrate dev --create-only` + `prisma migrate deploy`), υπηρεσία ΑΑΔΕ `POST https://vat.wwa.gr/afm2info` (χωρίς credentials), SoftOne μέσω `lib/softone.ts` (`s1()`), tests με `node:test` μέσω `npx tsx --test`, Fluent/DG design tokens.

**Προαπαιτούμενο:** Τα SoftOne credentials στο τοπικό `.env` είναι ξεπερασμένα (`Login fails due to invalid login credentials`). Χρειάζονται μόνο για το **Task 6** (μαζική εισαγωγή). Όλα τα υπόλοιπα tasks τρέχουν χωρίς SoftOne — η ΑΑΔΕ δεν θέλει credentials.

---

## File Structure

**Create**
| Αρχείο | Ευθύνη |
|---|---|
| `lib/companies/afm.ts` | Κανονικοποίηση + έλεγχος ΑΦΜ. Καθαρές συναρτήσεις, καμία I/O. |
| `lib/companies/__tests__/afm.test.ts` | Tests του παραπάνω. |
| `lib/companies/aade-map.ts` | Καθαρός mapper ΑΑΔΕ → Company patch + nil coercion. Καμία I/O. |
| `lib/companies/__tests__/aade-map.test.ts` | Tests του mapper με fixtures της πραγματικής απόκρισης. |
| `lib/companies/aade.ts` | Network client προς `vat.wwa.gr/afm2info`. |
| `lib/companies/softone-import.ts` | Μαζική εισαγωγή πελατών από `TRDR`. |
| `scripts/import-companies-from-softone.ts` | CLI wrapper της μαζικής εισαγωγής. |
| `app/(app)/admin/companies/page.tsx` | Λίστα + αναζήτηση. |
| `app/(app)/admin/companies/companies-client.tsx` | Client UI λίστας + φόρμα δημιουργίας. |
| `app/(app)/admin/companies/actions.ts` | Server actions. |
| `app/(app)/admin/companies/[id]/page.tsx` | Καρτέλα εταιρίας. |
| `app/(app)/admin/companies/[id]/company-detail-client.tsx` | Client UI καρτέλας + επαφές. |

**Modify**
| Αρχείο | Αλλαγή |
|---|---|
| `prisma/schema.prisma` | Νέα models, `User.companyId`, `Project.primaryCompanyId`. |
| `lib/softone-contacts.ts:406-440` | `PRJC.TRDR` από `primaryCompany.TRDR`. |
| `app/(app)/admin/users/page.tsx` + `actions.ts` | Σχέση εταιρίας. |
| `components/admin/user-management.tsx` | Picker τοπικής εταιρίας για customers. |
| `components/layout/sidebar.tsx` | Link «Εταιρίες». |
| `app/(app)/projects/project-form.tsx` | Πεδίο πελάτη. |

---

### Task 1: Έλεγχος ΑΦΜ

**Files:**
- Create: `lib/companies/afm.ts`
- Test: `lib/companies/__tests__/afm.test.ts`

- [ ] **Step 1: Γράψε το failing test**

```ts
// lib/companies/__tests__/afm.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAfm, isValidAfm, hasValidChecksum } from '../afm'

test('normalizeAfm κρατά μόνο ψηφία', () => {
  assert.equal(normalizeAfm(' 094019245 '), '094019245')
  assert.equal(normalizeAfm('EL094019245'), '094019245')
  assert.equal(normalizeAfm('el-094-019-245'), '094019245')
})

test('isValidAfm ελέγχει μόνο μορφή 9 ψηφίων', () => {
  assert.equal(isValidAfm('094019245'), true)
  assert.equal(isValidAfm('123456789'), true) // λάθος checksum αλλά σωστή μορφή
  assert.equal(isValidAfm('12345678'), false)
  assert.equal(isValidAfm('1234567890'), false)
  assert.equal(isValidAfm('09401924A'), false)
  assert.equal(isValidAfm(''), false)
})

test('hasValidChecksum εφαρμόζει τον αλγόριθμο ΓΓΠΣ', () => {
  assert.equal(hasValidChecksum('094019245'), true)
  assert.equal(hasValidChecksum('094014201'), true)
  assert.equal(hasValidChecksum('123456789'), false)
  assert.equal(hasValidChecksum('000000000'), false)
})

test('hasValidChecksum απορρίπτει λάθος μορφή χωρίς να σκάει', () => {
  assert.equal(hasValidChecksum('abc'), false)
  assert.equal(hasValidChecksum(''), false)
})
```

- [ ] **Step 2: Τρέξε το test για να δεις ότι αποτυγχάνει**

Run: `npx tsx --test lib/companies/__tests__/afm.test.ts`
Expected: FAIL — `Cannot find module '../afm'`

- [ ] **Step 3: Υλοποίησε**

Σημείωση σχεδιασμού: το checksum είναι **προειδοποίηση, όχι φραγμός**. Το damask ελέγχει μόνο τη μορφή· κρατάμε τον έλεγχο ψηφίου ελέγχου για να πιάνουμε τυπογραφικά, αλλά δεν μπλοκάρουμε την καταχώριση — η υπηρεσία ΑΑΔΕ είναι η τελική αυθεντία για το αν υπάρχει το ΑΦΜ.

```ts
// lib/companies/afm.ts

/** Κρατά μόνο ψηφία — ανέχεται prefix χώρας ("EL094019245" → "094019245"). */
export function normalizeAfm(input: string): string {
  return String(input ?? '').replace(/\D+/g, '')
}

/** Έλεγχος μορφής: ακριβώς 9 ψηφία μετά την κανονικοποίηση. */
export function isValidAfm(input: string): boolean {
  return /^\d{9}$/.test(normalizeAfm(input))
}

/**
 * Ψηφίο ελέγχου ΓΓΠΣ: τα 8 πρώτα ψηφία σταθμίζονται με 2^8…2^1,
 * το άθροισμα mod 11 mod 10 ισούται με το 9ο ψηφίο.
 *
 * Χρησιμοποιείται ως ΠΡΟΕΙΔΟΠΟΙΗΣΗ στο UI, όχι ως φραγμός.
 */
export function hasValidChecksum(input: string): boolean {
  const afm = normalizeAfm(input)
  if (!/^\d{9}$/.test(afm)) return false
  if (afm === '000000000') return false

  let sum = 0
  for (let i = 0; i < 8; i++) sum += Number(afm[i]) * 2 ** (8 - i)
  return (sum % 11) % 10 === Number(afm[8])
}
```

- [ ] **Step 4: Τρέξε τα tests**

Run: `npx tsx --test lib/companies/__tests__/afm.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add lib/companies/afm.ts lib/companies/__tests__/afm.test.ts
git commit -m "feat(companies): add Greek AFM normalization and validation"
```

---

### Task 2: Mapper ΑΑΔΕ (καθαρός, με nil coercion)

Το κρίσιμο κομμάτι. Η ζωντανή απόκριση επιστρέφει κενές τιμές ως XML nil markers
(`{"$":{"xsi:nil":"true"}}`), **όχι** ως JSON null — επιβεβαιωμένο με ΑΦΜ `094019245`.

**Files:**
- Create: `lib/companies/aade-map.ts`
- Test: `lib/companies/__tests__/aade-map.test.ts`

- [ ] **Step 1: Γράψε το failing test**

```ts
// lib/companies/__tests__/aade-map.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { s, mapAadeResponse } from '../aade-map'

test('s() κανονικοποιεί nil markers σε null', () => {
  assert.equal(s({ $: { 'xsi:nil': 'true' } }), null)
  assert.equal(s({ '@_xsi:nil': 'true' }), null)
  assert.equal(s({ _: '  τιμή  ' }), 'τιμή')
  assert.equal(s('  κείμενο '), 'κείμενο')
  assert.equal(s('   '), null)
  assert.equal(s(null), null)
  assert.equal(s(undefined), null)
  assert.equal(s(42), '42')
})

// Πραγματικό σχήμα απόκρισης για ΑΦΜ 094019245 (ΟΤΕ ΑΕ)
const RAW = {
  basic_rec: {
    afm: '094019245',
    onomasia: 'ΟΡΓΑΝΙΣΜΟΣ ΤΗΛΕΠΙΚΟΙΝΩΝΙΩΝ ΤΗΣ ΕΛΛΑΔΟΣ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ',
    commer_title: { $: { 'xsi:nil': 'true' } },
    doy: '1190',
    doy_descr: 'ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ',
    legal_status_descr: 'ΑΕ',
    postal_address: 'ΛΕΩΦΟΡΟΣ ΚΗΦΙΣΙΑΣ',
    postal_address_no: '99',
    postal_zip_code: '15124',
    postal_area_description: 'ΜΑΡΟΥΣΙ',
    regist_date: '1949-11-26',
    deactivation_flag: '1',
    deactivation_flag_descr: 'ΕΝΕΡΓΟΣ ΑΦΜ',
    firm_flag_descr: 'ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ',
    stop_date: { $: { 'xsi:nil': 'true' } },
  },
  firm_act_tab: {
    item: [
      { firm_act_code: '61900000', firm_act_descr: 'ΑΛΛΕΣ ΥΠΗΡΕΣΙΕΣ ΤΗΛΕΠΙΚΟΙΝΩΝΙΩΝ', firm_act_kind: '1' },
      { firm_act_code: '62010000', firm_act_descr: 'ΠΡΟΓΡΑΜΜΑΤΙΣΜΟΣ', firm_act_kind: '2' },
    ],
  },
}

test('mapAadeResponse αντιστοιχεί τα πεδία', () => {
  const r = mapAadeResponse(RAW)!
  assert.equal(r.company.NAME, 'ΟΡΓΑΝΙΣΜΟΣ ΤΗΛΕΠΙΚΟΙΝΩΝΙΩΝ ΤΗΣ ΕΛΛΑΔΟΣ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ')
  assert.equal(r.company.ADDRESS, 'ΛΕΩΦΟΡΟΣ ΚΗΦΙΣΙΑΣ 99')
  assert.equal(r.company.ZIP, '15124')
  assert.equal(r.company.CITY, 'ΜΑΡΟΥΣΙ')
  assert.equal(r.company.IRSDATA, '1190')
  assert.equal(r.company.appLegalForm, 'ΑΕ')
  assert.equal(r.company.aadeStatus, 'ΕΝΕΡΓΟΣ ΑΦΜ')
  assert.equal(r.company.aadeFirmKind, 'ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ')
  assert.equal(r.company.foundingDate?.toISOString().slice(0, 10), '1949-11-26')
  assert.equal(r.company.JOBTYPETRD, 'ΑΛΛΕΣ ΥΠΗΡΕΣΙΕΣ ΤΗΛΕΠΙΚΟΙΝΩΝΙΩΝ')
  assert.equal(r.isActive, true)
  assert.equal(r.doyDescr, 'ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ')
})

test('mapAadeResponse κανονικοποιεί τις δραστηριότητες', () => {
  const r = mapAadeResponse(RAW)!
  assert.equal(r.activities.length, 2)
  assert.equal(r.activities[0].kind, 'PRIMARY')
  assert.equal(r.activities[0].code, '61900000')
  assert.equal(r.activities[1].kind, 'SECONDARY')
})

test('firm_act_tab.item δέχεται μονό object ή απουσία', () => {
  const single = mapAadeResponse({
    basic_rec: { afm: '094019245', onomasia: 'Χ' },
    firm_act_tab: { item: { firm_act_code: '1', firm_act_descr: 'Α', firm_act_kind: '1' } },
  })!
  assert.equal(single.activities.length, 1)

  const none = mapAadeResponse({ basic_rec: { afm: '094019245', onomasia: 'Χ' } })!
  assert.equal(none.activities.length, 0)
})

test('mapAadeResponse επιστρέφει null όταν λείπει το basic_rec/afm', () => {
  assert.equal(mapAadeResponse({}), null)
  assert.equal(mapAadeResponse({ basic_rec: {} }), null)
})

test('ανενεργό ΑΦΜ όταν υπάρχει stop_date', () => {
  const r = mapAadeResponse({
    basic_rec: { afm: '094019245', onomasia: 'Χ', deactivation_flag: '1', stop_date: '2020-01-01' },
  })!
  assert.equal(r.isActive, false)
})
```

- [ ] **Step 2: Τρέξε το test για να δεις ότι αποτυγχάνει**

Run: `npx tsx --test lib/companies/__tests__/aade-map.test.ts`
Expected: FAIL — `Cannot find module '../aade-map'`

- [ ] **Step 3: Υλοποίησε**

```ts
// lib/companies/aade-map.ts
/**
 * Καθαρός mapper ΑΑΔΕ (vat.wwa.gr/afm2info) → Company patch.
 * ΚΑΜΙΑ εξάρτηση σε fetch/prisma/ρολόι — δοκιμάζεται απομονωμένα.
 * Ported από cloudzeus/damask src/lib/trdr/aade-map.ts.
 */

/**
 * Coercer για nil markers: κάποιες XML→JSON μετατροπές αναπαριστούν την
 * απούσα τιμή ως αντικείμενο αντί για JSON null.
 *   - { $: { 'xsi:nil': 'true' } }   (SOAP→JSON — ΕΠΙΒΕΒΑΙΩΜΕΝΟ στη ζωντανή απόκριση)
 *   - { '@_xsi:nil': 'true' }        (xml2js attribute-prefix)
 *   - { _: 'πραγματική τιμή' }       (SOAP→JSON text node)
 */
export function s(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (o['@_xsi:nil'] === 'true') return null
    const dollar = o.$ as Record<string, unknown> | undefined
    if (dollar && (dollar['xsi:nil'] === 'true' || dollar.nil === 'true')) return null
    if (typeof o._ === 'string') return o._.trim() || null
  }
  return null
}

export type AadeFirmActRaw = {
  firm_act_code?: unknown
  firm_act_descr?: unknown
  firm_act_kind?: unknown
}

export type AadeRawResponse = {
  basic_rec?: Record<string, unknown>
  firm_act_tab?: { item?: AadeFirmActRaw | AadeFirmActRaw[] }
}

export type CompanyActivityDraft = {
  code: string | null
  description: string | null
  kind: 'PRIMARY' | 'SECONDARY'
  order: number
}

/** Τα πεδία της Company που γεμίζει η ΑΑΔΕ. */
export type AadeCompanyPatch = {
  NAME: string
  ADDRESS: string | null
  ZIP: string | null
  CITY: string | null
  /** κωδ. ΔΟΥ (basic_rec.doy) */
  IRSDATA: string | null
  /** περιγραφή κύριας δραστηριότητας */
  JOBTYPETRD: string | null
  appLegalForm: string | null
  foundingDate: Date | null
  aadeStatus: string | null
  aadeFirmKind: string | null
}

export type AadeMapped = {
  company: AadeCompanyPatch
  activities: CompanyActivityDraft[]
  /** Ονομασία ΔΟΥ — για εμφάνιση, δεν αποθηκεύεται ως πεδίο. */
  doyDescr: string | null
  /** deactivation_flag === '1' ΚΑΙ χωρίς stop_date. */
  isActive: boolean
}

function toDate(v: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Μετατρέπει την ακατέργαστη απόκριση σε Company patch + δραστηριότητες.
 * `null` όταν λείπει το basic_rec/afm — δηλαδή το ΑΦΜ δεν βρέθηκε στο μητρώο.
 */
export function mapAadeResponse(raw: AadeRawResponse): AadeMapped | null {
  const b = raw?.basic_rec
  if (!b || !s(b.afm)) return null

  const item = raw?.firm_act_tab?.item
  const items: AadeFirmActRaw[] = item == null ? [] : Array.isArray(item) ? item : [item]

  const activities: CompanyActivityDraft[] = items.map((a, i) => ({
    code: s(a?.firm_act_code),
    description: s(a?.firm_act_descr),
    // firm_act_kind: '1' κύρια, οτιδήποτε άλλο δευτερεύουσα.
    kind: s(a?.firm_act_kind) === '1' ? 'PRIMARY' : 'SECONDARY',
    order: i,
  }))

  const primary = activities.find((a) => a.kind === 'PRIMARY') ?? activities[0]
  const addressParts = [s(b.postal_address), s(b.postal_address_no)].filter(Boolean)

  return {
    company: {
      NAME: s(b.onomasia) ?? '',
      ADDRESS: addressParts.join(' ') || null,
      ZIP: s(b.postal_zip_code),
      CITY: s(b.postal_area_description),
      IRSDATA: s(b.doy),
      JOBTYPETRD: primary?.description ?? null,
      appLegalForm: s(b.legal_status_descr),
      foundingDate: toDate(s(b.regist_date)),
      aadeStatus: s(b.deactivation_flag_descr),
      aadeFirmKind: s(b.firm_flag_descr),
    },
    activities,
    doyDescr: s(b.doy_descr),
    isActive: s(b.deactivation_flag) === '1' && !s(b.stop_date),
  }
}
```

- [ ] **Step 4: Τρέξε τα tests**

Run: `npx tsx --test lib/companies/__tests__/aade-map.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add lib/companies/aade-map.ts lib/companies/__tests__/aade-map.test.ts
git commit -m "feat(companies): add pure AADE response mapper with nil-marker coercion"
```

---

### Task 3: Network client ΑΑΔΕ

**Files:**
- Create: `lib/companies/aade.ts`

- [ ] **Step 1: Γράψε τον client**

```ts
// lib/companies/aade.ts
/**
 * Αναζήτηση στοιχείων επιχείρησης από ΑΦΜ μέσω της δικής μας υπηρεσίας
 * vat.wwa.gr/afm2info (ΟΧΙ το δημόσιο GSIS SOAP, ΟΧΙ credentials).
 *
 * POST https://vat.wwa.gr/afm2info  body: { afm: "094019245" }
 */
import { normalizeAfm, isValidAfm } from './afm'
import { mapAadeResponse, type AadeMapped, type AadeRawResponse } from './aade-map'

const AADE_ENDPOINT = 'https://vat.wwa.gr/afm2info'
const REQUEST_TIMEOUT_MS = 10_000

/** Σφάλμα επικοινωνίας — ΔΕΝ σημαίνει «δεν βρέθηκε» (αυτό είναι `null` return). */
export class AadeLookupError extends Error {}

/**
 * - `null` όταν το ΑΦΜ δεν βρέθηκε στο μητρώο (φυσιολογικό, όχι σφάλμα).
 * - `AadeLookupError` για μη έγκυρη μορφή, timeout, HTTP ή δικτυακό σφάλμα.
 */
export async function aadeLookup(afmInput: string): Promise<AadeMapped | null> {
  const afm = normalizeAfm(afmInput)
  if (!isValidAfm(afm)) {
    throw new AadeLookupError('Το ΑΦΜ πρέπει να έχει 9 ψηφία.')
  }

  let raw: AadeRawResponse
  try {
    const res = await fetch(AADE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ afm }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new AadeLookupError(`Η υπηρεσία ΑΑΔΕ επέστρεψε σφάλμα HTTP ${res.status}.`)
    }
    raw = (await res.json()) as AadeRawResponse
  } catch (err) {
    if (err instanceof AadeLookupError) throw err
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AadeLookupError('Η υπηρεσία ΑΑΔΕ δεν απάντησε έγκαιρα (10s). Δοκίμασε ξανά.')
    }
    throw new AadeLookupError('Αδυναμία σύνδεσης με την υπηρεσία ΑΑΔΕ. Δοκίμασε ξανά σε λίγο.')
  }

  return mapAadeResponse(raw)
}
```

- [ ] **Step 2: Επαλήθευσε ζωντανά**

Run:
```bash
npx tsx -e "
import('./lib/companies/aade.ts').then(async (m) => {
  const r = await m.aadeLookup('094019245')
  console.log(r?.company.NAME, '|', r?.company.CITY, '|', r?.isActive, '|', r?.activities.length, 'δραστηριότητες')
  console.log('άγνωστο ΑΦΜ →', await m.aadeLookup('999999999'))
})
"
```
Expected: τυπώνει την επωνυμία του ΟΤΕ, `ΜΑΡΟΥΣΙ`, `true`, και αριθμό δραστηριοτήτων. Το δεύτερο ΑΦΜ τυπώνει `null` χωρίς exception.

- [ ] **Step 3: Commit**

```bash
git add lib/companies/aade.ts
git commit -m "feat(companies): add AADE lookup client for vat.wwa.gr/afm2info"
```

---

### Task 4: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Πρόσθεσε enum και models**

Κοντά στα υπόλοιπα enums:

```prisma
enum ProjectCompanyRole {
  partner
  subcontractor
  consultant
  other
}
```

Μετά το `model User`:

```prisma
/// Πελάτης/εταιρία. Τα πεδία που προέρχονται από SoftOne κρατούν τα ονόματα του
/// SoftOne αυτούσια ώστε το sync να είναι απευθείας αντιγραφή.
/// Το TRDR είναι το unique κλειδί — το AFM ΔΕΝ είναι unique, γιατί το SoftOne
/// κρατά νόμιμα πολλαπλές γραμμές ανά ΑΦΜ (υποκαταστήματα, ιστορικές καρτέλες).
model Company {
  id String @id @default(cuid())

  /// null = η εταιρία υπάρχει μόνο εδώ, δεν έχει συγχρονιστεί με SoftOne.
  TRDR       Int?      @unique
  /// 13 = Πελάτης, 12 = Προμηθευτής
  SODTYPE    Int       @default(13)
  CODE       String?
  NAME       String
  AFM        String?
  /// κωδ. ΔΟΥ
  IRSDATA    String?
  /// επάγγελμα, free text
  JOBTYPETRD String?
  ADDRESS    String?
  ZIP        String?
  DISTRICT   String?
  CITY       String?
  COUNTRY    Int?
  PHONE01    String?
  PHONE02    String?
  FAX        String?
  EMAIL      String?
  WEBPAGE    String?
  ISACTIVE   Int       @default(1)
  REMARKS    String?   @db.Text
  /// τελευταία μεταβολή στο SoftOne
  UPDDATE    DateTime?
  syncedAt   DateTime?

  // ── ΑΑΔΕ (vat.wwa.gr/afm2info) ──
  foundingDate DateTime?
  aadeStatus   String?
  aadeFirmKind String?
  appLegalForm String?
  aadeSyncedAt DateTime?

  // ── app-only ──
  appNotes String? @db.Text

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  contacts        Contact[]
  users           User[]
  activities      CompanyActivity[]
  primaryProjects Project[]         @relation("ProjectPrimaryCompany")
  projectRoles    ProjectCompany[]

  @@index([AFM])
  @@index([NAME])
  @@index([SODTYPE, ISACTIVE])
}

/// Δραστηριότητες (ΚΑΔ) από την ΑΑΔΕ.
model CompanyActivity {
  id          String  @id @default(cuid())
  companyId   String
  code        String?
  description String?
  /// 'PRIMARY' | 'SECONDARY'
  kind        String
  order       Int     @default(0)

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
}

model Contact {
  id        String  @id @default(cuid())
  companyId String
  name      String
  position  String?
  email     String?
  phone     String?
  mobile    String?
  isPrimary Boolean @default(false)
  notes     String? @db.Text

  // Mirror του CUSPRSN/SUPPRSN για μελλοντικό sync επαφών.
  PRSN      Int?
  TRDBRANCH Int?
  LINENUM   Int?

  /// Προαιρετικός λογαριασμός portal. Null = η επαφή δεν συνδέεται.
  userId String? @unique

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user    User?   @relation("ContactUser", fields: [userId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([companyId])
  @@index([email])
}

/// Εταιρίες συσχετιζόμενες με έργο σε ρόλο ΕΚΤΟΣ πελάτη. Ο πελάτης είναι το
/// Project.primaryCompanyId — δεν διπλοεγγράφεται εδώ.
model ProjectCompany {
  id        String             @id @default(cuid())
  projectId String
  companyId String
  role      ProjectCompanyRole
  notes     String?

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([projectId, companyId])
  @@index([companyId])
}
```

Στο `model User` πρόσθεσε:

```prisma
  companyId String?
  company   Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)
  contact   Contact? @relation("ContactUser")
```

και στα indexes: `@@index([companyId])`

Στο `model Project` πρόσθεσε:

```prisma
  /// Ο πελάτης: πηγή του PRJC.TRDR και η μόνη εταιρία που βλέπει το έργο στο portal.
  primaryCompanyId String?
  primaryCompany   Company? @relation("ProjectPrimaryCompany", fields: [primaryCompanyId], references: [id], onDelete: SetNull)
  companies        ProjectCompany[]
```

και στα indexes: `@@index([primaryCompanyId])`

- [ ] **Step 2: Δημιούργησε και εφάρμοσε το migration**

Το shadow DB είναι σπασμένο — γι' αυτό `--create-only` και μετά `deploy`.

Run:
```bash
npx prisma migrate dev --create-only --name companies_contacts
npx prisma migrate deploy
npx prisma generate
```
Expected: νέος φάκελος `prisma/migrations/*_companies_contacts/` με `CREATE TABLE Company/CompanyActivity/Contact/ProjectCompany` και `ALTER TABLE User ADD companyId`, `ALTER TABLE Project ADD primaryCompanyId`. Το `deploy` τυπώνει «All migrations have been successfully applied».

- [ ] **Step 3: Επιβεβαίωσε**

Run: `npx tsc --noEmit`
Expected: καθαρό

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add Company, CompanyActivity, Contact and ProjectCompany models"
```

---

### Task 5: Μαζική εισαγωγή πελατών από SoftOne

**Files:**
- Create: `lib/companies/softone-import.ts`
- Create: `scripts/import-companies-from-softone.ts`

- [ ] **Step 1: Γράψε τον importer**

```ts
// lib/companies/softone-import.ts
/**
 * Μαζική εισαγωγή πελατών από το SoftOne στο Company model.
 *
 * Στρατηγική δύο σταδίων, όπως το damask src/lib/s1-sync.ts:
 *   1. GetTable (TABLE, FIELDS, FILTER) — απευθείας query, προτιμώμενο.
 *   2. Fallback getBrowserInfo → getBrowserData (paginated).
 *
 * Upsert με κλειδί το TRDR. Κανόνας ενημέρωσης (από damask partner-upsert):
 * ΠΟΤΕ δεν αντικαθιστούμε υπάρχουσα τιμή με κενή — εταιρία εμπλουτισμένη από
 * την ΑΑΔΕ δεν πρέπει να ισοπεδώνεται από αραιή γραμμή του ERP.
 */
import { s1 } from '@/lib/softone'
import { prisma } from '@/lib/prisma'
import { normalizeAfm } from './afm'

const FIELDS = [
  'TRDR', 'SODTYPE', 'CODE', 'NAME', 'AFM', 'IRSDATA', 'JOBTYPETRD',
  'ADDRESS', 'ZIP', 'DISTRICT', 'CITY', 'COUNTRY',
  'PHONE01', 'PHONE02', 'FAX', 'EMAIL', 'WEBPAGE',
  'ISACTIVE', 'REMARKS', 'UPDDATE',
] as const

export type ImportResult = {
  fetched: number
  created: number
  updated: number
  skipped: number
  strategy: 'GetTable' | 'getBrowserData'
}

function str(v: unknown): string | null {
  if (v == null) return null
  const t = String(v).trim()
  return t ? t : null
}

function int(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function date(v: unknown): Date | null {
  const t = str(v)
  if (!t) return null
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Κρατά μόνο τα κλειδιά με μη-κενή τιμή — για το «μην σβήνεις με κενό». */
function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v
  }
  return out as Partial<T>
}

async function fetchRows(): Promise<{ rows: Record<string, unknown>[]; strategy: ImportResult['strategy'] }> {
  // 1. GetTable
  const table = await s1('GetTable', {
    TABLE: 'TRDR',
    FIELDS: FIELDS.join(','),
    FILTER: 'SODTYPE=13',
  })
  if (table?.success && Array.isArray(table.rows) && table.rows.length) {
    return { rows: table.rows as Record<string, unknown>[], strategy: 'GetTable' }
  }

  // 2. getBrowserInfo → getBrowserData (paginated)
  const info = await s1('getBrowserInfo', { object: 'CUSTOMER', LIST: '001', FILTERS: 'CUSTOMER.ISACTIVE=1' })
  if (!info?.success || !info.reqID) {
    throw new Error(`SoftOne: ούτε GetTable ούτε getBrowserInfo επέστρεψαν δεδομένα (${info?.error ?? 'άγνωστο'})`)
  }

  const fields = (info.fields ?? []) as { name: string }[]
  const total = Number(info.totalcount ?? 0)
  const PAGE = 500
  const rows: Record<string, unknown>[] = []

  for (let start = 0; start < total; start += PAGE) {
    const page = await s1('getBrowserData', { reqID: info.reqID, START: start, LIMIT: PAGE })
    if (!page?.success) throw new Error(`SoftOne getBrowserData απέτυχε: ${page?.error ?? 'άγνωστο'}`)
    for (const raw of (page.rows ?? []) as unknown[]) {
      // Οι γραμμές είναι πίνακες θέσεων· τις μετατρέπουμε σε αντικείμενα με βάση το fields meta.
      if (Array.isArray(raw)) {
        const obj: Record<string, unknown> = {}
        fields.forEach((f, i) => { obj[f.name.split('.').pop() ?? f.name] = raw[i] })
        rows.push(obj)
      } else if (raw && typeof raw === 'object') {
        rows.push(raw as Record<string, unknown>)
      }
    }
  }
  return { rows, strategy: 'getBrowserData' }
}

export async function importCompaniesFromSoftOne(
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const { rows, strategy } = await fetchRows()
  const result: ImportResult = { fetched: rows.length, created: 0, updated: 0, skipped: 0, strategy }

  for (const [i, row] of rows.entries()) {
    const TRDR = int(row.TRDR)
    const NAME = str(row.NAME)
    if (!TRDR || !NAME) { result.skipped++; continue }

    const afmRaw = str(row.AFM)
    const AFM = afmRaw ? normalizeAfm(afmRaw) || null : null

    const mirror = {
      SODTYPE: int(row.SODTYPE) ?? 13,
      CODE: str(row.CODE),
      NAME,
      AFM,
      IRSDATA: str(row.IRSDATA),
      JOBTYPETRD: str(row.JOBTYPETRD),
      ADDRESS: str(row.ADDRESS),
      ZIP: str(row.ZIP),
      DISTRICT: str(row.DISTRICT),
      CITY: str(row.CITY),
      COUNTRY: int(row.COUNTRY),
      PHONE01: str(row.PHONE01),
      PHONE02: str(row.PHONE02),
      FAX: str(row.FAX),
      EMAIL: str(row.EMAIL),
      WEBPAGE: str(row.WEBPAGE),
      ISACTIVE: int(row.ISACTIVE) ?? 1,
      REMARKS: str(row.REMARKS),
      UPDDATE: date(row.UPDDATE),
    }

    const existing = await prisma.company.findUnique({ where: { TRDR }, select: { id: true } })
    if (existing) {
      // Ποτέ δεν σβήνουμε υπάρχουσα τιμή με κενή.
      await prisma.company.update({
        where: { TRDR },
        data: { ...definedOnly(mirror), NAME, syncedAt: new Date() },
      })
      result.updated++
    } else {
      await prisma.company.create({ data: { TRDR, ...mirror, syncedAt: new Date() } })
      result.created++
    }

    onProgress?.(i + 1, rows.length)
  }

  return result
}
```

- [ ] **Step 2: Γράψε το CLI wrapper**

```ts
// scripts/import-companies-from-softone.ts
// Τρέξε: npx tsx --env-file=.env scripts/import-companies-from-softone.ts
import { importCompaniesFromSoftOne } from '@/lib/companies/softone-import'

async function main() {
  console.log('Ανάκτηση πελατών από SoftOne…')
  let last = 0
  const res = await importCompaniesFromSoftOne((done, total) => {
    const pct = Math.floor((done / total) * 100)
    if (pct >= last + 10) { last = pct; console.log(`  ${pct}% (${done}/${total})`) }
  })
  console.log('\nΟλοκληρώθηκε:')
  console.log(`  στρατηγική : ${res.strategy}`)
  console.log(`  ανακτήθηκαν: ${res.fetched}`)
  console.log(`  νέες       : ${res.created}`)
  console.log(`  ενημερώθηκαν: ${res.updated}`)
  console.log(`  παραλείφθηκαν: ${res.skipped}`)
}

main().catch((e) => { console.error('ERROR:', e instanceof Error ? e.message : e); process.exit(1) })
```

- [ ] **Step 3: Τρέξε την εισαγωγή**

Χρειάζεται έγκυρα SoftOne credentials στο `.env`.

Run: `npx tsx --env-file=.env scripts/import-companies-from-softone.ts`
Expected: τυπώνει πρόοδο και τελική σύνοψη με `created > 0`.

Αν βγάλει `Login fails due to invalid login credentials`, ανανέωσε τα SoftOne credentials από το deployment και ξανατρέξε.

- [ ] **Step 4: Επαλήθευσε τα δεδομένα**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT COUNT(*) AS total,
       SUM(TRDR IS NOT NULL) AS with_trdr,
       SUM(AFM IS NOT NULL AND AFM <> '') AS with_afm,
       COUNT(DISTINCT AFM) AS distinct_afm
FROM Company;
SQL
```
Expected: `total` = `with_trdr`. Το `distinct_afm` μπορεί να είναι μικρότερο από το `with_afm` — αυτό είναι φυσιολογικό και ο λόγος που το AFM δεν είναι unique.

- [ ] **Step 5: Commit**

```bash
git add lib/companies/softone-import.ts scripts/import-companies-from-softone.ts
git commit -m "feat(companies): bulk-import SoftOne customers into the Company model"
```

---

### Task 6: Server actions εταιριών και επαφών

**Files:**
- Create: `app/(app)/admin/companies/actions.ts`

- [ ] **Step 1: Γράψε τα actions**

```ts
// app/(app)/admin/companies/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { normalizeAfm, isValidAfm, hasValidChecksum } from '@/lib/companies/afm'
import { aadeLookup, AadeLookupError } from '@/lib/companies/aade'
import { importCompaniesFromSoftOne } from '@/lib/companies/softone-import'

async function requireAdmin(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== 'admin') {
    throw new Error('Μόνο διαχειριστές.')
  }
  return session.user.id
}

export type CompanyInput = {
  NAME: string
  AFM?: string | null
  IRSDATA?: string | null
  JOBTYPETRD?: string | null
  ADDRESS?: string | null
  ZIP?: string | null
  DISTRICT?: string | null
  CITY?: string | null
  PHONE01?: string | null
  PHONE02?: string | null
  EMAIL?: string | null
  WEBPAGE?: string | null
  appNotes?: string | null
  appLegalForm?: string | null
}

const t = (v: string | null | undefined) => (v ?? '').trim() || null

/**
 * Αναζήτηση στην ΑΑΔΕ. `found:false` = το ΑΦΜ δεν υπάρχει στο μητρώο, όχι σφάλμα.
 * Επιστρέφει και τυχόν υπάρχουσες εγγραφές με το ίδιο ΑΦΜ ως προειδοποίηση —
 * δεν μπλοκάρει, γιατί πολλαπλές καρτέλες ανά ΑΦΜ είναι νόμιμες.
 */
export async function lookupByAfm(afmInput: string) {
  await requireAdmin()
  const afm = normalizeAfm(afmInput)
  if (!isValidAfm(afm)) {
    return { ok: false as const, error: 'Το ΑΦΜ πρέπει να έχει 9 ψηφία.' }
  }

  const duplicates = await prisma.company.findMany({
    where: { AFM: afm },
    select: { id: true, NAME: true, CODE: true },
    take: 5,
  })

  try {
    const mapped = await aadeLookup(afm)
    return {
      ok: true as const,
      found: mapped !== null,
      afm,
      checksumOk: hasValidChecksum(afm),
      duplicates,
      draft: mapped
        ? {
            ...mapped.company,
            foundingDate: mapped.company.foundingDate?.toISOString() ?? null,
            doyDescr: mapped.doyDescr,
            isActive: mapped.isActive,
            activities: mapped.activities,
          }
        : null,
    }
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof AadeLookupError ? err.message : 'Σφάλμα αναζήτησης ΑΦΜ.',
    }
  }
}

export async function createCompany(
  input: CompanyInput & {
    foundingDate?: string | null
    aadeStatus?: string | null
    aadeFirmKind?: string | null
    activities?: { code: string | null; description: string | null; kind: string; order: number }[]
  },
) {
  await requireAdmin()
  const NAME = input.NAME.trim()
  if (NAME.length < 2) return { ok: false as const, error: 'Η επωνυμία είναι πολύ σύντομη.' }
  const AFM = input.AFM ? normalizeAfm(input.AFM) || null : null

  const company = await prisma.company.create({
    data: {
      NAME,
      AFM,
      SODTYPE: 13,
      IRSDATA: t(input.IRSDATA),
      JOBTYPETRD: t(input.JOBTYPETRD),
      ADDRESS: t(input.ADDRESS),
      ZIP: t(input.ZIP),
      DISTRICT: t(input.DISTRICT),
      CITY: t(input.CITY),
      PHONE01: t(input.PHONE01),
      PHONE02: t(input.PHONE02),
      EMAIL: t(input.EMAIL),
      WEBPAGE: t(input.WEBPAGE),
      appNotes: t(input.appNotes),
      appLegalForm: t(input.appLegalForm),
      foundingDate: input.foundingDate ? new Date(input.foundingDate) : null,
      aadeStatus: t(input.aadeStatus),
      aadeFirmKind: t(input.aadeFirmKind),
      aadeSyncedAt: input.activities?.length || input.aadeStatus ? new Date() : null,
      activities: input.activities?.length
        ? {
            create: input.activities.map((a) => ({
              code: a.code, description: a.description, kind: a.kind, order: a.order,
            })),
          }
        : undefined,
    },
  })
  revalidatePath('/admin/companies')
  return { ok: true as const, id: company.id }
}

export async function updateCompany(id: string, input: CompanyInput) {
  await requireAdmin()
  const NAME = input.NAME.trim()
  if (NAME.length < 2) return { ok: false as const, error: 'Η επωνυμία είναι πολύ σύντομη.' }
  await prisma.company.update({
    where: { id },
    data: {
      NAME,
      AFM: input.AFM ? normalizeAfm(input.AFM) || null : null,
      IRSDATA: t(input.IRSDATA),
      JOBTYPETRD: t(input.JOBTYPETRD),
      ADDRESS: t(input.ADDRESS),
      ZIP: t(input.ZIP),
      DISTRICT: t(input.DISTRICT),
      CITY: t(input.CITY),
      PHONE01: t(input.PHONE01),
      PHONE02: t(input.PHONE02),
      EMAIL: t(input.EMAIL),
      WEBPAGE: t(input.WEBPAGE),
      appNotes: t(input.appNotes),
    },
  })
  revalidatePath('/admin/companies')
  revalidatePath(`/admin/companies/${id}`)
  return { ok: true as const }
}

export async function setCompanyActive(id: string, active: boolean) {
  await requireAdmin()
  await prisma.company.update({ where: { id }, data: { ISACTIVE: active ? 1 : 0 } })
  revalidatePath('/admin/companies')
  return { ok: true as const }
}

/** Ξαναδιαβάζει στοιχεία από την ΑΑΔΕ και αντικαθιστά τις δραστηριότητες. */
export async function refreshFromAade(id: string) {
  await requireAdmin()
  const company = await prisma.company.findUnique({ where: { id }, select: { AFM: true } })
  if (!company?.AFM) return { ok: false as const, error: 'Η εταιρία δεν έχει ΑΦΜ.' }

  try {
    const mapped = await aadeLookup(company.AFM)
    if (!mapped) return { ok: false as const, error: 'Το ΑΦΜ δεν βρέθηκε στο μητρώο της ΑΑΔΕ.' }

    await prisma.$transaction(async (tx) => {
      await tx.companyActivity.deleteMany({ where: { companyId: id } })
      await tx.company.update({
        where: { id },
        data: {
          ...mapped.company,
          aadeSyncedAt: new Date(),
          activities: {
            create: mapped.activities.map((a) => ({
              code: a.code, description: a.description, kind: a.kind, order: a.order,
            })),
          },
        },
      })
    })
    revalidatePath(`/admin/companies/${id}`)
    return { ok: true as const }
  } catch (err) {
    return { ok: false as const, error: err instanceof AadeLookupError ? err.message : 'Σφάλμα ΑΑΔΕ.' }
  }
}

/** Μαζική εισαγωγή από SoftOne — τρέχει από το UI. */
export async function runSoftOneImport() {
  await requireAdmin()
  try {
    const res = await importCompaniesFromSoftOne()
    revalidatePath('/admin/companies')
    return { ok: true as const, ...res }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'Σφάλμα εισαγωγής.' }
  }
}

export type ContactInput = {
  name: string
  position?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  isPrimary?: boolean
  notes?: string | null
}

export async function createContact(companyId: string, input: ContactInput) {
  await requireAdmin()
  if (!input.name.trim()) return { ok: false as const, error: 'Το όνομα είναι υποχρεωτικό.' }
  await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.contact.updateMany({ where: { companyId }, data: { isPrimary: false } })
    }
    await tx.contact.create({
      data: {
        companyId,
        name: input.name.trim(),
        position: t(input.position),
        email: t(input.email),
        phone: t(input.phone),
        mobile: t(input.mobile),
        isPrimary: Boolean(input.isPrimary),
        notes: t(input.notes),
      },
    })
  })
  revalidatePath(`/admin/companies/${companyId}`)
  return { ok: true as const }
}

export async function updateContact(id: string, input: ContactInput) {
  await requireAdmin()
  const contact = await prisma.contact.findUnique({ where: { id }, select: { companyId: true } })
  if (!contact) return { ok: false as const, error: 'Δεν βρέθηκε η επαφή.' }
  await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.contact.updateMany({ where: { companyId: contact.companyId }, data: { isPrimary: false } })
    }
    await tx.contact.update({
      where: { id },
      data: {
        name: input.name.trim(),
        position: t(input.position),
        email: t(input.email),
        phone: t(input.phone),
        mobile: t(input.mobile),
        isPrimary: Boolean(input.isPrimary),
        notes: t(input.notes),
      },
    })
  })
  revalidatePath(`/admin/companies/${contact.companyId}`)
  return { ok: true as const }
}

export async function deleteContact(id: string) {
  await requireAdmin()
  const contact = await prisma.contact.findUnique({ where: { id }, select: { companyId: true } })
  if (!contact) return { ok: false as const, error: 'Δεν βρέθηκε η επαφή.' }
  await prisma.contact.delete({ where: { id } })
  revalidatePath(`/admin/companies/${contact.companyId}`)
  return { ok: true as const }
}

/**
 * Δίνει λογαριασμό portal σε μια επαφή, μέσω της υπάρχουσας ροής προσωρινού
 * κωδικού (mustChangePassword). Ο κωδικός επιστρέφεται ΜΙΑ φορά.
 */
export async function promoteContactToUser(contactId: string) {
  await requireAdmin()
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { company: { select: { id: true, NAME: true, AFM: true, TRDR: true } } },
  })
  if (!contact) return { ok: false as const, error: 'Δεν βρέθηκε η επαφή.' }
  if (contact.userId) return { ok: false as const, error: 'Η επαφή έχει ήδη λογαριασμό.' }
  const email = contact.email?.trim().toLowerCase()
  if (!email) return { ok: false as const, error: 'Η επαφή χρειάζεται email για να αποκτήσει λογαριασμό.' }
  if (await prisma.user.findUnique({ where: { email } })) {
    return { ok: false as const, error: 'Υπάρχει ήδη χρήστης με αυτό το email.' }
  }

  const tempPassword = randomBytes(9).toString('base64url')
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: contact.name,
        password: await bcrypt.hash(tempPassword, 10),
        mustChangePassword: true,
        role: 'viewer',
        userType: 'customer',
        companyId: contact.company.id,
        companyName: contact.company.NAME,
        companyAfm: contact.company.AFM,
        softoneCustomerId: contact.company.TRDR,
      },
    })
    await tx.contact.update({ where: { id: contactId }, data: { userId: user.id } })
  })

  revalidatePath(`/admin/companies/${contact.company.id}`)
  revalidatePath('/admin/users')
  return { ok: true as const, email, tempPassword }
}

/** Λίστα εταιριών για pickers. Τοπική αναζήτηση. */
export async function searchCompanies(q: string) {
  await requireAdmin()
  const needle = q.trim()
  return prisma.company.findMany({
    where: {
      ISACTIVE: 1,
      ...(needle ? { OR: [{ NAME: { contains: needle } }, { AFM: { contains: needle } }] } : {}),
    },
    select: { id: true, NAME: true, AFM: true },
    orderBy: { NAME: 'asc' },
    take: 50,
  })
}

/** Ορίζει τον πελάτη ενός έργου. `null` καθαρίζει τη σύνδεση. */
export async function setProjectPrimaryCompany(projectId: string, companyId: string | null) {
  await requireAdmin()
  if (companyId) {
    // Ο πελάτης δεν διπλοεγγράφεται ως ProjectCompany.
    await prisma.projectCompany.deleteMany({ where: { projectId, companyId } })
  }
  await prisma.project.update({ where: { id: projectId }, data: { primaryCompanyId: companyId } })
  revalidatePath(`/projects/${projectId}`)
  return { ok: true as const }
}

export async function addProjectCompany(
  projectId: string,
  companyId: string,
  role: 'partner' | 'subcontractor' | 'consultant' | 'other',
) {
  await requireAdmin()
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { primaryCompanyId: true },
  })
  if (project?.primaryCompanyId === companyId) {
    return { ok: false as const, error: 'Η εταιρία είναι ήδη ο πελάτης του έργου.' }
  }
  const exists = await prisma.projectCompany.findUnique({
    where: { projectId_companyId: { projectId, companyId } },
  })
  if (exists) return { ok: false as const, error: 'Η εταιρία είναι ήδη συνδεδεμένη.' }

  await prisma.projectCompany.create({ data: { projectId, companyId, role } })
  revalidatePath(`/projects/${projectId}`)
  return { ok: true as const }
}

export async function removeProjectCompany(id: string) {
  await requireAdmin()
  const row = await prisma.projectCompany.findUnique({ where: { id }, select: { projectId: true } })
  if (!row) return { ok: false as const, error: 'Δεν βρέθηκε η σύνδεση.' }
  await prisma.projectCompany.delete({ where: { id } })
  revalidatePath(`/projects/${row.projectId}`)
  return { ok: true as const }
}
```

- [ ] **Step 2: Έλεγξε**

Run: `npx tsc --noEmit`
Expected: καθαρό

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/admin/companies/actions.ts"
git commit -m "feat(companies): add admin server actions for companies, contacts and project links"
```

---

### Task 7: Σελίδα λίστας εταιριών

**Files:**
- Create: `app/(app)/admin/companies/page.tsx`
- Create: `app/(app)/admin/companies/companies-client.tsx`
- Modify: `components/layout/sidebar.tsx`

- [ ] **Step 1: Server page**

```tsx
// app/(app)/admin/companies/page.tsx
import { prisma } from '@/lib/prisma'
import { CompaniesClient } from './companies-client'

export const dynamic = 'force-dynamic'

export default async function CompaniesPage() {
  // Admin gate enforced by app/(app)/admin/layout.tsx
  const companies = await prisma.company.findMany({
    orderBy: [{ ISACTIVE: 'desc' }, { NAME: 'asc' }],
    select: {
      id: true, TRDR: true, CODE: true, NAME: true, AFM: true, CITY: true, ISACTIVE: true,
      _count: { select: { contacts: true, users: true, primaryProjects: true } },
    },
    take: 500,
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-fluent-neutral-90">Εταιρίες</h1>
      <p className="text-sm text-fluent-neutral-60 mt-1 mb-6">
        Πελάτες και συνεργαζόμενες εταιρίες. Τα στοιχεία αντλούνται από το ΑΦΜ μέσω ΑΑΔΕ.
        Η καταχώριση στο SoftOne δεν είναι υποχρεωτική.
      </p>
      <CompaniesClient
        companies={companies.map((c) => ({
          id: c.id,
          name: c.NAME,
          afm: c.AFM,
          code: c.CODE,
          city: c.CITY,
          isActive: c.ISACTIVE === 1,
          linkedToSoftOne: c.TRDR !== null,
          contactCount: c._count.contacts,
          userCount: c._count.users,
          projectCount: c._count.primaryProjects,
        }))}
      />
    </div>
  )
}
```

- [ ] **Step 2: Client λίστας**

```tsx
// app/(app)/admin/companies/companies-client.tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { lookupByAfm, createCompany, runSoftOneImport } from './actions'

type Row = {
  id: string; name: string; afm: string | null; code: string | null; city: string | null
  isActive: boolean; linkedToSoftOne: boolean
  contactCount: number; userCount: number; projectCount: number
}

const EMPTY = {
  NAME: '', AFM: '', IRSDATA: '', JOBTYPETRD: '', ADDRESS: '', ZIP: '',
  DISTRICT: '', CITY: '', PHONE01: '', PHONE02: '', EMAIL: '', WEBPAGE: '', appLegalForm: '',
}

export function CompaniesClient({ companies }: { companies: Row[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [aadeExtra, setAadeExtra] = useState<{
    foundingDate: string | null; aadeStatus: string | null; aadeFirmKind: string | null
    activities: { code: string | null; description: string | null; kind: string; order: number }[]
  } | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return companies
    return companies.filter(
      (c) => c.name.toLowerCase().includes(n) || (c.afm ?? '').includes(n) || (c.code ?? '').toLowerCase().includes(n),
    )
  }, [companies, q])

  async function onLookup() {
    setBusy(true); setError(''); setStatus('')
    const res = await lookupByAfm(form.AFM)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }

    const notes: string[] = []
    if (!res.checksumOk) notes.push('Προσοχή: το ΑΦΜ αποτυγχάνει στον έλεγχο ψηφίου ελέγχου.')
    if (res.duplicates.length) {
      notes.push(`Υπάρχουν ήδη ${res.duplicates.length} εγγραφές με αυτό το ΑΦΜ: ${res.duplicates.map((d) => d.NAME).join(', ')}.`)
    }

    if (!res.found || !res.draft) {
      notes.push('Δεν βρέθηκε στην ΑΑΔΕ — συμπλήρωσε τα στοιχεία χειροκίνητα.')
      setAadeExtra(null); setStatus(notes.join(' ')); return
    }

    const d = res.draft
    setForm({
      ...EMPTY,
      AFM: res.afm,
      NAME: d.NAME, IRSDATA: d.IRSDATA ?? '', JOBTYPETRD: d.JOBTYPETRD ?? '',
      ADDRESS: d.ADDRESS ?? '', ZIP: d.ZIP ?? '', CITY: d.CITY ?? '',
      appLegalForm: d.appLegalForm ?? '',
    })
    setAadeExtra({
      foundingDate: d.foundingDate, aadeStatus: d.aadeStatus,
      aadeFirmKind: d.aadeFirmKind, activities: d.activities,
    })
    notes.unshift(`Βρέθηκε: ${d.NAME}${d.doyDescr ? ` · ΔΟΥ ${d.doyDescr}` : ''}${d.isActive ? '' : ' · ΑΝΕΝΕΡΓΟ ΑΦΜ'}`)
    setStatus(notes.join(' '))
  }

  async function onCreate() {
    setBusy(true); setError('')
    const res = await createCompany({ ...form, ...(aadeExtra ?? {}) })
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    router.push(`/admin/companies/${res.id}`)
  }

  async function onImport() {
    if (!confirm('Να εισαχθούν όλοι οι πελάτες από το SoftOne; Οι υπάρχουσες εγγραφές θα ενημερωθούν.')) return
    setBusy(true); setError(''); setStatus('Εισαγωγή σε εξέλιξη…')
    const res = await runSoftOneImport()
    setBusy(false)
    if (!res.ok) { setError(res.error); setStatus(''); return }
    setStatus(`Ολοκληρώθηκε: ${res.created} νέες, ${res.updated} ενημερώθηκαν, ${res.skipped} παραλείφθηκαν.`)
    router.refresh()
  }

  const field = (key: keyof typeof EMPTY, label: string) => (
    <div>
      <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">{label}</label>
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full h-9 px-3 rounded-md border border-black/10 text-sm"
      />
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Αναζήτηση με επωνυμία, ΑΦΜ ή κωδικό…"
          className="flex-1 h-9 px-3 rounded-md border border-black/10 text-sm"
        />
        <Button variant="secondary" onClick={onImport} disabled={busy}>Εισαγωγή από SoftOne</Button>
        <Button onClick={() => setCreating((v) => !v)}>{creating ? 'Άκυρο' : 'Νέα εταιρία'}</Button>
      </div>

      {creating && (
        <div className="mb-6 rounded-lg border border-black/10 bg-white p-4 space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">ΑΦΜ</label>
              <input
                value={form.AFM}
                onChange={(e) => setForm({ ...form, AFM: e.target.value })}
                className="w-full h-9 px-3 rounded-md border border-black/10 text-sm font-mono"
              />
            </div>
            <Button onClick={onLookup} disabled={busy || !form.AFM.trim()} variant="secondary">
              Αναζήτηση ΑΑΔΕ
            </Button>
          </div>

          {status && <p className="text-xs text-fluent-neutral-70">{status}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            {field('NAME', 'Επωνυμία')}
            {field('appLegalForm', 'Νομική μορφή')}
            {field('IRSDATA', 'Κωδ. ΔΟΥ')}
            {field('JOBTYPETRD', 'Δραστηριότητα')}
            {field('ADDRESS', 'Διεύθυνση')}
            {field('CITY', 'Πόλη')}
            {field('ZIP', 'Τ.Κ.')}
            {field('DISTRICT', 'Περιοχή')}
            {field('PHONE01', 'Τηλέφωνο')}
            {field('EMAIL', 'Email')}
            {field('WEBPAGE', 'Website')}
          </div>

          <Button onClick={onCreate} disabled={busy || !form.NAME.trim()}>Αποθήκευση</Button>
        </div>
      )}

      <div className="rounded-lg border border-black/10 bg-white divide-y divide-black/5">
        {filtered.length === 0 && <p className="p-6 text-sm text-fluent-neutral-60 text-center">Καμία εταιρία.</p>}
        {filtered.map((c) => (
          <Link key={c.id} href={`/admin/companies/${c.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-black/[0.02]">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-fluent-neutral-90 truncate">
                {c.name}
                {!c.isActive && <span className="ml-2 text-xs text-fluent-neutral-50">(ανενεργή)</span>}
              </p>
              <p className="text-xs text-fluent-neutral-60 font-mono">
                {c.afm ?? '—'}{c.city ? ` · ${c.city}` : ''}
              </p>
            </div>
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
              c.linkedToSoftOne ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'bg-black/5 text-fluent-neutral-60'
            }`}>
              {c.linkedToSoftOne ? 'SoftOne' : 'Τοπική'}
            </span>
            <span className="text-xs text-fluent-neutral-60 tabular-nums w-32 text-right">
              {c.contactCount} επαφές · {c.projectCount} έργα
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Link στο admin nav**

Στο `components/layout/sidebar.tsx`, στο import block των icons (γραμμές 5-25) πρόσθεσε:

```ts
  Building24Regular, Building24Filled,
```

Και στον admin πίνακα (γύρω στη γραμμή 220), ανάμεσα στο «Χρήστες» και το «Τμήματα»:

```tsx
                { href: '/admin/users', label: 'Χρήστες', Regular: PeopleTeam24Regular, Filled: PeopleTeam24Filled },
                { href: '/admin/companies', label: 'Εταιρίες', Regular: Building24Regular, Filled: Building24Filled },
                { href: '/admin/departments', label: 'Τμήματα', Regular: BuildingMultiple24Regular, Filled: BuildingMultiple24Filled },
```

- [ ] **Step 4: Επαλήθευσε**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά. Στο `/admin/companies`, δοκίμασε «Νέα εταιρία» με ΑΦΜ `094019245` — τα πεδία πρέπει να γεμίσουν από την ΑΑΔΕ.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/admin/companies/page.tsx" "app/(app)/admin/companies/companies-client.tsx" components/layout/sidebar.tsx
git commit -m "feat(companies): add admin company list with AADE lookup and SoftOne import"
```

---

### Task 8: Καρτέλα εταιρίας με επαφές

**Files:**
- Create: `app/(app)/admin/companies/[id]/page.tsx`
- Create: `app/(app)/admin/companies/[id]/company-detail-client.tsx`

- [ ] **Step 1: Server page**

```tsx
// app/(app)/admin/companies/[id]/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { CompanyDetailClient } from './company-detail-client'

export const dynamic = 'force-dynamic'

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
      activities: { orderBy: { order: 'asc' } },
      users: { select: { id: true, name: true, email: true, role: true } },
      primaryProjects: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
      projectRoles: { select: { id: true, role: true, project: { select: { id: true, name: true } } } },
    },
  })
  if (!company) notFound()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <CompanyDetailClient
        company={{
          id: company.id,
          NAME: company.NAME, AFM: company.AFM, CODE: company.CODE,
          IRSDATA: company.IRSDATA, JOBTYPETRD: company.JOBTYPETRD,
          ADDRESS: company.ADDRESS, ZIP: company.ZIP, DISTRICT: company.DISTRICT, CITY: company.CITY,
          PHONE01: company.PHONE01, PHONE02: company.PHONE02,
          EMAIL: company.EMAIL, WEBPAGE: company.WEBPAGE,
          appNotes: company.appNotes, appLegalForm: company.appLegalForm,
          aadeStatus: company.aadeStatus,
          isActive: company.ISACTIVE === 1,
          linkedToSoftOne: company.TRDR !== null,
        }}
        activities={company.activities.map((a) => ({
          id: a.id, code: a.code, description: a.description, kind: a.kind,
        }))}
        contacts={company.contacts.map((c) => ({
          id: c.id, name: c.name, position: c.position, email: c.email,
          phone: c.phone, mobile: c.mobile, isPrimary: c.isPrimary, notes: c.notes,
          hasLogin: c.userId !== null,
        }))}
        users={company.users}
        clientProjects={company.primaryProjects}
        roleProjects={company.projectRoles.map((r) => ({
          id: r.id, role: r.role, projectId: r.project.id, projectName: r.project.name,
        }))}
      />
    </div>
  )
}
```

- [ ] **Step 2: Client καρτέλας**

```tsx
// app/(app)/admin/companies/[id]/company-detail-client.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  updateCompany, setCompanyActive, refreshFromAade,
  createContact, updateContact, deleteContact, promoteContactToUser,
} from '../actions'

type Company = {
  id: string; NAME: string; AFM: string | null; CODE: string | null
  IRSDATA: string | null; JOBTYPETRD: string | null
  ADDRESS: string | null; ZIP: string | null; DISTRICT: string | null; CITY: string | null
  PHONE01: string | null; PHONE02: string | null; EMAIL: string | null; WEBPAGE: string | null
  appNotes: string | null; appLegalForm: string | null; aadeStatus: string | null
  isActive: boolean; linkedToSoftOne: boolean
}
type Activity = { id: string; code: string | null; description: string | null; kind: string }
type Contact = {
  id: string; name: string; position: string | null; email: string | null
  phone: string | null; mobile: string | null; isPrimary: boolean; notes: string | null; hasLogin: boolean
}
type UserRow = { id: string; name: string | null; email: string; role: string }
type ProjectRow = { id: string; name: string }
type RoleRow = { id: string; role: string; projectId: string; projectName: string }

const ROLE_LABEL: Record<string, string> = {
  partner: 'Συνεργάτης', subcontractor: 'Υπεργολάβος', consultant: 'Σύμβουλος', other: 'Άλλο',
}

const EMPTY_CONTACT = { name: '', position: '', email: '', phone: '', mobile: '', isPrimary: false, notes: '' }

export function CompanyDetailClient({
  company, activities, contacts, users, clientProjects, roleProjects,
}: {
  company: Company; activities: Activity[]; contacts: Contact[]; users: UserRow[]
  clientProjects: ProjectRow[]; roleProjects: RoleRow[]
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    NAME: company.NAME, AFM: company.AFM ?? '', IRSDATA: company.IRSDATA ?? '',
    JOBTYPETRD: company.JOBTYPETRD ?? '', ADDRESS: company.ADDRESS ?? '',
    ZIP: company.ZIP ?? '', DISTRICT: company.DISTRICT ?? '', CITY: company.CITY ?? '',
    PHONE01: company.PHONE01 ?? '', PHONE02: company.PHONE02 ?? '',
    EMAIL: company.EMAIL ?? '', WEBPAGE: company.WEBPAGE ?? '', appNotes: company.appNotes ?? '',
  })
  const [editingContact, setEditingContact] = useState<string | null>(null)
  const [contactForm, setContactForm] = useState({ ...EMPTY_CONTACT })
  const [addingContact, setAddingContact] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>, ok?: (r: T) => void) {
    setBusy(true); setError(''); setMessage('')
    const res = await fn()
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Κάτι πήγε στραβά.'); return }
    ok?.(res)
    router.refresh()
  }

  const field = (key: keyof typeof form, label: string) => (
    <div>
      <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">{label}</label>
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full h-9 px-3 rounded-md border border-black/10 text-sm"
      />
    </div>
  )

  const cField = (key: keyof typeof EMPTY_CONTACT, label: string) => (
    <div>
      <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">{label}</label>
      <input
        value={String(contactForm[key] ?? '')}
        onChange={(e) => setContactForm({ ...contactForm, [key]: e.target.value })}
        className="w-full h-9 px-3 rounded-md border border-black/10 text-sm"
      />
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/companies" className="text-xs text-fluent-blue-600">← Εταιρίες</Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-2xl font-semibold text-fluent-neutral-90">{company.NAME}</h1>
          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
            company.linkedToSoftOne ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'bg-black/5 text-fluent-neutral-60'
          }`}>
            {company.linkedToSoftOne ? `SoftOne ${company.CODE ?? ''}` : 'Τοπική'}
          </span>
        </div>
        <p className="text-sm text-fluent-neutral-60 font-mono mt-1">
          ΑΦΜ {company.AFM ?? '—'}
          {company.appLegalForm ? ` · ${company.appLegalForm}` : ''}
          {company.aadeStatus ? ` · ${company.aadeStatus}` : ''}
        </p>
      </div>

      {message && <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">{message}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

      <section className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-fluent-neutral-90">Στοιχεία</h2>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy || !company.AFM}
              onClick={() => run(() => refreshFromAade(company.id), () => setMessage('Ενημερώθηκε από ΑΑΔΕ.'))}>
              Ανανέωση από ΑΑΔΕ
            </Button>
            <Button variant="secondary" disabled={busy}
              onClick={() => run(() => setCompanyActive(company.id, !company.isActive))}>
              {company.isActive ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field('NAME', 'Επωνυμία')}
          {field('AFM', 'ΑΦΜ')}
          {field('IRSDATA', 'Κωδ. ΔΟΥ')}
          {field('JOBTYPETRD', 'Δραστηριότητα')}
          {field('ADDRESS', 'Διεύθυνση')}
          {field('CITY', 'Πόλη')}
          {field('ZIP', 'Τ.Κ.')}
          {field('DISTRICT', 'Περιοχή')}
          {field('PHONE01', 'Τηλέφωνο')}
          {field('PHONE02', 'Τηλέφωνο 2')}
          {field('EMAIL', 'Email')}
          {field('WEBPAGE', 'Website')}
        </div>
        <Button className="mt-3" disabled={busy}
          onClick={() => run(() => updateCompany(company.id, form), () => setMessage('Αποθηκεύτηκε.'))}>
          Αποθήκευση
        </Button>

        {activities.length > 0 && (
          <div className="mt-4 border-t border-black/5 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-fluent-neutral-50 mb-2">
              Δραστηριότητες (ΚΑΔ)
            </p>
            {activities.map((a) => (
              <p key={a.id} className="text-xs text-fluent-neutral-70 py-0.5">
                <span className="font-mono">{a.code ?? '—'}</span> · {a.description ?? '—'}
                {a.kind === 'PRIMARY' && <span className="ml-2 text-[10px] uppercase font-semibold text-fluent-blue-700">κύρια</span>}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-fluent-neutral-90">Επαφές</h2>
          <Button variant="secondary"
            onClick={() => { setAddingContact((v) => !v); setContactForm({ ...EMPTY_CONTACT }); setEditingContact(null) }}>
            {addingContact ? 'Άκυρο' : 'Νέα επαφή'}
          </Button>
        </div>

        {(addingContact || editingContact) && (
          <div className="mb-4 rounded-md bg-black/[0.02] p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {cField('name', 'Ονοματεπώνυμο')}
              {cField('position', 'Θέση')}
              {cField('email', 'Email')}
              {cField('phone', 'Τηλέφωνο')}
              {cField('mobile', 'Κινητό')}
            </div>
            <label className="flex items-center gap-2 text-xs text-fluent-neutral-70">
              <input type="checkbox" checked={contactForm.isPrimary}
                onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })} />
              Κύρια επαφή
            </label>
            <Button disabled={busy}
              onClick={() => run(
                () => editingContact ? updateContact(editingContact, contactForm) : createContact(company.id, contactForm),
                () => { setAddingContact(false); setEditingContact(null); setContactForm({ ...EMPTY_CONTACT }) },
              )}>
              Αποθήκευση
            </Button>
          </div>
        )}

        <div className="divide-y divide-black/5">
          {contacts.length === 0 && <p className="text-sm text-fluent-neutral-60 py-3">Καμία επαφή.</p>}
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-fluent-neutral-90">
                  {c.name}
                  {c.isPrimary && <span className="ml-2 text-[10px] uppercase font-semibold text-fluent-blue-700">κύρια</span>}
                </p>
                <p className="text-xs text-fluent-neutral-60">
                  {[c.position, c.email, c.phone || c.mobile].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              {c.hasLogin ? (
                <span className="text-[10px] uppercase font-semibold text-green-700">έχει λογαριασμό</span>
              ) : (
                <Button variant="secondary" disabled={busy || !c.email}
                  onClick={() => run(
                    () => promoteContactToUser(c.id),
                    (r) => setMessage(
                      `Λογαριασμός: ${(r as { email: string }).email} — προσωρινός κωδικός: ${(r as { tempPassword: string }).tempPassword} (εμφανίζεται μία φορά)`,
                    ),
                  )}>
                  Δώσε πρόσβαση
                </Button>
              )}
              <Button variant="secondary" onClick={() => {
                setEditingContact(c.id); setAddingContact(false)
                setContactForm({
                  name: c.name, position: c.position ?? '', email: c.email ?? '',
                  phone: c.phone ?? '', mobile: c.mobile ?? '', isPrimary: c.isPrimary, notes: c.notes ?? '',
                })
              }}>
                Επεξεργασία
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => run(() => deleteContact(c.id))}>
                Διαγραφή
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-black/10 bg-white p-4">
        <h2 className="text-sm font-semibold text-fluent-neutral-90 mb-3">Έργα</h2>
        {clientProjects.length === 0 && roleProjects.length === 0 && (
          <p className="text-sm text-fluent-neutral-60">Κανένα έργο.</p>
        )}
        {clientProjects.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 py-2 text-sm hover:underline">
            <span className="flex-1">{p.name}</span>
            <span className="text-[10px] uppercase font-semibold text-fluent-blue-700">πελάτης</span>
          </Link>
        ))}
        {roleProjects.map((r) => (
          <Link key={r.id} href={`/projects/${r.projectId}`} className="flex items-center gap-3 py-2 text-sm hover:underline">
            <span className="flex-1">{r.projectName}</span>
            <span className="text-[10px] uppercase font-semibold text-fluent-neutral-60">{ROLE_LABEL[r.role] ?? r.role}</span>
          </Link>
        ))}

        <h2 className="text-sm font-semibold text-fluent-neutral-90 mt-5 mb-2">Χρήστες με πρόσβαση</h2>
        {users.length === 0 && <p className="text-sm text-fluent-neutral-60">Κανένας χρήστης.</p>}
        {users.map((u) => (
          <p key={u.id} className="text-sm py-1">
            {u.name ?? u.email} <span className="text-xs text-fluent-neutral-60">· {u.email} · {u.role}</span>
          </p>
        ))}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Επαλήθευσε χειροκίνητα**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά.

Δοκίμασε: δημιούργησε εταιρία με ΑΦΜ, πρόσθεσε επαφή, δώσε της πρόσβαση, επιβεβαίωσε ότι εμφανίζεται ο προσωρινός κωδικός μία φορά και ότι ο χρήστης υπάρχει στο `/admin/users`.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/admin/companies/[id]"
git commit -m "feat(companies): add company detail page with contacts and access granting"
```

---

### Task 9: Backfill υπαρχόντων εταιριών από τους χρήστες

**Files:**
- Create: `prisma/migrations/<timestamp>_backfill_companies/migration.sql`

- [ ] **Step 1: Δημιούργησε κενό migration**

Run: `npx prisma migrate dev --create-only --name backfill_companies`

- [ ] **Step 2: Γράψε το SQL**

Αντικατέστησε το περιεχόμενο του `migration.sql`:

```sql
-- Εταιρίες από τα ΑΦΜ που ήδη υπάρχουν στους χρήστες, ΜΟΝΟ όσες δεν καλύφθηκαν
-- ήδη από τη μαζική εισαγωγή SoftOne (η οποία ταιριάζει με TRDR).
INSERT INTO `Company` (`id`, `NAME`, `AFM`, `SODTYPE`, `TRDR`, `ISACTIVE`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('cmp_', LOWER(HEX(RANDOM_BYTES(12)))),
  COALESCE(MIN(u.`companyName`), u.`companyAfm`),
  u.`companyAfm`,
  13,
  MIN(u.`softoneCustomerId`),
  1,
  NOW(3),
  NOW(3)
FROM `User` u
WHERE u.`companyAfm` IS NOT NULL
  AND u.`companyAfm` <> ''
  AND NOT EXISTS (SELECT 1 FROM `Company` c WHERE c.`AFM` = u.`companyAfm`)
GROUP BY u.`companyAfm`;

-- Σύνδεσε κάθε χρήστη με εταιρία ίδιου ΑΦΜ. Όπου υπάρχουν πολλές γραμμές ανά
-- ΑΦΜ (νόμιμο), προτίμησε την ενεργή με το μικρότερο id ώστε να είναι ντετερμινιστικό.
UPDATE `User` u
JOIN (
  SELECT `AFM`, MIN(`id`) AS `id`
  FROM `Company`
  WHERE `AFM` IS NOT NULL AND `AFM` <> '' AND `ISACTIVE` = 1
  GROUP BY `AFM`
) c ON c.`AFM` = u.`companyAfm`
SET u.`companyId` = c.`id`
WHERE u.`companyId` IS NULL;

-- Ο πελάτης κάθε έργου προκύπτει από την εταιρία της επαφής-πελάτη.
UPDATE `Project` p
JOIN `User` u ON u.`id` = p.`customerUserId`
SET p.`primaryCompanyId` = u.`companyId`
WHERE p.`primaryCompanyId` IS NULL
  AND u.`companyId` IS NOT NULL;
```

Το `NOT EXISTS` και τα `WHERE … IS NULL` κάνουν το migration idempotent.

- [ ] **Step 3: Εφάρμοσε**

Run: `npx prisma migrate deploy`
Expected: «All migrations have been successfully applied».

- [ ] **Step 4: Επαλήθευσε**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT
  (SELECT COUNT(*) FROM Company) AS companies,
  (SELECT COUNT(*) FROM User WHERE companyAfm IS NOT NULL AND companyAfm <> '' AND companyId IS NULL) AS unlinked_users,
  (SELECT COUNT(*) FROM Project WHERE customerUserId IS NOT NULL AND primaryCompanyId IS NULL) AS unlinked_projects;
SQL
```
Expected: `unlinked_users` = 0. Το `unlinked_projects` > 0 μόνο αν κάποιο `customerUserId` δείχνει σε χρήστη χωρίς ΑΦΜ.

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations
git commit -m "feat(db): backfill companies from existing user company fields"
```

---

### Task 10: Στρέψε το SoftOne project sync στην κύρια εταιρία

**Files:**
- Modify: `lib/softone-contacts.ts:406-440`

- [ ] **Step 1: Άλλαξε την πηγή του TRDR**

Στη `syncProjectToSoftOne`, αντικατέστησε:

```ts
// ΠΡΙΝ
const customer = project.customerUserId
  ? await prisma.user.findUnique({
      where: { id: project.customerUserId },
      select: { softoneCustomerId: true },
    })
  : null;
```

με:

```ts
// ΜΕΤΑ — ο πελάτης του έργου είναι πλέον εταιρία, όχι χρήστης.
// Το PRJC δέχεται ένα TRDR· null όταν η εταιρία δεν υπάρχει στο ERP.
const customer = project.primaryCompanyId
  ? await prisma.company.findUnique({
      where: { id: project.primaryCompanyId },
      select: { TRDR: true },
    })
  : null;
```

Και τη γραμμή του payload:

```ts
    TRDR: customer?.TRDR ?? null,
```

- [ ] **Step 2: Έλεγξε**

Run: `npx tsc --noEmit`
Expected: καθαρό

- [ ] **Step 3: Commit**

```bash
git add lib/softone-contacts.ts
git commit -m "refactor(softone): source PRJC.TRDR from the project's primary company"
```

---

### Task 11: Πελάτης στη φόρμα έργου

**Files:**
- Modify: `app/(app)/projects/project-form.tsx`

Προσοχή: το `Project.customerUserId` **δεν τίθεται σήμερα από καμία φόρμα** — μόνο διαβάζεται
(`app/(app)/projects/[id]/page.tsx:148`, `lib/softone-contacts.ts:418`). Άρα αυτό είναι ο
πρώτος τρόπος να οριστεί πελάτης έργου από το UI· δεν αντικαθιστά υπάρχον πεδίο.

- [ ] **Step 1: Πρόσθεσε τον τύπο και το state**

Στο `ProjectFormInitial`:

```ts
  primaryCompanyId?: string | null;
```

Νέος exported τύπος δίπλα στο `UserOption`:

```ts
export type CompanyOption = { id: string; name: string; afm: string | null };
```

Νέα prop `companies: CompanyOption[]` και state:

```ts
  const [primaryCompanyId, setPrimaryCompanyId] = useState(initial?.primaryCompanyId ?? '');
```

- [ ] **Step 2: Πρόσθεσε το πεδίο**

Αμέσως μετά το block «Ιδιοκτήτης» (ίδιο ακριβώς styling με το `ownerId` select):

```tsx
      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Πελάτης (εταιρία)</label>
        <select
          name="primaryCompanyId"
          value={primaryCompanyId}
          onChange={(e) => setPrimaryCompanyId(e.target.value)}
          className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white"
        >
          <option value="">— καμία —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.afm ? ` (${c.afm})` : ''}</option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-fluent-neutral-60">
          Καθορίζει το <code>PRJC.TRDR</code> στο SoftOne και ποιος βλέπει το έργο στο portal πελατών.
        </p>
      </div>
```

- [ ] **Step 3: Τροφοδότησε και αποθήκευσε**

Στον caller της φόρμας:

```ts
const companies = await prisma.company.findMany({
  where: { ISACTIVE: 1 },
  select: { id: true, NAME: true, AFM: true },
  orderBy: { NAME: 'asc' },
});
```
(και map σε `{ id, name: c.NAME, afm: c.AFM }`)

Στο server action αποθήκευσης:

```ts
  const primaryCompanyId = String(formData.get('primaryCompanyId') ?? '').trim() || null;
```

και στο `data` του `create`/`update`:

```ts
    primaryCompanyId,
```

- [ ] **Step 4: Επαλήθευσε**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά. Δημιούργησε έργο με πελάτη· εμφανίζεται στην καρτέλα της εταιρίας ως «πελάτης».

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/projects/project-form.tsx"
git commit -m "feat(projects): assign a client company from the project form"
```

---

### Task 12: Στρέψε τη διαχείριση χρηστών στη σχέση εταιρίας

**Files:**
- Modify: `app/(app)/admin/users/page.tsx`, `actions.ts`
- Modify: `components/admin/user-management.tsx`

- [ ] **Step 1: Διάβασε την εταιρία μέσω σχέσης**

Στο `app/(app)/admin/users/page.tsx`, στο `select` του users query:

```ts
        companyId: true,
        company: { select: { id: true, NAME: true, AFM: true } },
```

στο mapping:

```ts
    companyId: u.companyId,
    companyLabel: u.company ? `${u.company.NAME}${u.company.AFM ? ` (${u.company.AFM})` : ''}` : null,
```

και φόρτωσε τη λίστα εταιριών για το picker:

```ts
    prisma.company.findMany({
      where: { ISACTIVE: 1 },
      select: { id: true, NAME: true, AFM: true },
      orderBy: { NAME: 'asc' },
    }),
```

- [ ] **Step 2: Αποθήκευσε companyId**

Στο `app/(app)/admin/users/actions.ts`, στη συνάρτηση που διαβάζει το form payload:

```ts
  const companyId = String(formData.get('companyId') ?? '').trim() || null;
```

Πέρασέ το στο data object, και γέμισε τα denormalized πεδία από την εταιρία:

```ts
    companyId,
```

```ts
  if (companyId) {
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: { NAME: true, AFM: true, TRDR: true },
    });
    if (c) {
      data.companyName = c.NAME;
      data.companyAfm = c.AFM;
      if (safeType === 'customer') data.softoneCustomerId = c.TRDR;
    }
  }
```

- [ ] **Step 3: Picker τοπικής εταιρίας για customers**

Στο `components/admin/user-management.tsx` (γραμμές ~426-452) υπάρχουν το «Εταιρεία (από SoftOne)» combobox και το «Α.Φ.Μ. εταιρείας (προαιρετικό override)» input. Για `userType === 'customer'` αντικαθίστανται· για employees/suppliers μένουν — το `SoftOneCompanyCombobox` **δεν διαγράφεται**.

Πρόσθεσε prop `companies: { id: string; NAME: string; AFM: string | null }[]` και `companyId: string | null` στον τύπο του `initial`, και αντικατέστησε το block με:

```tsx
        {userType === 'customer' ? (
          <div>
            <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Εταιρία</label>
            <select
              name="companyId"
              defaultValue={initial?.companyId ?? ''}
              className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white"
            >
              <option value="">— καμία —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.NAME}{c.AFM ? ` (${c.AFM})` : ''}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-fluent-neutral-60">
              Διαχείριση εταιριών και επαφών στο <code>/admin/companies</code>.
              Η επωνυμία και το ΑΦΜ συμπληρώνονται αυτόματα.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">
                Εταιρεία (από SoftOne)
              </label>
              <SoftOneCompanyCombobox
                source={softoneSource}
                fieldNamePrefix="softoneCompany"
                initial={initialSelection}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">
                Α.Φ.Μ. εταιρείας (προαιρετικό override)
              </label>
              <input
                name="companyAfm"
                defaultValue={initial?.companyAfm ?? ''}
                placeholder="9-ψήφιο ΑΦΜ"
                pattern="\d{9}"
                className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-fluent-neutral-60">
                Αν επιλέξεις εταιρεία από το combobox, το ΑΦΜ συμπληρώνεται αυτόματα.
                Συμπλήρωσε εδώ ΜΟΝΟ όταν θες override.
              </p>
            </div>
          </>
        )}
```

- [ ] **Step 4: Επαλήθευσε**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά. Δημιούργησε customer χρήστη με εταιρία· εμφανίζεται στην καρτέλα της.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/admin/users" components/admin/user-management.tsx
git commit -m "feat(admin): link users to companies through the new relation"
```

---

### Task 13: Τελικός έλεγχος

- [ ] **Step 1: Όλα τα tests**

Run: `npx tsx --test lib/companies/__tests__/*.test.ts lib/tickets/__tests__/*.test.ts`
Expected: όλα PASS

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά

- [ ] **Step 3: Ακεραιότητα δεδομένων**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT 'διπλά TRDR' AS check_name, COUNT(*) AS bad FROM (
  SELECT TRDR FROM Company WHERE TRDR IS NOT NULL GROUP BY TRDR HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'πελάτης διπλοεγγεγραμμένος ως συνεργάτης', COUNT(*) FROM ProjectCompany pc
  JOIN Project p ON p.id = pc.projectId AND p.primaryCompanyId = pc.companyId
UNION ALL
SELECT 'επαφές με userId που δεν υπάρχει', COUNT(*) FROM Contact c
  LEFT JOIN User u ON u.id = c.userId WHERE c.userId IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'εταιρίες χωρίς επωνυμία', COUNT(*) FROM Company WHERE NAME IS NULL OR NAME = '';
SQL
```
Expected: `bad` = 0 σε όλες τις γραμμές.

- [ ] **Step 4: Commit αν χρειάστηκαν διορθώσεις**

```bash
git add -A
git commit -m "chore(companies): final verification fixes"
```

---

## Τι ΔΕΝ κάνει αυτό το plan

- **Δεν στέλνει εταιρίες στο SoftOne.** Η ροή είναι μονόδρομη: SoftOne → εμάς.
- **Δεν τραβάει ΓΕΜΗ.** Το damask το κάνει· εδώ η ΑΑΔΕ αρκεί. Το model αφήνει χώρο.
- **Δεν αφαιρεί τα `User.companyName` / `companyAfm`.** Μένουν μία έκδοση ως denormalized αντίγραφα.
- **Δεν αγγίζει το portal.** `app/(portal)/`, `lib/portal/scope.ts` και το `Comment.visibility` ανήκουν στη Φάση Β.

---

## Εκτέλεση — τι άλλαξε από το plan (2026-07-30)

Η Φάση Α υλοποιήθηκε πλήρως. Επτά αποκλίσεις, όλες επιβεβλημένες από πραγματικά
δεδομένα και όχι από προτίμηση:

1. **`GetTable` επιστρέφει `data`, όχι `rows`, και οι γραμμές είναι θεσιακές.**
   Τα κλειδιά είναι δείκτες ως strings ("0", "1", …) με τη σειρά των FIELDS. Το
   `row.TRDR` έδινε `undefined`. Ο importer χαρτογραφεί με δείκτη.

2. **Το update path ξαναγράφτηκε ως batched upsert.** Ένα `prisma.update` ανά
   γραμμή σήμαινε 3924 διαδοχικά round trips σε remote MySQL και ξεπερνούσε τα
   10 λεπτά — θα έληγε το action του UI. Ένα `INSERT … ON DUPLICATE KEY UPDATE`
   ανά 500 γραμμές (MySQL 8 `AS new`) το κατέβασε σε **5 δευτερόλεπτα**.

3. **Το `IRSDATA` κρατά ονομασία ΔΟΥ, όχι κωδικό.** Προστέθηκε `doyCode` για τον
   αριθμητικό κωδικό της ΑΑΔΕ. Χωρίς αυτό, γραμμές από ERP και από ΑΑΔΕ θα
   διαφωνούσαν για το νόημα της στήλης.

4. **Το `AFM` δεν είναι unique — τώρα με στοιχεία.** 3061 πελάτες με ΑΦΜ, 2998
   διακριτά, 56 ΑΦΜ με πολλαπλές καρτέλες. Unique constraint θα έσπαγε την εισαγωγή.

5. **Το `migrate diff` πρότεινε να ρίξει δύο FULLTEXT indexes.** Η Prisma δεν τα
   εκφράζει, οπότε φαίνονται ως drift, αλλά τα χρησιμοποιεί το
   `lib/tickets/similar.ts` μέσω `MATCH…AGAINST`. Αφαιρέθηκαν από το migration —
   αλλιώς θα έσπαγε σιωπηλά το ticket triage.

6. **Server-side αναζήτηση αντί για client-side φιλτράρισμα.** Με ~3900 εταιρίες,
   ούτε η λίστα ούτε ένα `<select>` στη φόρμα έργου στέκουν. Προστέθηκε
   `components/companies/company-picker.tsx` (debounced combobox).

7. **Ο έλεγχος ψηφίου ελέγχου ΑΦΜ είναι προειδοποίηση, όχι φραγμός.** Ένας
   χρήστης έχει κυπριακό ΑΦΜ `10347430N` με γράμμα — αυστηρός έλεγχος θα τον
   απέκλειε. Το backfill ταιριάζει ΑΦΜ verbatim, χωρίς κανονικοποίηση.

**Κατάσταση:** 33 unit tests πράσινα, `tsc` και `npm run build` καθαρά, 9 έλεγχοι
ακεραιότητας δεδομένων στο 0. 3925 εταιρίες (3924 από SoftOne, 1 τοπική), 6
χρήστες συνδεδεμένοι. Επαληθεύτηκε ζωντανά: idempotent εισαγωγή, διατήρηση
τοπικού εμπλουτισμού σε re-sync, δημιουργία από ΑΑΔΕ με 85 ΚΑΔ και cascade delete.

**Εκκρεμεί:** UI για συνδεδεμένες εταιρίες με ρόλο (`ProjectCompany`) — τα actions
`addProjectCompany`/`removeProjectCompany` υπάρχουν και δοκιμάστηκαν, αλλά δεν
έχουν ακόμα σημείο στη σελίδα έργου. Ο πελάτης (`primaryCompanyId`) έχει πλήρες UI.
