# Companies, Contacts & Customer Portal — Design

**Date:** 2026-07-29
**Status:** Approved, ready for planning
**Branch:** `feat/ticketing-system`

Two deliverables, in order. **A** (companies & contacts) is a prerequisite for **B** (the
portal), because the portal's data scoping rests on a real company entity. Plan and execute
them as two phases.

---

## Problem

`User.userType = 'customer'` already exists, and customers can sign in today. But there is
no experience waiting for them. They land on the member dashboard, where
`app/(app)/dashboard/page.tsx` says outright:

> Customers (userType='customer') have no dedicated dashboard view yet — they fall
> through to the same member-scoped zones with mostly-empty attention/my-day lists.

The sidebar hides a handful of links (`components/layout/sidebar.tsx`), and writes are
blocked by ad-hoc `userType === 'customer'` checks scattered across roughly eight action
files. That is a deny-list: every new feature is a potential leak, because the default for
anything newly added is *visible*.

Underneath that sits a second problem. There is no company entity at all. A company today is
three denormalized free-text columns repeated on every user — `User.companyName`,
`User.companyAfm`, `User.softoneCustomerId`. Two contacts at the same client are related
only by having typed the same ΑΦΜ. There is nowhere to record a company's address, its
contacts, or anything else about it.

---

# A. Companies & Contacts

## Goals

- Add a company by ΑΦΜ, pulling its official details automatically.
- Companies that are **not** in SoftOne are fully supported — local-only is a first-class
  state, not a degraded one.
- Import the full customer list from SoftOne in one pass.
- Manage companies and their contacts from an admin page.
- Associate users with a company, replacing the free-text columns.

## Prior art: the damask app

`cloudzeus/damask` already solves this in production. Its `Trdr` and `Contact` models
(`prisma/schema.prisma:269-376`) and its ΑΦΜ lookup (`src/lib/aade.ts`,
`src/lib/trdr/aade-map.ts`) are the reference. Two conventions come from there and are worth
adopting wholesale:

- **SoftOne-sourced columns keep SoftOne's own names and casing** — `TRDR`, `NAME`, `AFM`,
  `ADDRESS`, `ZIP`, `CITY`, `PHONE01`, `ISACTIVE`. Sync becomes a direct field copy with no
  translation layer to get wrong. App-only and ΑΑΔΕ-sourced columns stay camelCase, so the
  origin of every column is readable at a glance.
- **`AFM` is indexed but NOT unique.** SoftOne legitimately holds several `TRDR` rows against
  one ΑΦΜ (branches, historical records). `TRDR` is the unique key. Treating ΑΦΜ as unique
  would make the bulk import fail on real data.

## ΑΦΜ → στοιχεία εταιρίας

The lookup service is **`POST https://vat.wwa.gr/afm2info`** with body `{ "afm": "094019245" }`
— your own hosted wrapper over the ΑΑΔΕ registry. No credentials, no SOAP, no TAXISnet keys.

This replaces the earlier plan of looking companies up through SoftOne. The difference
matters: SoftOne can only tell you about companies already in the ERP, whereas this service
resolves **any** Greek ΑΦΜ, which is exactly the case where a human would otherwise be typing
everything by hand.

Verified live against ΑΦΜ `094019245`:

```
basic_rec: afm, onomasia, commer_title, doy, doy_descr, legal_status_descr,
           postal_address, postal_address_no, postal_zip_code,
           postal_area_description, regist_date, deactivation_flag,
           deactivation_flag_descr, firm_flag_descr, stop_date,
           i_ni_flag_descr, normal_vat_system_flag
firm_act_tab.item[]: firm_act_code, firm_act_descr, firm_act_kind, firm_act_kind_descr
```

**Missing values arrive as XML nil markers, not JSON null.** The live response returns
`commer_title` and `stop_date` as `{"$": {"xsi:nil": "true"}}`. The tolerant coercer from
damask's `aade-map.ts` handles that shape (plus the `{"_": "value"}` text-node form) and must
be ported as-is — the simpler coercer in damask's `aade.ts` is not sufficient.

Mapping:

| Company | basic_rec |
|---|---|
| `NAME` | `onomasia` |
| `ADDRESS` | `postal_address` + `postal_address_no` |
| `ZIP` | `postal_zip_code` |
| `CITY` | `postal_area_description` |
| `IRSDATA` | `doy` (κωδικός ΔΟΥ) |
| `appLegalForm` | `legal_status_descr` |
| `foundingDate` | `regist_date` |
| `aadeStatus` | `deactivation_flag_descr` |
| `aadeFirmKind` | `firm_flag_descr` |
| `JOBTYPETRD` | περιγραφή της κύριας δραστηριότητας |

`firm_act_kind === '1'` marks the primary activity. Active company means
`deactivation_flag === '1'` **and** no `stop_date`.

SoftOne remains the source for `TRDR` / `CODE` linkage and for the bulk import, but it is no
longer on the critical path for creating a company.

## Model

```prisma
model Company {
  id String @id @default(cuid())

  // ── SoftOne mirror (ονόματα πεδίων αυτούσια από το TRDR) ──
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

/// Δραστηριότητες (ΚΑΔ) από την ΑΑΔΕ. Μία κύρια, πολλές δευτερεύουσες.
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

  // Mirror του CUSPRSN/SUPPRSN (S1 person-on-trader link), για μελλοντικό sync επαφών.
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
```

`Contact.userId` is the "optional login" hinge. A contact is a person we know about; a user
is a person who can sign in. Promoting a contact creates a `User` with
`userType = 'customer'`, `companyId` set, and the existing `mustChangePassword` temp-password
flow — no new onboarding machinery. Same idiom as damask's `approveAccessRequest`.

## Bulk import from SoftOne

A one-pass import of every customer, re-runnable as a refresh:

```
s1('GetTable', { TABLE: 'TRDR', FIELDS: 'TRDR,SODTYPE,CODE,NAME,AFM,IRSDATA,JOBTYPETRD,
                 ADDRESS,ZIP,DISTRICT,CITY,COUNTRY,PHONE01,PHONE02,FAX,EMAIL,WEBPAGE,
                 ISACTIVE,REMARKS,UPDDATE',
                 FILTER: 'SODTYPE=13' })
```

with a `getBrowserInfo`/`getBrowserData` paginated fallback if `GetTable` is unavailable for
the tenant — the same two-strategy shape damask uses in `src/lib/s1-sync.ts:114-126`.

Upsert is keyed on `TRDR`. Following damask's `partner-upsert.ts` rule: **an update never
overwrites an existing value with null or blank.** A company enriched locally from the ΑΑΔΕ
must not be flattened by a sparse ERP row.

## Projects ↔ companies

A project has **one client** and, optionally, **other companies in other roles**. Those two
things have different security semantics, so they are stored differently rather than as one
table with a flag:

```prisma
enum ProjectCompanyRole {
  partner
  subcontractor
  consultant
  other
}

model Project {
  // …
  primaryCompanyId String?   // ο πελάτης: πηγή του PRJC.TRDR και ο μόνος
                             // που βλέπει το έργο στο portal
  primaryCompany   Company?  @relation("ProjectPrimaryCompany",
                               fields: [primaryCompanyId], references: [id],
                               onDelete: SetNull)
  companies        ProjectCompany[]
}

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

There is no `client` value in the role enum, and no `isPrimary` boolean. The client *is*
`primaryCompanyId`. This is deliberate: portal scoping reads `primaryCompanyId` and nothing
else, so a partner or subcontractor **cannot** be exposed by a mis-set flag — the leak is
impossible by construction rather than prevented by remembering to check. MySQL also cannot
express "exactly one primary row per project" as a partial unique index, so a boolean would
need application-level enforcement that a foreign key gives for free.

Changing the client is one transaction: move the outgoing company into `ProjectCompany` with
an appropriate role if it should stay associated, then set the new `primaryCompanyId`. The
admin UI presents both in a single list with the client marked, so the split is invisible to
the user.

`PRJC.TRDR` in `syncProjectToSoftOne` comes from `primaryCompany.TRDR` — SoftOne's PRJC
accepts one TRDR, and the client is unambiguously it. When the primary company has no SoftOne
linkage, `TRDR` is null, exactly as it is today for projects with no customer.

## Admin pages

| Route | Content |
| --- | --- |
| `/admin/companies` | List + search by name/ΑΦΜ, badge for SoftOne-linked vs local-only, «Εισαγωγή από SoftOne» |
| `/admin/companies/new` | ΑΦΜ field → «Αναζήτηση» (ΑΑΔΕ) → prefilled form, or manual entry |
| `/admin/companies/[id]` | Edit details; contacts CRUD; linked users; projects as client and in other roles; «Ανανέωση από ΑΑΔΕ» |

These follow the existing `app/(app)/admin/*` conventions (see `ticket-sources` and `users`),
admin-only, Greek UI.

The project form gains a company picker: one field for the client (`primaryCompanyId`) and a
repeatable row for additional companies with a role. Both search the local `Company` table.

## Migration

1. Add `Company`, `CompanyActivity`, `Contact`, `ProjectCompany` tables; add `User.companyId`
   and `Project.primaryCompanyId` (both nullable).
2. Backfill: for each distinct non-null `User.companyAfm`, create a `Company` with that ΑΦΜ,
   taking `NAME` from `companyName` and `TRDR` from `softoneCustomerId`. Link every matching
   user via `companyId`. Where an ΑΦΜ maps to more than one row, prefer the active one.
3. Backfill `Project.primaryCompanyId` from `customerUserId → User.companyId`.
4. Point `syncProjectToSoftOne` at `primaryCompany.TRDR` instead of
   `customerUserId → User.softoneCustomerId`.
5. Update the ~5 files that read the old columns (`admin/users/*`,
   `components/admin/user-management.tsx`, `lib/softone-contacts.ts`) to read through the
   relation.
6. Leave `User.companyName` / `companyAfm` in place for one release as read-only
   denormalized copies, then drop them in a follow-up. `User.softoneCustomerId` stays —
   `lib/softone-contacts.ts` writes contact rows against it.

`Project.customerUserId` is **kept**. It now means "primary contact for this project"
(the mailto default), while `primaryCompanyId` means "which company the project is delivered
to". Distinct concepts that were previously conflated in one column. Note it is currently
never *set* by any UI — only read — so the company picker is the first way to assign a client
from the interface.

---

# B. Customer Portal

## Goals

A logged-in customer can, for their whole company:

- see the projects being delivered for them and how those projects are progressing;
- see, open and follow support tickets through to resolution;
- comment on tasks and answer clarification questions the team asks them.

Non-goals for v1: costing and invoices, approvals/sign-off, anonymous (no-account) flows.
`/t/{token}` and `/help/{source}` stay exactly as they are.

## Route group and the security boundary

A new `app/(portal)/` route group with its own layout, nav and pages, served under
`/portal/*`. `proxy.ts` becomes the single choke point:

| Signed-in as | `/portal/*` | `/(app)/*` |
| --- | --- | --- |
| `userType = 'customer'` | allowed | redirect to `/portal` |
| employee / supplier | redirect to `/dashboard` | allowed |

This flips the model from deny-list to allow-list: an employee route is unreachable for a
customer by routing, not by remembering to add a guard. The existing per-action
`userType === 'customer'` checks stay as defence in depth — they are cheap and they cover
server actions invoked outside a page render.

## The scope module

Every portal query draws its `where` clause from one module, `lib/portal/scope.ts`:

```ts
getPortalScope(session): Promise<PortalScope | null>

type PortalScope = {
  companyId:   string
  companyName: string
  userIds:     string[]   // users belonging to that company
  emails:      string[]   // users' + contacts' emails, for ticket matching
  projectIds:  string[]
}
```

No page builds its own filter. This is the single place to audit, and the single place a
scoping bug can live.

```
company    = me.company                      // via User.companyId
userIds    = User where companyId = company
emails     = userIds.email ∪ Contact.email where companyId = company
projectIds = Project where primaryCompanyId = company     // client only
tickets    = Ticket where reporterEmail IN emails
```

`projectIds` reads `primaryCompanyId` and never joins `ProjectCompany`. A company associated
as partner, subcontractor or consultant sees nothing of that project in its own portal — it
is internal metadata, not a visibility grant.

**If `me.companyId` is null, `getPortalScope` returns `null` and the portal renders an empty
state telling the customer to contact support.** Fail-closed: an unassigned customer sees
nothing rather than everything.

Including contact emails means a ticket opened by a colleague who has no login still appears
for the company — which is the point of modelling contacts separately.

## Pages

| Route | Content |
| --- | --- |
| `/portal` | Landing: tickets awaiting their input, active projects with progress, upcoming deadlines |
| `/portal/projects` | Project list for the company |
| `/portal/projects/[id]` | Read-only task view — title, status, assignee, dates, shared comments, their own questions |
| `/portal/tickets` | Company's tickets, sanitized statuses |
| `/portal/tickets/[id]` | Timeline, thread, attachments, reply box |
| `/portal/tickets/new` | Submit a request |

Never rendered in the portal: `ProjectCostLine`, the SoftOne catalog, capacity/utilization,
internal comments, reports, other companies' anything.

Status labels reuse `TICKET_PUBLIC_STATUS_LABEL` and `publicEventLabel` from
`lib/tickets/status-labels.ts` — the same sanitized vocabulary `/t/{token}` already shows,
so a customer never sees two different names for one state.

The shell is a trimmed variant of `AppShell`, same DG/Fluent design system, different nav.

### No general file browser in v1

An earlier draft included `/portal/files` listing `Attachment` rows for the company's
projects. `Attachment` has no visibility field — the same gap as `Comment` — so that page
would expose every internal document ever attached to a project. Rather than run a second
visibility migration, v1 shows attachments only where provenance already makes them safe:

- **ticket attachments** — uploaded by the customer, or deliberately sent to them;
- **attachments on a `shared` comment** — inheriting that comment's visibility.

A dedicated file area can come later behind an `Attachment.visibility` flag mirroring the
`Comment` one, if customers actually ask for it.

## Writes

### Ticket submission

A server action `createPortalTicket` authenticated by session rather than by
`X-Ticket-Project` / `X-Ticket-Key`. It reuses the existing pipeline — `nextTicketCode`,
LLM triage, `sendTicketReceivedEmail`, duplicate detection, rate limiting — and binds to a
`TicketSource` seeded with code `PORTAL`. Triage, dedupe and rate limiting therefore keep
working unchanged; only the authentication differs.

`reporterEmail` is taken from the session, never from the form.

### Comments — schema change required

`Comment` has no visibility field. Every task comment today is implicitly internal. Exposing
comments to customers without a flag would leak internal discussion retroactively.

```prisma
enum CommentVisibility {
  internal
  shared
}

model Comment {
  // …
  visibility CommentVisibility @default(internal)
}
```

Defaulting to `internal` means **every existing comment stays invisible to customers** and
the migration needs no backfill. Staff opt a comment in; a comment written by a customer is
always persisted as `shared`.

This requires a matching affordance on the staff side — a visibility toggle in the task
comment composer inside `(app)`. Without it the shared path is unreachable and the feature
is dead on arrival. It is small, but it is not optional.

### Task questions

`TaskQuestion` is reused as-is. `askedToId` already targets one specific user, so a customer
sees only questions addressed to them. No schema change.

---

## Testing

**Companies (A)**

- The ΑΑΔΕ mapper turns the live response shape into a `Company` patch, coercing
  `{"$":{"xsi:nil":"true"}}` and `{"_":"value"}` to null/value correctly, and normalizing
  `firm_act_tab.item` whether it arrives as array, single object, or absent.
- `aadeLookup` returns `null` for an ΑΦΜ absent from the registry and throws a typed error
  for timeout/HTTP failure — the two cases must not be conflated.
- A company can be created, edited and given contacts with no SoftOne linkage at all.
- The SoftOne bulk import upserts on `TRDR`, tolerates duplicate ΑΦΜ across rows, and never
  overwrites a populated field with a blank one.
- Promoting a contact to a user sets `userType='customer'`, `companyId`, and
  `mustChangePassword`.
- The backfill migration is idempotent and links every user that has an ΑΦΜ.
- `syncProjectToSoftOne` writes `PRJC.TRDR` from the primary company, and null when that
  company has no `TRDR`.
- A company cannot be attached twice to the same project (`@@unique`), and the client is not
  duplicated as a `ProjectCompany` row.

**Portal (B)**

- **Scope unit tests** — null `companyId` yields `null` scope; two seeded companies cannot
  see each other; a project with `primaryCompanyId = null` appears for nobody; a contact's
  email matches that company's tickets; a company attached only as partner/subcontractor does
  not see that project.
- **Route guard tests** — a customer session against `/dashboard`, `/admin`, `/reports`,
  `/api/reports` is redirected or refused; an employee session against `/portal` is
  redirected.
- **Leak test** — walk every portal page as a seeded customer and assert the rendered
  payload contains no internal comment, no cost line, and no record belonging to another
  company. This is the test that has to survive future features.
- **Write-path tests** — `createPortalTicket` ignores a spoofed `reporterEmail`; a customer
  comment is persisted `shared`; a customer cannot mutate a task field.

## Open items

- **Costing/invoices** deliberately excluded from v1. `ProjectCostLine` exists; exposing
  money to customers is a separate decision.
- **Pushing companies to SoftOne** is out of scope. Local-only companies stay local. If
  write-back is wanted later it belongs next to `syncUserToSoftOne` in
  `lib/softone-contacts.ts`.
- **ΓΕΜΗ enrichment** — damask also pulls ΓΕΜΗ open data (`arGemi`, `gemiStatus`,
  `gemiObjective`…). Not included here; the ΑΑΔΕ service covers what a PM app needs. The
  model leaves room to add it later without restructuring.
- **Azure AD for customers** — customers sign in with credentials. External clients are not
  in the tenant, so the Microsoft button is irrelevant to them; leaving it visible is
  acceptable but slightly confusing.

## Related work

Auth defects on the sign-in path were fixed separately in `aacacce`: the page rendered raw
i18n keys, provider errors were never surfaced, and undecryptable session cookies were never
cleared. Azure AD sign-in and the SoftOne connection both fail from the local `.env`, whose
credentials have not been refreshed since 11 May — the deployment holds newer ones.
