# V-Nav — Phase 0 Repository Audit

Date: 2026-11-10. Read-only audit; no application code was changed.

Evidence is cited as `file:line`. "Verified" means I ran it.

---

## 1. What exists today

| Area | State |
|---|---|
| Version control | **None.** Not a git repository. |
| Client | React 18 + Vite 5 + Tailwind 3 + Zustand + Framer Motion + Mapbox GL 3.4. 25 files, ~4,950 LOC in `src/`. |
| Server | Express 4 + Mongoose 8 + Socket.IO 4 + JWT + bcryptjs. 7 source files, single process, no layering. |
| Build | **Verified:** `vite build` succeeds. One JS chunk of **2.24 MB (637 kB gzip)**, no code splitting. |
| Tests | **None**, client or server. |
| Infra | Vercel rewrite (`client/vercel.json`), Railway `Procfile`. No Docker, no CI, no Redis. |
| Local tooling | Node 24, Docker 29 installed. No local Redis or MongoDB binaries (Docker will provide them). |

---

## 2. What works and is worth keeping

- **Mapbox helper layer** (`client/src/utils/mapHelpers.js`, 431 LOC): GeoJSON source with `promoteId`, feature-state hover highlighting, 3D `fill-extrusion`, accuracy-circle polygon. Good foundation for the building layer.
- **Shared map base** `client/src/components/map/MapView.jsx` exposing `flyTo` / `getMap` via ref. Reusable.
- **Auth UI** `client/src/pages/Auth.jsx` — styled register/login form; needs new fields (email, OTP step).
- **Socket auth handshake pattern** — identity derived from the verified JWT, not from client input (`server/sockets/index.js:9-32`). Correct idea; keep the principle.
- **Event ownership check** on delete (`server/routes/events.js:77`).
- **bcrypt cost 12** with `isModified` guard (`server/models/User.js:54-58`).
- **Coordinate validation** on events and socket updates.
- **Axios client** with timeout and 401 handling (`client/src/utils/api.js`).

---

## 3. Critical problems (security and privacy)

| # | Problem | Evidence | Impact |
|---|---|---|---|
| S1 | **Unfriending/blocking does not stop location delivery.** `socket.friendIds` is cached at connect time and only refreshed when the *client* emits `join`. | `sockets/index.js:26, 85-87, 90-94` | A removed friend keeps receiving live location until the sharer reconnects. Directly violates the core privacy rule. |
| S2 | **No real sharing state on the server.** Location is relayed to all friends on every `loc:update`; "sharing enabled" exists only in the client store. | `sockets/index.js:64-88`, `client/src/store/useStore.js:47` | A modified client can broadcast while the UI says off. Server cannot enforce "stop sharing immediately". |
| S3 | **No student verification.** Anyone can register any string as a student ID. | `routes/auth.js:12-28` | Non-students can join; impersonation of a real reg. number is possible. |
| S4 | **JWT in `localStorage`, 7-day lifetime, no refresh, no revocation.** | `routes/auth.js:9`, `store/useStore.js:9-14` | XSS → full account takeover for 7 days. Logout does not invalidate anything server-side. |
| S5 | **No rate limiting anywhere.** | `server.js` | Login brute force; friend-code enumeration (`/friends/add` returns 404 vs. 200 per code). |
| S6 | **Internal errors leaked to clients.** | `routes/auth.js:61` (`"Server error: " + err.message`), `server.js:52` | Exposes stack/DB details. |
| S7 | **No input validation library, no body-size limit, no helmet, no NoSQL-injection guard.** `req.body` values are passed to queries untyped (e.g. `friendCode.trim()` crashes on non-strings). | `routes/friends.js:12-19` | 500s on malformed input; injection surface. |
| S8 | **Online/offline presence broadcast to all friends regardless of sharing.** | `sockets/index.js:55-62, 120-128` | Leaks activity patterns even when the user chose not to share. |
| S9 | **Hardcoded Mapbox token** in the legacy vanilla file `client/app.js:1`. Mapbox `pk.` tokens are public by design, but this one should be URL-restricted in the Mapbox dashboard. | `client/app.js:1` | Quota abuse if unrestricted. |

## 4. Architectural problems

| # | Problem | Evidence |
|---|---|---|
| A1 | **Unbounded arrays in the user document** (`friends`, `friendRequests`). No block list, no cancel, no remove-friend. | `models/User.js:38-49` |
| A2 | **Non-atomic friend accept** — two separate saves; a crash between them leaves a one-sided friendship. | `routes/friends.js:68-77` |
| A3 | **In-memory `Map`s as socket state** — breaks with more than one instance; state lost on restart. | `sockets/index.js:4-6` |
| A4 | **Multi-tab bug:** closing one tab deletes the user's live location and tells friends they went offline, even if another tab is still sharing. | `sockets/index.js:114-129` |
| A5 | **No layering:** routes contain validation, business logic and DB access. | `routes/*.js` |
| A6 | **Event model too thin:** no date/time, category, image, campus-wide visibility, edit; no pagination; `$in` over a friends array. | `models/Event.js`, `routes/events.js:52-70` |
| A7 | **Client re-renders the whole map component on every location update** and uses one DOM `Marker` per friend/event. | `components/Map.jsx:57, 237-271` |
| A8 | **No graceful shutdown, `/health` reports but never fails, no `/ready`.** | `server.js:37-43` |
| A9 | **Location fires on a fixed 4 s timer** regardless of movement; no distance threshold, no server-side rate limit. | `hooks/useGeolocation.js:4, 57-61` |
| A10 | **Two parallel UIs:** `/` (Dashboard + `Map.jsx`, light theme bits) and `/app/*` (Sidebar + `map/MapView.jsx`). | `App.jsx` |

## 5. Fabricated, dead or non-functional code

These conflict with the brief's "no fake data, no non-functional buttons" rule.

| Item | Evidence | Verdict |
|---|---|---|
| **Building polygons are invented.** All 15 are axis-aligned squares of ~0.001° (~110 m), e.g. AB1 `[[80.1493,12.8455],[80.1503,12.8455],...]`. Several names (Hostel Block A/B/C) are generic. | `public/data/vit-buildings.geojson` | **Replace** with verified geometry (OpenStreetMap footprints, licensed ODbL, with attribution) or a survey you supply. |
| **Navigation "Quick Spots" coordinates invented**; "Start Navigation" button does nothing. | `pages/NavigationPage.jsx:4-9, 118` | Mark not implemented / remove until routing exists. |
| **Heatmap page** is controls with no data ("coming soon"). | `pages/HeatmapPage.jsx:66-70` | Remove from nav; heatmap is not in the new brief and has privacy implications. |
| **Explore page** is camera sliders only. | `pages/ExplorePage.jsx` | Fold into map controls or drop. |
| **Dead files:** `components/MapView.jsx` (New Delhi placeholder centre, imported nowhere), `client/app.js` + `client/styles.css` (legacy vanilla build, not referenced by `index.html`), committed `client/dist/`. | grep across `src/` | Delete. |

## 6. Environment variables

| Server | Client |
|---|---|
| `PORT`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN` | `VITE_MAPBOX_TOKEN`, `VITE_API_URL`, `VITE_SOCKET_URL` |

New ones needed: see the full list in [DEPLOYMENT.md §4](DEPLOYMENT.md) (supersedes this preliminary list).

`client/.env.example` sets `VITE_API_URL=http://localhost:3000`, which contradicts the README ("leave empty in dev").

---

## 7. Recommendation: evolve the client, rebuild the server

- **Server:** the current 7 files are small and the data model (A1) and socket model (S1, S2, A3) are wrong at the root. A clean rebuild in the layered structure is cheaper than refactoring. Existing `.env` keys are kept compatible where possible.
- **Client:** keep Vite/React/Tailwind/Zustand/Mapbox and the reusable map helpers; restructure into the brief's folder layout, merge the two UIs into one map-first shell, delete fabricated pages.
- **Data:** existing users have no email and cannot be verified. Plan: a one-off migration script that converts `friends[]` into `Friendship` documents and marks legacy accounts `unverified` until they complete email OTP. If the current database has only test data, simply reset it.

### Proposed deviations from the stated stack

| Item | Proposal | Reason |
|---|---|---|
| Language | **TypeScript on the server, JavaScript (JSDoc) on the client initially** | Server correctness (auth, privacy checks) benefits most from types; converting the existing JSX client wholesale adds risk without much payoff. Open to full TS — your call. |
| Password hashing | Keep **bcrypt (cost 12)** | Already in place, adequate; Argon2 needs native builds that complicate Windows + Docker. |
| Location state | **Redis only, never MongoDB** | Brief forbids precise location history without a retention justification. Redis keys with TTL give stale detection and automatic deletion. |
| Uploads | Local disk in dev behind a storage interface; S3-compatible (e.g. Cloudflare R2) in prod | No extra infra in dev; swappable later. |

---

## 8. Phased plan

Each phase ends with passing tests and a short report before the next starts.

| Phase | Deliverables | Exit criteria |
|---|---|---|
| **0.5 Setup** | `git init`, root `.gitignore`, first commit of the current state as a baseline. Delete dead files listed in §5. | Clean baseline to diff against. |
| **1 Architecture** | `docs/`: system diagram, DB schema + index rationale, REST API spec (OpenAPI), socket event spec, auth flow, location data flow, security model + checklist, deployment plan, performance targets. | You approve the docs. |
| **2 Backend foundation** | Layered TS server (`config/ controllers/ services/ repositories/ models/ routes/ middleware/ validators/ sockets/ observability/`), Zod validation, pino logs with request IDs, central error handler, helmet, body limits, Mongo + Redis connections with timeouts, `/health` + `/ready`, graceful shutdown. Auth: register → email OTP → verified; login; access token (15 min, memory) + rotating refresh token (HTTP-only cookie, hashed in Mongo, reuse detection); logout; logout-all; password reset; Redis-backed rate limits. Docker Compose (api ×2, mongo, redis, nginx). | Vitest + Supertest suite green; compose stack boots. |
| **3 Friends** | `Friendship` (sorted pair, unique), `FriendRequest` (unique pending per pair), `Block` collections; send / accept (transaction) / reject / cancel / remove / block / unblock; friend-code lookup with enumeration-resistant responses. | Tests for every prevention rule in the brief. |
| **4 Real-time location** | Redis adapter; per-user rooms; server-side sharing state (incl. timed sharing) in Redis; per-delivery friendship + block + sharing checks backed by a Redis friend-set cache invalidated on every friendship change; force-revoke on unfriend/block/stop; multi-tab aware presence; server rate limit + bounds check (campus bounding box); client movement threshold + adaptive interval. | Socket tests incl. two server instances through Redis. |
| **5 Map** | Single map-first shell; GeoJSON sources + symbol layers for friends/events with clustering (no DOM markers per item); map state isolated from React re-renders; verified building layer with hover/click. | Playwright map tests. |
| **6–9** | Events, frontend integration, testing + load tests, deployment. Tracked in [DEVELOPMENT_PROGRESS.md](../DEVELOPMENT_PROGRESS.md). | |

---

## 9. Decisions needed from you

1. **Phases 6+ of the brief** — the message was truncated mid-sentence at "PHASE 6 — EVENTS / Event CRUD / Event visi…". Please resend the remainder (Phase 6 onward and anything after it).
2. **Git** — OK to `git init` and commit the current state as a baseline before changes?
3. **Institutional email domain(s)** for OTP verification (e.g. `vitstudent.ac.in`), and how OTP mail will be sent: SMTP account, a provider like Resend/SES, or a dev-only console/Mailpit transport for now.
4. **Building data** — OK to pull VIT Chennai building footprints from OpenStreetMap (ODbL, attribution shown on the map)? Buildings missing from OSM will be left out rather than invented.
5. **Existing database** — real users to migrate, or test data that can be reset?
6. **TypeScript** — server-only TS (recommended), full TS, or plain JS throughout?
