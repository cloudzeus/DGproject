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

- Add a company by ΑΦΜ, pulling its details from SoftOne where they exist.
- Companies that are **not** in SoftOne are fully supported — local-only is a first-class
  state, not a degraded one.
- Manage companies and their contacts from an admin page.
- Associate users with a company, replacing the free-text columns.

## Model

```prisma
enum CompanySource {
  manual    // typed in by hand
  softone   // pulled from a SoftOne CUSTOMER record
}

model Company {
  id    String @id @default(cuid())
  afm   String @unique          // Α.Φ.Μ. — the natural key, and how lookup happens
  name  String

  // Optional SoftOne linkage. Null means the company exists only here, which is
  // an expected and fully supported state.
  softoneCustomerId Int?     @unique   // CUSTOMER.TRDR
  softoneCode       String?            // CUSTOMER.CODE
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

  contacts Contact[]
  users    User[]
  projects Project[]

  @@index([name])
  @@index([isActive])
}

model Contact {
  id        String  @id @default(cuid())
  companyId String
  firstName String
  lastName  String
  email     String?
  phone     String?
  mobile    String?
  jobTitle  String?          // θέση / ρόλος στην εταιρία
  isPrimary Boolean @default(false)
  notes     String? @db.Text

  // A contact may optionally be promoted to a portal account. Null = no login.
  userId String? @unique

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user    User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([companyId])
  @@index([email])
}
```

`Contact.userId` is the "optional login" hinge. A contact is a person we know about; a user
is a person who can sign in. Promoting a contact creates a `User` with
`userType = 'customer'`, `companyId` set, and the existing `mustChangePassword` temp-password
flow — no new onboarding machinery.

## ΑΦΜ lookup

The identity chain is SoftOne's own: **`CUSTOMER` is the object, `TRDR` is the key.** A
company in our database is linked to the ERP by `Company.softoneCustomerId = CUSTOMER.TRDR`,
the same key `Project` sync already writes into `PRJC.TRDR`
(`lib/softone-contacts.ts:434`) and that `User.softoneCustomerId` uses for contact rows.
One key, one meaning, across all three.

`lib/softone-lookup.ts` already resolves a 9-digit input to an exact `CUSTOMER.AFM` match via
`getBrowserInfo`, exposed at `/api/softone/lookup`. It returns only `id (TRDR), code, name,
afm, city`, so a second call is needed for the full record:

```
softoneLookup({ source: 'customer', q: afm })  →  TRDR
s1('getData', { OBJECT: 'CUSTOMER', KEY: TRDR })  →  address, ΔΟΥ, phones, email
```

A new `lib/companies/softone-import.ts` wraps both into
`lookupCompanyByAfm(afm): Promise<CompanyDraft | null>`, returning `null` when the ΑΦΜ is not
in the ERP. **`null` is not an error** — the admin form simply falls through to manual entry
with the ΑΦΜ prefilled.

Per the global SoftOne rules: official services only, two-step auth, cached daily `clientID`,
Windows-1253 decoding — all already handled by `lib/softone.ts`.

## Admin pages

| Route | Content |
| --- | --- |
| `/admin/companies` | List + search by name/ΑΦΜ, badge for SoftOne-linked vs local-only |
| `/admin/companies/new` | ΑΦΜ field → «Αναζήτηση» → prefilled form, or manual entry if not found |
| `/admin/companies/[id]` | Edit details; contacts CRUD; linked users; linked projects; «Επαναφόρτωση από SoftOne» when linked |

These follow the existing `app/(app)/admin/*` conventions (see `ticket-sources` and `users`),
admin-only, Greek UI.

## Migration

1. Add `Company` and `Contact` tables; add `User.companyId` and `Project.companyId`
   (both nullable).
2. Backfill: for each distinct non-null `User.companyAfm`, create a `Company` with that ΑΦΜ,
   taking `name` from `companyName` and `softoneCustomerId` from the user. Link every
   matching user via `companyId`.
3. Backfill `Project.companyId` from `customerUserId → User.companyId`.
4. Update the ~5 files that read the old columns (`admin/users/*`,
   `components/admin/user-management.tsx`, `lib/softone-contacts.ts`) to read through the
   relation.
5. Leave `User.companyName` / `companyAfm` in place for one release as read-only
   denormalized copies, then drop them in a follow-up. `User.softoneCustomerId` stays —
   `lib/softone-contacts.ts` writes contact rows against it.

`Project.customerUserId` is **kept**. It now means "primary contact for this project"
(the mailto default), while `Project.companyId` means "who the project is delivered to".
Distinct concepts that were previously conflated.

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
projectIds = Project where companyId = company
tickets    = Ticket where reporterEmail IN emails
```

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

- `lookupCompanyByAfm` returns a draft for a known ΑΦΜ, `null` for an unknown one, and
  surfaces SoftOne transport errors distinctly from "not found".
- A company can be created, edited and given contacts with no SoftOne linkage at all.
- Promoting a contact to a user sets `userType='customer'`, `companyId`, and
  `mustChangePassword`.
- The backfill migration is idempotent and produces one `Company` per distinct ΑΦΜ.

**Portal (B)**

- **Scope unit tests** — null `companyId` yields `null` scope; two seeded companies cannot
  see each other; a project with `companyId = null` appears for nobody; a contact's email
  matches that company's tickets.
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
- **Azure AD for customers** — customers sign in with credentials. External clients are not
  in the tenant, so the Microsoft button is irrelevant to them; leaving it visible is
  acceptable but slightly confusing.

## Related work

Auth defects on the sign-in path were fixed separately in `aacacce`: the page rendered raw
i18n keys, provider errors were never surfaced, and undecryptable session cookies were never
cleared. Azure AD sign-in remains broken until the app's client secret is regenerated —
`AADSTS7000222`, the secret expired.
