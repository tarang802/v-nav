# V-Nav Load Testing

Status: **Phase 1 plan. No load test has been run yet.** Results are recorded in §5 only after a run actually completes, with the environment it ran on.

Tool: **Artillery** (HTTP + native Socket.IO engine), one tool for all scenarios. k6 was considered; it lacks a Socket.IO client, so socket scenarios would need hand-written Engine.IO framing.

---

## 1. Setup (Phase 8)

```
loadtest/
  seed.ts              creates N verified users + friendship graph in a dedicated DB; writes tokens.csv
  scenarios/
    a-connections.yml
    b-location.yml
    c-api-burst.yml
    d-multi-instance.yml
    e-reconnect.yml
  processors.js        token injection, movement simulation inside the campus polygon, latency capture
  report/              raw JSON + summarised markdown per run (committed)
```

Seeding: 2,000 users, each with 10–60 friends (power-law-ish), all verified, against a **separate** database (`vnav_loadtest`). Load tests never run against production.

Latency for location delivery is measured by embedding the send timestamp in a test-only field that the processor reads on receipt (same machine clock for sender and receiver clients).

---

## 2. Scenarios

| ID | Scenario | Load | Pass criteria (initial, from SCALABILITY.md) |
|---|---|---|---|
| A | Concurrent authenticated connections | Ramp to 500 sockets over 2 min, hold 10 min, each heartbeating | < 0.5 % connect failures; no unexpected disconnects; memory per instance < 400 MB |
| B | Location sharing | 200 of the 500 sockets share; movement every 3–10 s; others receive | Delivery p95 ≤ 250 ms; 0 deliveries to non-friends (asserted); 0 MongoDB writes from location (checked via `mongostat`/profiler) |
| C | API burst | 100 virtual users/s for 2 min: friend list, incoming requests, event discovery, event map, profile, friend-code lookup, create event | p95 ≤ 200 ms reads / 300 ms writes; error rate < 0.1 %; no COLLSCAN in slow-query log |
| D | Multi-instance via Redis | A + B through Nginx to 2 instances; friends deliberately split across instances | Same as B; cross-instance deliveries observed on both instances' metrics |
| E | Drops and reconnects | During B, kill 30 % of client connections randomly every 30 s; restart one API instance mid-run | All clients reconnect within 35 s; sharing resumes; no ghost presence after 90 s; no deliveries after stop/unfriend |

## 3. What is measured

| Metric | Source |
|---|---|
| Requests/s, p50/p95/p99, error rate | Artillery report |
| Socket connect time, disconnects, message latency | Artillery Socket.IO engine + processor |
| CPU, memory per instance | `docker stats` sampled every 5 s → CSV |
| Event loop lag | `/metrics` (`nodejs_eventloop_lag_seconds`) |
| MongoDB | Atlas metrics / `db.setProfilingLevel(1, {slowms: 50})`, `mongostat` |
| Redis | `INFO stats` before/after (ops/s), `LATENCY` monitor |

## 4. Commands (become real in Phase 8)

```bash
npm --prefix loadtest run seed -- --users 2000
```
```bash
npx artillery run loadtest/scenarios/b-location.yml --output loadtest/report/b-raw.json
```
```bash
npx artillery report loadtest/report/b-raw.json
```

## 5. Results

| Date | Scenario | Environment | Result | Report |
|---|---|---|---|---|
| — | — | — | Not yet executed | — |
