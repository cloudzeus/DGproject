# PMS & Bunny CDN Integration Guide

This guide explains how to use the Bunny CDN for storing and retrieving PMS (Project Management System) data.

## Overview

A-Sisyphus uses a hybrid storage strategy:

- **Database (Prisma + MySQL)**: Metadata, relationships, and transactional data
- **Bunny CDN**: Large files, exports, backups, and archived project data

## Quick Start

### 1. Configure Bunny CDN

Update your `.env.local`:

```env
BUNNY_ACCESS_KEY="your-access-key"
BUNNY_CDN_HOSTNAME="your-domain.b-cdn.net"
BUNNY_STORAGE_ZONE="your-storage-zone"
BUNNY_STORAGE_API_HOST="storage.bunnycdn.com"
```

### 2. Export Project Data

```typescript
'use server'
import { exportProjectToCDN } from '@/lib/pms-storage';

// In your component or server action
const cdnUrl = await exportProjectToCDN(projectId);
console.log('Project exported to:', cdnUrl);
```

### 3. Export as CSV

```typescript
'use server'
import { exportProjectAsCSV } from '@/lib/pms-storage';

const csvUrl = await exportProjectAsCSV(projectId);
console.log('CSV exported to:', csvUrl);
```

## API Reference

### `exportProjectToCDN(projectId)`

Exports full project data to Bunny CDN as JSON.

**Parameters:**
- `projectId` (string) - The project ID to export

**Returns:**
- Promise<string> - CDN URL of the exported file

**Example:**
```typescript
const url = await exportProjectToCDN('project-123');
// Returns: https://dgsoft.b-cdn.net/pms/projects/project-project-123-1713361200000.json
```

**Data Includes:**
- Project metadata (name, description, status)
- All tasks with details
- Comments and attachments
- Workspace information
- Export timestamp

### `exportProjectAsCSV(projectId)`

Exports project tasks as CSV file.

**Parameters:**
- `projectId` (string) - The project ID to export

**Returns:**
- Promise<string> - CDN URL of the CSV file

**Example:**
```typescript
const url = await exportProjectAsCSV('project-123');
// Returns: https://dgsoft.b-cdn.net/pms/exports/project-project-123-export-1713361200000.csv
```

**CSV Columns:**
- Task ID
- Title
- Status
- Priority
- Due Date
- Estimated Hours
- Comments Count
- Created At
- Updated At

### `storeTaskToCDN(taskId)`

Stores individual task data to CDN.

**Parameters:**
- `taskId` (string) - The task ID to store

**Returns:**
- Promise<string> - CDN URL of the stored task

**Example:**
```typescript
const url = await storeTaskToCDN('task-456');
```

### `getProjectExportsFromCDN(projectId)`

Retrieves all exports/backups for a project.

**Parameters:**
- `projectId` (string) - The project ID

**Returns:**
- Promise<Attachment[]> - Array of attachment records

**Example:**
```typescript
const exports = await getProjectExportsFromCDN('project-123');
exports.forEach(exp => {
  console.log(`${exp.name}: ${exp.url}`);
});
```

### `deleteProjectExportFromCDN(attachmentId)`

Deletes an export from CDN and database.

**Parameters:**
- `attachmentId` (string) - The attachment ID to delete

**Returns:**
- Promise<boolean> - Success status

**Example:**
```typescript
const success = await deleteProjectExportFromCDN('attach-789');
if (success) {
  console.log('Export deleted');
}
```

## PMS Folder Structure

```
pms/
├── projects/      # Project data exports
├── tasks/         # Task snapshots
├── attachments/   # File attachments
├── exports/       # CSV and report files
└── README.md      # PMS documentation
```

Each folder stores files with the following naming pattern:
```
{type}-{entityId}-{timestamp}.{extension}
```

## File Storage Locations

All files are stored in Bunny CDN with these paths:

| Type | Path | Example |
|------|------|---------|
| Projects | `pms/projects/` | `pms/projects/project-abc123-1713361200000.json` |
| Tasks | `pms/tasks/` | `pms/tasks/task-xyz789-1713361200000.json` |
| Exports | `pms/exports/` | `pms/exports/project-abc123-export-1713361200000.csv` |
| Attachments | `pms/attachments/` | `pms/attachments/filename.pdf` |

Access via CDN:
```
https://dgsoft.b-cdn.net/pms/{folder}/{filename}
```

## Server-Side Usage

All PMS storage functions are server-side ('use server'):

```typescript
'use client'
import { exportProjectToCDN } from '@/lib/pms-storage';

export function ExportButton({ projectId }) {
  const handleExport = async () => {
    const url = await exportProjectToCDN(projectId);
    // Handle the exported URL
  };

  return <button onClick={handleExport}>Export Project</button>;
}
```

## Database References

Exported files are automatically saved in the `attachments` table:

```sql
SELECT * FROM attachments
WHERE projectId = 'project-123'
AND source = 'bunnycdn'
AND mimeType IN ('application/json', 'text/csv');
```

## Seeding with Bunny CDN

The seed script automatically:

1. Creates demo users and workspaces
2. Creates sample projects and tasks
3. Exports project data to Bunny CDN
4. Stores CDN URL references in the database

To run seeding:
```bash
npm run db:seed
```

## File Size Limits

- **Project JSON exports**: Up to 50MB
- **CSV exports**: Up to 100MB
- **Individual file uploads**: Up to 512MB
- **Total storage**: Based on Bunny CDN plan

## Bandwidth & Performance

- Files served from Bunny CDN edge network
- Automatic compression for JSON and CSV files
- Cache headers: 1 year for versioned files
- Cache purge: Available via `purgeCDNCache(filePath)`

## Error Handling

```typescript
try {
  const url = await exportProjectToCDN(projectId);
} catch (error) {
  console.error('Export failed:', error);
  // Handle error - check CDN credentials
}
```

**Common Issues:**

| Error | Solution |
|-------|----------|
| `BUNNY_ACCESS_KEY not found` | Check .env.local configuration |
| `401 Unauthorized` | Verify API key and storage zone |
| `File too large` | Check file size limits |
| `Connection timeout` | Verify network and Bunny CDN status |

## Best Practices

1. **Export regularly**: Schedule automatic exports for important projects
2. **Version control**: Each export has a timestamp for tracking
3. **Archive strategy**: Clean up old exports (retention policy: 6 months)
4. **Backup redundancy**: Keep multiple versions of critical exports
5. **Access control**: Only admins can export/delete from CDN
6. **Monitor usage**: Track CDN bandwidth and storage costs

## Automated Exports

To set up scheduled exports:

```typescript
// pages/api/cron/export-projects.ts
import { exportProjectToCDN } from '@/lib/pms-storage';

export default async function handler(req, res) {
  // Export all active projects every day
  const projects = await prisma.project.findMany({
    where: { status: 'active' }
  });

  for (const project of projects) {
    await exportProjectToCDN(project.id);
  }

  res.status(200).json({ exported: projects.length });
}
```

## Troubleshooting

### Files not uploading
- Check Bunny CDN credentials in `.env.local`
- Verify storage zone is active
- Check file size limits

### URLs not accessible
- Confirm `BUNNY_CDN_HOSTNAME` is correct
- Check CDN cache settings
- Verify file exists in storage zone

### Export taking too long
- Large projects may take time - use CSV instead of JSON
- Consider exporting by date range
- Check database query performance

## Resources

- [Bunny CDN Documentation](https://bunny.net/docs)
- [PMS Storage API](../lib/pms-storage.ts)
- [Bunny CDN Utilities](../lib/bunnycdn.ts)
- [Database Schema](../prisma/schema.prisma)
