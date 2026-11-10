# V-Nav 🗺️

> Real-time campus navigation and social map for VIT Chennai.  
> Built with React + Vite (client) and Node.js + Express + Socket.IO (server).

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Mapbox GL JS, Zustand, Framer Motion |
| Backend | Node.js, Express, Socket.IO |
| Database | MongoDB (Atlas in production) |
| Hosting | Vercel (client) + Railway (server) |

---

## Local Development

### Prerequisites
- Node.js 18+
- MongoDB running locally (or Atlas URI)
- Mapbox account (free tier works)

### 1. Clone and install

```bash
git clone https://github.com/your-username/v-nav.git
cd v-nav

# Install client deps
cd client && npm install

# Install server deps
cd ../server && npm install
```

### 2. Configure environment

**Client** — create `client/.env`:
```
VITE_MAPBOX_TOKEN=pk.your_mapbox_token
VITE_API_URL=
VITE_SOCKET_URL=http://localhost:3000
```
> Leave `VITE_API_URL` empty in dev — the Vite proxy routes `/api` to localhost:3000 automatically.

**Server** — create `server/.env`:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/vnav
JWT_SECRET=your_long_random_secret
CLIENT_ORIGIN=http://localhost:5173
```

### 3. Run

```bash
# Terminal 1 — server
cd server && npm run dev

# Terminal 2 — client
cd client && npm run dev
```

Open http://localhost:5173

---

## Production Deployment

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
