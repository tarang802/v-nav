# V-Nav Development Progress

Last updated: 2026-11-13 (Phase 6)

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
| 5 — Map | Persistent map shell, verified buildings layer, friend and event layers, clustering | ✅ Done, with one gap: map painting not seen on screen (see known gaps) |
| 6 — Events | CRUD, visibility, discovery, filters, pagination, map integration, images | ✅ Done — 136 server + 27 client tests passing (see below) |
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
- **Phase 5 map** (client, JavaScript):
  - **Verified buildings:** `client/public/data/campus-buildings.geojson`, 27 buildings (26 named) from OpenStreetMap inside the campus boundary, regenerated by `node ops/osm/fetch-buildings.mjs`. Names, shapes and level counts are OSM's; nothing is added.
  - **Rebuilt app shell beside the original app:** `npm run dev:next` / `build:next` (Vite mode `next`, `client/.env.next`) mounts `src/app/App.jsx`; plain `npm run dev` still mounts the original app for `server-legacy/`. Each is loaded on demand, so neither ships the other's code. The original app is deleted in Phase 7.
  - **Session:** `services/apiClient.js` (access token in memory only, refresh cookie, one shared refresh for concurrent 401s, one retry on `REFRESH_CONFLICT`), `stores/authStore.js` (restore on reload, refresh 60 s before expiry), sign-in page with specific error messages.
  - **One persistent Mapbox map** (`components/map/CampusMap.jsx`) in `layouts/AppShell.jsx`; routes render in a panel over it. Mapbox loads only after sign-in (sign-in bundle ≈ 70 kB gzip; map chunk ≈ 470 kB gzip).
  - **Layers:** OSM buildings (3D extrusion, labels, hover, popup); friends as one clustered GeoJSON source redrawn at most once per animation frame from a vanilla Zustand store, dimmed after 60 s and dropped after 120 s; clustered events layer (empty until the Phase 6 API feeds it through `mapController.setEvents`); own position (DOM marker + accuracy circle).
  - **Socket client** (`sockets/socketClient.js`): fresh token on every (re)connect, `auth:refresh` when the token is renewed, handling of `TOKEN_EXPIRED` / `SESSION_REVOKED` / `auth:expired`, events routed to the store or to TanStack Query invalidation.
  - **Sharing:** `useGeolocationSharing` watches GPS only while sharing, applies the send policy (≥ 10 m and ≥ 3 s, or 30 s heartbeat, accuracy ≤ 100 m), pauses after 5 min hidden, never retries a denied permission. Sharing control with durations, countdown, and notices for blocked permission, off campus and weak GPS. "Friends on campus" panel that flies to a friend.
  - **Dev tools (server):** `npm run seed:dev` (three verified demo students who are friends; local databases only) and `npm run simulate` (a demo student shares a moving position between real OSM buildings through the real API and socket server).
  - Popups are built with `textContent`, so names can never be interpreted as HTML. OSM attribution is shown on the map.
- **Phase 6 events** (`multer` 2.5, `sharp` 0.35):
  - `events` collection with the four designed indexes (discovery, organiser, 2dsphere, category).
  - Rules in `EventService`: location must be inside the campus boundary (`422 OFF_CAMPUS`); end after start, at most 14 days long, not already over, at most a year ahead (`422 INVALID_TIME_RANGE`); 20 new events per day per student.
  - **Visibility, decided only on the server:** campus-wide events for everyone; friends-only events for the organiser and their friends; nothing between students in a block relationship, in either direction; a hidden event is a 404. The same filter serves the list, the map endpoint and single-event access.
  - Discovery: default window of the next 30 days (upcoming and ongoing), filters for date range, category, visibility and "my events", cursor pagination on `(startsAt, id)` that is stable when events share a start time.
  - `GET /events/map`: GeoJSON for a bounding box, lightweight properties, capped at 500.
  - Update and cancel by the organiser only (403 for viewers, 404 for those who cannot see it); delete by the organiser, or by a moderator/admin with an audit record. Cancelled events leave lists but stay reachable by link.
  - **Image pipeline** (`ImageService`): type decided from file content, never from the name or declared type; JPEG, PNG and WebP only (SVG and undecodable files refused, 415); 5 MB cap (413); pixel-count cap against decompression bombs; EXIF orientation applied, then re-encoded to WebP with all metadata removed; random server-generated names; old files deleted on replace, removal and event deletion. Used for event images (max 1,600 px) and profile pictures (512 px, `PUT`/`DELETE /users/me/avatar`).
  - `StorageAdapter` interface with a local-disk driver; `/uploads` served with a fixed `image/webp` type, `nosniff` and immutable caching.
  - `event:changed` socket notification to the organiser's friends and own tabs for friends-only events.
  - **Client map integration:** the shell fetches `/events/map` for the campus, refreshes every 2 minutes and when `event:changed` arrives, and draws the clustered events layer with a popup (title, time, category).
  - `seed:dev` also creates two demo events at real buildings (one campus-wide, one friends-only).
- The pre-rebuild server moved to `server-legacy/` (unchanged, still runnable) so the current client keeps working until Phase 7, when it is deleted.

## Pending modules
Phases 7–9. Phase 0.5 dead-file cleanup is folded into Phase 7.

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

## Phase 5 deviations from the Phase 1 docs (docs updated)
| Change | Why |
|---|---|
| The rebuilt shell lives beside the original app behind a Vite mode, instead of replacing it now | The original app must keep working with `server-legacy/` until every screen is rebuilt (Phase 7). |
| Sign-in page, API client, auth store and socket client were built now rather than in Phase 7 | The map cannot be shown with real data without a signed-in socket. Registration, verification, password reset, friends and profile screens are still Phase 7. |
| Friends layer is clustered too | A student can have many friends in one building; a count bubble is clearer than stacked markers. |
| Friend markers are a circle layer with initials (no avatar images) | Avatar upload does not exist until Phase 6. |
| Buildings file is `campus-buildings.geojson`; extrusion height is OSM height, else OSM levels × 3.2 m, else a 4 m drawing default | 14 of 27 buildings have no height data in OSM; the default is a rendering choice, not a measurement, and is labelled as such in code. |
| Client tooling upgraded to Vite 8, @vitejs/plugin-react 6, Vitest 5; `npm audit fix` applied | Vitest needs Vite ≥ 6, and the client had 9 audit findings (axios, form-data, nanoid, esbuild and others); now 0. The original app still builds. |
| `VITE_API_URL` is used directly (CORS + credentials) rather than the Vite proxy | Same code path as production, where the API is on another origin. |

## Phase 6 deviations from the Phase 1 docs (docs updated)
| Change | Why |
|---|---|
| Only the `local` storage driver exists; `s3` moved to Phase 9 | An S3 driver cannot be tested without a bucket or a MinIO container, and nothing needs it before deployment. The interface is in place. |
| New `API_PUBLIC_URL` and `UPLOAD_DIR` settings | Image URLs need the API's public origin; the upload directory must be a mountable volume. |
| `GET /events/map` features also carry `endsAt` | Lets the map tell ongoing from upcoming events without a second request. |
| `event:changed` also goes to the organiser's own tabs, and is sent when a friends-only event becomes campus-wide | Other tabs and friends' lists both need to refresh in those cases. |
| Cancelling is one-way through the API | Avoids an event flickering between cancelled and active for people who already saw the cancellation. |
| Events cannot start more than a year ahead; listing windows are capped at a year | Bounds on otherwise unbounded inputs. |
| Event screens (list, detail, form) are not in this phase | Phase 6 is the API and the map layer; every remaining screen is built in Phase 7. |

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
- Images use local disk storage only. Several instances work only with a shared volume (the multi-instance Compose file has one); an S3-compatible driver is Phase 9 and its `S3_*` variables are not read yet.
- **The map has still not been seen on screen by a person.** The desktop Browser pane was hidden in every session, so no screenshot was possible. In Phase 6 the page was driven with timer-based animation frames instead, and Mapbox reported what it drew: all 27 buildings with labels and both demo events at the default view. That check found and fixed a real bug (the map was only 300 px tall). Colours, label placement, cluster appearance and the mobile layout still need a look in a visible browser (`npm run dev:next`, then `npm run simulate` in `server/`).
- Own-position marker and the GPS send path could not be exercised in the browser (geolocation is blocked in the test pane); the send policy is unit-tested and the blocked-permission notice was seen.
- The fabricated `client/public/data/vit-buildings.geojson` is still used by the original app and is deleted with it in Phase 7. The rebuilt shell does not load it.
- No component or end-to-end tests for the client yet (Playwright is Phase 8); client tests cover pure logic only.
- Account deletion (`DELETE /users/me`) is not built yet; it needs a full cascade over sessions, friendships, blocks, events and images (Phase 8).
- There are no event screens yet (list, detail, create/edit form, image picker); events are created through the API or `seed:dev`. Those screens are Phase 7. Friend markers still show initials rather than avatars.

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

| 2026-11-11 | `client: npm test` (Vitest): send policy, geo helpers, location store, feature builders, API client refresh behaviour, countdown label | ✅ 28/28 |
| 2026-11-11 | `client: vite build --mode next` and `vite build` (original app); `npm audit` | ✅ both build; 0 vulnerabilities |
| 2026-11-11 | Manual, real API + browser (`dev:next`): sign-in, wrong-password message, session restored after reload, socket "Live", 12 layers + 27 OSM buildings loaded, OSM attribution shown | ✅ |
| 2026-11-11 | Manual: `npm run simulate` as a demo friend → appears in the panel and in the friends map source with initials, position changes between reads, removed when they stop | ✅ (map pixels not seen; see known gaps) |
| 2026-11-11 | Manual: Share → 15 minutes → server state on, blocked-permission notice; reload keeps state; Stop; Sign out | ✅ (found and fixed: countdown showed 18 min for a 15 min share) |
| 2026-11-12 | `server: npm test` after adding the dev scripts; `tsc --noEmit`; `npm audit` | ✅ 111/111 passed, 2 consecutive runs; 0 vulnerabilities |
| 2026-11-12 | Second attempt to view the map in the Browser pane | ⚠️ Pane still hidden (0 animation frames); not verified |

| 2026-11-13 | `server: npm test`: 136 tests (23 new event and upload tests, 2 new socket tests) | ✅ 136/136 passed, 3 consecutive runs |
| 2026-11-13 | Upload checks inside that suite: GPS-tagged 3000×2000 JPEG comes back as 1600×1067 WebP with no EXIF; SVG, HTML and fake-JPEG files refused; 5 MB cap; files removed on replace/delete | ✅ |
| 2026-11-13 | `tsc --noEmit`, `npm run build`, `npm audit` (server); `npm test` 27/27, both builds, `npm audit` (client) | ✅ 0 vulnerabilities |
| 2026-11-13 | Manual, real API + browser: a friend of the organiser gets both demo events (campus-wide and friends-only) from `/events/map`; Mapbox reports both event markers, one title label and all 27 buildings drawn at the default view | ✅ after fixing the map height bug (canvas was 1024×300; now fills the window) |

Load tests: none run yet (Phase 8).
