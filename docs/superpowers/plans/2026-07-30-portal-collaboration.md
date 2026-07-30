# Portal Collaboration (Φάση Γ) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ο πελάτης να βλέπει και να ανεβάζει αρχεία όταν του ζητηθεί, να βλέπει την ομάδα του έργου με στοιχεία επικοινωνίας και αρμοδιότητες, και να ρωτάει συγκεκριμένο μέλος ή όλη την ομάδα.

**Architecture:** Τέσσερα ανεξάρτητα κομμάτια πάνω στα υπάρχοντα θεμέλια της Φάσης Β (`lib/portal/scope.ts`, `taskVisibilityFilter`). Κάθε νέα ροή περνά από το ίδιο scope — καμία δεν χτίζει δικό της έλεγχο πρόσβασης.

**Tech Stack:** Next.js App Router, Prisma/MySQL (**shadow DB ΣΠΑΣΜΕΝΟ** → `migrate diff` + `db execute` + `migrate resolve`· **πάντα αφαίρεσε τα `DROP INDEX` για τα FULLTEXT**), Bunny CDN μέσω `lib/bunnycdn.ts` (`uploadFileToCDN`), tests με `node:test`.

**Αποφάσεις που ελήφθησαν:** ρητό αίτημα αρχείου (όχι ελεύθερο ανέβασμα) · προσθήκη τηλεφώνου στον `User` · νέο νήμα συζήτησης επιπέδου έργου (όχι ticket, όχι TaskQuestion).

---

## Τι υπάρχει ήδη και επαναχρησιμοποιείται

| Υπάρχον | Χρήση εδώ |
|---|---|
| `Attachment` (έχει `projectId`, `uploadedById`, `url`) | Τα αρχεία του έργου· χρειάζεται `visibility` |
| `lib/bunnycdn.ts` → `uploadFileToCDN` | Ανέβασμα από το portal, ίδιο μονοπάτι με τα ticket attachments |
| `lib/tickets/image-sniff.ts` → `sniffImage` | Έλεγχος τύπου αρχείου· **προσοχή**: μόνο εικόνες — για PDF/DOC χρειάζεται νέος έλεγχος |
| `ProjectMember` | Αποκτά `title` + `responsibilities` |
| `lib/portal/scope.ts` | Ο μοναδικός έλεγχος πρόσβασης σε όλα τα νέα queries |
| `sendTicketReceivedEmail` pattern (`lib/tickets/emails.ts`) | Πρότυπο για τα emails ειδοποίησης νήματος |

---

### Task 1: Schema — τέσσερα κομμάτια σε ένα migration

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Ορατότητα αρχείων + τηλέφωνα + ιδιότητα μέλους**

```prisma
enum AttachmentVisibility {
  /// Μόνο η ομάδα. Default — τα υπάρχοντα αρχεία δεν εκτίθενται αναδρομικά.
  internal
  /// Ορατό στον πελάτη στο portal.
  shared
}

// model Attachment — πρόσθεσε:
  visibility AttachmentVisibility @default(internal)
  /// Ποιο αίτημα καλύπτει αυτό το αρχείο, αν ανέβηκε από τον πελάτη.
  fileRequestId String?
  fileRequest   FileRequest? @relation(fields: [fileRequestId], references: [id], onDelete: SetNull)
// και index: @@index([projectId, visibility])

// model User — πρόσθεσε:
  phone  String?
  mobile String?
  /// Ιδιότητα/τίτλος θέσης, π.χ. "Ηλεκτρολόγος Μηχανικός".
  jobTitle String?

// model ProjectMember — πρόσθεσε:
  /// Ιδιότητα στο ΣΥΓΚΕΚΡΙΜΕΝΟ έργο, π.χ. "Υπεύθυνος εγκατάστασης".
  /// Χωριστό από το User.jobTitle: ο ίδιος άνθρωπος έχει άλλο ρόλο ανά έργο.
  title            String?
  /// Σύντομη περιγραφή αρμοδιοτήτων — αυτό διαβάζει ο πελάτης για να ξέρει
  /// σε ποιον να απευθυνθεί.
  responsibilities String? @db.Text
  /// Αν ο πελάτης βλέπει αυτό το μέλος στο portal. Default true: η ομάδα του
  /// έργου είναι εξ ορισμού γνωστή στον πελάτη· κρύβονται ρητά όσοι δεν πρέπει.
  visibleToCustomer Boolean @default(true)
```

**Σημείωση για το default του `Attachment.visibility`:** εδώ είναι `internal`, αντίθετα από
το `Task.visibility`. Ο λόγος είναι ο ίδιος κανόνας εφαρμοσμένος σε διαφορετικά δεδομένα:
στα αρχεία ενός έργου υπάρχουν ήδη εσωτερικά έγγραφα (προσφορές, σημειώσεις, εσωτερικά
σχέδια) και μια αναδρομική έκθεσή τους θα ήταν διαρροή. Στις εργασίες η πλειοψηφία αφορούσε
τον πελάτη. Το default ακολουθεί το τι είναι συχνότερο **ανά μοντέλο**, όχι μια γενική αρχή.

- [ ] **Step 2: Αιτήματα αρχείων**

```prisma
enum FileRequestStatus {
  open
  fulfilled
  cancelled
}

/// Ρητό αίτημα αρχείου προς τον πελάτη. Ο πελάτης ΔΕΝ ανεβάζει ελεύθερα — μόνο
/// πάνω σε αίτημα — ώστε να είναι πάντα σαφές τι περιμένει η ομάδα και γιατί.
model FileRequest {
  id          String            @id @default(cuid())
  projectId   String
  title       String
  description String?           @db.Text
  dueDate     DateTime?
  status      FileRequestStatus @default(open)
  createdById String
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  project     Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdBy   User         @relation("FileRequestCreator", fields: [createdById], references: [id], onDelete: Cascade)
  attachments Attachment[]

  @@index([projectId, status])
}
```

- [ ] **Step 3: Νήματα συζήτησης έργου**

```prisma
/// Συζήτηση επιπέδου έργου ανάμεσα στον πελάτη και την ομάδα.
///
/// Χωριστό από το Ticket (που είναι υποστήριξη, με triage και SLA) και από το
/// TaskQuestion (που είναι δεμένο σε μία εργασία). Εδώ ο πελάτης ρωτάει για το
/// έργο συνολικά, είτε συγκεκριμένο μέλος είτε όλη την ομάδα.
model ProjectThread {
  id        String   @id @default(cuid())
  projectId String
  subject   String
  /// null = απευθύνεται σε ΟΛΗ την ομάδα του έργου.
  addresseeId String?
  createdById String
  /// Κλείνει όταν απαντηθεί· ο πελάτης μπορεί να το ξανανοίξει απαντώντας.
  resolvedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  addressee User?   @relation("ThreadAddressee", fields: [addresseeId], references: [id], onDelete: SetNull)
  createdBy User    @relation("ThreadCreator", fields: [createdById], references: [id], onDelete: Cascade)
  messages  ProjectThreadMessage[]

  @@index([projectId, resolvedAt])
  @@index([addresseeId])
}

model ProjectThreadMessage {
  id        String   @id @default(cuid())
  threadId  String
  authorId  String
  body      String   @db.Text
  createdAt DateTime @default(now())

  thread ProjectThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  author User          @relation("ThreadMessageAuthor", fields: [authorId], references: [id], onDelete: Cascade)

  @@index([threadId, createdAt])
}
```

Πρόσθεσε τις αντίστροφες σχέσεις στο `model User` και `model Project`.

- [ ] **Step 4: Migration**

```bash
npx prisma validate
MIG="prisma/migrations/$(date +%Y%m%d%H%M%S)_portal_collaboration"
mkdir -p "$MIG"
npx prisma migrate diff \
  --from-url "$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')" \
  --to-schema-datamodel prisma/schema.prisma --script > "$MIG/migration.sql"
```

**ΑΦΑΙΡΕΣΕ** τα δύο `DROP INDEX` για `KnowledgeEntry_fulltext` / `Task_fulltext` (η Prisma
δεν εκφράζει MySQL FULLTEXT, φαίνονται ως μόνιμο drift, τα χρησιμοποιεί το
`lib/tickets/similar.ts`). Μετά:

```bash
grep -nE '^\s*DROP' "$MIG/migration.sql"   # πρέπει να είναι κενό
npx prisma db execute --file "$MIG/migration.sql" --schema prisma/schema.prisma
npx prisma migrate resolve --applied "$(basename "$MIG")"
npx prisma generate
```

Expected: `FULLTEXT indexes: 2` μετά την εφαρμογή.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add file requests, project threads, member roles and phones"
```

---

### Task 2: Κανόνας ορατότητας αρχείων

**Files:** Create `lib/attachments/visibility.ts` + `lib/attachments/__tests__/visibility.test.ts`

- [ ] **Step 1: Test πρώτα** — αντίγραψε τη δομή του `lib/tasks/__tests__/visibility.test.ts`,
      με τις ίδιες τέσσερις περιπτώσεις (ομάδα βλέπει όλα, πελάτης μόνο shared, άγνωστος
      τύπος fail-closed, και ποιος μπορεί να αλλάξει).

- [ ] **Step 2: Υλοποίηση**

```ts
// lib/attachments/visibility.ts
export type AttachmentVisibility = 'internal' | 'shared'

function isStaff(userType: string | undefined): boolean {
  return userType === 'employee' || userType === 'supplier'
}

/** Fail-closed: ό,τι δεν είναι ρητά ομάδα βλέπει μόνο shared. */
export function attachmentVisibilityFilter(
  userType: string | undefined,
): { visibility?: AttachmentVisibility } {
  return isStaff(userType) ? {} : { visibility: 'shared' }
}

/**
 * Αρχείο που ανέβασε ο πελάτης είναι πάντα shared — αλλιώς θα εξαφανιζόταν από
 * αυτόν που το ανέβασε.
 */
export function visibilityForUploader(
  userType: string | undefined,
  requested: AttachmentVisibility | undefined,
): AttachmentVisibility {
  if (!isStaff(userType)) return 'shared'
  return requested === 'shared' ? 'shared' : 'internal'
}
```

- [ ] **Step 3:** `npx tsx --test lib/attachments/__tests__/visibility.test.ts` → PASS. Commit.

---

### Task 3: Έλεγχος τύπου αρχείου (ΟΧΙ μόνο εικόνες)

Το υπάρχον `lib/tickets/image-sniff.ts` δέχεται μόνο jpg/png/webp. Τα παραδοτέα έργου είναι
συνήθως PDF, DWG, XLSX.

**Files:** Create `lib/attachments/file-sniff.ts` + tests

- [ ] **Step 1: Test με magic bytes**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sniffFile } from '../file-sniff'

test('αναγνωρίζει PDF από magic bytes', () => {
  const pdf = Buffer.from('255044462d312e34', 'hex') // %PDF-1.4
  assert.equal(sniffFile(pdf, 'a.pdf')?.mime, 'application/pdf')
})

test('απορρίπτει εκτελέσιμο μεταμφιεσμένο σε pdf', () => {
  const exe = Buffer.from('4d5a90000300', 'hex') // MZ header
  assert.equal(sniffFile(exe, 'evil.pdf'), null)
})

test('απορρίπτει άγνωστη επέκταση', () => {
  const pdf = Buffer.from('255044462d312e34', 'hex')
  assert.equal(sniffFile(pdf, 'a.exe'), null)
})
```

- [ ] **Step 2: Υλοποίηση** — allowlist σε επέκταση ΚΑΙ magic bytes:
      PDF (`25504446`), PNG (`89504e47`), JPEG (`ffd8ff`), ZIP-based OOXML docx/xlsx/pptx
      (`504b0304`), plain text/csv (χωρίς magic — μόνο επέκταση + έλεγχος ότι δεν είναι
      binary). Όριο μεγέθους 20MB. Επιστρέφει `{ mime, ext, size }` ή `null`.

      **Κρίσιμο:** ο έλεγχος γίνεται στα bytes, ΟΧΙ στο `file.type` που στέλνει ο browser —
      αυτό ελέγχεται από τον client και είναι πλαστογραφήσιμο.

- [ ] **Step 3:** Tests PASS. Commit.

---

### Task 4: Server actions — αιτήματα αρχείων (πλευρά ομάδας)

**Files:** Create `app/(app)/projects/[id]/file-request-actions.ts`

- [ ] **Step 1:** `createFileRequest(projectId, { title, description, dueDate })`,
      `cancelFileRequest(id)`, `setAttachmentVisibility(id, visibility)`.
      Guard: `requireProjectEditor` pattern από το `app/(app)/projects/actions.ts` —
      admin/manager/owner. Κάθε action κάνει `revalidatePath('/projects/' + projectId)`
      **και** `revalidatePath('/portal/projects/' + projectId)`.

- [ ] **Step 2:** `npx tsc --noEmit`. Commit.

---

### Task 5: Server actions — portal (πλευρά πελάτη)

**Files:** Modify `app/(portal)/portal/actions.ts`

- [ ] **Step 1: Ανέβασμα σε αίτημα**

```ts
export async function uploadToFileRequest(requestId: string, formData: FormData) {
  const { userId, scope } = await requirePortal()

  // Το αίτημα πρέπει να ανήκει σε έργο του scope ΚΑΙ να είναι ανοιχτό.
  const req = await prisma.fileRequest.findFirst({
    where: { id: requestId, status: 'open', projectId: { in: scope.projectIds } },
    select: { id: true, projectId: true },
  })
  if (!req) return { ok: false as const, error: 'Το αίτημα δεν βρέθηκε ή έχει κλείσει.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: 'Δεν επιλέχθηκε αρχείο.' }
  }
  const buf = Buffer.from(await file.arrayBuffer())
  const sniffed = sniffFile(buf, file.name)
  if (!sniffed) {
    return { ok: false as const, error: 'Μη αποδεκτός τύπος αρχείου ή υπερβολικό μέγεθος.' }
  }

  const uploaded = await uploadFileToCDN({
    file: buf,
    filename: `${randomUUID()}.${sniffed.ext}`,
    folder: `projects/${req.projectId}/requests`,
    contentType: sniffed.mime,
  })

  await prisma.attachment.create({
    data: {
      projectId: req.projectId,
      fileRequestId: req.id,
      uploadedById: userId,
      name: file.name.slice(0, 200),
      size: sniffed.size,
      mimeType: sniffed.mime,
      url: uploaded.url,
      // Ό,τι ανεβάζει ο πελάτης το βλέπει ο πελάτης.
      visibility: 'shared',
    },
  })

  revalidatePath(`/portal/projects/${req.projectId}`)
  revalidatePath(`/projects/${req.projectId}`)
  return { ok: true as const }
}
```

Το `status: 'fulfilled'` **δεν** τίθεται αυτόματα: ένα αίτημα μπορεί να θέλει πολλά αρχεία,
και μόνο η ομάδα ξέρει πότε καλύφθηκε.

- [ ] **Step 2: Νήματα**

```ts
export async function createPortalThread(input: {
  projectId: string
  subject: string
  body: string
  addresseeId: string | null   // null = όλη η ομάδα
})
export async function replyToPortalThread(threadId: string, body: string)
```

Και τα δύο: έλεγχος ότι το `projectId` είναι στο `scope.projectIds`· ο `addresseeId`
πρέπει να είναι **ορατό μέλος** του συγκεκριμένου έργου (`ProjectMember` με
`visibleToCustomer: true`) — αλλιώς ο πελάτης θα μπορούσε να στείλει σε οποιονδήποτε
χρήστη του συστήματος περνώντας αυθαίρετο id.

Email ειδοποίηση: στον αποδέκτη, ή σε όλα τα ορατά μέλη αν είναι `null`. Fire-and-forget
με `void`, όπως το `createPortalTicket`.

- [ ] **Step 3:** tsc + commit.

---

### Task 6: Portal UI — αρχεία

**Files:** Create `app/(portal)/portal/projects/[id]/portal-files.tsx`

- [ ] **Step 1:** Δύο ενότητες στη σελίδα έργου:
      **«Ζητήθηκαν από εσάς»** (ανοιχτά `FileRequest`) με τίτλο, περιγραφή, προθεσμία και
      dropzone· και **«Αρχεία έργου»** (τα `shared` attachments) με όνομα, μέγεθος,
      ημερομηνία, ποιος το ανέβασε, link λήψης.

- [ ] **Step 2:** Ένα ανοιχτό αίτημα εμφανίζεται και στο `/portal` landing ως εκκρεμότητα
      (ίδιο μπλοκ «Χρειαζόμαστε την απάντησή σας»), και μετράει στο stat tile «Χρειάζονται
      εσάς».

- [ ] **Step 3:** Το query των αρχείων περνά από `attachmentVisibilityFilter('customer')`.

---

### Task 7: Portal UI — ομάδα έργου

**Files:** Create `app/(portal)/portal/projects/[id]/portal-team.tsx`

- [ ] **Step 1:** Κάρτες μελών: avatar, όνομα, **ιδιότητα στο έργο** (`ProjectMember.title`),
      **αρμοδιότητες** (`responsibilities`), email, τηλέφωνο — μόνο όσα μέλη έχουν
      `visibleToCustomer: true`.

- [ ] **Step 2:** Κουμπί «Ερώτηση» ανά μέλος, και ένα «Ρωτήστε την ομάδα» πάνω από τη λίστα.
      Ανοίγουν την ίδια φόρμα με προεπιλεγμένο αποδέκτη.

- [ ] **Step 3:** Ενότητα ανοιχτών νημάτων με τις απαντήσεις.

---

### Task 8: Staff UI — αρμοδιότητες μελών + αιτήματα

**Files:** Modify `app/(app)/projects/[id]/members-manager.tsx`, `project-files.tsx`

- [ ] **Step 1:** Στο `MembersManager`, ανά μέλος: πεδία «Ιδιότητα στο έργο»,
      «Αρμοδιότητες», και διακόπτης «Ορατό στον πελάτη». Guard: admin/manager/owner.

- [ ] **Step 2:** Στα αρχεία έργου: διακόπτης ορατότητας ανά αρχείο (ίδιο μοτίβο με το
      `TaskVisibilityToggle`) και κουμπί «Ζήτησε αρχείο από τον πελάτη».

- [ ] **Step 3:** Στη σελίδα έργου, ενότητα με τα ανοιχτά αιτήματα και τι έχει ανεβάσει ο
      πελάτης, με κουμπί «Καλύφθηκε».

---

### Task 9: Leak test — επέκταση

**Files:** Modify `lib/portal/__tests__/leak.test.ts`

- [ ] **Step 1:** Πρόσθεσε στα fixtures ένα `internal` attachment, ένα `shared`, ένα
      `FileRequest` σε ξένο έργο, ένα κρυμμένο μέλος και ένα νήμα ξένης εταιρίας.

- [ ] **Step 2:** Νέα assertions:
      - εσωτερικό αρχείο δεν επιστρέφεται στο portal query
      - αίτημα ξένου έργου δεν είναι στο scope
      - μέλος με `visibleToCustomer:false` δεν εμφανίζεται
      - νήμα ξένης εταιρίας δεν είναι ορατό
      - **ο πελάτης δεν μπορεί να ανεβάσει σε αίτημα εκτός scope** (κάλεσε το action)

- [ ] **Step 3:** Καθάρισμα fixtures· επιβεβαίωσε μηδέν υπολείμματα.

---

### Task 10: Τελικός έλεγχος

- [ ] Όλα τα unit tests + leak test PASS
- [ ] `npx tsc --noEmit && npm run build` καθαρά
- [ ] Έλεγχοι ακεραιότητας: κανένα attachment χωρίς visibility· κανένα αρχείο πελάτη
      μαρκαρισμένο internal· κανένα thread με addressee εκτός μελών του έργου
- [ ] Χειροκίνητος έλεγχος με λογαριασμό πελάτη: ανέβασμα σε αίτημα, ερώτηση σε μέλος,
      ερώτηση σε όλη την ομάδα

---

## Τι ΔΕΝ κάνει αυτό το plan

- **Ελεύθερο ανέβασμα αρχείων** — μόνο πάνω σε ρητό αίτημα (απόφαση).
- **Έλεγχο ιών** στα ανεβασμένα αρχεία. Ο έλεγχος είναι τύπου + μεγέθους. Αν χρειαστεί
  σάρωση, μπαίνει στο `uploadToFileRequest` πριν το CDN.
- **Προεπισκόπηση αρχείων** στο portal — μόνο λήψη.
- **Ειδοποιήσεις σε πραγματικό χρόνο** — μόνο email.
