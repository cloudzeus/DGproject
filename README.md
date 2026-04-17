# A-Sisyphus

Premium project management app with Microsoft 365 integration. Built with Next.js 14, TypeScript, Tailwind, `@dnd-kit`, and Framer Motion. Fluent 2 design system.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 — it redirects to `/dashboard`.

## Architecture

This is **Phase 1** of a three-phase build:

| Phase | Goal | Status |
|---|---|---|
| 1. UI/UX mockups with dummy data | Every screen clickable, drag-drop works, types are production-shaped | ✅ Done |
| 2. Prisma schema + real database | Swap mock data for DB queries without touching components | 🔜 Next |
| 3. Real Microsoft 365 integration | NextAuth w/ Azure AD, MS Graph SDK, webhooks | Later |

### Type-first strategy

The types in `types/index.ts` were designed upfront to map 1:1 to the future Prisma schema in `prisma/schema.future.prisma`. This means:

- Components only ever import types — they don't know about mock data vs real data
- Mock data in `lib/mock-data.ts` conforms exactly to what Prisma will return
- Phase 2 migration is *mostly* a search-and-replace: `import from '@/lib/mock-data'` → `import from '@/lib/db'`

## File structure

```
app/
  (app)/                 ← grouped route with shared layout (sidebar + topbar)
    dashboard/           ← greeting, stats, activity feed, active projects
    projects/            ← grid/list of projects
      [id]/              ← single project detail with hero, stats, task list
    board/               ← Kanban board with drag-and-drop ⭐
    calendar/            ← month view with task deadlines
    files/               ← OneDrive/SharePoint/uploaded files with filters
    team/                ← team member cards
    settings/            ← profile, integrations, notifications
  layout.tsx             ← root HTML shell
  page.tsx               ← redirects to /dashboard
  globals.css            ← Fluent tokens, acrylic/mica effects, shimmer

components/
  layout/
    sidebar.tsx          ← Mica-effect nav with animated active indicator
    topbar.tsx           ← Search, O365 apps launcher, notifications
  board/
    task-card.tsx        ← Draggable card (uses @dnd-kit/sortable)
    board-column.tsx     ← Droppable column
    task-drawer.tsx      ← Slide-in task detail with comments + O365 actions
  ui/
    avatar.tsx           ← Avatar + AvatarStack with presence dots
    button.tsx           ← 5 variants, 3 sizes, Fluent styling
    badge.tsx            ← Status badges and tags

lib/
  mock-data.ts           ← All dummy data (swap for DB in Phase 2)
  utils.ts               ← cn(), date helpers, priority colors

types/
  index.ts               ← Single source of truth for data shapes

prisma/
  schema.future.prisma   ← Phase 2 schema preview (not active yet)

tailwind.config.ts       ← Fluent 2 color palette, elevation shadows, animations
```

## Design notes (Fluent 2)

- **Colors**: Primary #0078D4, accents on purple/green/orange/red. Neutral scale calibrated for Fluent 2 light theme.
- **Elevation**: Six levels (2, 4, 8, 16, 28, 64) matching Fluent's depth tokens.
- **Acrylic** (`.acrylic`): 70% white with 40px blur + saturation boost. Used on topbar, flyouts.
- **Mica** (`.mica`): Subtle tint over canvas. Used on sidebar.
- **Motion**: Cubic-bezier `(0.33, 0, 0.67, 1)` for standard easing, springs for drawer and toggles.
- **Reveal effect**: Subtle blue gradient follows cursor on `.reveal` cards — Fluent's signature hover.
- **Typography**: Segoe UI Variable when available, falls back to system-ui.

## Microsoft 365 integrations (UI stubs, ready for real wiring)

| Integration | Where it shows | Phase 3 implementation |
|---|---|---|
| Outlook Calendar | Task drawer "Add to Outlook" button, Calendar sync button | Graph `POST /me/events` |
| OneDrive | Files page tab, task attachments | Graph `/me/drive/items` |
| SharePoint | Files page tab, project site URL field, attachments | Graph `/sites/{id}/drive` |
| Teams | Topbar apps launcher, task drawer "Discuss in Teams" | Graph `/teams/{id}/channels` |
| Apps launcher | Top-right waffle icon | Static — links out to O365 |

Ready hooks on the data model: `User.azureAdId`, `Project.sharepointSiteUrl`, `Project.teamsChannelId`, `Task.outlookEventId`, `Attachment.source + sharepointFileId`.

## Drag-and-drop (`@dnd-kit`)

The Kanban board in `/board` uses `@dnd-kit/core` + `@dnd-kit/sortable`:

- **Pointer sensor** with 6px activation distance (prevents accidental drags on clicks)
- **`closestCorners` collision detection** — better than `closestCenter` for columns
- **`onDragOver`** handles cross-column transfers (status changes)
- **`onDragEnd`** handles same-column reordering via `arrayMove`
- **`DragOverlay`** renders a floating, rotated copy of the card during drag

In Phase 2, replace the `setTasks` calls with `fetch('/api/tasks/' + id, { method: 'PATCH', body: ... })` — the state shape is already correct.

## Phase 2 migration checklist

1. `npm install -D prisma && npm install @prisma/client`
2. `mv prisma/schema.future.prisma prisma/schema.prisma`
3. Set `DATABASE_URL` in `.env`
4. `npx prisma migrate dev --name init`
5. Create `lib/db.ts` with query functions matching the `mock-data.ts` signatures:
   ```ts
   export async function getAllProjectsWithStats() { /* prisma query */ }
   export async function getTasksByProject(id: string) { /* prisma query */ }
   // ... etc
   ```
6. Find-and-replace `from '@/lib/mock-data'` → `from '@/lib/db'` in page files
7. Convert page components from `'use client'` with `useState` to server components that receive data as props, plus API routes for mutations
8. Delete `lib/mock-data.ts`

## Phase 3 checklist (O365)

1. `npm install next-auth @microsoft/microsoft-graph-client @azure/msal-node`
2. Register app in Azure AD portal, get client ID + secret, configure redirect URIs
3. Set up NextAuth with Azure AD provider + required Graph scopes:
   - `User.Read`, `Calendars.ReadWrite`, `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `ChannelMessage.Send`
4. Create `lib/graph.ts` with Graph SDK client
5. Wire the "Connect" buttons on `/settings` to trigger OAuth consent
6. Wire task drawer actions (Add to Outlook, Attach from OneDrive, Discuss in Teams)
7. Set up webhooks/change notifications for two-way sync

## Known limitations

- No auth yet — every request is as "Sarah Chen"
- Board only persists drag-drop in memory; refresh resets it
- Search input in topbar isn't wired to anything
- Calendar shows month view only (Week/Day/Agenda tabs are placeholders)
- Project detail page shows task list only (Timeline and Reports tabs are placeholders)

These are all intentional — Phase 1 is about nailing the UX and data shapes, not the backend.
# DGproject
