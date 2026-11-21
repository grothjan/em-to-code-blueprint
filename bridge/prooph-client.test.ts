// L2 client tests: real HTTP against the fake prooph server, no fetch mocks.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createProophClient } from './prooph-client.js';
import { createFakeServer, type FakeServer } from './testing/fake-prooph-server.js';

const apiKey = 'pb_test-key-12345';

describe('ProophClient', () => {
  let server: FakeServer;
  let baseUrl: string;

  const makeClient = (opts = {}) =>
    createProophClient(apiKey, baseUrl, { backoffDelays: [1, 1, 1], timeout: 1000, ...opts });

  beforeEach(async () => {
    server = createFakeServer();
    await server.start();
    baseUrl = `http://localhost:${server.getPort()}/api`;
  });

  afterEach(async () => {
    await server.stop();
  });

  it('loads slice elements with correct query params', async () => {
    const result = await makeClient().getSliceElements('chapter-1', 'slice-1');

    expect(result.chapterName).toBe('User Management');
    expect(result.elements.map(e => e.type)).toEqual(['command', 'event', 'information', 'automation']);
    expect(result.elements[0]).toMatchObject({ id: 'cmd-create-user', name: 'CreateUser', context: 'App' });

    const req = server.getRequestLogs()[0];
    expect(req.query).toEqual({ slice_ids: 'slice-1', structure_only: 'true' });
    expect(req.headers.authorization).toBe(`Bearer ${apiKey}`);
  });

  it('loads a dependency graph', async () => {
    const graph = await makeClient().getDependencyGraph('chapter-1', 'evt-user-created');

    expect(graph.sources.map(s => s.name)).toEqual(['CreateUser']);
    expect(graph.targets.map(t => t.name)).toEqual(['UserList', 'SendNotification']);
    expect(graph.targets[0].chapterId).toBe('chapter-1');
  });

  it('posts a task comment', async () => {
    await makeClient().addTaskComment('chapter-1', 'cmd-create-user', 'do it');

    const post = server.getRequestLogs().find(r => r.method === 'POST')!;
    expect(post.path).toBe('/api/chapters/chapter-1/elements/cmd-create-user/comments');
    expect(post.body).toEqual({ text: 'do it', is_task: true });
    expect(server.getComments()).toHaveLength(1);
  });

  it('retries on 500 then succeeds', async () => {
    server.failNext(500, 2);
    const result = await makeClient().getSliceElements('chapter-1', 'slice-1');

    expect(result.elements).toHaveLength(4);
    expect(server.getRequestLogs()).toHaveLength(3);
  });

  it('retries on 429 then succeeds', async () => {
    server.failNext(429, 1);
    await makeClient().getSliceElements('chapter-1', 'slice-1');

    expect(server.getRequestLogs()).toHaveLength(2);
  });

  it('gives up after max retries', async () => {
    server.failNext(500, 100);

    await expect(makeClient().getSliceElements('chapter-1', 'slice-1')).rejects.toThrow(/500/);
    expect(server.getRequestLogs()).toHaveLength(4); // 1 try + 3 retries
  });

  it.each([400, 401, 404])('does not retry on %i', async status => {
    server.failNext(status, 100);

    await expect(makeClient().getSliceElements('chapter-1', 'slice-1')).rejects.toThrow(
      new RegExp(String(status))
    );
    expect(server.getRequestLogs()).toHaveLength(1);
  });

  it('aborts when the server is too slow', async () => {
    const slow = createFakeServer({ delayMs: 300 });
    await slow.start();
    try {
      const client = createProophClient(apiKey, `http://localhost:${slow.getPort()}/api`, {
        timeout: 50,
        backoffDelays: [1, 1, 1],
        maxRetries: 0
      });
      await expect(client.getSliceElements('chapter-1', 'slice-1')).rejects.toThrow();
    } finally {
      await slow.stop();
    }
  });

  it('never leaks the api key in error messages', async () => {
    server.failNext(401, 1);

    const err = await makeClient()
      .getSliceElements('chapter-1', 'slice-1')
      .catch(e => String(e));

    expect(err).not.toContain(apiKey);
    expect(err).not.toContain('test-key-12345');
  });
});
