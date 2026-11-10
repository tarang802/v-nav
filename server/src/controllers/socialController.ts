import type { RequestHandler, Response } from 'express';
import { Types } from 'mongoose';
import { getAuth } from '../middleware/auth.js';
import type { FriendService, PageQuery } from '../services/friendService.js';
import type { SessionService } from '../services/sessionService.js';

// Inputs reaching these handlers were already validated by the route's zod schemas.
const oid = (v: unknown) => new Types.ObjectId(String(v));
const pageOf = (res: Response) => res.locals.query as PageQuery;
const privateNoStore = (res: Response) => res.setHeader('Cache-Control', 'private, no-store');

export function createSocialController(friends: FriendService, sessions: SessionService) {
  const viewer = (res: Response) => getAuth(res).userObjectId;

  const lookup: RequestHandler = async (_req, res) => {
    const { code } = res.locals.query as { code: string };
    privateNoStore(res);
    res.json(await friends.lookupByCode(viewer(res), code));
  };

  const getUser: RequestHandler = async (req, res) => {
    privateNoStore(res);
    res.json(await friends.getUser(viewer(res), oid(req.params.userId)));
  };

  const listFriends: RequestHandler = async (_req, res) => {
    privateNoStore(res);
    res.json(await friends.listFriends(viewer(res), pageOf(res)));
  };

  const unfriend: RequestHandler = async (req, res) => {
    await friends.unfriend(viewer(res), oid(req.params.userId));
    res.status(204).end();
  };

  const incoming: RequestHandler = async (_req, res) => {
    privateNoStore(res);
    res.json(await friends.listIncoming(viewer(res), pageOf(res)));
  };

  const outgoing: RequestHandler = async (_req, res) => {
    privateNoStore(res);
    res.json(await friends.listOutgoing(viewer(res), pageOf(res)));
  };

  const sendRequest: RequestHandler = async (req, res) => {
    const result = await friends.sendRequest(viewer(res), (req.body as { friendCode: string }).friendCode);
    if (result.kind === 'accepted') res.status(200).json({ friend: result.friend, autoAccepted: true });
    else res.status(201).json({ request: result.request });
  };

  const accept: RequestHandler = async (req, res) => {
    res.json(await friends.acceptRequest(viewer(res), oid(req.params.id)));
  };

  const reject: RequestHandler = async (req, res) => {
    await friends.rejectRequest(viewer(res), oid(req.params.id));
    res.status(204).end();
  };

  const cancel: RequestHandler = async (req, res) => {
    await friends.cancelRequest(viewer(res), oid(req.params.id));
    res.status(204).end();
  };

  const listBlocks: RequestHandler = async (_req, res) => {
    privateNoStore(res);
    res.json(await friends.listBlocks(viewer(res), pageOf(res)));
  };

  const block: RequestHandler = async (req, res) => {
    await friends.block(viewer(res), oid((req.body as { userId: string }).userId), sessions.hashIp(req.ip ?? 'unknown'));
    res.status(201).end();
  };

  const unblock: RequestHandler = async (req, res) => {
    await friends.unblock(viewer(res), oid(req.params.userId), sessions.hashIp(req.ip ?? 'unknown'));
    res.status(204).end();
  };

  return { lookup, getUser, listFriends, unfriend, incoming, outgoing, sendRequest, accept, reject, cancel, listBlocks, block, unblock };
}
