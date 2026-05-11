# Database Backup — Setup & Operations

Καθημερινό automatic backup της MySQL βάσης σε Bunny Storage, με optional
AES-256-GCM encryption και retention policy.

---

## Architecture

```
┌─ Coolify Scheduled Task (cron) ─────────────────────────────────┐
│                                                                  │
│  daily 03:00  →  bash scripts/backup-database.sh                │
│                       ↓                                          │
│                  npx tsx scripts/backup-database.ts --prune 14  │
│                       ↓                                          │
│                  lib/db-backup.ts                                │
│                       ↓                                          │
│  mysqldump → gzip → [AES-256-GCM if BACKUP_ENCRYPTION_KEY] →    │
│      Bunny Storage  (backups/db/<env>/<YYYY-MM-DD>/db-<ts>.…)   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 1. Critical security setup (do this FIRST)

### 1.1 Separate Bunny Storage Zone

⚠️ **Τα backups ΔΕΝ πρέπει να ζουν στην ίδια storage zone με public assets**.
Αν χρησιμοποιείς την ίδια zone (`dgsoft` στην περίπτωσή σου) ένας Pull Zone
front-end θα μπορεί να επιστρέψει το backup file δημόσια.

Steps στο [Bunny dashboard](https://dash.bunny.net):

1. **Storage → Add Storage Zone**
   - Name: `dgsoft-backups` (ή ό,τι θες)
   - Region: ίδιο με app για ταχύτητα (π.χ. Frankfurt)
   - **Do NOT attach a Pull Zone**
2. Copy το **Password** (FTP & API access key) — αυτό είναι το `BUNNY_ACCESS_KEY` *για αυτή τη zone*
3. Πρόσθεσε στο `.env.local` και στο Coolify env vars:

```bash
BUNNY_BACKUP_STORAGE_ZONE=dgsoft-backups
BUNNY_BACKUP_ACCESS_KEY=...   # password από τη zone αν είναι διαφορετικό
```

(Σημείωση: το τρέχον module χρησιμοποιεί το **ίδιο** `BUNNY_ACCESS_KEY` για όλες
τις zones. Bunny επιτρέπει per-zone passwords — αν θες διαχωρισμό access keys,
ζήτα μου να το προσθέσω.)

### 1.2 Encryption at rest

Πρόσθεσε ένα strong passphrase (αποθήκευσε σε password manager):

```bash
BACKUP_ENCRYPTION_KEY=<48+ characters of randomness>
```

Όταν είναι set, τα backups κρυπτογραφούνται με **AES-256-GCM** πριν φύγουν από
το container. Framing: `[16B salt][12B IV][16B tag][ciphertext]`.

Παράδειγμα generation:
```bash
openssl rand -base64 48
```

### 1.3 Backup secret για API endpoint (αν θες HTTP-triggered cron)

```bash
BACKUP_SECRET_TOKEN=<32+ random chars>
```

---

## 2. Coolify deployment

### 2.1 Nixpacks config (already added)

[nixpacks.toml](nixpacks.toml) περιλαμβάνει `mysql80` package ώστε το mysqldump
να είναι διαθέσιμο στο runtime container. Στο επόμενο deploy γίνεται auto-pickup.

### 2.2 Environment variables (Coolify UI → Application → Environment)

Πρόσθεσε όλα αυτά:

```bash
# Backup destination
BUNNY_BACKUP_STORAGE_ZONE=dgsoft-backups
BUNNY_ACCESS_KEY=<storage access key>           # ήδη υπάρχει
BUNNY_STORAGE_API_HOST=storage.bunnycdn.com    # ήδη υπάρχει

# Security
BACKUP_ENCRYPTION_KEY=<48+ chars from openssl rand -base64 48>
BACKUP_SECRET_TOKEN=<32+ chars from openssl rand -hex 32>

# Optional
RETENTION_DAYS=14
NODE_ENV=production
```

### 2.3 Scheduled Task

Coolify UI → **Application → Scheduled Tasks → + New Scheduled Task**:

- **Name**: `daily-db-backup`
- **Command**: `bash scripts/backup-database.sh`
- **Frequency** (cron syntax): `0 3 * * *` (κάθε μέρα 03:00 UTC ≈ 06:00 EEST summer / 05:00 winter)
- **Container**: ίδιο με την κύρια εφαρμογή

Save. Coolify εκτελεί το command μέσα στο container κάθε φορά που ταιριάζει η cron expression.

Το script κάνει αυτόματα:
- mysqldump μέσω `MYSQLDUMP_BIN` (αν είναι set) ή system default
- gzip
- AES encryption αν έχεις `BACKUP_ENCRYPTION_KEY`
- upload σε Bunny `backups/db/production/<YYYY-MM-DD>/...`
- **prune** backups παλιότερα από `RETENTION_DAYS` (default 14)

### 2.4 Logs

Coolify UI → Application → Logs → φιλτράρισε `[backup]` ή `[cron-backup]`.

Επιτυχία:
```
[backup] starting (encryption=true)
[backup] ✅ backups/db/production/2026-05-12/db-2026-05-12T03-00-00-000Z.sql.gz.enc  12.5 MB  4521ms  encrypted
[prune] scanned 30 folders, deleted 0 files
```

Αποτυχία:
```
[backup] ❌ mysqldump exited 2: <error message>
```

---

## 3. Alternative: HTTP-triggered cron

Αν προτιμάς external scheduler (π.χ. [cron-job.org](https://cron-job.org), [EasyCron](https://easycron.com)):

```
URL:      https://your-app.com/api/admin/backup-database?prune=14
Method:   POST
Header:   X-Backup-Token: <BACKUP_SECRET_TOKEN>
Schedule: 0 3 * * *
```

Αυτό είναι useful αν:
- Έχεις multiple instances και θες να μην τρέχει cron σε όλα
- Θες notifications/retries που το external scheduler προσφέρει

---

## 4. Manual / on-demand backup

```bash
# Local development
MYSQLDUMP_BIN=/opt/homebrew/opt/mysql-client@8.0/bin/mysqldump \
  npx tsx scripts/backup-database.ts

# With prune
MYSQLDUMP_BIN=/opt/homebrew/opt/mysql-client@8.0/bin/mysqldump \
  npx tsx scripts/backup-database.ts --prune 30

# Via shell wrapper (auto-detects mysql-client 8.0 path on macOS)
bash scripts/backup-database.sh
```

---

## 5. Restore από backup

### 5.1 Encrypted backup (.sql.gz.enc)

Κατέβασε το file από Bunny dashboard ή με curl:

```bash
curl -H "AccessKey: $BUNNY_ACCESS_KEY" \
  https://storage.bunnycdn.com/dgsoft-backups/backups/db/production/2026-05-12/db-...sql.gz.enc \
  -o backup.sql.gz.enc
```

Decrypt + decompress + import (απαιτεί το ίδιο `BACKUP_ENCRYPTION_KEY` που είχαμε στο backup):

```bash
npx tsx scripts/restore-database.ts ./backup.sql.gz.enc
```

(Το `scripts/restore-database.ts` θα δημιουργηθεί όταν το χρειαστούμε πρώτη
φορά — δεν είναι έτοιμο τώρα για να μην προτρέξουμε σε untested untested
destructive code.)

### 5.2 Unencrypted backup (.sql.gz)

```bash
gunzip -c backup.sql.gz | mysql -u USER -p DBNAME
```

---

## 6. Monitoring & alerting

Recommended:
1. **Coolify** ήδη logs τα Scheduled Tasks — δες ότι το cron τρέχει επιτυχημένα
2. **Uptime monitor** για το URL `/api/admin/backup-database` (set up GET endpoint with health response)
3. Optional: webhook ειδοποίηση όταν αποτυγχάνει το cron (δεν είναι ακόμα wired up — ρώτα με όταν το θες)

---

## 7. Όταν αλλάξεις server

Όταν μετακινήσεις την εφαρμογή σε νέο Coolify instance:
1. Copy όλα τα backup-related env vars
2. Confirm ότι το νέο nixpacks build περιλαμβάνει `mysql80`
3. Re-add τη Scheduled Task στο νέο instance
4. **Δες ότι έγινε πρώτο backup χειροκίνητα** πριν αφήσεις τη cron μόνη της

---

## 8. Files added για αυτό το feature

```
nixpacks.toml                              # mysql-client στο Coolify build
.github/workflows/backup-database.yml      # alternative GitHub Actions cron
lib/db-backup.ts                           # backup pipeline + retention
scripts/backup-database.ts                 # CLI entrypoint
scripts/backup-database.sh                 # cron wrapper (auto-detects mysqldump path)
app/api/admin/backup-database/route.ts     # HTTP-triggered cron (GET+POST, dual auth)
BACKUP_SETUP.md                            # this file
```
