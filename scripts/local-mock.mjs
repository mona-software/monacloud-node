// Optional localhost transport smoke test. The main suite injects the same
// HTTP contract because some restricted CI sandboxes forbid binding a port.
import assert from 'node:assert/strict';
import http from 'node:http';
import { MonaCloud } from '../index.js';

const server = http.createServer((request, response) => {
  assert.equal(request.headers.authorization, 'Bearer vc_live_local');
  assert.equal(request.headers['x-vibecloud-sandbox'], '1');
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ prices: {} }));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
try {
  const cloud = new MonaCloud({
    token: 'vc_live_local',
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    sandbox: true,
  });
  assert.deepEqual(await cloud.prices(), { prices: {} });
} finally {
  await new Promise((resolve) => server.close(resolve));
}
