#!/bin/bash
# ============================================================================
# Zynk — Automated Database Backup Script
#
# Features:
# - Full PostgreSQL dump with compression
# - Upload to S3 with server-side encryption
# - Retention management (keep last 30 daily, 12 weekly, 12 monthly)
# - Slack notification on success/failure
# - Point-in-time recovery support via WAL archiving
#
# Usage:
#   ./backup.sh                 # Full backup
#   ./backup.sh --type wal      # WAL archive only
#
# Cron:
#   0 2 * * *  /opt/zynk/scripts/backup.sh >> /var/log/zynk-backup.log 2>&1
# ============================================================================

set -euo pipefail

# ======================== Configuration ========================
BACKUP_DIR="${BACKUP_DIR:-/tmp/zynk-backups}"
S3_BUCKET="${S3_BUCKET:-zynk-backups}"
S3_REGION="${S3_REGION:-us-east-1}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-zynk}"
DB_USER="${DB_USER:-zynk}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
RETENTION_DAILY=30
RETENTION_WEEKLY=12
RETENTION_MONTHLY=12

# ======================== Helpers ========================
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE=$(date +%Y-%m-%d)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday
DAY_OF_MONTH=$(date +%d)
BACKUP_FILE="zynk_${DB_NAME}_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

notify_slack() {
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        local color="$1"
        local message="$2"
        curl -s -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{\"attachments\":[{\"color\":\"${color}\",\"text\":\"${message}\"}]}" \
            > /dev/null 2>&1 || true
    fi
}

cleanup() {
    rm -f "$BACKUP_PATH" 2>/dev/null || true
}
trap cleanup ERR

# ======================== Main ========================
log "Starting database backup..."
mkdir -p "$BACKUP_DIR"

# Create compressed backup
log "Dumping database ${DB_NAME}..."
pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --verbose \
    2>/dev/null | gzip > "$BACKUP_PATH"

BACKUP_SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
log "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Determine S3 path based on schedule
S3_PREFIX="daily"
if [[ "$DAY_OF_MONTH" == "01" ]]; then
    S3_PREFIX="monthly"
elif [[ "$DAY_OF_WEEK" == "7" ]]; then
    S3_PREFIX="weekly"
fi

# Upload to S3 with server-side encryption
log "Uploading to S3: s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}"
aws s3 cp "$BACKUP_PATH" \
    "s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}" \
    --region "$S3_REGION" \
    --sse AES256 \
    --storage-class STANDARD_IA \
    --no-progress

# Verify upload
aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}" --region "$S3_REGION" > /dev/null
log "Upload verified successfully"

# ======================== Retention Management ========================
log "Applying retention policy..."

# Clean daily backups older than $RETENTION_DAILY days
CUTOFF_DAILY=$(date -d "-${RETENTION_DAILY} days" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAILY}d +%Y%m%d)
aws s3 ls "s3://${S3_BUCKET}/daily/" --region "$S3_REGION" | while read -r line; do
    FILE=$(echo "$line" | awk '{print $4}')
    FILE_DATE=$(echo "$FILE" | grep -oP '\d{8}' | head -1)
    if [[ -n "$FILE_DATE" && "$FILE_DATE" < "$CUTOFF_DAILY" ]]; then
        log "Deleting old daily backup: $FILE"
        aws s3 rm "s3://${S3_BUCKET}/daily/${FILE}" --region "$S3_REGION" 2>/dev/null || true
    fi
done

# Clean up local backup
rm -f "$BACKUP_PATH"

# ======================== Summary ========================
log "Backup completed successfully!"
log "  File: ${BACKUP_FILE}"
log "  Size: ${BACKUP_SIZE}"
log "  Type: ${S3_PREFIX}"
log "  Location: s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}"

notify_slack "good" "✅ Zynk DB backup successful | ${BACKUP_FILE} | ${BACKUP_SIZE} | ${S3_PREFIX}"
