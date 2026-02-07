# Backup Procedures for Healthcare AI Assistant

## Document Information

| Property | Value |
|----------|-------|
| Document | Backup Procedures |
| Version | 1.0 |
| Created | February 7, 2026 |
| Last Updated | February 7, 2026 |
| Owner | DevOps Team |
| Review Frequency | Quarterly |
| Compliance | HIPAA, SOC 2 |

## Purpose and Scope

This document establishes comprehensive backup procedures for all data stores within the Healthcare AI Assistant platform. These procedures ensure data durability, enable point-in-time recovery, and satisfy HIPAA requirements for protected health information (PHI) backup and retention.

All backup procedures must be executed according to the defined schedule, with verification steps confirming backup integrity before considering operations complete. Any deviation from these procedures requires documented approval and post-execution review.

The scope of this document encompasses database backups, vector store backups, file storage backups, configuration backups, and audit log archival. Each data category has specific procedures reflecting its unique characteristics and recovery requirements.

## Backup Strategy Overview

### Guiding Principles

Our backup strategy prioritizes data integrity, recovery capability, and regulatory compliance. No backup procedure will be considered complete until integrity verification confirms successful completion and audit logging documents the operation.

The strategy employs multiple backup tiers to balance cost against recovery speed. Continuous protection provides immediate recoverability for recent changes, while incremental and full backups provide longer-term retention with reduced storage costs.

Geographic distribution ensures backup availability even during regional disasters. All backups are replicated to geographically separate storage locations, with the secondary location maintaining at least the same data freshness as the primary backup repository.

### Backup Frequency Matrix

| Data Category | Continuous | Hourly | Daily | Weekly | Monthly | Yearly |
|--------------|------------|--------|-------|--------|---------|--------|
| Database Transaction Logs | ✓ | - | - | - | - | - |
| Database Incremental | - | ✓ | - | - | - | - |
| Database Full | - | - | ✓ | - | - | - |
| Vector Store | - | ✓ | ✓ | - | - | - |
| File Storage | - | ✓ | ✓ | - | - | - |
| Configuration | - | - | ✓ | ✓ | - | - |
| Audit Logs | - | ✓ | ✓ | - | - | ✓ |
| System Logs | - | - | ✓ | ✓ | - | - |

## Database Backup Procedures

### Continuous Backup (Transaction Log Archiving)

Supabase provides continuous archiving of write-ahead logs (WAL) to enable point-in-time recovery. This automatic process requires no manual intervention but must be monitored for continuity.

**Verification Procedures:**

1. **WAL Archiving Status Check**
   ```bash
   # Verify WAL archiving is active
   supabase db show | grep "WAL"
   
   Expected: WAL archiving enabled
   ```
   
2. **Archive Continuity Check**
   ```bash
   # Check for any gaps in WAL archiving
   psql -c "SELECT last_archived_wal, last_archived_time FROM pg_stat_archiver;"
   
   Expected: last_archived_time within 5 minutes
   ```

3. **Recovery Point Verification**
   ```bash
   # Verify latest recovery point available
   psql -c "SELECT latest_restore_point FROM pg_replication_info;"
   
   Expected: timestamp within 15 minutes
   ```

**Monitoring:**

- Alerts trigger if WAL archiving lapses beyond 15 minutes
- Daily reports document archive continuity metrics
- Weekly review identifies any archival anomalies

### Hourly Incremental Backups

Incremental backups capture all changes since the last full backup, providing efficient storage utilization while enabling recovery to any hourly checkpoint.

**Execution Schedule:** Every hour at :00

**Execution Procedure:**

```bash
#!/bin/bash
# Hourly incremental backup script

BACKUP_DIR="/backups/incremental/$(date +%Y%m%d)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Execute incremental backup
pg_basebackup \
  --host=$DB_HOST \
  --port=$DB_PORT \
  --username=$BACKUP_USER \
  --pgdata=$BACKUP_DIR/incremental_$TIMESTAMP \
  --wal-method=stream \
  --checkpoint=fast \
  --progress \
  --verbose

# Calculate checksum for integrity verification
sha256sum $BACKUP_DIR/incremental_$TIMESTAMP/* > $BACKUP_DIR/checksums_$TIMESTAMP.sha256

# Log completion
echo "[$(date)] Incremental backup completed: $BACKUP_DIR/incremental_$TIMESTAMP" >> /var/log/backup.log
```

**Verification Procedure:**

1. **Checksum Verification**
   ```bash
   cd /backups/incremental/$(date +%Y%m%d)
   sha256sum -c checksums_$(date +%Y%m%d-%H%M%S).sha256
   
   Expected: All files verified
   ```

2. **Backup Completeness Check**
   ```bash
   # Verify backup contains all expected files
   ls -la $BACKUP_DIR/incremental_$TIMESTAMP/ | wc -l
   
   Expected: > 10 files (control files, data files, WAL segments)
   ```

3. **Restore Test (Weekly)**
   ```bash
   # Restore to test environment
   pg_restore -h test-db-host -U test-user -d test-db $BACKUP_DIR/incremental_$TIMESTAMP
   
   Expected: Restore completes without errors
   ```

### Daily Full Backups

Full backups provide complete database snapshots for baseline recovery and long-term retention. These backups serve as recovery anchors for incremental backups.

**Execution Schedule:** Daily at 2:00 AM UTC (low traffic period)

**Execution Procedure:**

```bash
#!/bin/bash
# Daily full backup script

BACKUP_DIR="/backups/full/$(date +%Y%m%d)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Execute full backup
pg_basebackup \
  --host=$DB_HOST \
  --port=$DB_PORT \
  --username=$BACKUP_USER \
  --pgdata=$BACKUP_DIR/full_$TIMESTAMP \
  --wal-method=stream \
  --checkpoint=fast \
  --progress \
  --verbose \
  --compress=gzip

# Generate manifest for integrity tracking
cat > $BACKUP_DIR/manifest_$TIMESTAMP.json << EOF
{
  "backup_type": "full",
  "timestamp": "$TIMESTAMP",
  "database": "$DB_NAME",
  "files": $(find $BACKUP_DIR/full_$TIMESTAMP -type f | wc -l),
  "size_bytes": $(du -sb $BACKUP_DIR/full_$TIMESTAMP | cut -f1),
  "checksum": "$(sha256sum $BACKUP_DIR/full_$TIMESTAMP.tar.gz | cut -d' ' -f1)"
}
EOF

# Log completion
echo "[$(date)] Full backup completed: $BACKUP_DIR/full_$TIMESTAMP" >> /var/log/backup.log
```

**Retention Policy:**
- Daily backups retained for 30 days
- Weekly backups (Sunday) retained for 12 weeks
- Monthly backups (first of month) retained for 12 months
- Yearly backups (January 1) retained for 7 years (HIPAA requirement)

### Database Backup Encryption

All database backups containing PHI must be encrypted at rest and in transit.

**Encryption Configuration:**

```bash
# Generate encryption key (store in secrets manager)
openssl rand -base64 32 > encryption.key

# Encrypt backup before storage
gpg --symmetric --cipher-algo AES256 \
  --batch --passphrase-file encryption.key \
  backup_file.sql

# Upload encrypted backup to cloud storage
aws s3 cp backup_file.sql.gpg s3://healthcare-ai-backups/encrypted/ \
  --sse aws:kms \
  --kms-key-id alias/backup-key
```

## Vector Store Backup Procedures

### pgvector Backup Overview

The vector store integrates with PostgreSQL through the pgvector extension, enabling unified backup procedures that capture both relational and vector data simultaneously.

**Backup Considerations:**

- Vector embeddings represent significant computational investment
- Rebuilding embeddings from source documents is time-consuming
- Unified PostgreSQL backups capture vector data automatically
- Separate vector-specific backups provide additional protection

### Hourly Vector Store Backups

```bash
#!/bin/bash
# Hourly vector store backup script

BACKUP_DIR="/backups/vector/$(date +%Y%m%d)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p $BACKUP_DIR

# Export vector data specifically for verification
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "\COPY (SELECT id, embedding, document_id, metadata FROM document_embeddings TO '$BACKUP_DIR/embeddings_$TIMESTAMP.csv' WITH CSV HEADER"

# Compress and encrypt
gzip $BACKUP_DIR/embeddings_$TIMESTAMP.csv
gpg --symmetric --cipher-algo AES256 \
  --batch --passphrase-file encryption.key \
  $BACKUP_DIR/embeddings_$TIMESTAMP.csv.gz

# Log embedding count for verification
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -t -c "SELECT COUNT(*) FROM document_embeddings;" > $BACKUP_DIR/count_$TIMESTAMP.txt

echo "[$(date)] Vector store backup completed: $TIMESTAMP" >> /var/log/vector-backup.log
```

**Verification:**

```bash
# Verify embedding count matches
CURRENT_COUNT=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM document_embeddings;")
BACKUP_COUNT=$(cat $BACKUP_DIR/count_$TIMESTAMP.txt)

if [ "$CURRENT_COUNT" = "$BACKUP_COUNT" ]; then
  echo "Vector store backup verified: $CURRENT_COUNT embeddings"
else
  echo "WARNING: Embedding count mismatch. Current: $CURRENT_COUNT, Backup: $BACKUP_COUNT"
fi
```

### Daily Vector Store Verification

```bash
#!/bin/bash
# Daily vector store verification script

# Restore backup to test environment
psql -h test-db-host -U test-user -d test-db \
  -c "\COPY document_embeddings FROM '/backups/vector/$(date +%Y%m%d)/embeddings_$(date +%Y%m%d-%H%M%S).csv.gz'"

# Test similarity search functionality
psql -h test-db-host -U test-user -d test-db << EOF
-- Verify vector search works with restored data
SELECT COUNT(*) 
FROM document_embeddings 
WHERE embedding IS NOT NULL;

-- Test similarity search returns expected results
SELECT COUNT(*) 
FROM document_embeddings 
ORDER BY embedding <=> query_vector('test clinical query'::vector)
LIMIT 10;
EOF
```

## File Storage Backup Procedures

### Vercel Blob Storage Backup

Healthcare documents uploaded to Vercel Blob Storage require systematic backup procedures.

**Backup Schedule:** Hourly incremental, Daily full

**Execution Procedure:**

```bash
#!/bin/bash
# File storage backup script

STORAGE_BACKUP_DIR="/backups/files/$(date +%Y%m%d)"
mkdir -p $STORAGE_BACKUP_DIR

# List all files in blob storage
vercel blobs ls --json > $STORAGE_BACKUP_DIR/file-list.json

# Download all files
vercel blobs download all --output=$STORAGE_BACKUP_DIR/files/

# Create manifest with metadata
cat > $STORAGE_BACKUP_DIR/manifest.json << EOF
{
  "backup_date": "$(date -Iseconds)",
  "total_files": $(cat $STORAGE_BACKUP_DIR/file-list.json | jq '.files | length'),
  "total_size_bytes": $(cat $STORAGE_BACKUP_DIR/file-list.json | jq '[.files[].size] | add'),
  "storage_location": "vercel-blob"
}
EOF

# Sync to S3 for cross-region redundancy
aws s3 sync $STORAGE_BACKUP_DIR/files/ s3://healthcare-ai-file-backups/$(date +%Y%m%d)/ \
  --sse aws:kms \
  --kms-key-id alias/file-backup-key

echo "[$(date)] File storage backup completed" >> /var/log/file-backup.log
```

### S3 Cross-Region Replication

Enable S3 cross-region replication for automatic backup to secondary region.

**Configuration:**

```json
{
  "Role": "arn:aws:iam::account-id:role/s3-replication-role",
  "Rules": [
    {
      "ID": "BackupReplicationRule",
      "Status": "Enabled",
      "Priority": 1,
      "Filter": {
        "Prefix": ""
      },
      "Destination": {
        "Bucket": "arn:aws:s3:::healthcare-ai-backups-secondary",
        "EncryptionConfiguration": {
          "ReplicaKmsKeyID": "alias/secondary-backup-key"
        },
        "Account": "target-account-id"
      }
    }
  ]
}
```

## Configuration Backup Procedures

### Environment Variables Backup

```bash
#!/bin/bash
# Environment variables backup script

CONFIG_BACKUP_DIR="/backups/config/$(date +%Y%m%d)"
mkdir -p $CONFIG_BACKUP_DIR

# Export environment variables (excluding secrets)
echo "# Environment backup - $(date)" > $CONFIG_BACKUP_DIR/env-backup.sh
echo "# DO NOT COMMIT TO VERSION CONTROL" >> $CONFIG_BACKUP_DIR/env-backup.sh

# Export non-sensitive configuration
echo "NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL" >> $CONFIG_BACKUP_DIR/env-backup.sh
echo "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" >> $CONFIG_BACKUP_DIR/env-backup.sh
echo "LOG_LEVEL=$LOG_LEVEL" >> $CONFIG_BACKUP_DIR/env-backup.sh

# Export encrypted secrets reference
echo "# Secrets stored in: aws secrets manager" >> $CONFIG_BACKUP_DIR/env-backup.sh
echo "SECRETS_REFERENCE=arn:aws:secretsmanager:region:account:secret:healthcare-ai/*" >> $CONFIG_BACKUP_DIR/env-backup.sh

# Hash of encrypted secrets (for verification)
aws secretsmanager list-secrets \
  --filters Key=string,Values=healthcare-ai \
  --query 'SecretList[].Name' \
  --output text > $CONFIG_BACKUP_DIR/secrets-reference.txt

echo "[$(date)] Configuration backup completed" >> /var/log/config-backup.log
```

### Terraform State Backup

```bash
#!/bin/bash
# Terraform state backup script

TERRAFORM_BACKUP_DIR="/backups/terraform/$(date +%Y%m%d)"
mkdir -p $TERRAFORM_BACKUP_DIR

# Backup Terraform state
terraform state pull > $TERRAFORM_BACKUP_DIR/terraform-state.json

# Backup Terraform configuration
tar -czf $TERRAFORM_BACKUP_DIR/terraform-config.tar.gz \
  -C /path/to/terraform \
  .

# Encrypt sensitive state
gpg --symmetric --cipher-algo AES256 \
  --batch --passphrase-file encryption.key \
  $TERRAFORM_BACKUP_DIR/terraform-state.json

echo "[$(date)] Terraform backup completed" >> /var/log/terraform-backup.log
```

## Audit Log Backup Procedures

### Continuous Audit Log Archiving

Audit logs require special handling to maintain integrity and chain of custody.

**Execution Procedure:**

```bash
#!/bin/bash
# Audit log backup script

AUDIT_BACKUP_DIR="/backups/audit/$(date +%Y%m%d)"
mkdir -p $AUDIT_BACKUP_DIR

# Export audit logs for the hour
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "\COPY (SELECT * FROM audit_log WHERE created_at >= NOW() - INTERVAL '1 hour' TO '$AUDIT_BACKUP_DIR/audit_$(date +%Y%m%d-%H%M%S).csv' WITH CSV HEADER"

# Generate integrity hash
sha256sum $AUDIT_BACKUP_DIR/audit_*.csv > $AUDIT_BACKUP_DIR/integrity_$(date +%Y%m%d-%H%M%S).sha256

# Create tamper-evident manifest
cat > $AUDIT_BACKUP_DIR/manifest.json << EOF
{
  "backup_type": "audit_log",
  "backup_time": "$(date -Iseconds)",
  "records_exported": $(wc -l < $AUDIT_BACKUP_DIR/audit_*.csv | head -1),
  "integrity_hashes": {
    $(find $AUDIT_BACKUP_DIR -name "*.sha256" -exec basename {} \; | tr '\n' ','): "see files"
  },
  "compliance_retention": "6_years"
}
EOF

# Upload to compliance-approved storage
aws s3 cp $AUDIT_BACKUP_DIR/ s3://healthcare-ai-audit-logs/$(date +%Y%m%d)/ \
  --sse aws:kms \
  --kms-key-id alias/audit-backup-key \
  --recursive

echo "[$(date)] Audit log backup completed" >> /var/log/audit-backup.log
```

### Long-Term Audit Retention

**Retention Schedule:**

| Retention Period | Storage | Access Level |
|------------------|---------|--------------|
| 0-90 days | Hot Storage (S3 Standard) | Operations Team |
| 91 days - 1 year | Warm Storage (S3 Glacier) | Compliance Team |
| 1-6 years | Cold Storage (S3 Glacier Deep Archive) | Compliance, Legal |

## Backup Verification Procedures

### Automated Verification Checks

All backups require automated verification before being marked complete.

**Verification Checklist:**

1. **Backup File Existence**
   - Confirm backup files created in expected location
   - Verify file size within expected range
   - Check file permissions are restrictive (600)

2. **Integrity Verification**
   - Run checksum verification
   - Compare against expected hash
   - Log verification result

3. **Completeness Verification**
   - Verify expected record counts
   - Confirm all required components included
   - Check for truncated files

4. **Restorability Verification (Daily)**
   - Restore to test environment
   - Verify data integrity
   - Test functionality

### Verification Script

```bash
#!/bin/bash
# Comprehensive backup verification script

BACKUP_DATE=${1:-$(date +%Y%m%d)}
VERIFICATION_LOG="/var/log/backup-verification-$(date +%Y%m%d).log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $VERIFICATION_LOG
}

log "Starting backup verification for $BACKUP_DATE"

# Check backup directory exists
if [ ! -d "/backups/full/$BACKUP_DATE" ]; then
  log "ERROR: Backup directory not found"
  exit 1
fi

# Verify checksums
log "Verifying checksums..."
for checksum_file in /backups/full/$BACKUP_DATE/*.sha256; do
  if sha256sum -c "$checksum_file" >> $VERIFICATION_LOG 2>&1; then
    log "CHECKSUM OK: $(basename $checksum_file)"
  else
    log "CHECKSUM FAILURE: $(basename $checksum_file)"
    exit 1
  fi
done

# Verify backup completeness
log "Checking backup completeness..."
FILE_COUNT=$(find /backups/full/$BACKUP_DATE -type f | wc -l)
if [ $FILE_COUNT -lt 10 ]; then
  log "WARNING: Low file count in backup: $FILE_COUNT"
fi

# Update manifest
cat >> /backups/full/$BACKUP_DATE/verification.json << EOF
{
  "verification_date": "$(date -Iseconds)",
  "checksums_verified": true,
  "files_count": $FILE_COUNT,
  "verification_status": "PASSED"
}
EOF

log "Backup verification completed successfully"
```

## Backup Storage Locations

### Primary Backup Location

**S3 Bucket:** `s3://healthcare-ai-backups-primary/`

**Configuration:**
- Versioning: Enabled
- Encryption: AES-256 + KMS
- Access: IAM policies restrict to backup service accounts
- Lifecycle: Transition to Glacier after 30 days

### Secondary Backup Location (Geo-Redundant)

**S3 Bucket:** `s3://healthcare-ai-backups-secondary-us-west-2/`

**Configuration:**
- Cross-Region Replication enabled
- Same encryption settings as primary
- Independent lifecycle policies
- Separate access controls

### Long-Term Retention Storage

**S3 Glacier Deep Archive:**
- 6-year retention for audit logs
- 7-year retention for database backups (HIPAA)
- Compliance bucket with locked configuration
- WORM (Write Once, Read Many) compliance

## Backup Security

### Access Controls

- **Backup Service Account:** Dedicated IAM user with write-only backup permissions
- **Restore Service Account:** Separate IAM user with read-only restore permissions
- **Audit Access:** Compliance team with audit-only access

### Encryption Standards

- **At Rest:** AES-256 encryption with AWS KMS
- **In Transit:** TLS 1.3 for all backup operations
- **Application-Level:** GPG encryption for PHI-containing backups

### Secrets Management

- Encryption keys stored in AWS Secrets Manager
- Key rotation: 90 days
- Key access: Audit-logged
- Emergency key retrieval: Documented procedure with dual authorization

## Recovery Testing Schedule

| Test Type | Frequency | Duration | Focus |
|-----------|-----------|----------|-------|
| Database Restore | Weekly | 30 min | Backup integrity |
| Vector Store Restore | Monthly | 2 hours | Embedding accuracy |
| Full System Restore | Quarterly | 4 hours | End-to-end recovery |
| DR Simulation | Quarterly | 8 hours | RTO/RPO validation |

## Appendix A: Emergency Recovery Procedures

### Immediate Database Recovery

```bash
#!/bin/bash
# Emergency database recovery script

BACKUP_DATE=${1:-$(date +%Y%m%d)}
BACKUP_TIME=${2:-latest}

# Stop application
echo "Stopping application services..."
kubectl scale deployment healthcare-ai --replicas=0

# Identify backup to restore
BACKUP_PATH="/backups/full/$BACKUP_DATE"
if [ "$BACKUP_TIME" = "latest" ]; then
  BACKUP_PATH=$(ls -td $BACKUP_PATH/full_* | head -1)
fi

# Restore from backup
echo "Restoring database from $BACKUP_PATH"
pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME \
  --clean \
  --if-exists \
  $BACKUP_PATH/*.sql

# Restart application
echo "Restarting application services..."
kubectl scale deployment healthcare-ai --replicas=3

# Verify
echo "Verifying database connectivity..."
pg_isready -h $DB_HOST
```

### Emergency Vector Store Recovery

```bash
#!/bin/bash
# Emergency vector store recovery script

BACKUP_DATE=${1:-$(date +%Y%m%d)}

# Identify latest backup
BACKUP_PATH=$(ls -td /backups/vector/$BACKUP_DATE/embeddings_*.csv.gz | head -1)
BACKUP_COUNT=$(cat $(dirname $BACKUP_PATH)/count_*.txt | tail -1)

# Restore embeddings
echo "Restoring vector store from $BACKUP_PATH"
gunzip -c $BACKUP_PATH | \
  psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "\COPY document_embeddings FROM STDIN WITH CSV HEADER"

# Verify
ACTUAL_COUNT=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM document_embeddings;")
if [ "$ACTUAL_COUNT" = "$BACKUP_COUNT" ]; then
  echo "Vector store recovery verified: $ACTUAL_COUNT embeddings"
else
  echo "WARNING: Embedding count mismatch. Expected: $BACKUP_COUNT, Actual: $ACTUAL_COUNT"
fi
```

## Appendix B: Backup Maintenance

### Cleanup Old Backups

```bash
#!/bin/bash
# Cleanup old backups script

# Remove daily backups older than 30 days
find /backups/full -type d -name "????????-??-??" -mtime +30 | xargs rm -rf

# Remove incremental backups older than 7 days
find /backups/incremental -type d -name "????????-??-??" -mtime +7 | xargs rm -rf

# Remove log files older than 90 days
find /var/log/backup*.log -type f -mtime +90 | xargs rm -f

# Log cleanup
echo "[$(date)] Backup cleanup completed" >> /var/log/backup-maintenance.log
```

### Database Maintenance

```bash
#!/bin/bash
# Database backup maintenance script

# Vacuum and analyze to maintain backup efficiency
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << EOF
VACUUM (VERBOSE, ANALYZE);
REINDEX DATABASE $DB_NAME;
EOF

# Update statistics
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ANALYZE;"

echo "[$(date)] Database maintenance completed" >> /var/log/backup-maintenance.log
```
