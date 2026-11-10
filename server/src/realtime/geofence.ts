import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Ring = [number, number][]; // [lng, lat]
type Polygon = Ring[]; // outer ring, then holes

/**
 * Campus geofence. Loaded once at startup from a GeoJSON Polygon or
 * MultiPolygon (Feature, FeatureCollection or bare geometry). Points are
 * tested in memory with ray casting; no network or database access.
 *
 * Campus-sized polygons (about 1 km) are small enough that treating lng/lat as
 * planar coordinates introduces no meaningful error.
 */
export class Geofence {
  private readonly bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };

  constructor(private readonly polygons: Polygon[]) {
    if (polygons.length === 0) throw new Error('Geofence needs at least one polygon');
    const pts = polygons.flatMap((p) => p[0] ?? []);
    this.bbox = {
      minLng: Math.min(...pts.map((p) => p[0])),
      minLat: Math.min(...pts.map((p) => p[1])),
      maxLng: Math.max(...pts.map((p) => p[0])),
      maxLat: Math.max(...pts.map((p) => p[1])),
    };
  }

  static fromFile(path: string): Geofence {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(resolve(path), 'utf8'));
    } catch (err) {
      throw new Error(`Cannot read campus boundary file ${path}: ${(err as Error).message}`);
    }
    return Geofence.fromGeoJson(raw);
  }

  static fromGeoJson(raw: unknown): Geofence {
    const polygons: Polygon[] = [];
    const visit = (node: unknown): void => {
      const n = node as { type?: string; features?: unknown[]; geometry?: unknown; coordinates?: unknown };
      if (n?.type === 'FeatureCollection') n.features?.forEach(visit);
      else if (n?.type === 'Feature') visit(n.geometry);
      else if (n?.type === 'Polygon') polygons.push(validatePolygon(n.coordinates));
      else if (n?.type === 'MultiPolygon' && Array.isArray(n.coordinates)) {
        for (const p of n.coordinates) polygons.push(validatePolygon(p));
      }
    };
    visit(raw);
    if (polygons.length === 0) throw new Error('Campus boundary must contain a Polygon or MultiPolygon');
    return new Geofence(polygons);
  }

  contains(lat: number, lng: number): boolean {
    const b = this.bbox;
    if (lng < b.minLng || lng > b.maxLng || lat < b.minLat || lat > b.maxLat) return false;
    return this.polygons.some(([outer, ...holes]) => inRing(lng, lat, outer!) && !holes.some((h) => inRing(lng, lat, h)));
  }
}

function validatePolygon(coords: unknown): Polygon {
  if (!Array.isArray(coords) || coords.length === 0) throw new Error('Invalid polygon coordinates');
  return coords.map((ring) => {
    if (!Array.isArray(ring) || ring.length < 4) throw new Error('Polygon rings need at least 4 positions');
    return ring.map((pt) => {
      const [lng, lat] = pt as [unknown, unknown];
      if (typeof lng !== 'number' || typeof lat !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new Error('Invalid polygon position');
      }
      return [lng, lat] as [number, number];
    });
  });
}

/** Even-odd ray casting. */
function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
