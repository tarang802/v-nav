import { describe, expect, it } from 'vitest';
import { Geofence } from '../../src/realtime/geofence.js';
import { OFF_CAMPUS, ON_CAMPUS } from '../helpers/realtime.js';

const square = (x0: number, y0: number, x1: number, y1: number) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

describe('Geofence', () => {
  it('loads the OSM campus boundary shipped with the server', () => {
    const fence = Geofence.fromFile('data/campus-boundary.geojson');
    expect(fence.contains(ON_CAMPUS.lat, ON_CAMPUS.lng)).toBe(true);
    expect(fence.contains(OFF_CAMPUS.lat, OFF_CAMPUS.lng)).toBe(false);
    // Kelambakkam (about 10 km south) and central Chennai are outside.
    expect(fence.contains(12.7856, 80.2205)).toBe(false);
    expect(fence.contains(13.0827, 80.2707)).toBe(false);
  });

  it('respects holes and multipolygons', () => {
    const fence = Geofence.fromGeoJson({
      type: 'MultiPolygon',
      coordinates: [[square(0, 0, 10, 10), square(4, 4, 6, 6)], [square(20, 20, 21, 21)]],
    });
    expect(fence.contains(1, 1)).toBe(true);
    expect(fence.contains(5, 5)).toBe(false); // in the hole
    expect(fence.contains(20.5, 20.5)).toBe(true);
    expect(fence.contains(15, 15)).toBe(false);
  });

  it('refuses files without a usable polygon', () => {
    expect(() => Geofence.fromGeoJson({ type: 'Point', coordinates: [0, 0] })).toThrow(/Polygon/);
    expect(() => Geofence.fromGeoJson({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] })).toThrow(/4 positions/);
    expect(() => Geofence.fromGeoJson({ type: 'Polygon', coordinates: [square(0, 0, 200, 1)] })).toThrow(/position/);
    expect(() => Geofence.fromFile('does/not/exist.geojson')).toThrow(/Cannot read/);
  });
});
