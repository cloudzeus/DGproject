# 🚀 A-Sisyphus - Quick Start Guide

**Updated for Next.js 16.2.4 with Auth.js RBAC, Microsoft 365 Integration, Bunny CDN, & Server Components**

## Prerequisites

- Node.js 18+ 
- MySQL 8.0+
- npm or yarn
- **Bunny CDN account** (mandatory for file storage)
- **Microsoft 365 tenant** (mandatory for authentication)
- Mailgun account (for email notifications)

## Installation & Setup

### 1. Clone and Install

```bash
git clone <your-repo>
cd a-sisyphus
npm install --legacy-peer-deps
```

### 2. Configure Environment

Create `.env.local` in the root directory (copy from `.env.example`):

```bash
cp .env.example .env.local
```

Then fill in your configuration:

```env
# Database
DATABASE_URL="mysql://user:password@localhost:3306/a_sisyphus"

# Auth
AUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://localhost:3000"

# Microsoft 365 (MANDATORY)
TENANT_ID="your-tenant-id"
APPLICATION_ID="your-application-id"
CLIENT_SECRET_VALUE="your-client-secret"

# Bunny CDN (MANDATORY)
BUNNY_ACCESS_KEY="your-bunny-access-key"
BUNNY_CDN_HOSTNAME="your-domain.b-cdn.net"
BUNNY_STORAGE_ZONE="your-storage-zone"

# Mailgun
MAILGUN_API_KEY="your-mailgun-api-key"
MAILGUN_DOMAIN="your-domain.com"
```

### 3. Setup Database

```bash
# Run migrations (creates schema)
npm run db:migrate

# Seed demo data (and export to Bunny CDN)
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
```

Open http://localhost:3000 — redirects to login page.

## Login Credentials

Use these test credentials:

| Email | Password | Role |
|-------|----------|------|
| gkozyris@i4ria.com | 1f1femsk | Admin |
| admin@example.com | password123 | Admin |
| manager@example.com | password123 | Manager |
| member@example.com | password123 | Member |
| viewer@example.com | password123 | Viewer |

## Key Features

### 🔐 Authentication & RBAC

- **Role-Based Access Control**: Admin, Manager, Member, Viewer
- **Credentials Authentication**: Email/password with bcryptjs
- **Microsoft 365 Integration**: Azure AD authentication (mandatory)
- **Protected Routes**: Automatic session validation
- **JWT Sessions**: 30-day expiration

### 🌍 Multi-Language Support

Supports 7 languages:
- 🇺🇸 English
- 🇪🇸 Spanish
- 🇫🇷 French
- 🇩🇪 German
- 🇵🇹 Portuguese
- 🇯🇵 Japanese
- 🇨🇳 Chinese

### 📁 PMS (Project Management System)

```
pms/
├── projects/      # Project data exports
├── tasks/         # Task snapshots
├── attachments/   # File attachments
├── exports/       # CSV and report files
└── README.md      # Documentation
```

### ☁️ Bunny CDN Integration

- **Store project exports** as JSON snapshots
- **Export tasks** as CSV reports
- **File attachments** via CDN
- **Automatic backup** with timestamps
- **CDN-delivered** files for fast access

### 🖥️ Server-Side Components

All data fetching uses **Next.js Server Components**:
- Direct database access
- No API routes needed for data fetching
- Type-safe database queries
- Automatic caching and revalidation

See [SERVER_COMPONENTS_GUIDE.md](SERVER_COMPONENTS_GUIDE.md)

### 📊 Project Management Features

- **Dashboard** - Stats, activity feed, recent projects
- **Projects** - Grid/list view with status filters
- **Kanban Board** - Drag-and-drop task management
- **Calendar** - View tasks by date
- **Files** - OneDrive/SharePoint integration ready
- **Team** - Manage team members and roles
- **Settings** - User preferences and integrations

## Project Structure

```
app/
  api/auth/              # Auth.js route handlers
  auth/signin/           # Login page
  (app)/                 # Protected routes
    dashboard/
    projects/
    board/
    calendar/
    files/
    team/
    settings/

lib/
  auth.config.ts         # Auth.js with RBAC
  prisma.ts              # Prisma client
  i18n.ts                # i18next configuration
  db.ts                  # Server database functions
  pms-storage.ts         # PMS & CDN operations
  bunnycdn.ts            # BunnyCDN utilities
  mailgun.ts             # Email service

pms/                     # Project Management System
  projects/              # Exports directory
  tasks/                 # Tasks directory
  attachments/           # Attachments directory
  exports/               # Reports directory
  README.md              # PMS documentation

locales/                 # Translation files
  en.json, es.json, ...

prisma/
  schema.prisma          # Database schema
  seed.ts                # Database seed script

middleware.ts            # Route protection
```

## Development Commands

```bash
# Start dev server
npm run dev

# Build production bundle
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Database commands
npm run db:migrate       # Create/update database
npm run db:seed          # Seed demo data
npm run db:studio        # Open Prisma Studio (DB editor)
npm run db:push          # Push schema to DB
```

## Architecture

### Three-Phase Build Plan

| Phase | Goal | Status |
|-------|------|--------|
| **1. UI/UX** | Every screen clickable, drag-drop works, types production-ready | ✅ Done |
| **2. Database & Auth** | Real database, auth with RBAC, PMS, CDN storage | ✅ Done |
| **3. Microsoft 365** | Full integration with Graph API, webhooks, sync | 🔜 Next |

### Storage Strategy

- **Database (Prisma + MySQL)**: Metadata, relationships, real-time data
- **Bunny CDN**: Exports, backups, large files, CDN-delivered content

### Data Flow

```
Server Components
    ↓ (fetch data)
Prisma / Database
    ↓ (store metadata)
Bunny CDN (exports)
    ↓ (serve files)
Client Components
```

## Role-Based Routes

| Role | Access |
|------|--------|
| **Admin** | All routes + admin panel |
| **Manager** | Dashboard, projects, team, settings |
| **Member** | Dashboard, projects, board, calendar, files |
| **Viewer** | Dashboard, projects (read-only) |

## Microsoft 365 Integration

### Configuration

1. Create Azure AD Application
2. Set permissions for Microsoft Graph API
3. Store credentials in `.env.local`:
   ```env
   TENANT_ID=your-tenant-id
   APPLICATION_ID=your-app-id
   CLIENT_SECRET_VALUE=your-secret
   ```

### Features

- ✅ Azure AD authentication
- ✅ Microsoft Teams integration
- ✅ SharePoint file storage
- ✅ Outlook calendar sync
- ✅ Microsoft Graph API access

See [AUTH_I18N_SETUP.md](AUTH_I18N_SETUP.md)

## Bunny CDN Storage

### Export Project

```typescript
import { exportProjectToCDN } from '@/lib/pms-storage';

const url = await exportProjectToCDN(projectId);
```

### Export as CSV

```typescript
import { exportProjectAsCSV } from '@/lib/pms-storage';

const url = await exportProjectAsCSV(projectId);
```

See [PMS_CDN_INTEGRATION.md](PMS_CDN_INTEGRATION.md)

## Tech Stack

- **Frontend**: Next.js 16.2.4, React 18, TypeScript
- **Styling**: Tailwind CSS 3.4, Fluent 2 design
- **Database**: MySQL 8, Prisma ORM
- **Authentication**: Auth.js v5 with JWT + Azure AD
- **Storage**: Bunny CDN
- **Email**: Mailgun
- **i18n**: next-intl with 7 languages
- **Drag & Drop**: @dnd-kit
- **Animations**: Framer Motion

## Common Tasks

### Convert Component to Server Component

```typescript
// ❌ Before: Client component with useEffect
'use client'
export default function Page() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(setData);
  }, []);
  return <div>{data?.name}</div>;
}

// ✅ After: Server component with direct fetch
import { getData } from '@/lib/db';
export default async function Page() {
  const data = await getData();
  return <div>{data?.name}</div>;
}
```

### Add Server Action

```typescript
// lib/actions.ts
'use server'
export async function updateProject(id: string, data: any) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  
  return prisma.project.update({ where: { id }, data });
}

// components/form.tsx
'use client'
import { updateProject } from '@/lib/actions';
export function Form({ id }) {
  return <form action={(formData) => updateProject(id, Object.fromEntries(formData))}>...</form>;
}
```

### Create Protected Route

```typescript
// app/(app)/admin/page.tsx
import { getCurrentUser } from '@/lib/db';
import { redirect } from 'next/navigation';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') redirect('/dashboard');
  
  return <AdminPanel />;
}
```

### Use PMS Storage

```typescript
'use server'
import { exportProjectToCDN, getProjectExportsFromCDN } from '@/lib/pms-storage';

// In your component
const exports = await getProjectExportsFromCDN(projectId);
```

## Troubleshooting

### Session not found
- Check `AUTH_SECRET` in `.env.local`
- Clear browser cookies
- Verify database connection

### Microsoft 365 login fails
- Verify tenant ID and application ID
- Check client secret value
- Confirm Azure AD permissions
- Test in Azure AD admin portal

### Bunny CDN upload fails
- Check access key is correct
- Verify storage zone exists
- Confirm CDN hostname is set
- Check file size limits

### i18n not working
- Verify `/locales` folder exists
- Check translation JSON files
- Clear browser localStorage
- Confirm `NEXT_PUBLIC_SUPPORTED_LANGUAGES`

### Database connection fails
- Verify `DATABASE_URL` format
- Check MySQL server is running
- Run `npm run db:migrate`
- Check user permissions

## Documentation Files

- [QUICK_START.md](QUICK_START.md) - This file
- [AUTH_I18N_SETUP.md](AUTH_I18N_SETUP.md) - Auth & i18n details
- [SERVER_COMPONENTS_GUIDE.md](SERVER_COMPONENTS_GUIDE.md) - Server components & data fetching
- [PMS_CDN_INTEGRATION.md](PMS_CDN_INTEGRATION.md) - PMS & Bunny CDN integration
- [HANDOFF.md](HANDOFF.md) - Original project overview
- [pms/README.md](pms/README.md) - PMS folder structure

## Next Steps

1. ✅ **Phase 2 Complete**: Database, Auth, PMS, CDN
2. 📅 **Phase 3**: Full Microsoft 365 integration
3. 🔄 **Roadmap**: Webhooks, real-time sync, advanced reporting

## Support

For issues or questions, check documentation files or contact the team.

---

**Version**: 16.2.4 with Auth.js, Microsoft 365, Bunny CDN & Server Components  
**Last Updated**: April 2026

