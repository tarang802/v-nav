# V-Nav REST API

Status: **Approved design.** Implemented and tested so far (Phase 2): all of §2 Auth, `GET /users/me`, `/health`, `/ready`. Everything else is design only until its phase lands; [DEVELOPMENT_PROGRESS.md](../DEVELOPMENT_PROGRESS.md) is the source of truth. An OpenAPI 3.1 file generated from the zod validators is planned for Phase 7, when the client consumes the API; this document is authoritative until then.

Base URL: `/api/v1`. All bodies are JSON unless noted. All timestamps are ISO 8601 UTC.

Live location is **not** available over REST. It is delivered only over authenticated Socket.IO to authorised friends (see [SOCKET_EVENTS.md](SOCKET_EVENTS.md)). The only location endpoints concern **your own** sharing state.

---

## 1. Conventions

### Authentication
- `Authorization: Bearer <accessToken>` on every endpoint marked 🔒.
- Refresh token travels only as the `vnav_rt` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`). JavaScript never sees it.
- Cookie-authenticated endpoints (`/auth/refresh`, `/auth/logout`) also require header `X-Requested-With: vnav` and an allowed `Origin` (CSRF defence; see [SECURITY.md](SECURITY.md)).

### Error format
```json
{ "error": { "code": "FRIEND_REQUEST_EXISTS", "message": "Friend request already sent", "requestId": "c0a8…", "details": [] } }
```
`details` appears only for `VALIDATION_ERROR` (field path + message). 5xx responses never include internal messages.

| HTTP | Typical codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `WEAK_PASSWORD`, `INVALID_CODE` (wrong/expired/locked OTP, or unknown email), `INVALID_TOKEN` (reset link) |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `SESSION_REVOKED`, `INVALID_CREDENTIALS`, `REFRESH_CONFLICT` (concurrent refresh; retry once) |
| 403 | `FORBIDDEN`, `CSRF_REJECTED`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_SUSPENDED`, `EMAIL_DOMAIN_NOT_ALLOWED` |
| 404 | `NOT_FOUND` (also used where revealing existence would leak information) |
| 409 | `EMAIL_TAKEN`, `REG_NO_TAKEN`, `ALREADY_FRIENDS`, `FRIEND_REQUEST_EXISTS`, `FRIEND_LIMIT_REACHED` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `OFF_CAMPUS`, `INVALID_TIME_RANGE` |
| 429 | `RATE_LIMITED`, `ACCOUNT_LOCKED` (both with `Retry-After`) |
| 503 | `NOT_READY` |

### Pagination
Cursor-based: `?limit=20&cursor=<opaque>`; response `{ items: [...], nextCursor: "…" | null }`. `limit` max 50. Cursors are base64url of the sort key and are validated server-side.

### Public user shape (`PublicUser`)
Returned when the viewer is **not** a friend:
```json
{ "id": "…", "name": "Asha R", "avatarUrl": "…", "friendCode": "VNAV-A82KD", "isVerified": true }
```
`FriendUser` (viewer is a friend) adds `regNo`, `friendCount`, `friendsSince`, and — only if the friend allows it — `online` and `lastSeenAt`. Email is never shown to anyone but the owner.

---

## 2. Auth

| Method & path | Auth | Body | Success | Notes |
|---|---|---|---|---|
| `POST /auth/register` | — | `{ name, regNo, email, password }` | `202 { email, verificationRequired: true }` | Password 10–128 chars, rejected if in a common-password list. Sends OTP. Rate limit 5/h per IP. |
| `POST /auth/verify-email` | — | `{ email, code }` | `200 { accessToken, user }` + cookie | 5 attempts per code. Activates account. |
| `POST /auth/resend-verification` | — | `{ email }` | `202` always | 1/min, 5/h per email. Same response whether or not the account exists. |
| `POST /auth/login` | — | `{ email, password }` | `200 { accessToken, user }` + cookie | Generic `INVALID_CREDENTIALS`. Lockout after 5 failures (15 min, progressive). Unverified → `403 EMAIL_NOT_VERIFIED`. |
| `POST /auth/refresh` | cookie | — | `200 { accessToken }` + rotated cookie | Reuse of an old token revokes the whole session family. |
| `POST /auth/logout` | cookie | — | `204` | Revokes this session, clears cookie, disconnects this session's sockets. |
| `POST /auth/logout-all` | 🔒 | — | `204` | Revokes every session of the user. |
| `GET /auth/sessions` | 🔒 | — | `200 { items: Session[] }` | `{ id, userAgent, lastUsedAt, createdAt, current }` |
| `DELETE /auth/sessions/:id` | 🔒 | — | `204` | Own sessions only. |
| `POST /auth/password/forgot` | — | `{ email }` | `202` always | Emails a single-use link (30 min). 3/h per email. |
| `POST /auth/password/reset` | — | `{ token, password }` | `204` | Revokes all sessions. |
| `POST /auth/password/change` | 🔒 | `{ currentPassword, newPassword }` | `204` | Revokes all **other** sessions. |

---

## 3. Users and profile

| Method & path | Auth | Body / query | Success | Notes |
|---|---|---|---|---|
| `GET /users/me` | 🔒 | — | `200 { user }` | Full own profile incl. email, privacy, sharing state |
| `PATCH /users/me` | 🔒 | `{ name? }` | `200 { user }` | `regNo` and `email` are not self-editable after verification |
| `PATCH /users/me/privacy` | 🔒 | `{ showOnlineStatus?, allowFriendRequests? }` | `200 { privacy }` | Change takes effect on sockets immediately |
| `PUT /users/me/avatar` | 🔒 | `multipart/form-data` field `image` | `200 { avatarUrl }` | JPEG/PNG/WebP ≤ 5 MB, verified by magic bytes, re-encoded to 512 px WebP, EXIF stripped |
| `DELETE /users/me/avatar` | 🔒 | — | `204` | |
| `DELETE /users/me` | 🔒 | `{ password }` | `204` | Full account deletion (see schema §4) |
| `GET /users/lookup` | 🔒 | `?code=VNAV-A82KD` | `200 { user: PublicUser, relationship }` | `relationship`: `none` \| `friends` \| `request_sent` \| `request_received`. Blocked either way, unverified, or unknown → identical `404`. 60/h per user. |
| `GET /users/:id` | 🔒 | — | `200 { user: PublicUser \| FriendUser }` | `404` if blocked either way |

---

## 4. Friends

| Method & path | Auth | Body / query | Success | Notes |
|---|---|---|---|---|
| `GET /friends` | 🔒 | `?limit&cursor` | `200 { items: FriendUser[], nextCursor }` | Sorted by `since` desc |
| `DELETE /friends/:userId` | 🔒 | — | `204` | Removes both edges; stops location delivery both ways immediately |
| `GET /friends/requests/incoming` | 🔒 | `?limit&cursor` | `200 { items: [{ id, from: PublicUser, createdAt }] }` | |
| `GET /friends/requests/outgoing` | 🔒 | `?limit&cursor` | `200 { items: [{ id, to: PublicUser, createdAt }] }` | |
| `POST /friends/requests` | 🔒 | `{ friendCode }` | `201 { request }` or `200 { friendship }` if it auto-accepted a crossing request | 30/h per user. Rules in schema §2.5. |
| `POST /friends/requests/:id/accept` | 🔒 | — | `200 { friend: FriendUser }` | Recipient only, else `404`. Transaction. |
| `POST /friends/requests/:id/reject` | 🔒 | — | `204` | Recipient only. Sender is not notified. |
| `DELETE /friends/requests/:id` | 🔒 | — | `204` | Cancel; sender only. |

## 5. Blocks

| Method & path | Auth | Body | Success | Notes |
|---|---|---|---|---|
| `GET /blocks` | 🔒 | `?limit&cursor` | `200 { items: [{ user: PublicUser, createdAt }] }` | |
| `POST /blocks` | 🔒 | `{ userId }` | `201` | Removes friendship and requests both ways, revokes location access |
| `DELETE /blocks/:userId` | 🔒 | — | `204` | Does not restore the friendship |

---

## 6. Location (own state only)

| Method & path | Auth | Body | Success | Notes |
|---|---|---|---|---|
| `GET /location/sharing` | 🔒 | — | `200 { sharing: boolean, startedAt, expiresAt }` | |
| `POST /location/sharing/stop` | 🔒 | — | `204` | **Emergency stop** that works even if the socket is disconnected. Same effect as the socket event. |

Starting sharing is socket-only, because it is meaningless without a live connection sending positions.

---

## 7. Events

| Method & path | Auth | Body / query | Success | Notes |
|---|---|---|---|---|
| `GET /events` | 🔒 | `?from&to&category&visibility&creator=me&limit&cursor` | `200 { items: Event[], nextCursor }` | Default window: now → +30 days. Only events the viewer may see. |
| `GET /events/map` | 🔒 | `?bbox=minLng,minLat,maxLng,maxLat&from&to` | `200 GeoJSON FeatureCollection` | Lightweight properties (`id, title, category, startsAt`), max 500 features. Used by the map layer. |
| `GET /events/:id` | 🔒 | — | `200 { event }` | `404` if not visible to viewer |
| `POST /events` | 🔒 | `{ title, description?, category, location: {lat,lng}, venue, startsAt, endsAt, visibility }` | `201 { event }` | Location must be on campus (`422 OFF_CAMPUS`). 20/day per user. |
| `PATCH /events/:id` | 🔒 | any subset of the above, or `{ status: 'cancelled' }` | `200 { event }` | Creator only |
| `DELETE /events/:id` | 🔒 | — | `204` | Creator, or `moderator`/`admin` (audited) |
| `PUT /events/:id/image` | 🔒 | multipart `image` | `200 { imageUrl }` | Creator only. ≤ 5 MB, re-encoded to max 1,600 px WebP |
| `DELETE /events/:id/image` | 🔒 | — | `204` | |

`Event` shape:
```json
{
  "id": "…", "title": "Robotics Club Demo Day", "description": "…", "category": "technical",
  "imageUrl": "…", "location": { "lat": 12.8406, "lng": 80.1534 },
  "venue": { "buildingId": "osm-way-123", "label": "AB1 Atrium" },
  "startsAt": "2026-11-20T10:00:00Z", "endsAt": "2026-11-20T13:00:00Z",
  "visibility": "campus", "status": "active",
  "creator": { "id": "…", "name": "…", "avatarUrl": "…" },
  "canEdit": true, "shareUrl": "https://<app>/events/…", "createdAt": "…"
}
```

"Share event details" = the `shareUrl` (opened by any logged-in viewer who is allowed to see it) plus the Web Share API on the client.

---

## 8. Operational endpoints

| Method & path | Auth | Success | Notes |
|---|---|---|---|
| `GET /health` | — | `200 { status: "ok" }` | Liveness: process is up and event loop responsive. No dependency checks (so a Mongo blip doesn't restart every pod). |
| `GET /ready` | — | `200 { status: "ready", checks: { mongo: "ok", redis: "ok" } }` or `503` | Readiness: pings MongoDB and Redis (1 s timeout each); 503 during shutdown. |
| `GET /metrics` | internal network / bearer token | Prometheus text | Not exposed through the public load balancer |

`/health` and `/ready` are served at the root, outside `/api/v1`, as the brief specifies.

---

## 9. Rate limits

Backed by Redis so limits hold across instances. If Redis is unreachable, limited endpoints answer `503` (fail closed).

**Campus NAT:** most students reach the API through a few shared campus IP addresses, so one IP can be hundreds of real users. Per-IP limits are therefore loose backstops; the tight limits are per email or per user. (Phase 2 raised the per-IP values from the Phase 1 draft for this reason.)

| Scope | Limit |
|---|---|
| Global per IP (unauthenticated endpoints) | 600 / min |
| Global per user (authenticated) | 300 / min |
| `POST /auth/login` | 10 / 15 min per IP+email; 300 / 15 min per IP; lockout of the **email** after 5 failures in 15 min: 15 min, doubling per repeat lockout within 24 h, max 4 h. Unknown emails lock the same way (no enumeration). |
| `POST /auth/register` | 30 / h per IP |
| `POST /auth/verify-email`, `/auth/password/reset` | 5 attempts per code; 100 / h per IP |
| `POST /auth/refresh` | 60 / min per IP |
| `POST /auth/register` (re-send), `/auth/resend-verification` | 1 / min and 5 / h per email; 60 / h per IP |
| `POST /auth/password/forgot` | 3 / h per email; 60 / h per IP |
| `GET /users/lookup` | 60 / h per user |
| `POST /friends/requests` | 30 / h per user |
| `POST /events` | 20 / day per user |
| Uploads | 20 / h per user |
