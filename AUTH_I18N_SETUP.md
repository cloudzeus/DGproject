# Auth.js RBAC Setup Guide

## Overview

This project now includes **auth.js** (Auth.js v5) for role-based access control (RBAC) with support for credentials-based authentication and OAuth.

## Features

- ✅ **Role-Based Access Control (RBAC)**: Admin, Manager, Member, Viewer roles
- ✅ **Credentials Authentication**: Email/password login with bcryptjs
- ✅ **JWT Sessions**: 30-day session management
- ✅ **Route Protection**: Automatic redirect for unauthorized access
- ✅ **Type-Safe**: Full TypeScript support with role types
- ✅ **Database**: Prisma ORM with MySQL

## Setup Instructions

### 1. Environment Configuration

Create a `.env.local` file in the root directory:

```env
# Database
DATABASE_URL="mysql://user:password@localhost:3306/fluent_pm"

# Auth
AUTH_SECRET="generate-a-random-string-here"
# Generate with: openssl rand -base64 32

# NextAuth Config
AUTH_REDIRECT_PROXY_URL="http://localhost:3000"

# i18n
NEXT_PUBLIC_DEFAULT_LANGUAGE="en"
NEXT_PUBLIC_SUPPORTED_LANGUAGES="en,es,fr,de,pt,ja,zh"
```

### 2. Database Setup

```bash
# Install Prisma CLI
npm install -D prisma

# Generate Prisma client
npx prisma generate

# Run migrations (set up database schema)
npx prisma migrate dev --name init

# Seed initial data (optional)
npx prisma db seed
```

### 3. Create Initial Admin User

Run this script to create a demo admin user:

```bash
npx prisma db execute --stdin << EOF
INSERT INTO User (id, email, password, name, role, createdAt, updatedAt) VALUES (
  'user_1',
  'admin@example.com',
  '\$2a\$10\$...', -- bcrypt hash of 'password123'
  'Admin User',
  'admin',
  NOW(),
  NOW()
);
EOF
```

Or use a seeding script in `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcryptjs.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'admin',
    },
  });

  console.log('Created admin user:', admin);
}

main();
```

## Architecture

### Authentication Flow

```
User Request
    ↓
Middleware (middleware.ts)
    ↓ (Check session)
Protected Route?
    ├─ Yes → Valid session? 
    │        ├─ Yes → Continue
    │        └─ No → Redirect to /auth/signin
    └─ No → Continue
```

### File Structure

```
app/
├── api/auth/route.ts           # Auth.js handlers
├── auth/
│   ├── signin/page.tsx         # Login page
│   └── signup/page.tsx         # Registration (future)
└── (app)/                       # Protected routes
    ├── dashboard/
    ├── projects/
    └── ...
lib/
├── auth.config.ts              # Auth.js configuration
├── prisma.ts                   # Prisma client
└── i18n.ts                     # i18n configuration
middleware.ts                    # Route protection
```

## Role-Based Access Control

### Available Roles

| Role | Permissions |
|------|---|
| **admin** | Full access to all routes and settings |
| **manager** | Access to `/settings` and project management |
| **member** | Access to projects, board, calendar, files, team |
| **viewer** | Read-only access to dashboard and projects |

### Protected Routes

- `/dashboard` → Any authenticated user
- `/projects` → Any authenticated user
- `/board` → Any authenticated user
- `/calendar` → Any authenticated user
- `/files` → Any authenticated user
- `/team` → Any authenticated user
- `/settings` → Admin, Manager
- `/admin` → Admin only

## API Routes

### Sign In

```typescript
import { signIn } from '@/app/api/auth/route';

// Credentials flow
const result = await signIn('credentials', {
  email: 'user@example.com',
  password: 'password123',
  redirect: false,
});

if (result?.error) {
  console.error('Sign in failed:', result.error);
}
```

### Get Session

```typescript
import { auth } from '@/app/api/auth/route';

export default async function MyPage() {
  const session = await auth();
  
  if (!session?.user) {
    return <div>Not authenticated</div>;
  }

  return (
    <div>
      <p>Welcome, {session.user.name}</p>
      <p>Role: {session.user.role}</p>
    </div>
  );
}
```

### Sign Out

```typescript
import { signOut } from '@/app/api/auth/route';

export function LogoutButton() {
  return (
    <button onClick={() => signOut({ redirectTo: '/' })}>
      Logout
    </button>
  );
}
```

## Multi-Language Support (i18n)

### Configuration

Translation files are located in `/locales/` directory:
- `en.json` - English
- `es.json` - Spanish
- `fr.json` - French
- `de.json` - German
- `pt.json` - Portuguese
- `ja.json` - Japanese
- `zh.json` - Chinese (Simplified)

### Usage

```typescript
'use client';

import { useTranslation } from 'react-i18next';

export function MyComponent() {
  const { t, i18n } = useTranslation();

  return (
    <div>
      <h1>{t('dashboard.title')}</h1>
      <p>{t('dashboard.greeting')}</p>
      
      <button onClick={() => i18n.changeLanguage('es')}>
        Español
      </button>
    </div>
  );
}
```

### Adding New Translations

1. Add key to all translation files in `/locales/`:

```json
{
  "myFeature": {
    "title": "My Feature Title",
    "description": "My feature description"
  }
}
```

2. Use in components:

```typescript
const { t } = useTranslation();
<h1>{t('myFeature.title')}</h1>
```

## Security Best Practices

1. **AUTH_SECRET**: Never commit to git. Use environment variables in production
2. **Password Hashing**: Always use bcryptjs for password hashing
3. **HTTPS**: Always use HTTPS in production
4. **Session Management**: Sessions expire after 30 days
5. **CSRF Protection**: Auth.js handles CSRF tokens automatically
6. **Role Validation**: Always validate roles on the server side

## Testing

### Test Credentials

```
Email: admin@example.com
Password: password123
Role: admin
```

### Login Flow

1. Navigate to `http://localhost:3000/auth/signin`
2. Enter test credentials
3. You'll be redirected to `/dashboard`

## Troubleshooting

### "Session not found" error

- Check `AUTH_SECRET` is set in `.env.local`
- Verify database connection is working
- Clear browser cookies and try again

### "Insufficient permissions" error

- Verify user role in database
- Check role-based route protection in `middleware.ts`
- Ensure authenticated user has correct role

### i18n not working

- Check `/locales` folder has translation files
- Verify i18n is initialized in root layout
- Browser localStorage should have `i18nextLng` key

## Next Steps

1. Implement OAuth providers (Azure AD, Google, GitHub)
2. Add email verification for sign-up
3. Implement password reset flow
4. Add user profile management
5. Implement audit logging for admin actions

## Resources

- [Auth.js Documentation](https://authjs.dev)
- [Prisma Documentation](https://www.prisma.io/docs)
- [i18next Documentation](https://www.i18next.com)
- [bcryptjs Documentation](https://github.com/dcodeIO/bcrypt.js)
