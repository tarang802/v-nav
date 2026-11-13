import type { Request, RequestHandler, Response } from 'express';
import { Types } from 'mongoose';
import { getAuth } from '../middleware/auth.js';
import type { EventInput, EventListQuery, EventPatch, EventService, Viewer } from '../services/eventService.js';
import type { SessionService } from '../services/sessionService.js';
import type { Bbox } from '../repositories/eventRepository.js';

// Inputs reaching these handlers were already validated by the route's zod schemas.
const idOf = (req: Request) => new Types.ObjectId(String(req.params.id));
const privateNoStore = (res: Response) => res.setHeader('Cache-Control', 'private, no-store');

export function createEventController(events: EventService, sessions: SessionService) {
  const viewerOf = (req: Request, res: Response): Viewer => {
    const auth = getAuth(res);
    return { id: auth.userObjectId, role: auth.role, ipHash: sessions.hashIp(req.ip ?? 'unknown') };
  };

  const list: RequestHandler = async (req, res) => {
    privateNoStore(res);
    res.json(await events.list(viewerOf(req, res), res.locals.query as EventListQuery));
  };

  const map: RequestHandler = async (req, res) => {
    privateNoStore(res);
    res.json(await events.map(viewerOf(req, res), res.locals.query as { bbox: Bbox; from?: Date; to?: Date }));
  };

  const get: RequestHandler = async (req, res) => {
    privateNoStore(res);
    res.json({ event: await events.get(viewerOf(req, res), idOf(req)) });
  };

  const create: RequestHandler = async (req, res) => {
    res.status(201).json({ event: await events.create(viewerOf(req, res), req.body as EventInput) });
  };

  const update: RequestHandler = async (req, res) => {
    res.json({ event: await events.update(viewerOf(req, res), idOf(req), req.body as EventPatch) });
  };

  const remove: RequestHandler = async (req, res) => {
    await events.remove(viewerOf(req, res), idOf(req));
    res.status(204).end();
  };

  const setImage: RequestHandler = async (req, res) => {
    res.json(await events.setImage(viewerOf(req, res), idOf(req), req.file!.buffer));
  };

  const removeImage: RequestHandler = async (req, res) => {
    await events.removeImage(viewerOf(req, res), idOf(req));
    res.status(204).end();
  };

  return { list, map, get, create, update, remove, setImage, removeImage };
}
