import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { MonaCloud, MonaCloudError } from '../index.js';

const require = createRequire(import.meta.url);

test('ESM và CJS export cùng public API', () => {
  const commonJs = require('../index.cjs');
  assert.equal(typeof MonaCloud, 'function');
  assert.equal(typeof commonJs.MonaCloud, 'function');
  assert.equal(typeof commonJs.MonaCloudError, 'function');
  const cloud = new MonaCloud({ token: 'vc_live_test', fetch: async () => undefined });
  assert.equal(cloud.baseUrl, 'https://api.monacloud.vn');
});

test('mock HTTP kiểm tra auth/sandbox/idempotency, poll job và lỗi 402', async () => {
  let jobPolls = 0;
  const seen = [];
  const route = async ({ method, url, headers, body }) => {
    seen.push({ method, url, headers, body });
    if (headers.authorization !== 'Bearer vc_live_test') {
      return { status: 401, body: { detail: 'Invalid token' } };
    }
    if (headers['x-vibecloud-sandbox'] !== '1') {
      return { status: 400, body: { detail: 'Missing sandbox header' } };
    }
    if (url === '/api/prices') return { status: 200, body: { prices: { cpu_hour_vnd: 100 } } };
    if (url === '/api/packages') return { status: 200, body: { packages: [{ slug: 'standard-1' }] } };
    if (url === '/api/services' && method === 'GET') {
      return { status: 200, body: [{ id: 'svc-1', kind: 'lxc', status: 'active', name: 'demo-app' }] };
    }
    if (url === '/api/services/svc-1/start') return { status: 200, body: { status: 'running' } };
    if (url === '/api/services/svc-1/stop') return { status: 200, body: { status: 'stopped' } };
    if (url === '/api/services/svc-1/rebuild') {
      return { status: 202, body: { id: 'job-rebuild', type: 'rebuild_lxc', status: 'queued' } };
    }
    if (url === '/api/services/svc-1' && method === 'DELETE') {
      return { status: 200, body: { status: 'destroyed' } };
    }
    if (url === '/api/me') return { status: 200, body: { user: { id: 'user-1' } } };
    if (url === '/api/lxc' && method === 'POST') {
      assert.equal(body.app_name, 'demo-app');
      assert.ok(headers['idempotency-key']);
      return { status: 202, body: { id: 'job-1', type: 'create_lxc', status: 'queued', sandbox: true } };
    }
    if (url === '/api/jobs/job-1') {
      jobPolls += 1;
      return {
        status: 200,
        body: jobPolls === 1
          ? { id: 'job-1', type: 'create_lxc', status: 'running', sandbox: true }
          : { id: 'job-1', type: 'create_lxc', status: 'done', result: { service_id: 'svc-1' }, sandbox: true },
      };
    }
    if (url === '/api/databases') {
      assert.ok(headers['idempotency-key']);
      return { status: 402, body: { detail: 'Insufficient credit' } };
    }
    return { status: 404, body: { detail: 'Not found' } };
  };
  const fetchImpl = async (url, options = {}) => {
    const headers = Object.fromEntries(
      Object.entries(options.headers || {}).map(([name, value]) => [name.toLowerCase(), value]),
    );
    const result = await route({
      method: options.method || 'GET',
      url: new URL(url).pathname,
      headers,
      body: options.body ? JSON.parse(options.body) : undefined,
    });
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: { get: (name) => name.toLowerCase() === 'x-request-id' ? 'req-test' : null },
      text: async () => JSON.stringify(result.body),
    };
  };

  const cloud = new MonaCloud({
    token: 'vc_live_test',
    baseUrl: 'http://mock.vibecloud.test',
    sandbox: true,
    fetch: fetchImpl,
  });
  assert.equal((await cloud.prices()).prices.cpu_hour_vnd, 100);
  const created = await cloud.createVps({ app_name: 'demo-app', package_slug: 'standard-1' });
  assert.equal(created.id, 'job-1');
  const finished = await cloud.waitJob(created.id, { timeout: 1, pollInterval: 0.001 });
  assert.equal(finished.status, 'done');
  assert.equal(finished.result.service_id, 'svc-1');
  assert.equal((await cloud.packages()).packages[0].slug, 'standard-1');
  assert.equal((await cloud.services())[0].id, 'svc-1');
  assert.equal((await cloud.startService('svc-1')).status, 'running');
  assert.equal((await cloud.stopService('svc-1')).status, 'stopped');
  assert.equal((await cloud.rebuildService('svc-1')).id, 'job-rebuild');
  assert.equal((await cloud.deleteService('svc-1')).status, 'destroyed');
  assert.equal((await cloud.me()).user.id, 'user-1');

  await assert.rejects(
    cloud.createDatabase({ app_name: 'no-credit', package_slug: 'standard-1' }),
    (error) => {
      assert.ok(error instanceof MonaCloudError);
      assert.equal(error.code, 'insufficient_funds');
      assert.equal(error.message, 'Insufficient credit');
      assert.equal(error.next_step, 'nạp ví tại https://monacloud.vn/console');
      assert.equal(error.status, 402);
      assert.equal(error.request_id, 'req-test');
      return true;
    },
  );
  assert.ok(seen.length >= 12);
});
