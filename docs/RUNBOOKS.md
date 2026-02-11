# Zynk — Incident Response Runbooks

## Table of Contents
1. [Service Down](#1-service-down)
2. [High Error Rate](#2-high-error-rate)
3. [Database Issues](#3-database-issues)
4. [Redis Failures](#4-redis-failures)
5. [High Latency](#5-high-latency)
6. [DDoS / Brute Force](#6-ddos--brute-force)
7. [Data Breach Response](#7-data-breach-response)
8. [Deployment Rollback](#8-deployment-rollback)

---

## 1. Service Down

**Alert:** `ServiceDown` — Zynk API server unreachable for >1 minute

**Severity:** P0 / Critical

**Impact:** All users unable to send/receive messages

### Investigation Steps
```bash
# Check pod status
kubectl get pods -n zynk -l component=server

# Check pod logs
kubectl logs -n zynk -l component=server --tail=100

# Check events
kubectl get events -n zynk --sort-by='.lastTimestamp'

# Check node resources
kubectl top nodes
kubectl top pods -n zynk
```

### Resolution
1. **Pod CrashLoopBackOff:** Check logs for startup errors (missing env vars, DB unreachable)
2. **OOMKilled:** Increase memory limits in deployment spec
3. **Node failure:** Pods should auto-reschedule; verify with `kubectl get pods -o wide`
4. **All pods pending:** Check PVC bindings, resource quotas

### Escalation
- If not resolved in 15 minutes → Page on-call SRE
- If database issue → Follow Runbook #3

---

## 2. High Error Rate

**Alert:** `HighErrorRate` — >5% of requests returning 5xx

### Investigation
```bash
# Check error distribution
kubectl logs -n zynk -l component=server --tail=500 | grep '"level":50' | jq '.err.message' | sort | uniq -c | sort -rn

# Check Grafana dashboard
# → Zynk Overview → Error Rate panel

# Check recent deployments
kubectl rollout history deployment/zynk-server -n zynk
```

### Common Causes & Fixes
| Cause | Fix |
|-------|-----|
| Database connection pool exhausted | Increase `DB_POOL_MAX`, check for connection leaks |
| Redis connection failure | Check Redis health, circuit breaker should activate |
| Memory pressure | Scale up replicas or increase resource limits |
| Bad deployment | Rollback: `kubectl rollout undo deployment/zynk-server -n zynk` |

---

## 3. Database Issues

**Alert:** `DatabaseDown` or `DatabaseHighConnections` or `SlowQueries`

### Investigation
```bash
# Check PostgreSQL status
kubectl exec -it postgres-0 -n zynk -- psql -U zynk -c "SELECT count(*) FROM pg_stat_activity;"

# Check running queries
kubectl exec -it postgres-0 -n zynk -- psql -U zynk -c "
  SELECT pid, now() - query_start AS duration, query 
  FROM pg_stat_activity 
  WHERE state = 'active' 
  ORDER BY duration DESC 
  LIMIT 10;"

# Check locks
kubectl exec -it postgres-0 -n zynk -- psql -U zynk -c "
  SELECT blocked.pid, blocked.query, blocking.pid AS blocking_pid, blocking.query AS blocking_query
  FROM pg_catalog.pg_locks bl
  JOIN pg_stat_activity blocked ON bl.pid = blocked.pid
  JOIN pg_catalog.pg_locks kl ON bl.locktype = kl.locktype AND bl.relation = kl.relation AND bl.pid != kl.pid
  JOIN pg_stat_activity blocking ON kl.pid = blocking.pid
  WHERE NOT bl.granted;"

# Check replication lag (if using replicas)
kubectl exec -it postgres-0 -n zynk -- psql -U zynk -c "
  SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn
  FROM pg_stat_replication;"
```

### Resolution
1. **Kill long-running queries:** `SELECT pg_terminate_backend(PID);`
2. **Connection exhaustion:** Restart app pods to reset connections
3. **Disk full:** Expand PVC or clean up old data
4. **Replication lag:** Check network, consider promoting replica

---

## 4. Redis Failures

**Alert:** `RedisDown` or `RedisHighMemory`

**Impact:** Degraded — App continues without caching/rate limiting

### Investigation
```bash
# Check Redis
kubectl exec -it redis-0 -n zynk -- redis-cli info memory
kubectl exec -it redis-0 -n zynk -- redis-cli info clients
kubectl exec -it redis-0 -n zynk -- redis-cli dbsize
```

### Resolution
1. **High memory:** Flush cached data: `redis-cli FLUSHDB` (caches only!)
2. **Connection refused:** Restart Redis pod
3. The app is designed for graceful degradation — verify circuit breakers are active

---

## 5. High Latency

**Alert:** `HighLatency` — P99 >2 seconds

### Investigation
```bash
# Check slow endpoints in Grafana
# → Zynk Overview → Request Duration by Route

# Check database query times
kubectl logs -n zynk -l component=server --tail=500 | grep 'Slow query'

# Check resource pressure
kubectl top pods -n zynk
```

### Resolution
1. **Scale out:** Increase replicas: `kubectl scale deployment/zynk-server --replicas=5 -n zynk`
2. **Database bottleneck:** Check indexes, add read replicas
3. **Network issues:** Check inter-pod latency

---

## 6. DDoS / Brute Force

**Alert:** `AuthBruteForce` — High rate of auth failures

### Response
```bash
# Identify attacking IPs from logs
kubectl logs -n zynk -l component=server | grep 'auth_failures' | jq '.ip' | sort | uniq -c | sort -rn | head -20

# Block at Nginx level
kubectl exec -it nginx-pod -n zynk -- sh -c 'echo "deny ATTACKER_IP;" >> /etc/nginx/block.conf && nginx -s reload'

# Or use CloudFlare API to block
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/firewall/access_rules/rules" \
  -H "Authorization: Bearer CF_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"mode":"block","configuration":{"target":"ip","value":"ATTACKER_IP"}}'
```

---

## 7. Data Breach Response

**Severity:** P0 / Critical

### Immediate Actions (First 30 minutes)
1. **Contain:** Isolate affected systems
2. **Assess:** Determine what data was accessed
3. **Preserve:** Capture logs and evidence
4. **Rotate:** Immediately rotate all secrets (JWT, DB passwords, API keys)

```bash
# Rotate JWT secrets (forces all users to re-authenticate)
kubectl create secret generic zynk-server-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -hex 64) \
  --from-literal=JWT_REFRESH_SECRET=$(openssl rand -hex 64) \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart all pods to pick up new secrets
kubectl rollout restart deployment/zynk-server -n zynk
```

### Follow-up (24-72 hours)
1. Notify affected users
2. File regulatory report if required (GDPR: 72 hours)
3. Conduct root cause analysis
4. Implement preventive measures

---

## 8. Deployment Rollback

### Instant Rollback
```bash
# Rollback to previous version
kubectl rollout undo deployment/zynk-server -n zynk
kubectl rollout undo deployment/zynk-web -n zynk

# Verify rollback
kubectl rollout status deployment/zynk-server -n zynk

# Rollback to specific revision
kubectl rollout undo deployment/zynk-server -n zynk --to-revision=N
```

### Database Migration Rollback
```bash
# Check migration status
npx prisma migrate status

# If migration is reversible, create and apply down migration
# Otherwise, create a new migration that reverses the changes
```

---

## Contact Escalation

| Level | Who | When |
|-------|-----|------|
| L1 | On-call engineer | All alerts |
| L2 | Senior backend engineer | Unresolved after 15 min |
| L3 | CTO / Principal engineer | Data breach, extended outage >1hr |
