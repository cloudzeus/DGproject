# Companies & Contacts (Φάση Α) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Να προστίθεται εταιρία με ΑΦΜ (με άντληση στοιχείων από το SoftOne `CUSTOMER`/`TRDR` όπου υπάρχουν), να διαχειρίζεται με τις επαφές της από admin σελίδα, και να συσχετίζεται με χρήστες και έργα.

**Architecture:** Νέα models `Company`, `Contact`, `ProjectCompany`. Η εταιρία έχει φυσικό κλειδί το ΑΦΜ· η σύνδεση με SoftOne (`softoneCustomerId = CUSTOMER.TRDR`) είναι **προαιρετική** — τοπική-μόνο εταιρία είναι πλήρως υποστηριζόμενη κατάσταση. Το έργο αποκτά `primaryCompanyId` (ο πελάτης — πηγή του `PRJC.TRDR` και το μόνο που θα βλέπει το portal στη Φάση Β) και `ProjectCompany[]` για συνεργάτες/υπεργολάβους. Τα free-text `User.companyName/companyAfm` αντικαθίστανται από σχέση `User.companyId`.

**Tech Stack:** Next.js App Router (server components + server actions), Prisma/MySQL (**shadow DB ΣΠΑΣΜΕΝΟ** → migrations με `prisma migrate dev --create-only` + `prisma migrate deploy`), SoftOne Web Services μέσω `lib/softone.ts` (`s1()`), tests με `node:test` μέσω `npx tsx --test`, Fluent/DG design tokens.

**Προαπαιτούμενο:** Τα SoftOne credentials στο τοπικό `.env` είναι ξεπερασμένα (`Login fails due to invalid login credentials`). Το Task 1 χρειάζεται ζωντανή σύνδεση — ανανέωσε `SOFTONE_USERNAME`/`SOFTONE_PASSWORD`/`SOFTONE_APP_ID` από το deployment πριν ξεκινήσεις. Τα Tasks 2-10 δεν χρειάζονται SoftOne.

---

## File Structure

**Create**
| Αρχείο | Ευθύνη |
|---|---|
| `lib/companies/afm.ts` | Validation ΑΦΜ (μήκος + checksum ΓΓΠΣ). Καθαρή συνάρτηση, καμία I/O. |
| `lib/companies/__tests__/afm.test.ts` | Tests του παραπάνω. |
| `lib/companies/softone-import.ts` | `lookupCompanyByAfm(afm)` → `CompanyDraft | null`. Μοναδικό σημείο που ξέρει τα ονόματα πεδίων του `CUSTOMER`. |
| `lib/companies/__tests__/softone-import.test.ts` | Tests του mapper με fixture, χωρίς δίκτυο. |
| `app/(app)/admin/companies/page.tsx` | Λίστα + αναζήτηση. |
| `app/(app)/admin/companies/companies-client.tsx` | Client UI λίστας. |
| `app/(app)/admin/companies/actions.ts` | Server actions: company CRUD, contact CRUD, promote-to-user, ΑΦΜ lookup. |
| `app/(app)/admin/companies/[id]/page.tsx` | Καρτέλα εταιρίας. |
| `app/(app)/admin/companies/[id]/company-detail-client.tsx` | Client UI καρτέλας + επαφές. |
| `scripts/probe-softone-customer.ts` | Διαγνωστικό: τυπώνει τα πεδία του `CUSTOMER`. Μένει στο repo ως εργαλείο. |

**Modify**
| Αρχείο | Αλλαγή |
|---|---|
| `prisma/schema.prisma` | Νέα models/enums, `User.companyId`, `Project.primaryCompanyId`. |
| `lib/softone-contacts.ts:406-440` | `PRJC.TRDR` από `primaryCompany` αντί για `customerUserId → User`. |
| `app/(app)/admin/users/page.tsx` | Διάβασμα εταιρίας μέσω σχέσης. |
| `app/(app)/admin/users/actions.ts` | Αποθήκευση `companyId`. |
| `components/admin/user-management.tsx` | Picker τοπικής εταιρίας αντί για SoftOne combobox. |
| `components/layout/sidebar.tsx` | Link «Εταιρίες» στο admin nav. |
| `app/(app)/projects/project-form.tsx` | Πεδίο πελάτη + συσχετιζόμενες εταιρίες με ρόλο. |

---

### Task 1: Καρφώσε το mapping των πεδίων του SoftOne `CUSTOMER`

Ο σκοπός είναι να μη μαντέψουμε ονόματα πεδίων. Το script τυπώνει ό,τι επιστρέφει πραγματικά το ERP.

**Files:**
- Create: `scripts/probe-softone-customer.ts`

- [ ] **Step 1: Γράψε το probe script**

```ts
// scripts/probe-softone-customer.ts
// Διαγνωστικό: τυπώνει τα ονόματα πεδίων ενός CUSTOMER record ώστε το
// lib/companies/softone-import.ts να χτιστεί πάνω σε πραγματικά δεδομένα.
// Τρέξε: npx tsx --env-file=.env scripts/probe-softone-customer.ts [ΑΦΜ]
import { softoneLookup } from '@/lib/softone-lookup'
import { s1 } from '@/lib/softone'

async function main() {
  const afm = process.argv[2] ?? ''
  const rows = await softoneLookup({ source: 'customer', q: afm, limit: 1 })
  if (!rows.length) {
    console.log(afm ? `Δεν βρέθηκε CUSTOMER με ΑΦΜ ${afm}` : 'Δεν επιστράφηκε κανένας CUSTOMER')
    return
  }
  console.log('lookup row:', rows[0])

  const res = await s1('getData', { OBJECT: 'CUSTOMER', KEY: String(rows[0].id) })
  if (!res.success) {
    console.log('getData failed:', res.error, 'code', res.errorcode)
    return
  }
  const cust = (res.data?.CUSTOMER?.[0] ?? {}) as Record<string, unknown>
  console.log('\nΌλα τα πεδία:')
  console.log(Object.keys(cust).sort().join(', '))
  console.log('\nΤιμές (μόνο μη-κενά):')
  for (const k of Object.keys(cust).sort()) {
    const v = cust[k]
    if (v !== null && v !== '' && v !== 0) console.log(`  ${k} = ${JSON.stringify(v)}`)
  }
}

main().catch((e) => console.error('ERROR:', e instanceof Error ? e.message : e))
```

- [ ] **Step 2: Τρέξ' το με πραγματικό ΑΦΜ πελάτη**

Run: `npx tsx --env-file=.env scripts/probe-softone-customer.ts 999999999` (βάλε υπαρκτό ΑΦΜ)
Expected: λίστα πεδίων. Αν βγάλει `Login fails due to invalid login credentials`, ανανέωσε πρώτα τα SoftOne credentials στο `.env`.

- [ ] **Step 3: Σημείωσε το mapping**

Γράψε στο τέλος αυτού του αρχείου (ή σε σχόλιο μέσα στο `softone-import.ts` στο Task 4) ποια πεδία αντιστοιχούν σε τι. Το **αναμενόμενο** mapping, που πρέπει να επιβεβαιωθεί από το output:

| Company | CUSTOMER |
|---|---|
| `softoneCustomerId` | `TRDR` |
| `softoneCode` | `CODE` |
| `name` | `NAME` |
| `afm` | `AFM` |
| `doy` | `IRSDATA` |
| `address` | `ADDRESS` |
| `city` | `CITY` |
| `postalCode` | `ZIP` |
| `country` | `COUNTRY` |
| `phone` | `PHONE01` |
| `email` | `EMAIL` |
| `website` | `WEBPAGE` |

Αν κάποιο δεν υπάρχει στο output, χρησιμοποίησε το πραγματικό όνομα και ενημέρωσε τον πίνακα.

- [ ] **Step 4: Commit**

```bash
git add scripts/probe-softone-customer.ts docs/superpowers/plans/2026-07-29-companies-contacts.md
git commit -m "chore(softone): add CUSTOMER field probe script"
```

---

### Task 2: Validation ΑΦΜ

**Files:**
- Create: `lib/companies/afm.ts`
- Test: `lib/companies/__tests__/afm.test.ts`

- [ ] **Step 1: Γράψε το failing test**

```ts
// lib/companies/__tests__/afm.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAfm, isValidAfm } from '../afm'

test('normalizeAfm αφαιρεί κενά, παύλες και prefix EL/GR', () => {
  assert.equal(normalizeAfm(' 094014201 '), '094014201')
  assert.equal(normalizeAfm('EL094014201'), '094014201')
  assert.equal(normalizeAfm('el-094-014-201'), '094014201')
})

test('isValidAfm δέχεται έγκυρα ΑΦΜ', () => {
  // Πραγματικά έγκυρα κατά checksum ΓΓΠΣ
  assert.equal(isValidAfm('094014201'), true)
  assert.equal(isValidAfm('997276654'), true)
})

test('isValidAfm απορρίπτει λάθος checksum', () => {
  assert.equal(isValidAfm('094014202'), false)
  assert.equal(isValidAfm('123456789'), false)
})

test('isValidAfm απορρίπτει λάθος μήκος ή μη-ψηφία', () => {
  assert.equal(isValidAfm('12345678'), false)
  assert.equal(isValidAfm('1234567890'), false)
  assert.equal(isValidAfm('09401420A'), false)
  assert.equal(isValidAfm(''), false)
})

test('isValidAfm απορρίπτει το 000000000', () => {
  assert.equal(isValidAfm('000000000'), false)
})
```

- [ ] **Step 2: Τρέξε το test για να δεις ότι αποτυγχάνει**

Run: `npx tsx --test lib/companies/__tests__/afm.test.ts`
Expected: FAIL — `Cannot find module '../afm'`

- [ ] **Step 3: Υλοποίησε**

```ts
// lib/companies/afm.ts

/**
 * Καθαρίζει ένα ΑΦΜ όπως το πληκτρολογεί ο χρήστης: κενά, παύλες, τελείες
 * και το προαιρετικό EL/GR prefix του VIES.
 */
export function normalizeAfm(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/^(EL|GR)/, '')
    .replace(/[^0-9]/g, '')
}

/**
 * Έλεγχος εγκυρότητας ΑΦΜ με τον αλγόριθμο checksum της ΓΓΠΣ:
 * τα 8 πρώτα ψηφία σταθμίζονται με 2^8…2^1, το άθροισμα mod 11 mod 10
 * πρέπει να ισούται με το 9ο ψηφίο.
 *
 * Δέχεται ήδη-normalized ή ακατέργαστη είσοδο.
 */
export function isValidAfm(input: string): boolean {
  const afm = normalizeAfm(input)
  if (!/^\d{9}$/.test(afm)) return false
  if (afm === '000000000') return false

  let sum = 0
  for (let i = 0; i < 8; i++) {
    sum += Number(afm[i]) * 2 ** (8 - i)
  }
  return (sum % 11) % 10 === Number(afm[8])
}
```

- [ ] **Step 4: Τρέξε τα tests**

Run: `npx tsx --test lib/companies/__tests__/afm.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add lib/companies/afm.ts lib/companies/__tests__/afm.test.ts
git commit -m "feat(companies): add Greek AFM normalization and checksum validation"
```

---

### Task 3: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Πρόσθεσε enums και models**

Στο `prisma/schema.prisma`, κοντά στα υπόλοιπα enums:

```prisma
enum CompanySource {
  manual
  softone
}

enum ProjectCompanyRole {
  partner
  subcontractor
  consultant
  other
}
```

Και τα models (μετά το `model User`):

```prisma
/// Πελάτης/εταιρία. Φυσικό κλειδί το ΑΦΜ. Η σύνδεση με SoftOne είναι
/// προαιρετική — εταιρία που δεν υπάρχει στο ERP είναι πλήρως έγκυρη.
model Company {
  id   String @id @default(cuid())
  afm  String @unique
  name String

  /// CUSTOMER.TRDR. Null = υπάρχει μόνο τοπικά.
  softoneCustomerId Int?          @unique
  softoneCode       String?
  softoneSyncedAt   DateTime?
  source            CompanySource @default(manual)

  doy        String?
  address    String?
  city       String?
  postalCode String?
  country    String?  @default("GR")
  phone      String?
  email      String?
  website    String?
  notes      String?  @db.Text
  isActive   Boolean  @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  contacts        Contact[]
  users           User[]
  primaryProjects Project[]        @relation("ProjectPrimaryCompany")
  projectRoles    ProjectCompany[]

  @@index([name])
  @@index([isActive])
}

/// Επαφή εταιρίας. Μπορεί προαιρετικά να αποκτήσει λογαριασμό (userId).
model Contact {
  id        String  @id @default(cuid())
  companyId String
  firstName String
  lastName  String
  email     String?
  phone     String?
  mobile    String?
  jobTitle  String?
  isPrimary Boolean @default(false)
  notes     String? @db.Text
  userId    String? @unique

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user    User?   @relation("ContactUser", fields: [userId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([companyId])
  @@index([email])
}

/// Εταιρίες συσχετιζόμενες με έργο σε ρόλο ΕΚΤΟΣ πελάτη. Ο πελάτης είναι
/// το Project.primaryCompanyId — δεν διπλοεγγράφεται εδώ.
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

και στα indexes του `User`: `@@index([companyId])`

Στο `model Project` πρόσθεσε:

```prisma
  /// Ο πελάτης: πηγή του PRJC.TRDR και η μόνη εταιρία που βλέπει το έργο στο portal.
  primaryCompanyId String?
  primaryCompany   Company? @relation("ProjectPrimaryCompany", fields: [primaryCompanyId], references: [id], onDelete: SetNull)
  companies        ProjectCompany[]
```

και στα indexes του `Project`: `@@index([primaryCompanyId])`

- [ ] **Step 2: Δημιούργησε το migration (shadow-DB workaround)**

Το shadow DB είναι σπασμένο σε αυτό το project — γι' αυτό `--create-only` και μετά `deploy`.

Run:
```bash
npx prisma migrate dev --create-only --name companies_contacts
npx prisma migrate deploy
npx prisma generate
```
Expected: νέος φάκελος `prisma/migrations/*_companies_contacts/` με `CREATE TABLE Company/Contact/ProjectCompany` και `ALTER TABLE User ADD companyId`, `ALTER TABLE Project ADD primaryCompanyId`. Το `deploy` τυπώνει «All migrations have been successfully applied».

- [ ] **Step 3: Επιβεβαίωσε ότι ο client τυπάρει**

Run: `npx tsc --noEmit`
Expected: καθαρό (καμία χρήση των νέων models ακόμα).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add Company, Contact and ProjectCompany models"
```

---

### Task 4: Import εταιρίας από SoftOne με ΑΦΜ

**Files:**
- Create: `lib/companies/softone-import.ts`
- Test: `lib/companies/__tests__/softone-import.test.ts`

- [ ] **Step 1: Γράψε το failing test**

Το mapping δοκιμάζεται χωρίς δίκτυο· η `mapCustomerRecord` είναι καθαρή.

```ts
// lib/companies/__tests__/softone-import.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapCustomerRecord } from '../softone-import'

const FIXTURE = {
  TRDR: 1234,
  CODE: '30.00.0001',
  NAME: 'ΑΚΜΗ ΚΑΤΑΣΚΕΥΑΣΤΙΚΗ ΑΕ',
  AFM: '094014201',
  IRSDATA: 'ΦΑΕ ΑΘΗΝΩΝ',
  ADDRESS: 'ΛΕΩΦ. ΚΗΦΙΣΙΑΣ 100',
  CITY: 'ΑΘΗΝΑ',
  ZIP: '11526',
  COUNTRY: 'ΕΛΛΑΔΑ',
  PHONE01: '2101234567',
  EMAIL: 'info@akmi.gr',
  WEBPAGE: 'https://akmi.gr',
}

test('mapCustomerRecord αντιστοιχεί τα πεδία του CUSTOMER', () => {
  const d = mapCustomerRecord(FIXTURE)
  assert.equal(d.softoneCustomerId, 1234)
  assert.equal(d.softoneCode, '30.00.0001')
  assert.equal(d.name, 'ΑΚΜΗ ΚΑΤΑΣΚΕΥΑΣΤΙΚΗ ΑΕ')
  assert.equal(d.afm, '094014201')
  assert.equal(d.doy, 'ΦΑΕ ΑΘΗΝΩΝ')
  assert.equal(d.city, 'ΑΘΗΝΑ')
  assert.equal(d.postalCode, '11526')
  assert.equal(d.source, 'softone')
})

test('mapCustomerRecord μετατρέπει κενά σε null', () => {
  const d = mapCustomerRecord({ TRDR: 7, NAME: 'Χ', AFM: '094014201', CITY: '   ', EMAIL: '' })
  assert.equal(d.city, null)
  assert.equal(d.email, null)
  assert.equal(d.address, null)
})

test('mapCustomerRecord κανονικοποιεί το ΑΦΜ', () => {
  const d = mapCustomerRecord({ TRDR: 7, NAME: 'Χ', AFM: 'EL 094-014-201' })
  assert.equal(d.afm, '094014201')
})
```

- [ ] **Step 2: Τρέξε το test για να δεις ότι αποτυγχάνει**

Run: `npx tsx --test lib/companies/__tests__/softone-import.test.ts`
Expected: FAIL — `Cannot find module '../softone-import'`

- [ ] **Step 3: Υλοποίησε**

Αν το Task 1 έδειξε διαφορετικά ονόματα πεδίων, διόρθωσε το `FIELDS` object — είναι το μόνο σημείο που τα ξέρει.

```ts
// lib/companies/softone-import.ts
import { s1 } from '@/lib/softone'
import { softoneLookup } from '@/lib/softone-lookup'
import { normalizeAfm } from './afm'

/** Ό,τι μπορούμε να γεμίσουμε αυτόματα σε μια νέα Company. */
export type CompanyDraft = {
  afm: string
  name: string
  softoneCustomerId: number | null
  softoneCode: string | null
  source: 'softone'
  doy: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  country: string | null
  phone: string | null
  email: string | null
  website: string | null
}

/** Ονόματα πεδίων του SoftOne CUSTOMER — επιβεβαιωμένα με scripts/probe-softone-customer.ts */
const FIELDS = {
  trdr: 'TRDR',
  code: 'CODE',
  name: 'NAME',
  afm: 'AFM',
  doy: 'IRSDATA',
  address: 'ADDRESS',
  city: 'CITY',
  postalCode: 'ZIP',
  country: 'COUNTRY',
  phone: 'PHONE01',
  email: 'EMAIL',
  website: 'WEBPAGE',
} as const

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Καθαρή μετατροπή ενός CUSTOMER record σε CompanyDraft. Καμία I/O. */
export function mapCustomerRecord(rec: Record<string, unknown>): CompanyDraft {
  return {
    afm: normalizeAfm(String(rec[FIELDS.afm] ?? '')),
    name: str(rec[FIELDS.name]) ?? '',
    softoneCustomerId: num(rec[FIELDS.trdr]),
    softoneCode: str(rec[FIELDS.code]),
    source: 'softone',
    doy: str(rec[FIELDS.doy]),
    address: str(rec[FIELDS.address]),
    city: str(rec[FIELDS.city]),
    postalCode: str(rec[FIELDS.postalCode]),
    country: str(rec[FIELDS.country]),
    phone: str(rec[FIELDS.phone]),
    email: str(rec[FIELDS.email]),
    website: str(rec[FIELDS.website]),
  }
}

/**
 * Ψάχνει CUSTOMER με το δοσμένο ΑΦΜ και επιστρέφει πλήρη draft.
 *
 * `null` σημαίνει «δεν υπάρχει στο ERP» — ΔΕΝ είναι σφάλμα· ο χρήστης
 * συνεχίζει με χειροκίνητη καταχώριση. Πρόβλημα επικοινωνίας με το SoftOne
 * πετάει exception ώστε να ξεχωρίζει από το «δεν βρέθηκε».
 */
export async function lookupCompanyByAfm(afmInput: string): Promise<CompanyDraft | null> {
  const afm = normalizeAfm(afmInput)
  if (!/^\d{9}$/.test(afm)) return null

  const rows = await softoneLookup({ source: 'customer', q: afm, limit: 1 })
  if (!rows.length) return null

  const res = await s1('getData', { OBJECT: 'CUSTOMER', KEY: String(rows[0].id) })
  if (!res.success) {
    throw new Error(`SoftOne getData CUSTOMER απέτυχε: ${res.error ?? 'άγνωστο'} (code ${res.errorcode ?? '-'})`)
  }

  const rec = res.data?.CUSTOMER?.[0] as Record<string, unknown> | undefined
  if (!rec) return null

  const draft = mapCustomerRecord(rec)
  // Το browser row είναι πιο αξιόπιστο για TRDR/CODE/NAME από το getData.
  return {
    ...draft,
    afm: draft.afm || afm,
    name: draft.name || rows[0].name,
    softoneCustomerId: draft.softoneCustomerId ?? rows[0].id,
    softoneCode: draft.softoneCode ?? (rows[0].code || null),
  }
}
```

- [ ] **Step 4: Τρέξε τα tests**

Run: `npx tsx --test lib/companies/__tests__/softone-import.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add lib/companies/softone-import.ts lib/companies/__tests__/softone-import.test.ts
git commit -m "feat(companies): look up company details from SoftOne CUSTOMER by AFM"
```

---

### Task 5: Server actions εταιριών και επαφών

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
import { isValidAfm, normalizeAfm } from '@/lib/companies/afm'
import { lookupCompanyByAfm } from '@/lib/companies/softone-import'

async function requireAdmin(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== 'admin') {
    throw new Error('Μόνο διαχειριστές.')
  }
  return session.user.id
}

export type CompanyInput = {
  afm: string
  name: string
  doy?: string | null
  address?: string | null
  city?: string | null
  postalCode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  notes?: string | null
  softoneCustomerId?: number | null
  softoneCode?: string | null
}

/** Αναζήτηση στο SoftOne. `found:false` = δεν υπάρχει στο ERP, όχι σφάλμα. */
export async function lookupCompany(afmInput: string) {
  await requireAdmin()
  const afm = normalizeAfm(afmInput)
  if (!isValidAfm(afm)) {
    return { ok: false as const, error: 'Μη έγκυρο ΑΦΜ (αποτυγχάνει ο έλεγχος ψηφίου ελέγχου).' }
  }
  const existing = await prisma.company.findUnique({ where: { afm }, select: { id: true, name: true } })
  if (existing) {
    return { ok: false as const, error: `Η εταιρία «${existing.name}» έχει ήδη αυτό το ΑΦΜ.`, existingId: existing.id }
  }
  try {
    const draft = await lookupCompanyByAfm(afm)
    return draft
      ? { ok: true as const, found: true as const, draft }
      : { ok: true as const, found: false as const, draft: null }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'Σφάλμα επικοινωνίας με SoftOne.' }
  }
}

export async function createCompany(input: CompanyInput) {
  await requireAdmin()
  const afm = normalizeAfm(input.afm)
  if (!isValidAfm(afm)) return { ok: false as const, error: 'Μη έγκυρο ΑΦΜ.' }
  const name = input.name.trim()
  if (name.length < 2) return { ok: false as const, error: 'Η επωνυμία είναι πολύ σύντομη.' }
  if (await prisma.company.findUnique({ where: { afm } })) {
    return { ok: false as const, error: 'Υπάρχει ήδη εταιρία με αυτό το ΑΦΜ.' }
  }

  const company = await prisma.company.create({
    data: {
      afm,
      name,
      doy: input.doy?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      country: input.country?.trim() || 'GR',
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      website: input.website?.trim() || null,
      notes: input.notes?.trim() || null,
      softoneCustomerId: input.softoneCustomerId ?? null,
      softoneCode: input.softoneCode?.trim() || null,
      source: input.softoneCustomerId ? 'softone' : 'manual',
      softoneSyncedAt: input.softoneCustomerId ? new Date() : null,
    },
  })
  revalidatePath('/admin/companies')
  return { ok: true as const, id: company.id }
}

export async function updateCompany(id: string, input: Omit<CompanyInput, 'afm'>) {
  await requireAdmin()
  const name = input.name.trim()
  if (name.length < 2) return { ok: false as const, error: 'Η επωνυμία είναι πολύ σύντομη.' }
  await prisma.company.update({
    where: { id },
    data: {
      name,
      doy: input.doy?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      country: input.country?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      website: input.website?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  })
  revalidatePath('/admin/companies')
  revalidatePath(`/admin/companies/${id}`)
  return { ok: true as const }
}

export async function setCompanyActive(id: string, isActive: boolean) {
  await requireAdmin()
  await prisma.company.update({ where: { id }, data: { isActive } })
  revalidatePath('/admin/companies')
  return { ok: true as const }
}

/** Ξαναδιαβάζει στοιχεία από το SoftOne για συνδεδεμένη εταιρία. */
export async function refreshFromSoftOne(id: string) {
  await requireAdmin()
  const company = await prisma.company.findUnique({ where: { id } })
  if (!company) return { ok: false as const, error: 'Δεν βρέθηκε η εταιρία.' }
  try {
    const draft = await lookupCompanyByAfm(company.afm)
    if (!draft) return { ok: false as const, error: 'Δεν βρέθηκε στο SoftOne με αυτό το ΑΦΜ.' }
    await prisma.company.update({
      where: { id },
      data: {
        name: draft.name || company.name,
        doy: draft.doy,
        address: draft.address,
        city: draft.city,
        postalCode: draft.postalCode,
        country: draft.country,
        phone: draft.phone,
        email: draft.email,
        website: draft.website,
        softoneCustomerId: draft.softoneCustomerId,
        softoneCode: draft.softoneCode,
        source: 'softone',
        softoneSyncedAt: new Date(),
      },
    })
    revalidatePath(`/admin/companies/${id}`)
    return { ok: true as const }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'Σφάλμα SoftOne.' }
  }
}

export type ContactInput = {
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  mobile?: string | null
  jobTitle?: string | null
  isPrimary?: boolean
  notes?: string | null
}

export async function createContact(companyId: string, input: ContactInput) {
  await requireAdmin()
  if (!input.firstName.trim() || !input.lastName.trim()) {
    return { ok: false as const, error: 'Όνομα και επώνυμο είναι υποχρεωτικά.' }
  }
  await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.contact.updateMany({ where: { companyId }, data: { isPrimary: false } })
    }
    await tx.contact.create({
      data: {
        companyId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        mobile: input.mobile?.trim() || null,
        jobTitle: input.jobTitle?.trim() || null,
        isPrimary: Boolean(input.isPrimary),
        notes: input.notes?.trim() || null,
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
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        mobile: input.mobile?.trim() || null,
        jobTitle: input.jobTitle?.trim() || null,
        isPrimary: Boolean(input.isPrimary),
        notes: input.notes?.trim() || null,
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
 * Δίνει λογαριασμό portal σε μια επαφή. Χρησιμοποιεί τη ροή προσωρινού κωδικού
 * (mustChangePassword) που ήδη υπάρχει — ο κωδικός επιστρέφεται ΜΙΑ φορά.
 */
export async function promoteContactToUser(contactId: string) {
  await requireAdmin()
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { company: { select: { id: true, name: true, afm: true, softoneCustomerId: true } } },
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
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        password: await bcrypt.hash(tempPassword, 10),
        mustChangePassword: true,
        role: 'viewer',
        userType: 'customer',
        companyId: contact.company.id,
        companyName: contact.company.name,
        companyAfm: contact.company.afm,
        softoneCustomerId: contact.company.softoneCustomerId,
      },
    })
    await tx.contact.update({ where: { id: contactId }, data: { userId: user.id } })
  })

  revalidatePath(`/admin/companies/${contact.company.id}`)
  revalidatePath('/admin/users')
  return { ok: true as const, email, tempPassword }
}
```

- [ ] **Step 2: Έλεγξε ότι τυπάρει**

Run: `npx tsc --noEmit`
Expected: καθαρό

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/admin/companies/actions.ts"
git commit -m "feat(companies): add admin server actions for companies and contacts"
```

---

### Task 6: Σελίδα λίστας εταιριών

**Files:**
- Create: `app/(app)/admin/companies/page.tsx`
- Create: `app/(app)/admin/companies/companies-client.tsx`

- [ ] **Step 1: Server page**

```tsx
// app/(app)/admin/companies/page.tsx
import { prisma } from '@/lib/prisma'
import { CompaniesClient } from './companies-client'

export const dynamic = 'force-dynamic'

export default async function CompaniesPage() {
  // Admin gate enforced by app/(app)/admin/layout.tsx
  const companies = await prisma.company.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      afm: true,
      name: true,
      city: true,
      isActive: true,
      softoneCustomerId: true,
      _count: { select: { contacts: true, users: true, primaryProjects: true } },
    },
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-fluent-neutral-90">Εταιρίες</h1>
      <p className="text-sm text-fluent-neutral-60 mt-1 mb-6">
        Πελάτες και συνεργαζόμενες εταιρίες. Η καταχώριση στο SoftOne δεν είναι υποχρεωτική —
        εταιρία μπορεί να υπάρχει μόνο εδώ.
      </p>
      <CompaniesClient
        companies={companies.map((c) => ({
          id: c.id,
          afm: c.afm,
          name: c.name,
          city: c.city,
          isActive: c.isActive,
          linkedToSoftOne: c.softoneCustomerId !== null,
          contactCount: c._count.contacts,
          userCount: c._count.users,
          projectCount: c._count.primaryProjects,
        }))}
      />
    </div>
  )
}
```

- [ ] **Step 2: Client λίστας + φόρμα δημιουργίας**

```tsx
// app/(app)/admin/companies/companies-client.tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { lookupCompany, createCompany } from './actions'

type Row = {
  id: string
  afm: string
  name: string
  city: string | null
  isActive: boolean
  linkedToSoftOne: boolean
  contactCount: number
  userCount: number
  projectCount: number
}

const EMPTY = {
  afm: '', name: '', doy: '', address: '', city: '', postalCode: '',
  country: 'GR', phone: '', email: '', website: '', notes: '',
}

export function CompaniesClient({ companies }: { companies: Row[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [softoneId, setSoftoneId] = useState<number | null>(null)
  const [softoneCode, setSoftoneCode] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return companies
    return companies.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.afm.includes(needle),
    )
  }, [companies, q])

  async function onLookup() {
    setBusy(true); setError(''); setStatus('')
    const res = await lookupCompany(form.afm)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    if (!res.found) {
      setStatus('Δεν βρέθηκε στο SoftOne — συμπλήρωσε τα στοιχεία χειροκίνητα.')
      setSoftoneId(null); setSoftoneCode(null)
      return
    }
    const d = res.draft!
    setForm({
      afm: d.afm, name: d.name, doy: d.doy ?? '', address: d.address ?? '',
      city: d.city ?? '', postalCode: d.postalCode ?? '', country: d.country ?? 'GR',
      phone: d.phone ?? '', email: d.email ?? '', website: d.website ?? '', notes: '',
    })
    setSoftoneId(d.softoneCustomerId); setSoftoneCode(d.softoneCode)
    setStatus('Βρέθηκε στο SoftOne — τα πεδία συμπληρώθηκαν.')
  }

  async function onCreate() {
    setBusy(true); setError('')
    const res = await createCompany({ ...form, softoneCustomerId: softoneId, softoneCode })
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setCreating(false); setForm({ ...EMPTY }); setSoftoneId(null); setSoftoneCode(null); setStatus('')
    router.push(`/admin/companies/${res.id}`)
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
          placeholder="Αναζήτηση με επωνυμία ή ΑΦΜ…"
          className="flex-1 h-9 px-3 rounded-md border border-black/10 text-sm"
        />
        <Button onClick={() => setCreating((v) => !v)}>
          {creating ? 'Άκυρο' : 'Νέα εταιρία'}
        </Button>
      </div>

      {creating && (
        <div className="mb-6 rounded-lg border border-black/10 bg-white p-4 space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">ΑΦΜ</label>
              <input
                value={form.afm}
                onChange={(e) => setForm({ ...form, afm: e.target.value })}
                className="w-full h-9 px-3 rounded-md border border-black/10 text-sm font-mono"
              />
            </div>
            <Button onClick={onLookup} disabled={busy || !form.afm.trim()} variant="secondary">
              Αναζήτηση
            </Button>
          </div>

          {status && <p className="text-xs text-fluent-neutral-70">{status}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            {field('name', 'Επωνυμία')}
            {field('doy', 'ΔΟΥ')}
            {field('address', 'Διεύθυνση')}
            {field('city', 'Πόλη')}
            {field('postalCode', 'Τ.Κ.')}
            {field('country', 'Χώρα')}
            {field('phone', 'Τηλέφωνο')}
            {field('email', 'Email')}
            {field('website', 'Website')}
          </div>

          <Button onClick={onCreate} disabled={busy || !form.name.trim() || !form.afm.trim()}>
            Αποθήκευση
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-black/10 bg-white divide-y divide-black/5">
        {filtered.length === 0 && (
          <p className="p-6 text-sm text-fluent-neutral-60 text-center">Καμία εταιρία.</p>
        )}
        {filtered.map((c) => (
          <Link
            key={c.id}
            href={`/admin/companies/${c.id}`}
            className="flex items-center gap-4 px-4 py-3 hover:bg-black/[0.02]"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-fluent-neutral-90 truncate">
                {c.name}
                {!c.isActive && <span className="ml-2 text-xs text-fluent-neutral-50">(ανενεργή)</span>}
              </p>
              <p className="text-xs text-fluent-neutral-60 font-mono">
                {c.afm}{c.city ? ` · ${c.city}` : ''}
              </p>
            </div>
            <span
              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                c.linkedToSoftOne ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'bg-black/5 text-fluent-neutral-60'
              }`}
            >
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

- [ ] **Step 3: Πρόσθεσε το link στο admin nav**

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
Expected: καθαρά. Άνοιξε `/admin/companies` — η λίστα φορτώνει κενή, το «Νέα εταιρία» ανοίγει τη φόρμα.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/admin/companies" components/layout/sidebar.tsx
git commit -m "feat(companies): add admin company list with AFM lookup and creation"
```

---

### Task 7: Καρτέλα εταιρίας με επαφές

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
      contacts: { orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }] },
      users: { select: { id: true, name: true, email: true, role: true } },
      primaryProjects: { select: { id: true, name: true, status: true }, orderBy: { name: 'asc' } },
      projectRoles: {
        select: { id: true, role: true, project: { select: { id: true, name: true } } },
      },
    },
  })
  if (!company) notFound()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <CompanyDetailClient
        company={{
          id: company.id,
          afm: company.afm,
          name: company.name,
          doy: company.doy,
          address: company.address,
          city: company.city,
          postalCode: company.postalCode,
          country: company.country,
          phone: company.phone,
          email: company.email,
          website: company.website,
          notes: company.notes,
          isActive: company.isActive,
          linkedToSoftOne: company.softoneCustomerId !== null,
          softoneCode: company.softoneCode,
        }}
        contacts={company.contacts.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          mobile: c.mobile,
          jobTitle: c.jobTitle,
          isPrimary: c.isPrimary,
          notes: c.notes,
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
  updateCompany, setCompanyActive, refreshFromSoftOne,
  createContact, updateContact, deleteContact, promoteContactToUser,
} from '../actions'

type Company = {
  id: string; afm: string; name: string; doy: string | null; address: string | null
  city: string | null; postalCode: string | null; country: string | null
  phone: string | null; email: string | null; website: string | null
  notes: string | null; isActive: boolean; linkedToSoftOne: boolean; softoneCode: string | null
}
type Contact = {
  id: string; firstName: string; lastName: string; email: string | null
  phone: string | null; mobile: string | null; jobTitle: string | null
  isPrimary: boolean; notes: string | null; hasLogin: boolean
}
type UserRow = { id: string; name: string | null; email: string; role: string }
type ProjectRow = { id: string; name: string; status: string }
type RoleRow = { id: string; role: string; projectId: string; projectName: string }

const ROLE_LABEL: Record<string, string> = {
  partner: 'Συνεργάτης',
  subcontractor: 'Υπεργολάβος',
  consultant: 'Σύμβουλος',
  other: 'Άλλο',
}

const EMPTY_CONTACT = {
  firstName: '', lastName: '', email: '', phone: '', mobile: '',
  jobTitle: '', isPrimary: false, notes: '',
}

export function CompanyDetailClient({
  company, contacts, users, clientProjects, roleProjects,
}: {
  company: Company; contacts: Contact[]; users: UserRow[]
  clientProjects: ProjectRow[]; roleProjects: RoleRow[]
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: company.name, doy: company.doy ?? '', address: company.address ?? '',
    city: company.city ?? '', postalCode: company.postalCode ?? '', country: company.country ?? '',
    phone: company.phone ?? '', email: company.email ?? '', website: company.website ?? '',
    notes: company.notes ?? '',
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
          <h1 className="text-2xl font-semibold text-fluent-neutral-90">{company.name}</h1>
          <span
            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
              company.linkedToSoftOne ? 'bg-fluent-blue-50 text-fluent-blue-700' : 'bg-black/5 text-fluent-neutral-60'
            }`}
          >
            {company.linkedToSoftOne ? `SoftOne ${company.softoneCode ?? ''}` : 'Τοπική'}
          </span>
        </div>
        <p className="text-sm text-fluent-neutral-60 font-mono mt-1">ΑΦΜ {company.afm}</p>
      </div>

      {message && <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">{message}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

      {/* Στοιχεία */}
      <section className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-fluent-neutral-90">Στοιχεία</h2>
          <div className="flex gap-2">
            {company.linkedToSoftOne && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => run(() => refreshFromSoftOne(company.id), () => setMessage('Ενημερώθηκε από SoftOne.'))}
              >
                Επαναφόρτωση από SoftOne
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => setCompanyActive(company.id, !company.isActive))}
            >
              {company.isActive ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field('name', 'Επωνυμία')}
          {field('doy', 'ΔΟΥ')}
          {field('address', 'Διεύθυνση')}
          {field('city', 'Πόλη')}
          {field('postalCode', 'Τ.Κ.')}
          {field('country', 'Χώρα')}
          {field('phone', 'Τηλέφωνο')}
          {field('email', 'Email')}
          {field('website', 'Website')}
        </div>
        <Button
          className="mt-3"
          disabled={busy}
          onClick={() => run(() => updateCompany(company.id, form), () => setMessage('Αποθηκεύτηκε.'))}
        >
          Αποθήκευση
        </Button>
      </section>

      {/* Επαφές */}
      <section className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-fluent-neutral-90">Επαφές</h2>
          <Button
            variant="secondary"
            onClick={() => { setAddingContact((v) => !v); setContactForm({ ...EMPTY_CONTACT }); setEditingContact(null) }}
          >
            {addingContact ? 'Άκυρο' : 'Νέα επαφή'}
          </Button>
        </div>

        {(addingContact || editingContact) && (
          <div className="mb-4 rounded-md bg-black/[0.02] p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {cField('firstName', 'Όνομα')}
              {cField('lastName', 'Επώνυμο')}
              {cField('email', 'Email')}
              {cField('jobTitle', 'Θέση')}
              {cField('phone', 'Τηλέφωνο')}
              {cField('mobile', 'Κινητό')}
            </div>
            <label className="flex items-center gap-2 text-xs text-fluent-neutral-70">
              <input
                type="checkbox"
                checked={contactForm.isPrimary}
                onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
              />
              Κύρια επαφή
            </label>
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  () => editingContact
                    ? updateContact(editingContact, contactForm)
                    : createContact(company.id, contactForm),
                  () => { setAddingContact(false); setEditingContact(null); setContactForm({ ...EMPTY_CONTACT }) },
                )
              }
            >
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
                  {c.firstName} {c.lastName}
                  {c.isPrimary && <span className="ml-2 text-[10px] uppercase font-semibold text-fluent-blue-700">κύρια</span>}
                </p>
                <p className="text-xs text-fluent-neutral-60">
                  {[c.jobTitle, c.email, c.phone || c.mobile].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              {c.hasLogin ? (
                <span className="text-[10px] uppercase font-semibold text-green-700">έχει λογαριασμό</span>
              ) : (
                <Button
                  variant="secondary"
                  disabled={busy || !c.email}
                  onClick={() =>
                    run(
                      () => promoteContactToUser(c.id),
                      (r: any) => setMessage(`Λογαριασμός: ${r.email} — προσωρινός κωδικός: ${r.tempPassword} (εμφανίζεται μία φορά)`),
                    )
                  }
                >
                  Δώσε πρόσβαση
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  setEditingContact(c.id); setAddingContact(false)
                  setContactForm({
                    firstName: c.firstName, lastName: c.lastName, email: c.email ?? '',
                    phone: c.phone ?? '', mobile: c.mobile ?? '', jobTitle: c.jobTitle ?? '',
                    isPrimary: c.isPrimary, notes: c.notes ?? '',
                  })
                }}
              >
                Επεξεργασία
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => run(() => deleteContact(c.id))}>
                Διαγραφή
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Έργα & χρήστες */}
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

Δοκίμασε στο `/admin/companies`: δημιούργησε εταιρία με ΑΦΜ (με και χωρίς SoftOne match), πρόσθεσε επαφή, δώσε της πρόσβαση, επιβεβαίωσε ότι εμφανίζεται ο προσωρινός κωδικός μία φορά και ότι ο χρήστης υπάρχει στο `/admin/users`.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/admin/companies/[id]"
git commit -m "feat(companies): add company detail page with contacts and access granting"
```

---

### Task 8: Backfill υπαρχόντων εταιριών από τους χρήστες

**Files:**
- Create: `prisma/migrations/<timestamp>_backfill_companies/migration.sql`

- [ ] **Step 1: Δημιούργησε κενό migration**

Run: `npx prisma migrate dev --create-only --name backfill_companies`
Expected: νέος φάκελος με κενό (ή σχεδόν κενό) `migration.sql`.

- [ ] **Step 2: Γράψε το SQL**

Αντικατέστησε το περιεχόμενο του `migration.sql`:

```sql
-- Μία Company ανά διακριτό ΑΦΜ που υπάρχει σήμερα στους χρήστες.
-- Το ΑΦΜ είναι το φυσικό κλειδί· κρατάμε το πρώτο companyName/softoneCustomerId
-- που συναντάμε (MIN) ως αντιπροσωπευτικό.
INSERT INTO `Company` (`id`, `afm`, `name`, `softoneCustomerId`, `source`, `country`, `isActive`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('cmp_', LOWER(HEX(RANDOM_BYTES(12)))),
  u.`companyAfm`,
  COALESCE(MIN(u.`companyName`), u.`companyAfm`),
  MIN(u.`softoneCustomerId`),
  CASE WHEN MIN(u.`softoneCustomerId`) IS NULL THEN 'manual' ELSE 'softone' END,
  'GR',
  1,
  NOW(3),
  NOW(3)
FROM `User` u
WHERE u.`companyAfm` IS NOT NULL
  AND u.`companyAfm` <> ''
  AND NOT EXISTS (SELECT 1 FROM `Company` c WHERE c.`afm` = u.`companyAfm`)
GROUP BY u.`companyAfm`;

-- Σύνδεσε κάθε χρήστη με την εταιρία του ΑΦΜ του.
UPDATE `User` u
JOIN `Company` c ON c.`afm` = u.`companyAfm`
SET u.`companyId` = c.`id`
WHERE u.`companyId` IS NULL;

-- Ο πελάτης κάθε έργου προκύπτει από την εταιρία της επαφής-πελάτη.
UPDATE `Project` p
JOIN `User` u ON u.`id` = p.`customerUserId`
SET p.`primaryCompanyId` = u.`companyId`
WHERE p.`primaryCompanyId` IS NULL
  AND u.`companyId` IS NOT NULL;
```

Σημείωση: το `NOT EXISTS` κάνει το migration idempotent — μπορεί να ξανατρέξει χωρίς διπλοεγγραφές.

- [ ] **Step 3: Εφάρμοσε**

Run: `npx prisma migrate deploy`
Expected: «All migrations have been successfully applied».

- [ ] **Step 4: Επαλήθευσε τα δεδομένα**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT
  (SELECT COUNT(*) FROM Company) AS companies,
  (SELECT COUNT(DISTINCT companyAfm) FROM User WHERE companyAfm IS NOT NULL AND companyAfm <> '') AS distinct_afms,
  (SELECT COUNT(*) FROM User WHERE companyAfm IS NOT NULL AND companyAfm <> '' AND companyId IS NULL) AS unlinked_users,
  (SELECT COUNT(*) FROM Project WHERE customerUserId IS NOT NULL AND primaryCompanyId IS NULL) AS unlinked_projects;
SQL
```
Expected: `companies` = `distinct_afms`, `unlinked_users` = 0. Το `unlinked_projects` μπορεί να είναι > 0 μόνο αν κάποιο `customerUserId` δείχνει σε χρήστη χωρίς ΑΦΜ — έλεγξέ τα χειροκίνητα.

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations
git commit -m "feat(db): backfill companies from existing user company fields"
```

---

### Task 9: Στρέψε το SoftOne project sync στην κύρια εταιρία

**Files:**
- Modify: `lib/softone-contacts.ts:406-440`

- [ ] **Step 1: Άλλαξε την πηγή του TRDR**

Στη `syncProjectToSoftOne`, αντικατέστησε το block που διαβάζει τον πελάτη:

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
      select: { softoneCustomerId: true },
    })
  : null;
```

Η γραμμή `TRDR: customer?.softoneCustomerId ?? null,` μένει ως έχει.

- [ ] **Step 2: Έλεγξε**

Run: `npx tsc --noEmit`
Expected: καθαρό

- [ ] **Step 3: Commit**

```bash
git add lib/softone-contacts.ts
git commit -m "refactor(softone): source PRJC.TRDR from the project's primary company"
```

---

### Task 10: Πελάτης και συνεργαζόμενες εταιρίες στη φόρμα έργου

**Files:**
- Modify: `app/(app)/projects/project-form.tsx`
- Modify: `app/(app)/admin/companies/actions.ts` (νέα actions)

- [ ] **Step 1: Πρόσθεσε actions για τη σύνδεση έργου–εταιρίας**

Στο τέλος του `app/(app)/admin/companies/actions.ts`:

```ts
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

/** Λίστα εταιριών για pickers. Τοπική αναζήτηση, δεν αγγίζει SoftOne. */
export async function searchCompanies(q: string) {
  await requireAdmin()
  const needle = q.trim()
  const companies = await prisma.company.findMany({
    where: {
      isActive: true,
      ...(needle ? { OR: [{ name: { contains: needle } }, { afm: { contains: needle } }] } : {}),
    },
    select: { id: true, name: true, afm: true },
    orderBy: { name: 'asc' },
    take: 20,
  })
  return companies
}
```

- [ ] **Step 2: Πρόσθεσε το πεδίο πελάτη στη φόρμα έργου**

Προσοχή: το `Project.customerUserId` **δεν τίθεται σήμερα από καμία φόρμα** — μόνο διαβάζεται
(`app/(app)/projects/[id]/page.tsx:148`, `lib/softone-contacts.ts:418`). Άρα αυτό είναι ο
πρώτος τρόπος να οριστεί πελάτης έργου από το UI· δεν αντικαθιστά υπάρχον πεδίο.

Στο `app/(app)/projects/project-form.tsx`:

Πρόσθεσε στον τύπο `ProjectFormInitial`:

```ts
  primaryCompanyId?: string | null;
```

Πρόσθεσε στα props του component ένα `companies` array (πέρασέ το από τον caller, ίδιο
pattern με το υπάρχον `users`):

```ts
export type CompanyOption = { id: string; name: string; afm: string };
```

Πρόσθεσε state δίπλα στα υπόλοιπα `useState`:

```ts
  const [primaryCompanyId, setPrimaryCompanyId] = useState(initial?.primaryCompanyId ?? '');
```

Και το πεδίο αμέσως μετά το block «Ιδιοκτήτης» (ίδιο ακριβώς styling με το `ownerId` select):

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
            <option key={c.id} value={c.id}>{c.name} ({c.afm})</option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-fluent-neutral-60">
          Καθορίζει το <code>PRJC.TRDR</code> στο SoftOne και ποιος βλέπει το έργο στο portal πελατών.
        </p>
      </div>
```

Στον caller της φόρμας, φόρτωσε τις εταιρίες:

```ts
const companies = await prisma.company.findMany({
  where: { isActive: true },
  select: { id: true, name: true, afm: true },
  orderBy: { name: 'asc' },
});
```

Στο server action που αποθηκεύει το έργο, διάβασε και πέρασε το πεδίο:

```ts
  const primaryCompanyId = String(formData.get('primaryCompanyId') ?? '').trim() || null;
```

και πρόσθεσέ το στο `data` του `prisma.project.create` / `prisma.project.update`:

```ts
    primaryCompanyId,
```

- [ ] **Step 3: Επαλήθευσε**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά. Δημιούργησε έργο με πελάτη, δες ότι εμφανίζεται στην καρτέλα της εταιρίας ως «πελάτης».

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/projects/project-form.tsx" "app/(app)/admin/companies/actions.ts"
git commit -m "feat(projects): associate a project with a client company and roled partners"
```

---

### Task 11: Στρέψε τη διαχείριση χρηστών στη σχέση εταιρίας

**Files:**
- Modify: `app/(app)/admin/users/page.tsx`
- Modify: `app/(app)/admin/users/actions.ts`
- Modify: `components/admin/user-management.tsx`

- [ ] **Step 1: Διάβασε την εταιρία μέσω σχέσης**

Στο `app/(app)/admin/users/page.tsx`, πρόσθεσε στο `select` του query:

```ts
        companyId: true,
        company: { select: { id: true, name: true, afm: true } },
```

και στο mapping που περνά στο `user-management`:

```ts
    companyId: u.companyId,
    companyLabel: u.company ? `${u.company.name} (${u.company.afm})` : null,
```

- [ ] **Step 2: Αποθήκευσε companyId**

Στο `app/(app)/admin/users/actions.ts`, στη συνάρτηση που διαβάζει το form payload, πρόσθεσε:

```ts
  const companyId = String(formData.get('companyId') ?? '').trim() || null;
```

και πέρασέ το στο data object του create/update μαζί με τα υπάρχοντα πεδία:

```ts
    companyId,
```

Τα υπάρχοντα `companyName` / `companyAfm` **μένουν** — γράφονται ακόμα ως denormalized αντίγραφα για μία έκδοση. Αν υπάρχει `companyId`, γέμισέ τα από την εταιρία:

```ts
  if (companyId) {
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, afm: true, softoneCustomerId: true },
    });
    if (c) {
      data.companyName = c.name;
      data.companyAfm = c.afm;
      if (safeType === 'customer') data.softoneCustomerId = c.softoneCustomerId;
    }
  }
```

- [ ] **Step 3: Δώσε στους customers picker τοπικής εταιρίας**

Στο `components/admin/user-management.tsx` (γραμμές ~426-452) υπάρχουν σήμερα δύο πεδία:
το «Εταιρεία (από SoftOne)» combobox και το «Α.Φ.Μ. εταιρείας (προαιρετικό override)» input.

Για `userType === 'customer'` αυτά αντικαθίστανται από επιλογή τοπικής εταιρίας. Για
employees/suppliers μένουν ως έχουν — το `SoftOneCompanyCombobox` **δεν διαγράφεται**.

Πρόσθεσε στα props του component:

```ts
  companies: { id: string; name: string; afm: string }[];
```

Και αντικατέστησε το block των δύο πεδίων με:

```tsx
        {userType === 'customer' ? (
          <div>
            <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">
              Εταιρία
            </label>
            <select
              name="companyId"
              defaultValue={initial?.companyId ?? ''}
              className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white"
            >
              <option value="">— καμία —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.afm})</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-fluent-neutral-60">
              Διαχείριση εταιριών και επαφών στο <code>/admin/companies</code>.
              Η επωνυμία και το ΑΦΜ συμπληρώνονται αυτόματα από την εταιρία.
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

Πρόσθεσε επίσης `companyId: string | null` στον τύπο της prop `initial` (γύρω στη γραμμή 40,
δίπλα στα `companyName` / `companyAfm`), και πέρασε τη λίστα εταιριών από το
`app/(app)/admin/users/page.tsx`:

```ts
    prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, name: true, afm: true },
      orderBy: { name: 'asc' },
    }),
```

- [ ] **Step 4: Επαλήθευσε**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά. Στο `/admin/users`, δημιούργησε customer χρήστη επιλέγοντας εταιρία και επιβεβαίωσε ότι εμφανίζεται στην καρτέλα της εταιρίας.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/admin/users" components/admin/user-management.tsx
git commit -m "feat(admin): link users to companies through the new relation"
```

---

### Task 12: Τελικός έλεγχος

- [ ] **Step 1: Όλα τα tests**

Run: `npx tsx --test lib/companies/__tests__/*.test.ts lib/tickets/__tests__/*.test.ts`
Expected: όλα PASS

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: καθαρά

- [ ] **Step 3: Έλεγχος ακεραιότητας δεδομένων**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT 'διπλά ΑΦΜ' AS check_name, COUNT(*) AS bad FROM (
  SELECT afm FROM Company GROUP BY afm HAVING COUNT(*) > 1
) x
UNION ALL
SELECT 'πελάτης διπλοεγγεγραμμένος ως συνεργάτης', COUNT(*) FROM ProjectCompany pc
  JOIN Project p ON p.id = pc.projectId AND p.primaryCompanyId = pc.companyId
UNION ALL
SELECT 'επαφές με userId που δεν υπάρχει', COUNT(*) FROM Contact c
  LEFT JOIN User u ON u.id = c.userId WHERE c.userId IS NOT NULL AND u.id IS NULL;
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

- **Δεν στέλνει εταιρίες στο SoftOne.** Τοπικές εταιρίες μένουν τοπικές (απόφαση spec).
- **Δεν αφαιρεί τα `User.companyName` / `companyAfm`.** Μένουν μία έκδοση ως denormalized αντίγραφα· η αφαίρεσή τους είναι ξεχωριστό follow-up.
- **Δεν αγγίζει το portal.** `app/(portal)/`, `lib/portal/scope.ts` και το `Comment.visibility` ανήκουν στη Φάση Β.
