#!/usr/bin/env bash
#
# backup-database.sh — wrapper για system cron / launchd / supervisord.
#
# Cron entry παράδειγμα (crontab -e):
#   0 3 * * * /path/to/fluent-pm/scripts/backup-database.sh >> /var/log/fluent-pm-backup.log 2>&1
#
# Πρέπει να τρέξει από το project root, γι' αυτό κάνουμε cd εμείς. Δεν χρειάζεται
# άλλο environment setup — το script φορτώνει .env / .env.local μόνο του.

set -euo pipefail

# Resolve project root από τη θέση του ίδιου του script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# In production, prefer absolute paths. Override these via env if needed.
NPX_BIN="${NPX_BIN:-/usr/local/bin/npx}"
if ! command -v "$NPX_BIN" >/dev/null 2>&1; then
  NPX_BIN="$(command -v npx)"
fi

# macOS με homebrew mysql 9.x + παλιότερος server → χρειάζεται mysqldump 8.0.
if [[ -z "${MYSQLDUMP_BIN:-}" ]] && [[ -x "/opt/homebrew/opt/mysql-client@8.0/bin/mysqldump" ]]; then
  export MYSQLDUMP_BIN="/opt/homebrew/opt/mysql-client@8.0/bin/mysqldump"
fi

# Retention: keep 14 days by default. Tune με `RETENTION_DAYS=30 ./backup-database.sh`.
RETENTION_DAYS="${RETENTION_DAYS:-14}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] backup starting…"
"$NPX_BIN" tsx scripts/backup-database.ts --prune "$RETENTION_DAYS"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] backup done"
