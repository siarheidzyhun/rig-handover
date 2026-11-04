import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus, type Status } from './status.js';
import { readNight } from './digest/read.js';
import { DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

function withCounts(status: Status, runsDir: string): Status {
  return {
    ...status,
    nightCounts: Object.fromEntries(
      status.nights.map((n) => {
        const rows = readNight(runsDir, n)?.rows ?? [];
        const count = (s: string) => rows.filter((r) => r.lastStatus === s).length;
        return [n, { ok: count('ok'), retry: rows.reduce((a, r) => a + r.retries, 0), fail: count('fail') }];
      }),
    ),
  };
}

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={withCounts(readStatus(config), config.runsDir)} />
      </Layout>,
    ),
  );

  // Page and JSON share readNight, so they cannot disagree (ADR 0001).
  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);
    if (!digest) return c.text('no such night', 404);
    return c.html(
      <Layout title={`digest ${night}`} lane={lane()}>
        <DigestPage night={night} digest={digest} />
      </Layout>,
    );
  });

  app.get('/api/digest/:night', (c) => {
    const digest = readNight(config.runsDir, c.req.param('night'));
    if (!digest) return c.json({ error: 'no such night' }, 404);
    return c.json(digest);
  });

  return app;
}
