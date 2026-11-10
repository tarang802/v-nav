# V-Nav Scalability and Performance Strategy

Status: **Approved design (Phase 1).** Targets below are initial objectives. They will be adjusted after real load tests ([LOAD_TESTING.md](LOAD_TESTING.md)); no figure here is a measured result.

---

## 1. Performance objectives (initial SLOs)

Measured at the load balancer, on the reference deployment in §6, at the load of each scenario in LOAD_TESTING.md.

| Metric | Objective |
|---|---|
| REST read p50 / p95 / p99 | ≤ 50 ms / ≤ 200 ms / ≤ 500 ms |
| REST write p95 | ≤ 300 ms (login excluded: bcrypt adds ~250 ms by design; login p95 ≤ 600 ms) |
| Location end-to-end (sender emit → friend receive), p95 | ≤ 250 ms same region |
| Concurrent sockets | 500 per deployment with < 0.5 % failed connections |
| Error rate (5xx + timeouts) | < 0.1 % |
| API instance memory at 250 sockets | < 400 MB RSS |
| API instance CPU at scenario B | < 70 % of one core |
| MongoDB writes caused by location updates | **0** |
| Client: map interactive on mid-range Android over 4G | ≤ 4 s; JS (excluding Mapbox) ≤ 250 kB gzip |

---

## 2. Load model

| Quantity | Estimate | Basis |
|---|---|---|
| Registered users | 2,000 → 10,000 | Brief |
| Peak concurrent sockets | 500 (25 % of users) | Brief benchmark |
| Concurrent sharers | 200 | Brief |
| Location updates in | ~40 / s peak | 200 sharers × 1 per 5 s (walking); real average lower because of the movement threshold |
| Fan-out deliveries out | ~40 × avg online friends (~10) = ~400 msgs/s | Adapter publishes **one** Redis message per update regardless of friend count |
| REST | ~50–100 req/s peak | Event browsing, friend lists, profile at class changeover |

Everything above fits comfortably in one small Node process; the design is about **correctness when there are several**, and about headroom.

---

## 3. Horizontal scaling

### 3.1 What makes instances interchangeable
| Concern | Where state lives |
|---|---|
| Sessions / auth | JWT (stateless) + MongoDB sessions + Redis denylist |
| Socket rooms across instances | `@socket.io/redis-adapter` (pub/sub) |
| Live location, sharing, presence | Redis keys with TTL |
| Rate limits | Redis (`rate-limit-redis`, `SET NX PX`) |
| Background jobs | Every instance runs the sweeper; `ZREM` on `share:expiry` ensures exactly one instance handles each expiry. No leader election needed. |
| Uploaded files | Object storage, not local disk (local disk adapter is dev-only) |

### 3.2 Load balancer requirements
- WebSocket upgrade (`Upgrade`/`Connection` headers), idle timeout ≥ 60 s (Socket.IO pings every 25 s).
- **No session affinity required** because transports are WebSocket-only (ARCHITECTURE D5). If polling is ever enabled, cookie-based affinity becomes mandatory — IP hash is unsuitable behind campus NAT.
- Health check on `/ready`; drain connections on deploy.

### 3.3 Verifying cross-instance delivery
"Redis is installed" is not proof. The socket integration suite starts **two** server instances on different ports against the same Redis and asserts that user A on instance 1 receives B's update sent through instance 2, and that unfriend/block on instance 1 stops delivery from instance 2. Scenario D of the load test repeats this under load through Nginx.

### 3.4 Limits of this design and the next step
- Redis pub/sub adapter sends every message to every instance. Fine up to tens of instances; beyond that, the sharded adapter (Redis 7 `SPUBLISH`) is a drop-in change.
- A single Redis is a single point of failure for real-time features (not for data). Production uses a managed Redis with replication/failover.

---

## 4. Database performance

- Every repository query maps to an index in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md); integration tests run key queries with `explain()` and fail on `COLLSCAN` for the hot paths (friend list, request inbox, friend-code lookup, event discovery, event map).
- **No N+1:** list endpoints fetch IDs then one `$in` query for user summaries (or an aggregation with `$lookup` on indexed `_id`), never a query per row.
- Cursor pagination everywhere; `limit` ≤ 50.
- Projections: list queries select only displayed fields.
- `maxTimeMS` on all queries; pool size 20 per instance.
- Location never touches MongoDB; presence writes only `lastSeenAt` once per user session end.

## 5. Caching policy

Caching must never widen who can see what.

| Cache | Key scope | TTL | Invalidation | Safe because |
|---|---|---|---|---|
| Friend-set `friends:{id}` | per user | 10 min | Synchronous `DEL` after friendship/block transaction commits | Used only to *restrict* delivery; a miss rebuilds from MongoDB |
| Block-set `blocks:{id}` | per user | 10 min | Synchronous `DEL` on block/unblock | Same |
| Public user summaries | per user ID | 5 min | On profile/avatar update | Contains only `PublicUser` fields |
| Campus event list | **not cached** initially | — | — | Query is indexed and cheap; add only if measurements require |
| HTTP | `Cache-Control: private, no-store` on all authenticated API responses | — | — | Prevents shared proxies from caching private data |
| Static assets | CDN, immutable hashed filenames | 1 year | New deploy = new names | Public |

Locations are never placed in a shared cache other than the per-user `loc:` key.

## 6. Reference deployment for testing
2 API instances (1 vCPU, 1 GB each) behind Nginx · MongoDB Atlas M10 (or local replica set for dev runs, clearly labelled as such in results) · Redis 7 (1 GB) · same region.

## 7. Frontend performance

| Technique | Detail |
|---|---|
| Code splitting | Route-level `React.lazy`; Mapbox in its own chunk; current single 2.24 MB bundle is the baseline to beat |
| Map rendering | GeoJSON sources + symbol/circle layers; clustering for events; friend source updated at most once per animation frame |
| React rendering | Location store consumed outside React; components subscribe with narrow selectors; `memo` on list rows |
| Data fetching | TanStack Query caching and de-duplication; socket events patch caches instead of refetching |
| Images | Server-generated WebP at fixed sizes; `loading="lazy"`, explicit dimensions |
| Fonts | One variable font, `font-display: swap`, preconnect |
| Resilience | Error boundaries per panel and around the map; retries with exponential backoff for idempotent requests only; 10 s request timeout |
| Animations | Framer Motion limited to panel/sheet transitions; respect `prefers-reduced-motion` |

## 8. Resilience
- Timeouts on every outbound call (MongoDB, Redis, SMTP, storage).
- Redis down → real-time features report unavailable, REST still serves (rate limiter fails **closed** for auth endpoints, open for reads, logged).
- MongoDB down → `/ready` fails, LB stops routing; sockets stay connected but write actions return 503.
- Graceful shutdown (ARCHITECTURE §4.4) for zero-downtime rolling deploys.
