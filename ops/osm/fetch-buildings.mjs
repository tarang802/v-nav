// Regenerates client/public/data/campus-buildings.geojson from OpenStreetMap.
//
//   node ops/osm/fetch-buildings.mjs
//
// Only buildings that exist in OSM inside the campus boundary are written, with
// the tags OSM has. Nothing is invented: no names, heights or shapes are added.
// Data © OpenStreetMap contributors, ODbL 1.0.

import dns from 'node:dns';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Some networks advertise IPv6 routes that do not work; prefer IPv4.
dns.setDefaultResultOrder('ipv4first');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const boundaryFile = resolve(root, 'server/data/campus-boundary.geojson');
const outFile = resolve(root, 'client/public/data/campus-buildings.geojson');
const OVERPASS = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

const boundary = JSON.parse(readFileSync(boundaryFile, 'utf8'));
const ring = boundary.features[0].geometry.coordinates[0];
const poly = ring.map(([lng, lat]) => `${lat} ${lng}`).join(' ');

const query = `[out:json][timeout:60];(way["building"](poly:"${poly}");relation["building"](poly:"${poly}"););out tags geom;`;
const res = await fetch(OVERPASS, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'vnav-dev-client' },
  body: `data=${encodeURIComponent(query)}`,
});
if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
const { elements } = await res.json();

const toRing = (geometry) => geometry.map((p) => [p.lon, p.lat]);
const isClosed = (r) => r.length >= 4 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1];
const num = (v) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const features = [];
const skipped = [];
for (const el of elements) {
  let coordinates = null;
  if (el.type === 'way') {
    const r = toRing(el.geometry ?? []);
    if (isClosed(r)) coordinates = [r];
  } else if (el.type === 'relation') {
    const outers = el.members.filter((m) => m.role === 'outer' && m.geometry).map((m) => toRing(m.geometry));
    const inners = el.members.filter((m) => m.role === 'inner' && m.geometry).map((m) => toRing(m.geometry));
    // Only simple multipolygons (one closed outer ring) are converted; anything else is reported, not guessed.
    if (outers.length === 1 && isClosed(outers[0]) && inners.every(isClosed)) coordinates = [outers[0], ...inners];
  }
  if (!coordinates) {
    skipped.push(`${el.type}/${el.id}`);
    continue;
  }
  const t = el.tags ?? {};
  features.push({
    type: 'Feature',
    id: el.id,
    properties: {
      osmId: `${el.type}/${el.id}`,
      name: t.name ?? null,
      kind: t.building === 'yes' ? null : t.building,
      levels: num(t['building:levels']),
      height: num(t.height),
    },
    geometry: { type: 'Polygon', coordinates },
  });
}
features.sort((a, b) => a.id - b.id);

const collection = {
  type: 'FeatureCollection',
  attribution: '© OpenStreetMap contributors, ODbL 1.0',
  source: 'OpenStreetMap buildings inside way 336095563 (Vellore Institute of Technology - Chennai), via Overpass API',
  retrieved: new Date().toISOString().slice(0, 10),
  features,
};
writeFileSync(outFile, `${JSON.stringify(collection)}\n`);

const named = features.filter((f) => f.properties.name);
console.log(`${features.length} buildings written (${named.length} named, ${features.filter((f) => f.properties.levels || f.properties.height).length} with a height or level count)`);
for (const f of named) console.log(`  - ${f.properties.name}`);
if (skipped.length) console.log(`skipped (geometry not a simple polygon): ${skipped.join(', ')}`);
