/**
 * Local development only: signs in as a demo student and shares a moving
 * location through the real API and Socket.IO server, so the map can be seen
 * working without walking around campus.
 *
 *   npm run simulate -- --email demo.ravi@vitstudent.ac.in --seconds 120 --speed 6
 *
 * The path runs between real campus buildings (centre points taken from the
 * OpenStreetMap data in client/public/data/campus-buildings.geojson). The
 * positions are simulated; they are not anyone's real location.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { io } from 'socket.io-client';
import { DEMO_PASSWORD } from './seed-dev-constants.js';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const API = arg('api', 'http://localhost:3000');
const email = arg('email', 'demo.ravi@vitstudent.ac.in');
const seconds = Number(arg('seconds', '120'));
const speed = Number(arg('speed', '1.4')); // metres per second; 1.4 is walking pace
const stops = arg('via', 'Academic Block 1|library|MG Auditorium|Academic Block 2').split('|');
const STEP_MS = 3000;

type Pt = { lat: number; lng: number };
const buildings = JSON.parse(readFileSync(resolve('../client/public/data/campus-buildings.geojson'), 'utf8')) as {
  features: { properties: { name: string | null }; geometry: { coordinates: number[][][] } }[];
};
const centreOf = (needle: string): Pt => {
  const f = buildings.features.find((b) => b.properties.name?.toLowerCase().includes(needle.toLowerCase()));
  if (!f) throw new Error(`No campus building matching "${needle}"`);
  const ring = f.geometry.coordinates[0]!.slice(0, -1);
  return {
    lng: ring.reduce((s, p) => s + p[0]!, 0) / ring.length,
    lat: ring.reduce((s, p) => s + p[1]!, 0) / ring.length,
  };
};
const waypoints = stops.map(centreOf);

const metres = (a: Pt, b: Pt) => {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

const login = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: DEMO_PASSWORD }),
});
if (!login.ok) {
  console.error(`Sign-in failed (${login.status}). Run "npm run seed:dev" first.`);
  process.exit(1);
}
const { accessToken, user } = (await login.json()) as { accessToken: string; user: { name: string } };

const socket = io(API, { transports: ['websocket'], auth: { token: accessToken } });
await new Promise<void>((ok, fail) => {
  socket.once('connect', () => ok());
  socket.once('connect_error', fail);
});
socket.on('location:rejected', (r: { code: string }) => console.log(`  server rejected update: ${r.code}`));

const started = await socket.timeout(5000).emitWithAck('location:share:start', { durationMinutes: 15 });
if (!started.ok) throw new Error('Could not start sharing');
console.log(`${user.name} is sharing for ${seconds}s at ${speed} m/s via: ${stops.join(' → ')}`);

let pos = { ...waypoints[0]! };
let target = 1;
const send = () => socket.emit('location:update', { lat: pos.lat, lng: pos.lng, accuracy: 8, ts: Date.now() });

const stop = async () => {
  clearInterval(timer);
  await socket.timeout(5000).emitWithAck('location:share:stop', {}).catch(() => {});
  socket.disconnect();
  console.log('Stopped sharing.');
  process.exit(0);
};

send();
const timer = setInterval(() => {
  let budget = speed * (STEP_MS / 1000);
  while (budget > 0) {
    const goal = waypoints[target % waypoints.length]!;
    const d = metres(pos, goal);
    if (d <= budget) {
      pos = { ...goal };
      budget -= d;
      target += 1;
      if (d === 0) break;
    } else {
      const t = budget / d;
      pos = { lat: pos.lat + (goal.lat - pos.lat) * t, lng: pos.lng + (goal.lng - pos.lng) * t };
      budget = 0;
    }
  }
  send();
}, STEP_MS);

setTimeout(() => void stop(), seconds * 1000);
process.on('SIGINT', () => void stop());
