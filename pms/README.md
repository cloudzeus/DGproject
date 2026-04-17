# PMS (Project Management System) Folder Structure

This directory contains the project management system data structure and storage configuration.

## Folder Organization

### `/projects`
Stores project-related data exports and backups
- Project metadata JSON files
- Project snapshots at different timestamps
- Project configuration backups
- Typical filename: `project-{projectId}-{timestamp}.json`

### `/tasks`
Stores task-specific data
- Individual task backups with comments
- Task history snapshots
- Task descriptions and metadata
- Typical filename: `task-{taskId}-{timestamp}.json`

### `/attachments`
Stores project and task file attachments
- Document uploads
- Image files
- Media assets
- File references (metadata stored in DB, actual files on Bunny CDN)

### `/exports`
Stores exported reports and data
- CSV exports of projects and tasks
- PDF reports (when generated)
- Excel worksheets
- Typical filename: `project-{projectId}-export-{timestamp}.csv`

## Data Storage Strategy

### Local Database (Prisma + MySQL)
- User accounts and authentication
- Project and task metadata
- Comments and relationships
- Activity logs

### Bunny CDN Storage
- Project exports and backups
- Task snapshots
- Report files (CSV, PDF, Excel)
- Large file attachments
- Efficient file streaming and CDN delivery

## File Naming Convention

All exported files follow this pattern:
```
{type}-{entityId}-{timestamp}.{extension}
```

Examples:
- `project-abc123-1713361200000.json`
- `task-xyz789-1713361200000.json`
- `project-abc123-export-1713361200000.csv`

## API Usage

### Export Project to CDN
```typescript
import { exportProjectToCDN } from '@/lib/pms-storage';

const cdnUrl = await exportProjectToCDN(projectId);
```

### Export Project as CSV
```typescript
import { exportProjectAsCSV } from '@/lib/pms-storage';

const csvUrl = await exportProjectAsCSV(projectId);
```

### Store Task Data
```typescript
import { storeTaskToCDN } from '@/lib/pms-storage';

const taskUrl = await storeTaskToCDN(taskId);
```

### Get Project Exports
```typescript
import { getProjectExportsFromCDN } from '@/lib/pms-storage';

const exports = await getProjectExportsFromCDN(projectId);
```

## CDN Configuration

The PMS folder uses the following Bunny CDN configuration:

```env
BUNNY_ACCESS_KEY=your-access-key
BUNNY_CDN_HOSTNAME=dgsoft.b-cdn.net
BUNNY_STORAGE_ZONE=dgsoft
BUNNY_STORAGE_API_HOST=storage.bunnycdn.com
```

All files are automatically versioned with timestamps and can be accessed via the CDN URL:
```
https://dgsoft.b-cdn.net/pms/{folder}/{filename}
```

## Benefits

✅ **Scalability**: Offload file storage to CDN
✅ **Performance**: Fast file delivery via CDN edge network
✅ **Backup**: Automatic versioning with timestamps
✅ **Archive**: Easy project history tracking
✅ **Compliance**: Audit trail of all exports
✅ **Cost**: Efficient storage and bandwidth usage

## Retention Policy

- Project exports: Retained for 1 year
- Task snapshots: Retained for 6 months
- Report files: Retained for 3 months
- Temporary exports: Cleaned up after 30 days

## Related Services

- **Mailgun** (`lib/mailgun.ts`) - Send file notifications
- **Bunny CDN** (`lib/bunnycdn.ts`) - File storage and delivery
- **Database** (`lib/db.ts`) - Metadata and relationships
- **PMS Storage** (`lib/pms-storage.ts`) - Export and backup operations
