# monacloud-cloud-sdk

Zero-dependency Node.js SDK for the MONA Cloud compute API: create VPS and databases, wait for jobs and manage services.

The client uses the built-in `fetch` of Node.js 20+ and calls `https://api.monacloud.vn` by default. It ships both ESM and CommonJS builds with TypeScript types.

## Install

```bash
npm install monacloud-cloud-sdk
```

## Quick start

```js
import { MonaCloud } from 'monacloud-cloud-sdk';

const token = process.env.MONACLOUD_TOKEN;

// Sandbox: simulates the call without creating infrastructure
const sandbox = new MonaCloud({ token, sandbox: true });
const preview = await sandbox.createVps({ app_name: 'demo-app', package_slug: 'standard-1' });
const previewDone = await sandbox.waitJob(preview.id, { timeout: 60 });
console.log('sandbox:', previewDone.result);

// Real call
const cloud = new MonaCloud({ token });
const job = await cloud.createVps({ app_name: 'demo-app', package_slug: 'standard-1' });
const done = await cloud.waitJob(job.id, { timeout: 600 });
console.log('result:', done.result);
```

## Usage

```js
new MonaCloud({ token, baseUrl?, sandbox?, fetch? })
```

| Method | Description |
|---|---|
| `prices()`, `packages()` | Unit prices and preset packages |
| `me()` | Current account |
| `createVps(payload, options?)` | Create a VPS from `package_slug` or `cpu`/`ram_gb`/`disk_gb`; returns a job |
| `createDatabase(payload, options?)` | Create a database (`engine`: `mongodb`, `postgresql` or `mysql`); returns a job |
| `job(id)` | Read a job |
| `waitJob(id, { timeout, pollInterval })` | Poll until the job finishes (defaults: 300 s timeout, 1 s interval) |
| `services()` | List VPS and database services |
| `startService(id)`, `stopService(id)`, `rebuildService(id)`, `deleteService(id)` | Service lifecycle |

`createVps()` and `createDatabase()` send an `Idempotency-Key` header automatically. Pass a stable key as the second argument when retrying:

```js
await cloud.createVps(payload, { idempotencyKey: 'deploy-order-123' });
```

### Errors

Every API error is a `MonaCloudError` with `code`, `message`, `next_step`, `status`, `body` and, when the API returns it, `request_id`.

## Configuration

- `token`: a MONA Pass access token or a `vc_live_*` key.
- `sandbox: true` sends the `X-Vibecloud-Sandbox: 1` header on every request.
- `baseUrl` overrides the API endpoint; `fetch` lets you inject a custom implementation.

Guide for AI agents: [monacloud.vn/ai-agent](https://monacloud.vn/ai-agent).

## Development

```bash
npm test
npm run test:local   # optional localhost transport smoke test
```

## License

MIT

**MONA Cloud SDK is part of MONA Cloud by The MONA Group.**
