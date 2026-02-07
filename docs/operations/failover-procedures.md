# Failover Procedures for Healthcare AI Assistant

## Document Information

| Property | Value |
|----------|-------|
| Document | Failover Procedures |
| Version | 1.0 |
| Created | February 7, 2026 |
| Last Updated | February 7, 2026 |
| Owner | DevOps Team |
| Review Frequency | Quarterly |
| Test Frequency | Quarterly |

## Purpose and Scope

This document provides comprehensive failover and recovery procedures for the Healthcare AI Assistant platform. Failover represents the transition of operations from primary infrastructure to recovery infrastructure, executed when primary systems become unavailable or unreliable.

These procedures are designed for use during declared disaster recovery events, major infrastructure failures, or planned maintenance requiring service migration. All failover operations require appropriate authorization based on the severity and nature of the failure.

The scope encompasses detection of failure conditions, decision to failover, execution of failover procedures, validation of recovered systems, and failback procedures to return to normal operations. Each phase includes specific steps, success criteria, and rollback options.

## Failover Decision Framework

### Authorization Matrix

| Failure Severity | Authorizer | Confirmation Required | Estimated Downtime |
|------------------|------------|----------------------|-------------------|
| P1 - Complete Outage | DR Team Lead + CTO | Phone + SMS | >15 minutes |
| P2 - Major Degradation | DR Team Lead | Phone call | >30 minutes |
| P3 - Partial Outage | On-call Engineer | Text message | >1 hour |
| P4 - Planned Maintenance | Platform Lead | Email (24 hours) | Scheduled |

### Decision Criteria for Failover

Failover should be initiated when one or more of the following conditions are met:

**Immediate Failover (within 15 minutes)**
- Primary region completely unavailable (all services down)
- Database cluster failure with no automatic failover
- Network connectivity loss exceeding 15 minutes
- Security incident requiring infrastructure isolation

**Consider Failover (within 30 minutes)**
- Multiple component failures affecting core functionality
- Recovery time estimate exceeds RTO target
- Prolonged degradation affecting clinical workflows
- Cascading failure patterns observed

**Evaluate Alternatives**
- Single component failure with workarounds available
- Degradation within RTO tolerance
- Planned maintenance with maintenance window

### Pre-Failover Checklist

Before executing failover, the following must be confirmed:

- [ ] Failure scope determined and documented
- [ ] Recovery infrastructure verified available
- [ ] Estimated recovery time calculated
- [ ] Stakeholder notification initiated
- [ ] Authorization obtained from appropriate level
- [ ] Rollback plan documented
- [ ] Current data synchronization status confirmed

## Failover Procedures

### Phase 1: Detection and Assessment (0-15 minutes)

**Step 1.1: Confirm Failure**

```bash
# Verify primary infrastructure status
curl -s https://health.healthcare-ai.com/api/health | jq '.status'
curl -s https://api.healthcare-ai.com/api/health | jq '.status'
curl -s https://db.healthcare-ai.com/health | jq '.status'

# Check monitoring dashboards
# Verify multiple geographic locations report same status
```

**Step 1.2: Document Failure Details**

Record the following information:
- Initial detection timestamp
- Affected components
- User impact assessment
- Current error rates and latency
- Any known root cause indicators

**Step 1.3: Assess Recovery Options**

```bash
# Check secondary region status
curl -s https://health-dr.healthcare-ai.com/api/health | jq '.status'

# Verify DNS propagation status
dig healthcare-ai.com +short

# Check last backup timestamps
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT last_archived_time FROM pg_stat_archiver;"
```

### Phase 2: Authorization (15-30 minutes)

**Step 2.1: Escalation Communication**

```
To: [On-call escalation list]
Subject: [URGENT] Healthcare AI - Failover Authorization Request

Failure Summary:
- Detection Time: [timestamp]
- Affected Systems: [list]
- User Impact: [description]
- RTO Status: [met/not met]

Recovery Assessment:
- Primary Recovery ETA: [time estimate]
- Failover ETA: [time estimate]
- Recommended Action: [failover/continue recovery]

Requesting authorization to proceed with failover.
```

**Step 2.2: Receive Authorization**

Document authorization details:
- Authorizer name and role
- Authorization timestamp
- Any conditions or limitations
- Expected communication updates

### Phase 3: Failover Execution (30 minutes - 2 hours)

**Step 3.1: Prepare Secondary Region**

```bash
# Verify secondary region infrastructure
cd terraform/secondary-region
terraform plan

# Apply infrastructure configuration
terraform apply -var="environment=production" -auto-approve

# Verify infrastructure health
kubectl --context=secondary-eks get nodes
kubectl --context=secondary-eks get pods -n healthcare-ai
```

**Step 3.2: Activate Secondary Database**

```bash
# Promote standby database in secondary region
supabase db promote --project-ref $SECONDARY_PROJECT_REF

# Verify promotion completion
supabase db show --project-ref $SECONDARY_PROJECT_REF | grep "Status"

# Update connection strings in secrets manager
aws secretsmanager update-secret \
  --secret-id healthcare-ai/db-connection \
  --secret-values '{"host":"secondary-db-host"}'
```

**Step 3.3: Restore Vector Store**

```bash
# Restore vector embeddings from latest backup
psql -h $SECONDARY_DB_HOST -U $DB_USER -d $DB_NAME \
  -c "\COPY document_embeddings FROM '/backups/vector/$(date +%Y%m%d)/embeddings_latest.csv' WITH CSV HEADER"

# Verify vector store functionality
psql -h $SECONDARY_DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT COUNT(*) FROM document_embeddings;"
```

**Step 3.4: Deploy Application**

```bash
# Deploy application to secondary region
vercel --environment=production --regions=iad

# Verify deployment status
vercel list --environment=production

# Check application health
curl -s https://api-dr.healthcare-ai.com/api/health | jq '.status'
```

**Step 3.5: Update Traffic Routing**

```bash
# Option 1: DNS-based failover (preferred)
# Update DNS TTL to minimum during failover
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://dns-failover.json

# DNS failover JSON:
# {
#   "Comment": "Failover to secondary region",
#   "Changes": [{
#     "Action": "UPSERT",
#     "ResourceRecordSet": {
#       "Name": "api.healthcare-ai.com",
#       "Type": "CNAME",
#       "SetIdentifier": "secondary-region",
#       "Failover": "SECONDARY",
#       "TTL": 60,
#       "ResourceRecords": [{"Value": "api-dr.healthcare-ai.com"}]
#     }
#   }]
# }

# Option 2: CDN-based failover (alternative)
# Update CDN configuration to route to secondary origin
```

**Step 3.6: Verify Connectivity**

```bash
# Test application from multiple locations
curl -s https://api.healthcare-ai.com/api/health
curl -s https://api-dr.healthcare-ai.com/api/health

# Verify database connectivity
curl -s "https://api.healthcare-ai.com/api/db-check"

# Verify vector store functionality
curl -s "https://api.healthcare-ai.com/api/vector-search?q=test"
```

### Phase 4: Validation (2-4 hours)

**Step 4.1: Data Integrity Validation**

```bash
# Verify database integrity
psql -h $SECONDARY_DB_HOST -U $DB_USER -d $DB_NAME << EOF
-- Check row counts against baseline
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'documents', COUNT(*) FROM documents
UNION ALL
SELECT 'audit_log', COUNT(*) FROM audit_log
UNION ALL
SELECT 'feedback', COUNT(*) FROM feedback;

-- Verify referential integrity
SELECT 'orphaned documents' as issue, COUNT(*) as count
FROM documents d
LEFT JOIN users u ON d.user_id = u.id
WHERE u.id IS NULL;
EOF
```

**Step 4.2: Functionality Testing**

Execute comprehensive functionality tests:

```bash
#!/bin/bash
# Failover functionality test script

echo "=== Failover Validation Tests ==="

echo "1. Authentication Test"
TOKEN=$(curl -s -X POST https://api.healthcare-ai.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' | jq -r '.token')

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  echo "   PASS: Authentication successful"
else
  echo "   FAIL: Authentication failed"
  exit 1
fi

echo "2. Document Search Test"
RESULTS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.healthcare-ai.com/api/documents/search?q=clinical" | jq '.results | length')

if [ "$RESULTS" -gt 0 ]; then
  echo "   PASS: Document search returned $RESULTS results"
else
  echo "   WARN: Document search returned no results"
fi

echo "3. Chat API Test"
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  -X POST https://api.healthcare-ai.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What are the symptoms of diabetes?"}')

if echo "$RESPONSE" | jq -e '.response' > /dev/null; then
  echo "   PASS: Chat API responding"
else
  echo "   FAIL: Chat API not responding"
  exit 1
fi

echo "4. Audit Logging Test"
AUDIT_COUNT=$(psql -h $SECONDARY_DB_HOST -U $DB_USER -d $DB_NAME \
  -t -c "SELECT COUNT(*) FROM audit_log WHERE created_at > NOW() - INTERVAL '1 hour';")

echo "   Audit events in last hour: $AUDIT_COUNT"

echo "=== Validation Complete ==="
```

**Step 4.3: Performance Validation**

```bash
# Test response times
echo "Response Time Tests:"

for i in {1..10}; do
  START=$(date +%s%N)
  curl -s -o /dev/null -w "%{time_total}" https://api.healthcare-ai.com/api/health
  echo " s"
done | awk '{sum+=$1; count++} END {print "Average response time: " sum/count "s"}'

# Test concurrent load
wrk -t 12 -c 100 -d 30s https://api.healthcare-ai.com/api/health
```

**Step 4.4: Security Validation**

```bash
# Verify authentication still required
RESPONSE=$(curl -s https://api.healthcare-ai.com/api/protected)
if echo "$RESPONSE" | jq -e '.error' > /dev/null; then
  echo "PASS: Protected endpoints require authentication"
else
  echo "FAIL: Protected endpoint accessible without auth"
  exit 1
fi

# Verify RLS policies
RESULT=$(psql -h $SECONDARY_DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SET ROLE = test_user; SELECT * FROM documents WHERE org_id != 'test_org';")

if [ -z "$RESULT" ]; then
  echo "PASS: RLS policies enforced"
else
  echo "FAIL: RLS bypass possible"
  exit 1
fi

# Verify audit logging
AUDIT_CHECK=$(psql -h $SECONDARY_DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT COUNT(*) FROM audit_log WHERE action = 'SYSTEM_STARTUP';")

if [ "$AUDIT_CHECK" -gt 0 ]; then
  echo "PASS: Audit logging operational"
else
  echo "WARN: Audit logging startup event missing"
fi
```

## Failback Procedures

### Planning Failback

Failback should be executed only after the following conditions are met:

**Primary Region Readiness**
- [ ] Primary infrastructure fully operational
- [ ] All services responding normally
- [ ] Performance metrics within baseline
- [ ] Data synchronized from secondary region
- [ ] Security controls verified

**Risk Assessment**
- [ ] Original failure root cause identified and resolved
- [ ] Stability period achieved (minimum 24 hours)
- [ ] No active incidents or degradation
- [ ] Rollback plan documented

### Failback Execution

**Phase 1: Data Synchronization**

```bash
# Verify data consistency between regions
psql -h $PRIMARY_DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT COUNT(*) FROM users;" > /tmp/primary-users.txt

psql -h $SECONDARY_DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT COUNT(*) FROM users;" > /tmp/secondary-users.txt

# Compare and sync any differences
if [ $(cat /tmp/primary-users.txt) != $(cat /tmp/secondary-users.txt) ]; then
  echo "Data synchronization required"
  # Execute data sync procedures
fi

# Verify replication lag
psql -h $PRIMARY_DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;"
```

**Phase 2: Traffic Migration**

```bash
# Option 1: Gradual traffic shift
# Update CDN configuration for percentage-based routing
# Start with 10% traffic to primary

# Monitor for issues
for i in {1..60}; do
  echo "Health check $(($i * 2))..."
  curl -s https://api.healthcare-ai.com/api/health | jq '.status'
  sleep 2
done

# Increase traffic to primary if healthy
# Repeat until 100% traffic on primary

# Option 2: Immediate cutover (if primary fully verified)
# Update DNS to primary only
```

**Phase 3: Final Validation**

```bash
# Comprehensive validation after failback
./failover-validation.sh --full

# Verify all traffic routing correctly
curl -s https://api.healthcare-ai.com/api/health | jq '.region'
curl -s https://api.healthcare-ai.com/api/health | jq '.region'

# Verify data consistency
./data-consistency-check.sh
```

**Phase 4: Secondary Region Standby**

```bash
# Return secondary region to standby mode
kubectl --context=secondary-eks scale deployment healthcare-ai --replicas=1 -n healthcare-ai

# Update secondary database to replica
supabase db configure --project-ref $SECONDARY_PROJECT_REF --replica

# Update monitoring to reflect primary-active status
```

## Quarterly DR Testing Procedures

### Test Schedule

| Test Date | Scenario | Duration | Participants |
|-----------|----------|----------|--------------|
| Q1 (Jan-Mar) | Database Recovery | 2 hours | DBA, Platform Engineer |
| Q2 (Apr-Jun) | Application Recovery | 1 hour | Platform Engineer |
| Q3 (Jul-Sep) | Complete System Recovery | 4 hours | All DR Team |
| Q4 (Oct-Dec) | Failover/Failback | 3 hours | All DR Team |

### Test Preparation

**Two Weeks Before Test:**

- [ ] Notify all stakeholders of test schedule
- [ ] Verify test environment isolation
- [ ] Prepare test data sets
- [ ] Document expected outcomes and metrics
- [ ] Assign test roles and responsibilities

**One Week Before Test:**

- [ ] Review and update test procedures
- [ ] Verify backup availability
- [ ] Confirm participant availability
- [ ] Prepare test documentation templates

**Day Before Test:**

- [ ] Final verification of test environment
- [ ] Send reminder notification to participants
- [ ] Prepare monitoring dashboards for test observation

### Test Scenarios

**Test 1: Database Recovery**

```markdown
## Database Recovery Test

**Objective:** Validate database recovery procedures meet RTO/RPO targets

**Preconditions:**
- Backup from 1 hour ago available
- Test environment isolated from production
- Participants: DBA, Platform Engineer

**Test Steps:**
1. Simulate database failure (terminate primary)
2. Detect failure and confirm with monitoring
3. Execute recovery procedures
4. Restore from point-in-time backup
5. Validate data integrity
6. Measure recovery time

**Success Criteria:**
- Recovery completes within 1 hour RTO
- Data loss within 15-minute RPO
- All integrity checks pass
- Audit log continuity maintained

**Documentation Required:**
- Start and end timestamps
- Issues encountered
- Recovery time actual
- Recommendations for improvement
```

**Test 2: Application Recovery**

```markdown
## Application Recovery Test

**Objective:** Validate application deployment and recovery procedures

**Preconditions:**
- Application container images available
- Terraform configurations current
- Test environment isolated

**Test Steps:**
1. Simulate application failure (scale to 0)
2. Detect failure and confirm
3. Execute redeployment procedures
4. Verify health checks pass
5. Test critical functionality
6. Measure recovery time

**Success Criteria:**
- Recovery within 30 minutes RTO
- All health checks passing
- Critical paths functional
- No manual intervention required

**Documentation Required:**
- Deployment logs
- Health check responses
- Issues and resolutions
```

**Test 3: Complete System Recovery**

```markdown
## Complete System Recovery Test

**Objective:** Validate end-to-end disaster recovery capabilities

**Preconditions:**
- All DR team members available
- Secondary region prepared
- Complete backup sets available
- Isolated test environment

**Test Steps:**
1. Simulate complete infrastructure failure
2. Activate secondary region procedures
3. Restore all data tiers
4. Deploy complete application stack
5. Execute validation procedures
6. Measure total recovery time
7. Document lessons learned

**Success Criteria:**
- Full recovery within 4 hours RTO
- All RTO/RPO targets met
- No data loss beyond RPO
- All tests passing
- Team coordination effective

**Documentation Required:**
- Detailed timeline
- Role assignments
- Issues by category
- Improvement recommendations
- Training needs assessment
```

### Test Execution Protocol

**During Test:**

1. **Test Lead** maintains test timeline and coordination
2. **Timekeeper** records all timestamps
3. **Observer** documents observations and issues
4. **Participants** execute assigned procedures
5. **All communications** through designated channel

**After Test:**

1. **Immediate debrief** (within 24 hours)
   - Review timeline and issues
   - Identify quick wins
   - Flag critical improvements

2. **Detailed report** (within 7 days)
   - Complete timeline analysis
   - Root cause of any failures
   - Recommendations with priorities
   - Updated procedures

3. **Follow-up actions**
   - Assign action items
   - Track resolution
   - Update documentation

## Emergency Contacts

| Role | Primary | Secondary | Responsibility |
|------|---------|-----------|----------------|
| DR Team Lead | [On-call] | [Escalation] | Overall coordination |
| Database Admin | [On-call] | [Escalation] | Database recovery |
| Platform Engineer | [On-call] | [Escalation] | Application recovery |
| Security Officer | [On-call] | [Escalation] | Security validation |
| Network Engineer | [On-call] | [Escalation] | DNS, connectivity |
| Clinical Liaison | [Designated] | [Designated] | Clinical impact |
| Comms Lead | [Designated] | [Designated] | Stakeholder updates |

## Appendix A: Rollback Procedures

### Database Rollback

```bash
# If primary database recovery completes during failover
# Rollback to primary and revert traffic

# 1. Verify primary is ready
supabase db show --project-ref $PRIMARY_PROJECT_REF | grep "Status"

# 2. Stop writes to secondary
# (Application automatically directs to primary after DNS update)

# 3. Sync final data changes
pg_dump -h $SECONDARY_DB_HOST -U $DB_USER -d $DB_NAME \
  --data-only --table=audit_log | \
  psql -h $PRIMARY_DB_HOST -U $DB_USER -d $DB_NAME

# 4. Verify data consistency
./verify-data-consistency.sh

# 5. Confirm primary active
curl -s "https://api.healthcare-ai.com/api/db-status"
```

### Application Rollback

```bash
# If secondary deployment has issues
# Redeploy with known-good configuration

# 1. Identify last known good deployment
vercel list --environment=production

# 2. Redeploy previous version
vercel --environment=production --confirm-previous

# 3. Verify health
curl -s https://api.healthcare-ai.com/api/health | jq '.status'

# 4. If issues persist, scale secondary to 0
kubectl --context=secondary-eks scale deployment healthcare-ai --replicas=0 -n healthcare-ai
```

### Complete Rollback

```bash
# Nuclear option: abort failover completely

# 1. Terminate secondary deployment
kubectl --context=secondary-eks delete deployment healthcare-ai -n healthcare-ai

# 2. Revert DNS to primary
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://dns-primary.json

# 3. Verify primary is serving
for i in {1..30}; do
  STATUS=$(curl -s https://api.healthcare-ai.com/api/health | jq -r '.status')
  if [ "$STATUS" = "healthy" ]; then
    echo "Primary restored"
    break
  fi
  sleep 2
done

# 4. Document rollback reason
```

## Appendix B: Communication Templates

### Failover Initiation Notification

```
Subject: [CRITICAL] Healthcare AI - Failover Initiated

FAILOVER INITIATED
================

Time: [timestamp]
Authorized By: [name]
DR Scenario: [scenario type]

Current Status:
- Primary Region: [status]
- Secondary Region: [status]
- Estimated Recovery: [time]

Actions Completed:
1. [ ] Failure detection and assessment
2. [ ] Authorization obtained
3. [ ] Secondary region activated
4. [ ] Traffic rerouting in progress

Next Update: Within 30 minutes or upon milestone

Contact: [on-call phone]
```

### Failover Completion Notification

```
Subject: [RESOLVED] Healthcare AI - Failover Complete

FAILOVER COMPLETE
================

Completion Time: [timestamp]
Total Duration: [duration]
Data Loss: [none/X minutes]

Validation Results:
- Database: [PASSED/FAILED]
- Application: [PASSED/FAILED]
- Security: [PASSED/FAILED]

Current Configuration:
- Active Region: [secondary]
- Status: [operational]

Failback Planning:
- Target Date: [TBD]
- Conditions: [list]

Contact: [on-call phone]
```

### Failback Notification

```
Subject: [PLANNED] Healthcare AI - Failback Scheduled

FAILBACK PLANNED
===============

Schedule:
- Start: [timestamp]
- Expected Duration: [duration]

Procedure:
1. Data synchronization
2. Traffic migration (gradual)
3. Final validation
4. Secondary region standby

Impact: Brief potential degradation during migration

Contact: [on-call phone]
```
