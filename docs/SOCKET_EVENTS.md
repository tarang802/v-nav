# V-Nav Socket.IO Events

Status: **Approved design (Phase 1).**

Namespace: default `/`. Transport: **WebSocket only** (see ARCHITECTURE D5). Path: `/socket.io`. Every instance uses `@socket.io/redis-adapter`, so emitting to a room reaches sockets on any instance.

---

## 1. Connection and authentication

```js
io(SOCKET_URL, {
  transports: ['websocket'],
  auth: (cb) => cb({ token: getAccessToken() }),   // evaluated on every (re)connect → always a fresh token
  reconnectionDelay: 1000, reconnectionDelayMax: 30000, randomizationFactor: 0.5  // unlimited attempts with jittered backoff
})
```

Handshake middleware (`io.use`):
1. Read `socket.handshake.auth.token`. No query-string tokens (they end up in logs).
2. Verify JWT signature and expiry. Check `session:revoked:{sid}` in Redis and that the user is `active`.
3. Set `socket.data = { userId, sessionId, tokenExp }` **from the verified token only**. Nothing the client sends later can change identity.
4. Reject with `Error` whose `data.code` is `UNAUTHENTICATED` | `TOKEN_EXPIRED` | `SESSION_REVOKED`. On `TOKEN_EXPIRED` the client refreshes over REST and reconnects.

On connection the server:
- Joins room `user:{userId}` (all of a user's tabs and devices). No other rooms are ever joined; there is **no campus-wide room**.
- Adds the socket to `presence:{userId}`; if it is the user's first live socket and `showOnlineStatus` is on, emits `friend:presence {online: true}` to friends.
- Sends `friends:snapshot` and `location:share:state`.

**Token expiry while connected:** the client emits `auth:refresh` with a new access token before expiry. The server verifies it (same user, same session) and updates `tokenExp`. A periodic check (every 60 s) disconnects sockets whose `tokenExp` is more than 60 s in the past with reason `TOKEN_EXPIRED`.

**Session revocation** (logout, password change, ban): the server calls `io.in('user:{userId}').disconnectSockets()` for the whole user, or matches `socket.data.sessionId` for a single session, after emitting `session:revoked`. Works across instances via the adapter.

---

## 2. Acknowledgements and errors

Every client→server event that changes state uses an ack callback:
```json
{ "ok": true, "data": { } }
{ "ok": false, "error": { "code": "NOT_SHARING", "message": "Start sharing first" } }
```
Payloads are validated with zod; unknown keys are stripped; invalid payloads get `VALIDATION_ERROR` and are counted in metrics. Malformed or oversized frames (`maxHttpBufferSize` = 16 kB) close the socket.

---

## 3. Client → server

| Event | Payload | Ack data | Rules |
|---|---|---|---|
| `location:share:start` | `{ durationMinutes: 15 \| 60 \| 240 \| null }` | `{ sharing: true, startedAt, expiresAt }` | `null` = until stopped (12 h safety cap). Broadcasts `location:share:state` to the user's other tabs. |
| `location:share:stop` | `{}` | `{ sharing: false }` | Deletes `share:` and `loc:` keys; friends get `friend:location:removed {reason: "stopped"}` |
| `location:update` | `{ lat, lng, accuracy, heading?, speed?, ts }` | none (fire-and-forget; errors via `location:rejected`) | See §5 |
| `friends:snapshot:request` | `{}` | `Snapshot` (see below) | Used after the client's friend list changes; rate-limited 1 / 5 s |
| `auth:refresh` | `{ token }` | `{ exp }` | Same user and session as the handshake, or the socket is disconnected |
| `presence:heartbeat` | `{}` | none | Sent automatically every 30 s; refreshes `presence:` TTL |

## 4. Server → client

| Event | Payload | Sent to | When |
|---|---|---|---|
| `friends:snapshot` | `Snapshot` | the connecting socket | On connect and on request |
| `friend:location` | `{ userId, lat, lng, accuracy, ts }` | `user:{friendId}` for each authorised friend | Accepted location update |
| `friend:location:removed` | `{ userId, reason: 'stopped' \| 'expired' \| 'off_campus' \| 'offline' \| 'revoked' }` | affected friends | Any path in ARCHITECTURE §6 |
| `friend:presence` | `{ userId, online, lastSeenAt }` | friends, only if the user's `showOnlineStatus` is on | First socket connects / last socket disconnects |
| `location:share:state` | `{ sharing, startedAt, expiresAt }` | `user:{userId}` (own tabs) | Start, stop, expiry, emergency stop via REST |
| `location:rejected` | `{ code: 'NOT_SHARING' \| 'OFF_CAMPUS' \| 'LOW_ACCURACY' \| 'RATE_LIMITED' \| 'VALIDATION_ERROR' }` | sender | Update dropped. `RATE_LIMITED` is not emitted every time (max 1 / 10 s) to avoid feedback loops. |
| `friend:request:received` | `{ requestId, from: PublicUser }` | `user:{to}` | New request |
| `friend:request:accepted` | `{ friend: FriendUser }` | `user:{from}` | Request accepted (and to the acceptor's other tabs) |
| `friendship:removed` | `{ userId }` | both users | Unfriend or block (the blocked user sees only a removal, not the block) |
| `event:changed` | `{ eventId, change: 'created' \| 'updated' \| 'cancelled' \| 'deleted' }` | Creator's friends, for **friends-only** events only (campus events are not pushed; see note) | Client invalidates its events query |
| `session:revoked` | `{ reason }` | the affected session's sockets | Just before disconnect |
| `server:shutdown` | `{ reconnectInMs }` | all sockets on a draining instance | Graceful shutdown; client reconnects (LB routes to a healthy instance) |

`Snapshot`:
```json
{
  "locations": [ { "userId": "…", "lat": 12.84, "lng": 80.15, "accuracy": 12, "ts": 1763000000000 } ],
  "presence":  [ { "userId": "…", "online": true, "lastSeenAt": null } ]
}
```
Contains only accepted, non-blocked friends who are currently sharing (locations) or allow online status (presence).

*Note on campus-wide event pushes:* broadcasting every campus event change to every socket is the "campus room" pattern the brief rules out for location; for events it is not a privacy problem but it is wasteful. Campus events are refreshed by TanStack Query on focus and every 2 minutes while the events view is open. Revisit if users want instant pushes.

---

## 5. `location:update` processing

Server, in order (cheapest checks first; any failure drops the update):

1. **Schema**: `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`, finite numbers; `accuracy ∈ (0, 5000]`; `ts` within ±5 min of server time.
2. **Accuracy**: `accuracy ≤ 100 m`, else `LOW_ACCURACY` (indoor GPS noise would otherwise jitter markers across buildings).
3. **Rate limit**: `SET loc:rl:{uid} 1 NX PX 2000`. Fails → `RATE_LIMITED`. One key per user, so multiple tabs cannot multiply the rate.
4. **Sharing**: `EXISTS share:{uid}`, else `NOT_SHARING`.
5. **Geofence**: point inside the campus polygon (ray casting over the configured polygon, in memory), else `OFF_CAMPUS` and a one-time `friend:location:removed {reason: off_campus}`.
6. **Store**: `HSET loc:{uid} …` + `PEXPIRE 120000` (one pipeline).
7. **Authorise + deliver**: `SMEMBERS friends:{uid}` (on miss: load from MongoDB, `SADD` + `EXPIRE 600`). Emit once to the room list `user:{f1} … user:{fn}`. The Redis adapter publishes **one** message; each instance delivers locally only to rooms it has.

Steps 3–7 are 3–4 Redis round trips, pipelined where possible. **No MongoDB access** in the hot path except a friend-set cache miss.

Client sending policy (`useGeolocationSharing`):
- `watchPosition` with `enableHighAccuracy: true`, `maximumAge: 10000`, `timeout: 20000`.
- Send if moved **≥ 10 m** since last sent point (haversine) and **≥ 3 s** since last send; or if **30 s** passed (heartbeat keeps `loc:` alive while stationary).
- Drop fixes with accuracy > 100 m locally.
- Stop the watcher entirely when sharing is off; pause while the tab is hidden for more than 5 minutes and show "sharing paused".
- Handle `PERMISSION_DENIED`, `POSITION_UNAVAILABLE`, `TIMEOUT` with distinct UI states; never retry a denied permission automatically.

Expected volume at 200 sharers: walking students send ~1 update / 5–10 s, stationary ones 1 / 30 s → roughly 10–40 updates/s in total. Comfortable for a single Redis.

---

## 6. Reconnection behaviour

| Situation | Behaviour |
|---|---|
| Network drop < 120 s | Socket.IO reconnects with backoff; client re-sends latest position immediately; sharing state survives (it's in Redis). Friends may briefly see the marker as stale (> 60 s → dimmed). |
| Network drop > 120 s | `loc:` expired; friends see the marker removed (`offline` presence after last socket's `presence:` TTL). On reconnect, sharing resumes if `share:` is still valid. |
| Token expired during drop | Handshake fails with `TOKEN_EXPIRED` → client refreshes over REST → reconnects. |
| Instance crash | Sockets reconnect to another instance via LB. Crashed instance's `presence:` entries self-expire within 90 s. |
| Multiple tabs | Each tab is a socket in `user:{id}`. Presence goes offline only when the last tab closes. Only one tab per device should own the geolocation watcher (coordinated via `BroadcastChannel`); the server rate limit enforces it regardless. |
