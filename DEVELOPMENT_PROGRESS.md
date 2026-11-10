# V-Nav Development Progress

Last updated: 2026-11-10 (Phase 2)

A module counts as **complete** only when its code exists, its tests have been run and pass, and the result is recorded below. Generated code alone counts as "in progress".

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 — Repository audit | Inspect existing code, find reusable parts and weaknesses | ✅ Done — [docs/PHASE-0-AUDIT.md](docs/PHASE-0-AUDIT.md) |
| 0.5 — Setup | Git baseline; remove dead/fabricated code | 🟡 Git baseline pushed (`cc7dfc8`); dead-file cleanup pending |
| 1 — Architecture | Architecture, schema, API, sockets, security, scalability, deployment, load-test plan | ✅ Approved 2026-11-10 with defaults Q1–Q5 |
| 2 — Backend foundation | TS server skeleton, config, logging, errors, validation, MongoDB + Redis, health/ready, graceful shutdown, auth + email OTP + sessions, Docker Compose | ✅ Done — 53 tests passing (see below) |
| 3 — Friend system | Friend codes, requests, friendships, blocks, lists | ⬜ |
| 4 — Real-time location | Socket auth, Redis adapter, sharing state, friend-only delivery, revocation, presence, reconnection | ⬜ |
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
- The pre-rebuild server moved to `server-legacy/` (unchanged, still runnable) so the current client keeps working until Phase 7, when it is deleted.

## Pending modules
Phases 3–9. Phase 0.5 dead-file cleanup is folded into Phase 7.

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

## Known gaps in Phase 2 (not yet tested or built)
- Behaviour when Redis goes down mid-request is designed to fail closed (503) but has **no automated test** yet; planned for Phase 8 with a fault-injection test.
- Sockets are not disconnected on session revocation yet (`SessionService.onRevoked` hook exists; wired in Phase 4).
- Suspension / roles have no admin endpoints yet (`requireRole` exists, unused).

## Tests executed
| Date | What | Result |
|---|---|---|
| 2026-11-10 | `vite build` of existing client | ✅ Builds; ⚠️ single 2.24 MB JS chunk (637 kB gzip) |
| 2026-11-10 | `server: npm test` (Vitest + Supertest against Compose Mongo rs0 + Redis): 17 unit, 36 integration | ✅ 53/53 passed, 3 consecutive runs |
| 2026-11-10 | `server: tsc --noEmit` (strict) and `npm run build` | ✅ |
| 2026-11-10 | `server: npm audit` | ✅ 0 vulnerabilities |
| 2026-11-10 | Manual: dev server boot, register → OTP delivered to Mailpit over real SMTP → verify → refresh with cookie | ✅ |
| 2026-11-10 | Manual: production image via `docker compose --profile api`, `/ready` 200, `docker stop` → graceful shutdown logs, exit code 0 | ✅ |

Load tests: none run yet (Phase 8).
