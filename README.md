# V-Nav 🗺️

> Real-time campus navigation and social map for VIT Chennai.  
> Built with React + Vite (client) and Node.js + Express + Socket.IO (server).

> **Rebuild in progress.** V-Nav is being rebuilt as a production-grade platform (verified student accounts, friend-only live location over Redis-backed Socket.IO, campus events).
>
> - **`server/`** is the new TypeScript API. Phases 2–6 (auth, sessions, infrastructure, friends and blocks, real-time location over Socket.IO, events with image uploads) are done and tested.
> - **`client/`** holds two apps until Phase 7: the original one (`npm run dev`, uses `server-legacy/`) and the rebuilt map shell (`npm run dev:next`, uses `server/`), which shows buildings, friends and events on the map. The remaining screens (registration, friends, event list and form, profile) follow in Phase 7.
> - **`server-legacy/`** is the original Express server, kept unchanged so the current client still runs. It is deleted in Phase 7, when the client moves to the new API.
> - Progress: [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md)
> - Design: [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE_SCHEMA.md) · [REST API](docs/API_DOCUMENTATION.md) · [Socket events](docs/SOCKET_EVENTS.md) · [Security](docs/SECURITY.md) · [Scalability](docs/SCALABILITY.md) · [Deployment](docs/DEPLOYMENT.md) · [Load testing](docs/LOAD_TESTING.md)

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Mapbox GL JS, Zustand, Framer Motion |
| Backend (new) | Node.js 22+, TypeScript, Express 5, MongoDB (replica set) via Mongoose, Redis via ioredis, zod, pino |
| Tests | Vitest + Supertest against real MongoDB and Redis |
| Local infra | Docker Compose: MongoDB 7 (rs0), Redis 7, Mailpit |

---

## Local Development (new server)

Prerequisites: Node.js 22+, Docker.

1. Start MongoDB (host port 27018), Redis (6380) and Mailpit (inbox at http://localhost:8025):
   ```bash
   docker compose up -d mongo redis mailpit
   ```
2. Configure the server. Copy the template, then replace the three `replace-with-…` secrets (the server refuses to start with them):
   ```bash
   cp server/.env.example server/.env
   ```
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
3. Install, test, run:
   ```bash
   npm --prefix server install
   ```
   ```bash
   npm --prefix server test
   ```
   ```bash
   npm --prefix server run dev
   ```
4. Check it: http://localhost:3000/ready should return `{"status":"ready",...}`. Register with an `@vitstudent.ac.in` address via `POST /api/v1/auth/register`; the code arrives in Mailpit.

### Running the rebuilt map shell (Phase 5)

With the new server running (`npm --prefix server run dev`):
```bash
npm --prefix server run seed:dev
```
```bash
npm --prefix client install
```
```bash
npm --prefix client run dev:next
```
Open http://localhost:5173 and sign in as one of the demo students printed by the seed script (password: `DEMO_PASSWORD` in `server/scripts/seed-dev-constants.ts`). To see a friend move on the map, in another terminal:
```bash
npm --prefix server run simulate -- --email demo.ravi@vitstudent.ac.in --seconds 120 --speed 6
```
`client/.env` needs `VITE_MAPBOX_TOKEN`, and `VITE_API_URL` / `VITE_SOCKET_URL` pointing at the new server. Campus buildings come from OpenStreetMap (© OpenStreetMap contributors, ODbL); refresh them with `node ops/osm/fetch-buildings.mjs`.

### Running the current client (legacy server)

The client in `client/` still talks to the old API until Phase 7:
```bash
npm --prefix server-legacy install
```
```bash
npm --prefix server-legacy run dev
```
```bash
npm --prefix client run dev
```
Only one of the two servers can use port 3000 at a time.

---

## Production Deployment (legacy, superseded by [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) in Phase 9)

### Architecture

```
Users → Vercel (client SPA) → Railway (Express + Socket.IO) → MongoDB Atlas
```

### Step 1: MongoDB Atlas
1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → Create free cluster
2. Create a database user
3. Allow all IPs (`0.0.0.0/0`) in Network Access
4. Copy the connection string: `mongodb+srv://<user>:<pass>@cluster.mongodb.net/vnav`

### Step 2: Push to GitHub
```bash
cd v-nav
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/v-nav.git
git push -u origin main
```

### Step 3: Deploy Server → Railway
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select your repo → set **Root Directory** to `server`
3. Add environment variables in Railway dashboard:
   ```
   MONGO_URI=mongodb+srv://...   ← from Atlas
   JWT_SECRET=your_long_secret
   CLIENT_ORIGIN=https://your-app.vercel.app
   ```
4. Copy the Railway public URL (e.g. `https://v-nav-server.up.railway.app`)

### Step 4: Deploy Client → Vercel
1. Go to [vercel.com](https://vercel.com) → New Project → Import GitHub repo
2. Set **Root Directory** to `client`
3. Framework preset: **Vite**
4. Add environment variables:
   ```
   VITE_MAPBOX_TOKEN=pk.your_mapbox_token
   VITE_API_URL=https://v-nav-server.up.railway.app
   VITE_SOCKET_URL=https://v-nav-server.up.railway.app
   ```
5. Deploy! ✅

### Step 5: Update Server CORS
After Vercel gives you a URL (e.g. `https://v-nav.vercel.app`), update the Railway env var:
```
CLIENT_ORIGIN=http://localhost:5173,https://v-nav.vercel.app
```

---

## Routes

| Route | Description |
|---|---|
| `/` | Dashboard — social map with friend locations |
| `/app/map` | Campus map with building labels |
| `/app/heatmap` | Crowd density heatmap |
| `/app/navigation` | Route planner |
| `/app/explore` | Explore campus points of interest |
| `/app/events` | Campus events map |

---

## Environment Variables Reference

### Client (`client/.env`)
| Variable | Dev Value | Prod Value |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | `pk.your_token` | Same |
| `VITE_API_URL` | *(empty)* | `https://your-railway-app.up.railway.app` |
| `VITE_SOCKET_URL` | `http://localhost:3000` | `https://your-railway-app.up.railway.app` |

### Server (`server/.env`)
| Variable | Dev Value | Prod Value |
|---|---|---|
| `PORT` | `3000` | Set by Railway |
| `MONGO_URI` | `mongodb://localhost:27017/vnav` | Atlas URI |
| `JWT_SECRET` | any string | Long random hex |
| `CLIENT_ORIGIN` | `http://localhost:5173` | `http://localhost:5173,https://v-nav.vercel.app` |
