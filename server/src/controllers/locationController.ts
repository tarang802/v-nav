import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import type { LocationService } from '../services/locationService.js';

/** Own sharing state only. Other students' positions are never available over REST. */
export function createLocationController(location: LocationService) {
  const sharing: RequestHandler = async (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(await location.state(getAuth(res).userObjectId));
  };

  /** Emergency stop: works even when the socket is disconnected. */
  const stop: RequestHandler = async (_req, res) => {
    await location.stop(getAuth(res).userObjectId, 'stopped');
    res.status(204).end();
  };

  return { sharing, stop };
}
