import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CapturingMailTransport, registerVerified } from '../helpers/testApp.js';
import { asTestContext, startInstance, TestClient, type Instance } from '../helpers/realtime.js';

const mail = new CapturingMailTransport();
let keep: Instance;

beforeAll(async () => {
  keep = await startInstance(mail);
  await asTestContext(keep, mail).reset();
});
afterAll(async () => {
  await keep.close();
});

describe('graceful shutdown with live sockets', () => {
  it('tells clients, drops them so they auto-reconnect elsewhere, and closes promptly', async () => {
    const draining = await startInstance(mail);
    const s = await registerVerified(asTestContext(keep, mail));

    const clients = [new TestClient(draining.url, s.accessToken), new TestClient(draining.url, s.accessToken)];
    for (const c of clients) {
      await c.connect();
      await c.next('friends:snapshot');
    }
    const reasons = clients.map((c) => c.waitDisconnect());

    const started = Date.now();
    await draining.close();
    const elapsed = Date.now() - started;

    for (const c of clients) expect(await c.next('server:shutdown')).toEqual({ reconnectInMs: 1000 });
    // "transport close" (not "io server disconnect") is what makes socket.io-client reconnect by itself.
    expect(await Promise.all(reasons)).toEqual(['transport close', 'transport close']);
    expect(elapsed).toBeLessThan(3000);
    // The last socket left, so presence was cleaned up rather than left to expire.
    expect(await keep.container.redis.exists(`presence:${s.user.id}`)).toBe(0);
    for (const c of clients) c.close();
  });
});
