#!/usr/bin/env bash
#
# Nightly backup: the SQLite file and the encrypted photos.
#
# Install with `crontab -e`:
#   15 3 * * * /srv/gym/deploy/backup.sh >> /srv/gym/logs/backup.log 2>&1
#
# Restoring is a file copy — stop pm2, put the .sqlite file and the photos
# directory back, start pm2. There is no import step and nothing to replay.

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/gym}"
KEEP_DAYS="${KEEP_DAYS:-30}"

DB_PATH="${SQLITE_PATH:-$APP_DIR/data/gym.sqlite}"
PHOTO_DIR="${PHOTO_DIR:-$APP_DIR/data/photos}"

stamp="$(date +%Y-%m-%d)"
target="$BACKUP_DIR/$stamp"
mkdir -p "$target"
chmod 700 "$BACKUP_DIR" "$target"

# An online snapshot through SQLite's own backup API. Not `cp` — in WAL mode the
# most recent writes are still in the -wal file, so copying the main file
# silently loses them. That is not theoretical: the first real run of this
# script with a cp fallback produced a backup missing half the workouts and
# every set. Doing it through the driver leaves no fallback path to get wrong.
cd "$APP_DIR"
SQLITE_PATH="$DB_PATH" npx tsx scripts/backup-db.ts "$target/gym.sqlite"

if [ -d "$PHOTO_DIR" ]; then
  tar -czf "$target/photos.tar.gz" -C "$(dirname "$PHOTO_DIR")" "$(basename "$PHOTO_DIR")"
fi

# The photos in the archive are still encrypted, so the backup is useless
# without ENCRYPTION_KEY. Keep a copy of that key somewhere other than this
# server — losing it loses every photo, backup or not.
cp "$APP_DIR/.env.local" "$target/env.local.copy" 2>/dev/null || true
chmod -R go-rwx "$target"

find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*' -mtime "+$KEEP_DAYS" -exec rm -rf {} +

echo "$(date -Iseconds) backed up to $target ($(du -sh "$target" | cut -f1))"
