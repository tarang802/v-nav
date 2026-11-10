# V-Nav Development Progress

Last updated: 2026-11-11 (Phase 4)

A module counts as **complete** only when its code exists, its tests have been run and pass, and the result is recorded below. Generated code alone counts as "in progress".

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 — Repository audit | Inspect existing code, find reusable parts and weaknesses | ✅ Done — [docs/PHASE-0-AUDIT.md](docs/PHASE-0-AUDIT.md) |
| 0.5 — Setup | Git baseline; remove dead/fabricated code | 🟡 Git baseline pushed (`cc7dfc8`); dead-file cleanup pending |
| 1 — Architecture | Architecture, schema, API, sockets, security, scalability, deployment, load-test plan | ✅ Approved 2026-11-10 with defaults Q1–Q5 |
| 2 — Backend foundation | TS server skeleton, config, logging, errors, validation, MongoDB + Redis, health/ready, graceful shutdown, auth + email OTP + sessions, Docker Compose | ✅ Done — 53 tests passing (see below) |
| 3 — Friend system | Friend codes, requests, friendships, blocks, lists | ✅ Done — 82 tests passing (see below) |
| 4 — Real-time location | Socket auth, Redis adapter, sharing state, friend-only delivery, revocation, presence, reconnection | ✅ Done — 111 tests passing, two-instance stack verified (see below) |
| 5 — Map | Persistent map shell, verified buildings layer, friend and event layers, clustering | ⬜ |
| 6 — Events | CRUD, visibility, discovery, filters, pagination, map integration, images | ⬜ |
| 7 — Frontend integration | Connect every screen to real APIs and sockets; remove mock/dead UI; responsive + mobile sheets | ⬜ |
| 8 — Testing and optimisation | Unit, integration, E2E (Playwright), security, load tests (Artillery); fix findings | ⬜ |
| 9 — Deployment | Production Docker config, env templates, CI/CD, production config, deployment and monitoring docs | ⬜ |

## Completed modules
- Phase 0 audit.
- Git repository initialised, connected to `github.com/tarang802/v-nav`, baseline pushed on top of the earlier Next.js history.
- Phase 1 architecture docs (approved).
- **Phase 2 backend foundation** (`server/`, TypeScript):
  - Layered structure: config → models → repositories → services → controllers → routes; composition root in `src/container.ts`; `app.ts` (no listen) and `server.ts` (listen + shutdown).
  - zod-validated env config that fails fast, names bad variables without printing values, rejects `.env.example` placeholder secrets, requires distinct secrets, refuses `COOKIE_SECURE=false` in production.
  - pino JSON logs with request ids (accepts a well-formed upstream `X-Request-Id`), redaction of credentials, tokens, codes and coordinates; pretty output only on a TTY.
  - One error handler, `{ error: { code, message, requestId, details? } }`; 5xx never leak internals; 400 malformed JSON, 413 oversize body.
  - helmet (JSON-only CSP), CORS allowlist with credentials, 100 kB body limit, `trust proxy` configurable.
  - MongoDB (replica set, pool 20, 5 s server selection) and Redis (fail-fast, no offline queue) connections; `/health` (liveness) and `/ready` (pings both, 503 while draining).
  - Graceful shutdown: `/ready` → 503, drain HTTP (10 s), close Redis + Mongo, exit 0; 20 s hard exit.
  - Auth: register → email OTP (HMAC-stored, 10 min, 5 attempts) → verify; login with dummy-hash timing and progressive email-keyed lockout; 15-min access JWT; opaque refresh token in `vnav_rt` cookie (HttpOnly, Secure, SameSite=Lax, Path=/api/v1/auth), SHA-256 hashed, rotated atomically, reuse detection with a 15 s race grace; Redis revocation denylist so revoked access tokens die immediately; logout, logout-all, list/revoke sessions (IDOR-safe); forgot/reset (single-use link in URL fragment, strength checked before the link is consumed, revokes all sessions); change password (keeps only the current session); `GET /users/me`.
  - Redis fixed-window rate limiter (atomic Lua), limits per API doc §9; fails closed (503).
  - Security audit log (`audit_logs`, 180-day TTL).
  - `StudentVerifier` interface with `EmailOtpVerifier`; `MailTransport` interface with SMTP implementation (Mailpit locally).
  - Docker Compose (mongo rs0, redis, mailpit, optional api); multi-stage non-root `server/Dockerfile` with tini; `npm run db:indexes` release script.
- **Phase 3 friend system**:
  - Collections `friend_requests` (one pending request per pair in either direction via a unique `pairKey`), `friendships` (two edges per friendship), `blocks`.
  - Every multi-document change (accept, crossing-request auto-accept, unfriend, block) runs in one MongoDB transaction (snapshot read, majority write) with automatic retry on write conflicts. `friendCount` changes only inside those transactions, through a conditional increment that enforces the 1,000-friend cap and that both accounts are active.
  - Friend-code lookup (`GET /users/lookup`; accepts `a82kd`, `vnav-a82kd`, and reads I/L/O as 1/1/0), profile view (`GET /users/:id`: public view for strangers, friend view for friends, own view for self), `PATCH /users/me`, `PATCH /users/me/privacy`.
  - Requests: send, incoming/outgoing lists, accept (recipient only), reject (recipient only), cancel (sender only); crossing requests accept automatically; cap of 50 pending outgoing; `allowFriendRequests` respected; 30/h send and 60/h lookup limits per user.
  - Friend list with cursor pagination; unfriend.
  - Blocks: remove the friendship and pending requests both ways in one transaction; blocked and unknown users get an identical 404 everywhere; block/unblock are idempotent; unblock does not restore the friendship; both are audit-logged.
  - Redis relationship cache (`friends:{id}`, `blocks:{id}`, 10 min) with a generation guard so a slow reader cannot write a stale list back after an unfriend or block; falls back to MongoDB on a miss or a Redis error. `FriendService.onRelationshipEnded` hook for Phase 4 location revocation.
- **Phase 4 real-time location** (`socket.io` 4.8, `@socket.io/redis-adapter` 8.3):
  - Handshake: access token from `auth.token` only, signature + expiry + Redis revocation + active-user check, Origin allowlist (CORS does not cover WebSockets); machine-readable rejection codes.
  - Sharing: `location:share:start` (15 / 60 / 240 min or until stopped, 12 h cap), stop over the socket or the REST emergency stop, state synced to the user's other tabs, timed expiry by a sweeper where exactly one instance notifies friends.
  - `location:update` pipeline: schema and clock skew → accuracy ≤ 100 m → 2 s per-user rate limit (shared across tabs and instances) → sharing check → campus geofence (real OSM boundary) → Redis store with 120 s TTL → delivery to friends only. No MongoDB access in the hot path except a friend-cache miss; **positions are never written to MongoDB** (tested).
  - Revocation: unfriend, block, sign-out and expiry remove the marker from friends' maps immediately and stop further delivery; the blocked student only sees a removal.
  - Presence across tabs, devices and instances (first tab online, last tab offline, crashed instances self-heal within 90 s), respecting `showOnlineStatus` including live changes; `lastSeenAt` written once per final disconnect.
  - Social notifications: `friend:request:received`, `friend:request:accepted` (with immediate location if the new friend is sharing), `friendship:removed`.
  - Domain event bus (`src/events/domainEvents.ts`): services publish, the socket layer subscribes; services never import Socket.IO.
  - Token-expiry sweep with `auth:refresh`; per-socket flood guard; 16 kB frame limit.
  - Graceful shutdown with live sockets: stop accepting, `server:shutdown`, close transports so clients auto-reconnect elsewhere, drain, exit 0 within Docker's 10 s grace.
  - `docker-compose.multi.yml` + `ops/nginx/multi.conf`: two instances behind Nginx.
- The pre-rebuild server moved to `server-legacy/` (unchanged, still runnable) so the current client keeps working until Phase 7, when it is deleted.

## Pending modules
Phases 5–9. Phase 0.5 dead-file cleanup is folded into Phase 7.

## Phase 2 deviations from the Phase 1 docs (docs updated)
| Change | Why |
|---|---|
| Per-IP rate limits raised (e.g. login 50 → 300 / 15 min per IP, global 100 → 600 / min) | Campus NAT: one IP can be hundreds of students. Tight limits stay per email / per user. |
| Login lockout keyed by email, not user id | Unknown emails lock identically, so lockout cannot reveal which accounts exist. |
| Refresh reuse within 15 s of rotation → `401 REFRESH_CONFLICT`, no revoke | Two tabs refreshing at once would otherwise log the user out as "token theft". |
| Abandoned unverified accounts removed by a partial TTL index instead of a job | Same effect with no job to run or monitor. |
| Local host ports: Mongo 27018, Redis 6380 | This machine already uses 27017 and 6379. |
| Upgraded to zod 4, nodemailer 10, vitest 5, Express 5, bcryptjs 3 | `npm audit` reported high/critical advisories in the older majors; now 0 vulnerabilities. |
| OpenAPI file deferred to Phase 7 | Not needed until the client consumes the API; API_DOCUMENTATION.md stays authoritative. |
| Metrics (`/metrics`, prom-client) and OpenTelemetry deferred to Phase 9 | Monitoring belongs with deployment; logging with request ids is in place now. |

## Phase 3 deviations from the Phase 1 docs (docs updated)
| Change | Why |
|---|---|
| `friend_requests` unique index on `pairKey` (sorted pair) instead of `{ from, to }` | Two students requesting each other at the same instant could otherwise create two crossing requests. With one request per pair, the second insert fails and the retry accepts the first request. Tested with concurrent requests. |
| Pagination indexes include `_id` (e.g. `{ userId, since: -1, _id: -1 }`) | Stable cursors when two rows share a timestamp. |
| Auto-accept on `POST /friends/requests` returns `200 { friend, autoAccepted: true }` | Same `FriendUser` shape as accept, so the client handles both the same way. |
| New error `403 FRIEND_REQUESTS_DISABLED` | Distinguishes "this student turned off requests" from "not found". |
| `GET /users/lookup` also returns `acceptsRequests` | Lets the UI disable the Add button instead of failing after a tap. |
| `FriendUser.online` not returned yet | Presence is built in Phase 4; returning `false` now would be fake data. `lastSeenAt` is returned, respecting `showOnlineStatus`. |

## Phase 4 deviations from the Phase 1 docs (docs updated)
| Change | Why |
|---|---|
| Sockets also join `session:{sessionId}` | Disconnecting one signed-out session on every instance is a room emit; no cross-instance socket scan. |
| Presence refreshed by the server every 30 s for its own sockets (client heartbeat optional) | Presence no longer depends on client behaviour; entries of a crashed instance expire on their own. |
| Presence hash values are expiry times, not instance ids | Lets the Lua scripts drop stale entries, so "last tab closed" is detected correctly even after an instance crash. |
| New `auth:expired` server event | Distinguishes token expiry from revocation so the client knows to refresh and reconnect rather than sign out. |
| `friend:request:accepted` goes to both users | Both sides need to add the friend to their list; the acceptor's other tabs too. |
| Signing out of every session stops sharing; one device does not | Another device may still be legitimately sharing. |
| Shutdown stops accepting before closing sockets, closes transports instead of disconnecting sockets, and fits in 9 s | Found with the two-instance stack: a server-side disconnect stops socket.io-client from reconnecting, reconnects landed back on the draining instance, and the old 20 s timer was cut by Docker's 10 s SIGKILL. Regression test in `test/integration/shutdown.test.ts`. |
| Local Nginx: `zone`, `least_conn`, 2 s connect timeout, `max_fails` | Without them all sockets landed on one instance (per-worker balancing) and failover reconnects hung on the stopped container's address. |

## Not yet implemented (deliberately)
| Feature | Reason |
|---|---|
| Turn-by-turn campus routing | Needs a verified campus path network; not in the brief's phases. The current "Start Navigation" button is non-functional and will be removed in Phase 0.5/7. |
| Crowd heatmap | Not in the brief; aggregate location raises privacy questions. Current page has no data and will be removed. |
| Roster / SSO student verification | No official roster or IdP access. `StudentVerifier` interface is the integration point. |

## Known bugs in the existing code
From the audit; these are fixed by the rebuild, not patched in place.
| ID | Bug |
|---|---|
| S1 | Unfriended/blocked users keep receiving location until the sharer reconnects |
| S2 | Server has no sharing state; a modified client can broadcast while the UI shows "off" |
| S8 | Online/offline presence broadcast regardless of privacy |
| A2 | Friend accept is two non-atomic saves |
| A4 | Closing one tab marks the user offline and deletes their location even if another tab is sharing |
| — | Building polygons in `vit-buildings.geojson` are fabricated squares |
| — | Navigation quick-spot coordinates are fabricated |
| — | Client bundle is a single 2.24 MB chunk |

## Technical decisions
Full reasoning in [docs/ARCHITECTURE.md §3](docs/ARCHITECTURE.md). Summary:
| # | Decision |
|---|---|
| D1 | Modular monolith, stateless instances |
| D3/D4 | Redis for all ephemeral state; **no location ever stored in MongoDB** |
| D5 | WebSocket-only Socket.IO (no sticky sessions needed behind campus NAT) |
| D6/D7 | Server-authoritative sharing; delivery-time authorisation with synchronously invalidated friend cache |
| D8 | Friendships as paired edge documents in transactions |
| D9 | 15-min access JWT in memory + rotating HttpOnly refresh cookie with reuse detection |
| D10 | Pluggable `StudentVerifier`, email OTP first |
| D11 | Campus geofence: off-campus positions never shared |
| D12 | Server TypeScript, client JS (confirmed) |
| D13 | `sharp` re-encoding of uploads to strip EXIF GPS |

## Resolved questions (approved 2026-11-10)
| # | Question | Decision |
|---|---|---|
| Q1 | Allowed email domain(s) | `vitstudent.ac.in` (env `ALLOWED_EMAIL_DOMAINS`) |
| Q2 | Mail delivery | Mailpit locally; any SMTP provider in production |
| Q3 | Building and campus-boundary geometry | OpenStreetMap (ODbL, attributed) |
| Q4 | Existing MongoDB data | Test data; the new server uses a fresh `vnav` database on the Compose Mongo |
| Q5 | TypeScript scope | Server only |

## Known gaps (not yet tested or built)
- Behaviour when Redis goes down mid-request is designed to fail closed (503) but has **no automated test** yet; planned for Phase 8 with a fault-injection test.
- Sockets are not disconnected on session revocation yet (`SessionService.onRevoked` hook exists; wired in Phase 4).
- Suspension / roles have no admin endpoints yet (`requireRole` exists, unused).
- Relationship-cache invalidation runs after the database commit. If that Redis call fails, the stale entry can survive until its 10-minute TTL (logged at error level). Decision in Phase 4: accepted, because every location update also needs Redis (rate limit, sharing flag, store); while Redis is failing, updates are not delivered at all, so the stale entry cannot leak positions in practice. Revisit if Redis gets a partial-failure mode (e.g. cluster) in Phase 9.
- No socket-level metrics yet (connected clients, updates/s, fan-out size); planned with `/metrics` in Phase 9. Load tests for 500 sockets / 200 sharers are Phase 8; **none have been run**.
- `event:changed` is Phase 6.
- Avatars (`PUT /users/me/avatar`) and account deletion (`DELETE /users/me`) are not built yet; they need the upload pipeline (Phase 6) and a full cascade (Phase 8).

## Tests executed
| Date | What | Result |
|---|---|---|
| 2026-11-10 | `vite build` of existing client | ✅ Builds; ⚠️ single 2.24 MB JS chunk (637 kB gzip) |
| 2026-11-10 | `server: npm test` (Vitest + Supertest against Compose Mongo rs0 + Redis): 17 unit, 36 integration | ✅ 53/53 passed, 3 consecutive runs |
| 2026-11-10 | `server: tsc --noEmit` (strict) and `npm run build` | ✅ |
| 2026-11-10 | `server: npm audit` | ✅ 0 vulnerabilities |
| 2026-11-10 | Manual: dev server boot, register → OTP delivered to Mailpit over real SMTP → verify → refresh with cookie | ✅ |
| 2026-11-10 | Manual: production image via `docker compose --profile api`, `/ready` 200, `docker stop` → graceful shutdown logs, exit code 0 | ✅ |

| 2026-11-11 | `server: npm test`: 26 unit, 56 integration (29 new for Phase 3, including concurrent crossing requests ×5 rounds, 5 concurrent duplicate sends, and transaction rollback at the friend cap) | ✅ 82/82 passed, 3 consecutive runs |
| 2026-11-11 | `server: tsc --noEmit`, `npm run build`, `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| 2026-11-11 | `npm run db:indexes` against the dev database; indexes on `friend_requests`, `friendships`, `blocks` checked in mongosh | ✅ |

| 2026-11-11 | `server: npm test`: 29 unit, 82 integration (25 socket tests incl. two in-process instances sharing Redis, 1 shutdown test) | ✅ 111/111 passed, 3 consecutive runs |
| 2026-11-11 | `tsc --noEmit`, `npm run build`, `npm audit` | ✅ 0 vulnerabilities |
| 2026-11-11 | Manual: `docker-compose.multi.yml` (api1 + api2 behind Nginx). Register two students via Mailpit OTP, befriend, A shares, B opens 6 tabs: sockets split 4/3 across instances, 6/6 tabs received A's location, 6/6 got the REST stop removal | ✅ |
| 2026-11-11 | Manual: stop `api2` with 3 of 6 sockets on it: 3 `server:shutdown`, 3 automatic reconnects to `api1`, 6/6 connected afterwards, `api2` exit code 0 in < 1 s | ✅ (after fixing the shutdown bugs listed above) |

Load tests: none run yet (Phase 8).
