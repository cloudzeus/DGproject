# Meetings + SoftOne Integration — Setup Guide

End-to-end πιπελάιν για **Microsoft Teams transcript → LLM insights → tasks**
και **fluent-pm Users/Projects → SoftOne CUSTOMER/SUPPLIER/USERS/PRJC**.

---

## 1. Database migration

Έχει δημιουργηθεί καινούριο migration:

```
prisma/migrations/20260511_softone_user_types_and_meetings/migration.sql
```

Εφάρμοσε σε όλα τα environments:

```bash
# Πριν τρέξεις backup της βάσης (όλο το migration είναι nullable add-only,
# αλλά πάντα backup):
mysqldump -u USER -p DBNAME > backup_pre_softone_migration.sql

# Apply migration:
npx prisma migrate deploy

# OR αν είσαι σε dev και θες να δεις το diff πρώτα:
npx prisma migrate dev
```

**Τι προσθέτει** (όλα non-destructive):

| Table | Νέες στήλες |
|---|---|
| `User` | `userType` enum, `companyName`, `companyAfm`, `softoneCompany`, `softoneUserId`, `softonePrsnId`, `softoneCustomerId`, `softoneSupplierId`, `softoneContactLine`, `softoneSyncStatus`, `softoneSyncedAt`, `softoneSyncError` |
| `Project` | `projectCode`, `softoneId`, `softoneCompany`, `customerUserId`, `softoneVersion`, `softoneSyncStatus`, `softoneSyncedAt`, `softoneSyncError` |
| `Task` | `generatedFromMeetingId`, `meetingSourceConfidence`, `meetingSourceQuote`, `meetingNeedsReview` |
| `MeetingNote` | νέος πίνακας — αναλυτικά παρακάτω |

---

## 2. Environment variables (.env.local)

### LLM provider

```bash
# Επιλογή ενεργού provider
LLM_PROVIDER=deepseek      # ή "azure-openai" όταν θες enterprise compliance

# DeepSeek (cheapest, OpenAI-compatible)
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
DEEPSEEK_MODEL=deepseek-chat

# Azure OpenAI (drop-in alternative)
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_API_VERSION=2024-08-01-preview
```

### Microsoft Graph (existing)

```bash
TENANT_ID=...
APPLICATION_ID=...
CLIENT_SECRET_VALUE=...
```

### SoftOne (tenant-specific — όχι hard-coded πουθενά)

```bash
S1_SERIAL=...               # subdomain πριν το .oncloud.gr
S1_USERNAME=...             # Web Account username
S1_PASSWORD=...
S1_APP_ID=...               # AppID από SoftOne client (Web Services config)
S1_COMPANY=...              # tenant company id
S1_BRANCH=...
S1_MODULE=0
S1_REFID=...                # user reference id για την authenticate
```

---

## 3. Microsoft Graph permissions (για production Teams transcripts)

### Step 1 — Application permissions στο Azure AD

Στο [Azure Portal](https://portal.azure.com) → **Azure Active Directory** → **App
registrations** → η εφαρμογή σας → **API permissions** → **Add a permission** →
**Microsoft Graph** → **Application permissions**:

| Permission | Σκοπός |
|---|---|
| `OnlineMeetings.Read.All` | List/get onlineMeetings ανά organizer |
| `OnlineMeetingTranscript.Read.All` | Download VTT transcripts |
| `OnlineMeetings.ReadWrite.All` | (Optional) Δημιουργία Teams meetings από fluent-pm |
| `CallRecords.Read.All` | (Optional) Webhook subscription για auto-trigger |

Μετά: **Grant admin consent for [tenant]**.

### Step 2 — Application access policy

Application permissions στο OnlineMeetings/Transcript δεν αρκούν μόνες τους —
χρειάζεται και policy που λέει για ποιους users (organizers) η εφαρμογή έχει
access. Run στο **Microsoft Teams PowerShell**:

```powershell
# Σύνδεση
Connect-MicrosoftTeams

# Δημιουργία policy
New-CsApplicationAccessPolicy `
  -Identity "FluentPmMeetingTranscriptPolicy" `
  -AppIds "<APPLICATION_ID>" `
  -Description "Allow fluent-pm to read online meetings & transcripts"

# Apply per-user (ή -Global για όλους — όχι recommended)
Grant-CsApplicationAccessPolicy `
  -PolicyName "FluentPmMeetingTranscriptPolicy" `
  -Identity "organizer@yourdomain.com"
```

Χωρίς αυτό, τα transcript Graph calls επιστρέφουν **403 Forbidden**.

### Step 3 — Teams meeting policies (transcription enabled)

Στο **Teams admin center** → **Meetings** → **Meeting policies**:

- `Allow transcription` = On
- `Allow cloud recording` = On (αν θες και recording fallback)

Per-user assignment αν δεν θες tenant-wide.

---

## 4. Flow Α: Πρακτικά σύσκεψης

### Manual path (διαθέσιμο τώρα — δεν χρειάζεται Graph)

1. Άνοιξε `/projects/[projectId]/meetings`
2. Paste το WEBVTT (download από Teams Recording UI ή Stream)
3. **Αποδελτίωση** — το pipeline:
   - parses VTT
   - **pseudonymizes** speaker names, emails, phones, AFM
   - καλεί DeepSeek/Azure OpenAI με ψευδωνυμοποιημένο prompt
   - **de-pseudonymizes** το JSON response
   - δημιουργεί MeetingNote
   - δημιουργεί tasks κατά confidence tier
4. Δες αποτελέσματα στο `/projects/[projectId]/meetings/[meetingNoteId]`

### Auto path (μετά από Graph permissions)

```bash
POST /api/meetings/poc
{
  "projectId": "cuid",
  "joinWebUrl": "https://teams.microsoft.com/...",
  "organizer": "user@example.com"
}
```

Το endpoint:
1. Resolves joinWebUrl → meetingId (υποστηρίζει και `/meet/` format)
2. Pulls latest transcript via Graph
3. Τρέχει το ίδιο pipeline όπως πάνω

### Confidence tiers

| Confidence | Tier | Action |
|---|---|---|
| ≥ 0.85 | **auto** | Task `todo`, με assignee (αν resolved), notification |
| 0.6 - 0.85 | **review** | Task `backlog`, `meetingNeedsReview=true`, manager triage |
| < 0.6 | **skip** | Μένει μόνο στο `MeetingNote.actionItems` JSON — όχι task |

Όλα τα generated tasks κρατάνε:
- `generatedFromMeetingId` → audit trail
- `meetingSourceConfidence` (0-1)
- `meetingSourceQuote` (verbatim quote από transcript)

---

## 5. Flow Β: User Types & SoftOne contacts

### Setup ενός User

Κάθε User πλέον έχει `userType ∈ {employee, customer, supplier}` και προαιρετικά:
- `companyName` — η εταιρεία που εκπροσωπεί
- `companyAfm` — Α.Φ.Μ. της εταιρείας (απαραίτητο για customer/supplier)
- `softoneCompany` — tenant company id στο SoftOne

### Sync σε SoftOne

```bash
POST /api/admin/users/{userId}/sync-softone
```

Dispatch logic:

| userType | Όνομα object | Action |
|---|---|---|
| `customer` | `CUSTOMER` (TRDR) | `setData` insert/update — populates `softoneCustomerId` |
| `supplier` | `SUPPLIER` (TRDR) | `setData` insert/update — populates `softoneSupplierId` |
| `employee` | `USERS` | **Lookup only** — βρίσκει το υπάρχον USERS row μέσω email (USERS.MAILACC). Δεν δημιουργεί. Populates `softoneUserId` + `softonePrsnId` |

**Γιατί όχι auto-insert για employees**: τα SoftOne USERS διαχειρίζονται μέσα στο ERP (rights, modules, licenses). Auto-creation από εξωτερική εφαρμογή είναι security smell.

### Sync ενός Project σε SoftOne PRJC

```bash
POST /api/projects/{projectId}/sync-softone
```

- Δημιουργεί ή updates τα `PRJC` master fields:
  - `CODE` — αν δεν υπάρχει, generates `PRJ-YYYY-NNNNNN`
  - `NAME` ← `Project.name`
  - `ISACTIVE`, `BLOCKED` ← derived από `Project.status`
  - `REMARKS` ← `Project.description`
  - `FROMDATE`, `FINALDATE` ← `startDate`, `dueDate`
  - `TRDR` ← `customerUserId.softoneCustomerId` (αν υπάρχει)
- Populates `Project.softoneId`, `projectCode`, `softoneSyncedAt`

**Required fields**: αν λείπει `companyAfm` σε customer/supplier User, το sync επιστρέφει `400` με μήνυμα τι λείπει.

---

## 6. Operational notes

### Cost (DeepSeek-V3)

Από το real test:
- 20-min meeting (5172 input + 1050 output tokens) ≈ **$0.003**
- 200 meetings/μήνα ≈ **~$0.55**

Με Azure OpenAI gpt-4o-mini (EU region) αυξάνεται σε **~$8/μήνα** για το ίδιο volume.

### Privacy

Το pseudonymization πάει **πριν** το API call. Το LLM βλέπει:
- `SPEAKER_A`, `SPEAKER_B`, … αντί ονομάτων
- `email_1@example.com`, … αντί emails
- `phone_1`, `afm_1`, … αντί τηλεφώνων/ΑΦΜ

Αυτό είναι **pseudonymization** (GDPR Art. 4(5)), όχι πλήρης ανωνυμοποίηση. Το
business context (project name, εταιρικά ονόματα στις συζητήσεις) παραμένει.
Για enterprise compliance, swap σε Azure OpenAI EU με μία αλλαγή env var.

### Switching providers

Όλος ο κώδικας είναι provider-agnostic. Αλλαγή:

```bash
# .env.local
LLM_PROVIDER=azure-openai    # was: deepseek
```

Καμία αλλαγή σε code.

---

## 7. File map

```
prisma/
  schema.prisma                                   # UserType enum, MeetingNote model, SoftOne fields
  migrations/20260511_softone_user_types_and_meetings/migration.sql

lib/
  llm/
    index.ts                                      # extractMeetingInsights()
    types.ts
    prompt.ts                                     # Greek prompt με JSON schema
    pseudonymize.ts                               # Pre-seeded member mapping
    sample-vtt.ts
    providers/
      shared.ts                                   # JSON validator
      deepseek.ts
      azure-openai.ts
  microsoft-graph.ts                              # +online meeting + VTT helpers + parser
  meeting-pipeline.ts                             # processMeeting() — full pipeline
  softone-contacts.ts                             # syncUserToSoftOne, syncProjectToSoftOne

app/
  api/
    meetings/
      poc/route.ts                                # Graph + LLM
      poc-vtt/route.ts                            # LLM-only (manual VTT)
      [id]/route.ts                               # GET/DELETE meeting note
    projects/
      [projectId]/
        meetings/route.ts                         # GET meetings list
        sync-softone/route.ts                     # POST sync project to PRJC
    admin/
      users/
        [id]/
          sync-softone/route.ts                   # POST sync user to CUSTOMER/SUPPLIER/USERS
  (app)/projects/[id]/meetings/
    page.tsx                                      # Meeting list page
    process-vtt-form.tsx                          # VTT paste form
    [meetingId]/page.tsx                          # Meeting detail (insights + tasks)

scripts/
  test-llm-extract.ts                             # Standalone E2E test runner

test/fixtures/
  real-kolleris-meeting.vtt                       # Real-world test transcript
```

---

## 8. What's still pending

These items are **scaffolded but not auto-wired** — they need admin actions or
follow-up work:

- [ ] **Microsoft Graph permissions** — admin must grant + add application access policy
- [ ] **Schedule meeting button** στο project page — wire-up στο `createOnlineMeeting()`
- [ ] **Webhook subscription** για auto-trigger όταν transcript γίνεται διαθέσιμο
- [ ] **CUSCONT/SUPCONT child table** — προς το παρόν στέλνουμε μόνο master record. Αν χρειάζονται multiple contacts ανά εταιρεία, επεκτείνουμε το `buildPartyMaster`.
- [ ] **Pull-down sync** (SoftOne → fluent-pm). Τώρα έχουμε μόνο push.
- [ ] **Review queue UI** για tasks με `meetingNeedsReview=true`
- [ ] **Notifications** στους assignees όταν δημιουργείται auto-task

Όλα τα παραπάνω είναι incremental — η foundation είναι έτοιμη.
