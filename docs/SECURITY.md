# V-Nav Security Model

Status: **Approved design (Phase 1).** The checklist in §7 is the acceptance gate for Phase 8; items are ticked only when a test or a manual verification proves them.

---

## 1. Assets and threats

| Asset | Why it matters | Primary threats |
|---|---|---|
| **Live location** | Physical safety of students | Stalking by a non-friend or ex-friend; IDOR via changed user IDs; leakage through logs, caches or stale authorisation |
| Accounts | Impersonation, access to friends' locations | Credential stuffing, brute force, token theft via XSS, session fixation |
| Student identity | Platform must be VIT-only | Non-students registering with a guessed registration number |
| Social graph | Who knows whom | Enumeration of friend codes and users |
| Uploaded images | Can contain GPS EXIF, malware polyglots | Metadata leakage, stored XSS via SVG, oversized uploads |
| Infrastructure secrets | Full compromise | Committed `.env`, secrets in logs, over-broad DB users |

Attacker profiles: (1) a curious or malicious student with a valid account; (2) an outsider with no account; (3) a former friend or blocked user; (4) a stolen device with an active session.

---

## 2. Authentication

### 2.1 Registration and student verification
1. `POST /auth/register` validates `name`, `regNo` (format only), `email` (domain must be in `ALLOWED_EMAIL_DOMAINS`), `password` (10–128 chars, not in a bundled list of the 10,000 most common passwords).
2. User created with `status: pending_verification`. Password hashed with **bcrypt, cost 12** (~250 ms; tuned so login stays under p95 targets while making offline cracking expensive).
3. `StudentVerifier.begin(user)` → `EmailOtpVerifier` generates a 6-digit code with `crypto.randomInt`, stores `HMAC-SHA256(OTP_SECRET, code)`, TTL 10 min, sends via `MailTransport`.
4. `POST /auth/verify-email`: constant-time compare; 5 attempts then the code is burned; success sets `status: active`, `verification.verifiedAt`, and issues tokens.

`StudentVerifier` interface: `begin(user)`, `complete(user, proof)`, `method`. Future `RosterVerifier` (checks `regNo` + email against an official list) or `SsoVerifier` (university IdP via OIDC/SAML) implement the same interface. Until a roster exists, `regNo` is shown as **self-reported**.

### 2.2 Tokens

| Token | Format | Lifetime | Storage (client) | Storage (server) |
|---|---|---|---|---|
| Access | JWT HS256 `{ sub, sid, role, iat, exp }` | 15 min | **JS memory only** | none (stateless) + `session:revoked:{sid}` denylist |
| Refresh | 256-bit random, base64url | 30 days idle | `vnav_rt` cookie: `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` | SHA-256 hash in `sessions` |

- **Rotation:** every `/auth/refresh` issues a new refresh token and moves the old hash to `previousTokenHash`. Presenting a previous token again means it was stolen → revoke the entire session family, audit `token_reuse_detected`. A family is one `sessions` document (one login on one device); other devices stay signed in.
- **Concurrent refresh race:** if a previous token is presented within **15 s** of its rotation, it is treated as two tabs refreshing at once, not theft: the server answers `401 REFRESH_CONFLICT` without revoking, and the client retries once (the browser already holds the new cookie). After 15 s, reuse revokes the family.
- **Page reload:** the SPA has no access token after reload; it calls `/auth/refresh` once on boot (cookie is sent automatically). Concurrent 401s share **one** in-flight refresh (single-flight) to avoid rotation races.
- **Revocation latency:** revoked sessions are added to `session:revoked:{sid}` (TTL 15 min), so even unexpired access tokens stop working immediately. Tokens with `iat` before `passwordChangedAt` are rejected.
- **Secrets:** `JWT_ACCESS_SECRET` (≥ 32 random bytes) and `OTP_SECRET` come from env; the server refuses to start if they are missing or short.

### 2.3 Brute force and abuse
- Login: per IP+email and per IP limits, progressive lockout (5 failures → 15 min, doubling, cap 24 h) keyed by email so distributed attempts against one account still stop. Lockout responses are identical to wrong-password responses.
- bcrypt comparison runs even for unknown emails (against a dummy hash) to keep timing uniform and prevent account enumeration.
- Registration, resend and forgot-password always return the same response regardless of account existence.

### 2.4 Password reset
Single-use random token (SHA-256 stored, 30 min). The emailed link points to the SPA, which posts the token; the token never appears in server logs (the reset page reads it from the URL fragment `#token=`, which browsers do not send to servers). Success revokes all sessions.

---

## 3. Authorisation

### 3.1 Roles (RBAC)

| Role | Extra capabilities |
|---|---|
| `student` | Everything on own data; friends features; create events |
| `moderator` | Delete any event (audited); suspend users pending admin review |
| `admin` | Change roles, unsuspend, view audit logs |

`requireRole('moderator')` middleware guards moderation routes. Role is read from the verified token, and re-read from MongoDB for role-changing actions.

### 3.2 Resource rules (enforced in services, shared by REST and sockets)

| Resource | Rule |
|---|---|
| Location | Delivered to B only if: A is sharing **and** A–B friendship edge exists **and** no block either way **and** A is on campus. Checked at delivery time against the friend-set cache that is invalidated synchronously on change. |
| Friend request accept/reject | Only the recipient. Cancel: only the sender. IDs that don't match return `404`, not `403`, to avoid confirming existence. |
| Friendship removal | Only a participant. |
| Event read | `campus`, or `friends` and viewer is creator or creator's friend; never if blocked either way. |
| Event write | Creator; delete also moderator/admin. |
| Profile | Public subset to any active user not in a block relationship; friend subset to friends; email only to self. |

**IDOR rule:** every query that touches another user's data includes the viewer's ID as a filter condition in the repository query (e.g. `findOne({ _id: requestId, to: viewerId })`), never "load by ID then check". There is no endpoint that accepts a user ID and returns a location.

---

## 4. Location privacy

1. **No location over REST.** Only own sharing state.
2. **No broadcast rooms.** Only per-user rooms `user:{id}`.
3. **Identity from token only** — the `location:update` payload has no `userId` field, and any extra keys are stripped.
4. **Server-authoritative sharing**, default **off**; must be started explicitly each session or by a timed share.
5. **Immediate revocation** on stop, expiry, unfriend, block, logout, suspension (ARCHITECTURE §6).
6. **Campus geofence** — off-campus points are discarded, not stored.
7. **No history** — only the latest point in Redis, 120 s TTL. Nothing in MongoDB. Not in logs (logger redacts `lat`, `lng`, `coordinates`, `location.*`).
8. **Precision:** stored and delivered as sent (≈ metre precision) to friends only; event coordinates are public-ish and carry no user location.
9. **Fail closed:** if Redis is unavailable, location updates are rejected and the UI shows "sharing unavailable" — never a fallback path that skips checks.

---

## 5. Input, output and transport

| Control | Implementation |
|---|---|
| Validation | zod schemas on every route and socket event; unknown keys stripped; strings length-capped |
| NoSQL injection | zod rejects objects where strings are expected; `express-mongo-sanitize`-style guard strips `$` and `.` keys from `req.body/query/params`; Mongoose `strictQuery: true` |
| XSS | React escapes output; no `dangerouslySetInnerHTML`; user text rendered as text; strict CSP on the SPA (`default-src 'self'`; Mapbox and API origins allow-listed; no inline scripts) |
| CSRF | Bearer tokens for all state-changing APIs (not ambient → not CSRF-able). The two cookie endpoints require `SameSite=Lax` cookie **plus** `X-Requested-With: vnav` header **plus** Origin allowlist check. Requires client and API on the same *site* (e.g. `app.example.in` + `api.example.in`); see DEPLOYMENT. |
| CORS | Exact-origin allowlist from `CLIENT_ORIGINS`; `credentials: true`; no wildcard |
| Headers | `helmet` (HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, frame denial) |
| Body limits | JSON 100 kB; multipart 5 MB, one file; Socket.IO `maxHttpBufferSize` 16 kB |
| Uploads | `multer` memory storage → magic-byte check (JPEG/PNG/WebP only; SVG rejected) → `sharp` decode + resize + re-encode to WebP (drops EXIF incl. GPS) → random object key; served with `Content-Type: image/webp`, `Content-Disposition: inline`, from a separate origin/bucket |
| TLS | Terminated at the load balancer; HSTS; `Secure` cookies; app trusts exactly one proxy hop (`trust proxy 1`) so rate limiting uses the real client IP |
| Errors | Generic messages for 5xx; stack traces only in logs |

---

## 6. Secrets, logging and operations

- Secrets only in environment variables / the host's secret manager. `.env` files are git-ignored; `.env.example` files contain placeholders only. CI runs a secret scan (gitleaks) on every push. GitHub push protection is already active on the repo (it blocked a Mapbox token during the baseline push).
- MongoDB user has `readWrite` on the app database only. Redis requires a password (and TLS in production).
- Mapbox public token restricted by URL in the Mapbox dashboard.
- Logs: pino JSON with redaction paths for `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.token`, `*.code`, `*.lat`, `*.lng`, `*.email`. Users are identified by ID only.
- Dependency hygiene: `npm audit --omit=dev` in CI (fails on high/critical), Dependabot weekly.

---

## 7. Security checklist

Each item gets a test reference or verification note when completed.

**Authentication**
- [ ] Passwords hashed with bcrypt cost ≥ 12; never returned or logged
- [ ] Registration rejects non-allowlisted email domains
- [ ] Account unusable until email OTP verified
- [ ] OTP hashed, 10 min expiry, 5 attempts, resend throttled
- [ ] Access token 15 min, memory-only on client
- [ ] Refresh token HttpOnly/Secure/SameSite cookie, hashed server-side, rotated on use
- [ ] Refresh token reuse revokes the session family
- [ ] Logout, logout-all, password change and reset revoke sessions and disconnect sockets
- [ ] Login rate limit + progressive lockout; uniform responses and timing for unknown accounts
- [ ] Password reset tokens single-use, 30 min, not logged

**Authorisation and privacy**
- [ ] Every socket connection authenticated; identity only from token
- [ ] No campus-wide or shared rooms for location
- [ ] Location delivered only to accepted, non-blocked friends while sharing is on
- [ ] Unfriend stops delivery immediately (test: next update after unfriend not received)
- [ ] Block stops delivery and hides users from each other's lookups
- [ ] Stop-sharing and timed expiry remove markers for friends
- [ ] Off-campus positions rejected and never stored
- [ ] No REST endpoint returns another user's location (test: enumerate routes)
- [ ] Changing IDs in any request cannot access another user's private data (IDOR tests per route)
- [ ] No location coordinates in MongoDB, logs or error reports
- [ ] Moderator/admin routes reject students

**Input and transport**
- [ ] zod validation on every route and socket event
- [ ] `$`-operator payloads rejected (NoSQL injection tests)
- [ ] Body and socket frame size limits enforced
- [x] Uploads: type by magic bytes, size cap, EXIF stripped (tested with a GPS-tagged JPEG), SVG rejected, undecodable files rejected (Phase 6, `test/integration/events.test.ts`)
- [ ] CORS exact allowlist; credentials only for allowlisted origins
- [ ] CSRF defences on cookie endpoints (missing header / foreign Origin → 403)
- [ ] helmet headers and CSP present
- [ ] 5xx responses contain no internal details

**Operations**
- [ ] No secrets in git (gitleaks clean); `.env.example` placeholders only
- [ ] Server refuses to start with missing/weak secrets
- [ ] `npm audit` clean of high/critical in production deps
- [ ] `/metrics` not reachable from the public internet
- [ ] Logs redact tokens, cookies, passwords, OTPs, emails, coordinates
