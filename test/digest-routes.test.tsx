import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

function appWith(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  for (const [n, body] of Object.entries(files)) writeFileSync(join(dir, `${n}.jsonl`), body);
  return createApp({ adapter: 'shim', installed: 'x', beatEverySeconds: 60, runsDir: dir });
}
const line = (job: string, status: string, owner: string | null = 'rook') =>
  JSON.stringify({ at: '2026-10-29T01:00:00+01:00', job, status, owner });

describe('digest routes', () => {
  it('200 for page and JSON, same jobs in the same order', async () => {
    const app = appWith({ '2026-10-28': [line('b/job', 'ok'), line('a/job', 'fail', null)].join('\n') });
    const page = await app.request('/digest/2026-10-28');
    const json = await app.request('/api/digest/2026-10-28');
    expect(page.status).toBe(200);
    expect(json.status).toBe(200);
    const jobs = ((await json.json()) as { rows: { job: string }[] }).rows.map((r) => r.job);
    expect(jobs).toEqual(['a/job', 'b/job']);
    const html = await page.text();
    expect(html.indexOf('a/job')).toBeLessThan(html.indexOf('b/job'));
    expect(html).toContain('—');
  });

  it('404 for a night with no file', async () => {
    const app = appWith({});
    expect((await app.request('/digest/2026-01-01')).status).toBe(404);
    expect((await app.request('/api/digest/2026-01-01')).status).toBe(404);
  });

  it('empty night renders "nothing ran"', async () => {
    const app = appWith({ '2026-10-27': '' });
    const res = await app.request('/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('a bad line is counted, the night still renders', async () => {
    const app = appWith({ '2026-10-28': `${line('a/job', 'ok')}\n{"at":"2026-10-29T05:5` });
    const res = await app.request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('a/job');
    const json = (await (await app.request('/api/digest/2026-10-28')).json()) as { badLines: number };
    expect(json.badLines).toBe(1);
  });

  it('board links each night to its digest with counts', async () => {
    const html = await (await createApp({ adapter: 'shim', installed: 'x', beatEverySeconds: 60, runsDir: 'runs' }).request('/')).text();
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('fail 1');
  });
});
