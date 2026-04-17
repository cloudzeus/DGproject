# HANDOFF — A-Sisyphus

Hey 👋 — this is a Phase-1 mockup of a project management app with a Microsoft 365 look-and-feel. Everything you need to pick this up is in this document. Read this first, then the `README.md` for deeper technical detail.

## TL;DR

- Next.js 14 (App Router) + TypeScript + Tailwind, strict types, zero `any`
- **9 pages**, fully styled, Fluent 2 design system
- **Kanban board with real drag-and-drop** (`@dnd-kit`) at `/board` — drag between columns to change status, reorder within columns
- All data is mocked in `lib/mock-data.ts` — intentional for Phase 1
- Types were designed upfront to map 1:1 to the future Prisma schema (included at `prisma/schema.future.prisma`)
- Builds cleanly: `npm install && npm run build` produces a working production bundle

## Get it running in 30 seconds

```bash
unzip fluent-pm.zip
cd fluent-pm
npm install
npm run dev
# open http://localhost:3000
```

No env file, no DB, no auth — it just runs.

## Project phases

| Phase | Scope | Status |
|---|---|---|
| **1. UI/UX mockups** | Every screen clickable, drag-drop works, types in production shape | ✅ Done (this handoff) |
| **2. Prisma + real DB** | Replace mock data with queries. Components stay unchanged. | 🔜 Next |
| **3. Microsoft 365 integration** | NextAuth w/ Azure AD + MS Graph SDK | Later |

## What's in each page

| Route | What's there |
|---|---|
| `/dashboard` | Greeting, 4 stat cards w/ staggered animations, "due this week", activity feed, active projects w/ animated progress bars |
| `/projects` | Grid + list views, status filter pills (All/Active/Planning/On hold/Completed), O365 integration badges |
| `/projects/[id]` | Hero banner w/ project color, stats row, task list, Timeline/Reports tabs (placeholders) |
| `/board` ⭐ | **The main feature.** 5-column Kanban w/ `@dnd-kit`. Click a card to open the detail drawer. |
| `/calendar` | Month view, tasks colored by project, "Sync with Outlook" button |
| `/files` | Tabbed by source (All / OneDrive / SharePoint / Uploaded), grid + list views |
| `/team` | Member cards w/ role badges, open-task counts, Email/Chat/Video buttons |
| `/settings` | Profile, **Integrations** (6 O365 services with connect/manage state), Notifications |

## Key architectural decision: type-first

Instead of building UI and then retrofitting a schema, I defined the types **first** in `types/index.ts`, then made mock data conform to those types, then built components against those types. The future Prisma schema in `prisma/schema.future.prisma` uses the same shapes.

**Why this matters to you:** Phase 2 migration won't require touching components. You only replace `lib/mock-data.ts` with real database queries that return the same shapes. See "Phase 2 migration checklist" in the README for steps.

## Microsoft 365 integration — where the seams are

UI stubs exist everywhere, but nothing actually calls Graph yet. When you're ready:

| Where the UI is | Data hook on the model | Graph endpoint to call |
|---|---|---|
| Task drawer "Add to Outlook" | `Task.outlookEventId` | `POST /me/events` |
| Task drawer "Attach from OneDrive" | `Attachment.source + sharepointFileId` | `GET /me/drive/items` |
| Task drawer "Discuss in Teams" | `Project.teamsChannelId` | `POST /teams/{id}/channels/{id}/messages` |
| Files page tabs | `Attachment.source` | `/me/drive` and `/sites/{id}/drive` |
| Settings → Integrations | `User.azureAdId` | OAuth consent flow |
| Calendar "Sync with Outlook" | `Task.outlookEventId` | Delta query on `/me/events` |
| Topbar waffle menu (9 O365 apps) | static | no API — just deep-links |

## Design system quick reference

- **Fluent 2 palette** in `tailwind.config.ts` under `colors.fluent.*`
  - Primary: `fluent-blue-500` (#0078D4)
  - Accents: `fluent-accent-{purple,green,orange,red,yellow,teal,pink}`
  - Neutrals: `fluent-neutral-{0..95}`
- **Elevation shadows**: `shadow-fluent-{2,4,8,16,28,64}` — match Fluent's depth tokens
- **`.acrylic`** (in `globals.css`) — 70% white + 40px blur, used on topbar and flyouts
- **`.mica`** — subtle tint over canvas, used on sidebar
- **`.reveal`** — blue gradient follows cursor on hover (Fluent's signature effect)
- **Motion**: standard easing is `cubic-bezier(0.33, 0, 0.67, 1)`; springs for drawer + toggles via Framer Motion

## File map (most important files for picking up)

```
app/
  (app)/                          ← shared layout (sidebar + topbar)
    board/page.tsx                ← DRAG-DROP KANBAN — start here to understand the pattern
    dashboard/page.tsx            ← most-animated page, good reference for motion
    projects/page.tsx
    projects/[id]/page.tsx
    calendar/page.tsx
    files/page.tsx
    team/page.tsx
    settings/page.tsx
    layout.tsx                    ← wraps pages w/ sidebar + topbar

components/
  board/
    task-card.tsx                 ← Draggable card (useSortable from @dnd-kit)
    board-column.tsx              ← Droppable column (useDroppable)
    task-drawer.tsx               ← Slide-in detail panel w/ O365 action buttons
  layout/
    sidebar.tsx                   ← Framer Motion layoutId for active indicator
    topbar.tsx                    ← Acrylic nav + flyouts (apps launcher, notifications)
  ui/
    avatar.tsx                    ← Avatar + AvatarStack w/ presence
    button.tsx                    ← 5 variants × 3 sizes
    badge.tsx                     ← Badge + Tag primitives

lib/
  mock-data.ts                    ← ⚠️ Replace this in Phase 2
  utils.ts                        ← cn(), date helpers, priority colors

types/
  index.ts                        ← Single source of truth — DO NOT CHANGE without updating schema.future.prisma

prisma/
  schema.future.prisma            ← Not active yet. For Phase 2: rename to schema.prisma, run `prisma migrate dev`

tailwind.config.ts                ← Fluent 2 design tokens
app/globals.css                   ← Acrylic, mica, reveal effect, custom scrollbars
```

## Drag-and-drop pattern (in case you're new to @dnd-kit)

Full implementation in `app/(app)/board/page.tsx`. The mental model:

1. `<DndContext>` wraps the board. It gets `sensors`, `collisionDetection` (we use `closestCorners`), and three handlers: `onDragStart`, `onDragOver`, `onDragEnd`.
2. Each column wraps its cards in `<SortableContext items={taskIds} strategy={verticalListSortingStrategy}>` and is itself a `useDroppable`.
3. Each card uses `useSortable({ id, data })` and spreads the returned `listeners` + `attributes` onto its DOM element.
4. `onDragOver` detects cross-column moves and updates the card's `status` so visual feedback is instant.
5. `onDragEnd` handles same-column reordering via `arrayMove`.
6. `<DragOverlay>` renders a floating rotated copy of the card while dragging — better than mutating the original's transform.

The 6px activation distance on `PointerSensor` is important — without it, clicks get swallowed as micro-drags.

## Things I deliberately left out (not bugs)

- **No auth** — every page renders as "Sarah Chen". Phase 3 adds NextAuth + Azure AD.
- **Drag-drop resets on refresh** — state lives in `useState`, not persisted. Phase 2 persists it.
- **Topbar search doesn't search** — Command palette (⌘K) is Phase 2 material.
- **Calendar only does month view** — Week/Day/Agenda tabs are placeholder buttons.
- **Project detail only has task list** — Timeline (Gantt) and Reports tabs are placeholders.
- **No tests** — Phase 1 is presentational; tests come with the data layer in Phase 2.

## If something breaks

- **Types error after editing**: run `npx tsc --noEmit` — it catches everything.
- **Build error**: `npm run build` — I verified this passes as of handoff.
- **Icon not found**: `@fluentui/react-icons` uses naming convention `<Name><Size><Style>` e.g. `Flag16Filled`, `Board24Regular`. Sizes available: 12/16/20/24. Styles: `Regular` and `Filled`.
- **Tailwind class not applying**: make sure the file path is in `content` in `tailwind.config.ts`.

## Suggested next steps (in order of impact)

1. **Get local Postgres running + do the Phase 2 migration**. This unlocks real CRUD and makes the drag-drop persist. Checklist is in `README.md`.
2. **Persist board state via API routes** — `PATCH /api/tasks/[id]` for status + order changes.
3. **Add the command palette** (⌘K search) — there are good libraries like `cmdk`.
4. **Build the Timeline/Gantt view** on project detail — `@visx/gantt` or similar.
5. **Phase 3: Azure AD + Graph**. Requires an Azure tenant + app registration (someone with admin in the tenant needs to grant consent).

## Questions about design choices?

Most are documented inline as comments. The biggest non-obvious decisions:

- **Chose @dnd-kit over react-beautiful-dnd** — react-beautiful-dnd is no longer actively maintained. @dnd-kit is smaller, more flexible, and supports React 18 concurrent features properly.
- **Chose `(app)` route group** instead of nested layout — cleaner URLs (`/dashboard` not `/app/dashboard`) while sharing the sidebar+topbar layout.
- **Avatars use `i.pravatar.cc`** for mock images. Replace with real user photos or Microsoft Graph `/me/photo/$value` in Phase 3.
- **No global state library** (Redux / Zustand) — Phase 1 didn't need it. When you add server data, React Query / TanStack Query is my recommendation over Redux.

Good luck, and ping me (via the original requester) if anything is unclear.
