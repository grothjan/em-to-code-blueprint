/**
 * Fake prooph board API for tests (real HTTP on a random local port).
 *
 * Routes (base path /api):
 * - GET  /chapters/:chapterId?slice_ids=...&structure_only=true
 * - GET  /chapters/:chapterId/elements/:elementId/dependency-graph
 * - POST /chapters/:chapterId/elements/:elementId/comments
 *
 * Records every request and posted comment. `failNext(status, n)` makes the
 * next n requests fail, which is used to test retries.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RequestLog {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: http.IncomingHttpHeaders;
  body?: any;
}

export interface FakeServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPort(): number;
  getRequestLogs(): RequestLog[];
  getComments(): Array<{ chapterId: string; elementId: string; text: string }>;
  failNext(status: number, count: number): void;
}

export function createFakeServer(options: { delayMs?: number } = {}): FakeServer {
  const requests: RequestLog[] = [];
  const comments: Array<{ chapterId: string; elementId: string; text: string }> = [];
  const failure = { status: 500, count: 0 };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();

    const log: RequestLog = {
      method: req.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers,
      body: raw ? JSON.parse(raw) : undefined
    };
    requests.push(log);

    if (options.delayMs) {
      await new Promise(resolve => setTimeout(resolve, options.delayMs));
    }

    const send = (status: number, data: unknown) => {
      if (res.destroyed) return; // client aborted (timeout test)
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    if (failure.count > 0) {
      failure.count--;
      return send(failure.status, { error: 'Simulated failure' });
    }

    let m: RegExpMatchArray | null;

    if ((m = url.pathname.match(/^\/api\/chapters\/([^/]+)$/)) && log.method === 'GET') {
      const chapter = CHAPTERS[m[1]];
      if (!chapter) return send(404, { error: 'Chapter not found' });
      const sliceIds = (log.query.slice_ids ?? '').split(',');
      return send(200, { ...chapter, elements: chapter.elements.filter(e => sliceIds.includes(e.sliceId)) });
    }

    if ((m = url.pathname.match(/^\/api\/chapters\/([^/]+)\/elements\/([^/]+)\/dependency-graph$/))) {
      const graph = GRAPHS[`${m[1]}/${m[2]}`];
      if (!graph) return send(404, { error: 'Element not found' });
      return send(200, graph);
    }

    if ((m = url.pathname.match(/^\/api\/chapters\/([^/]+)\/elements\/([^/]+)\/comments$/)) && log.method === 'POST') {
      comments.push({ chapterId: m[1], elementId: m[2], text: log.body?.text });
      return send(200, { commentId: `c-${comments.length}`, text: log.body?.text, createdAt: new Date().toISOString(), isTask: log.body?.is_task });
    }

    send(404, { error: 'Not found' });
  });

  return {
    start: () => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve())),
    stop: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close(err => (err ? reject(err) : resolve()));
      }),
    getPort: () => (server.address() as AddressInfo).port,
    getRequestLogs: () => [...requests],
    getComments: () => [...comments],
    failNext: (status, count) => {
      failure.status = status;
      failure.count = count;
    }
  };
}

// --- Fixtures (shape of get_chapter with structure_only=true / dependency-graph) ---

const element = (id: string, type: string, name: string, index: number) => ({
  id, type, name, description: '', details: '', icon: '', laneId: `lane-${type}`,
  sliceId: 'slice-1', index, comments: [], context: 'App'
});

const node = (id: string, type: string, name: string) => ({
  id, type, name, description: '', details: '', laneId: `lane-${type}`, sliceId: 'slice-1',
  context: 'App', chapterId: 'chapter-1', chapterName: 'User Management', sliceStatus: 'planned'
});

const CHAPTERS: Record<string, { id: string; name: string; slices: any[]; elements: any[] }> = {
  'chapter-1': {
    id: 'chapter-1',
    name: 'User Management',
    slices: [{ id: 'slice-1', label: 'Register User', width: 1, index: 0, status: 'planned', comments: [] }],
    elements: [
      element('cmd-create-user', 'command', 'CreateUser', 0),
      element('evt-user-created', 'event', 'UserCreated', 1),
      element('info-user-list', 'information', 'UserList', 2),
      element('auto-send-notification', 'automation', 'SendNotification', 3),
      element('ui-register', 'ui', 'RegisterForm', 4) // must be dropped by the client
    ]
  }
};

const GRAPHS: Record<string, unknown> = {
  'chapter-1/evt-user-created': {
    element: { ...node('evt-user-created', 'event', 'UserCreated') },
    sources: [node('cmd-create-user', 'command', 'CreateUser')],
    targets: [
      node('info-user-list', 'information', 'UserList'),
      node('auto-send-notification', 'automation', 'SendNotification')
    ]
  }
};
