# monacloud-cloud-sdk

SDK Node.js chính thức, zero-dependency, cho MONA Cloud. Client dùng `fetch` có sẵn trong Node.js 20+ và mặc định gọi `https://api.monacloud.vn`.

## Cài đặt

```bash
npm install monacloud-cloud-sdk
```

## Deploy app và đợi job

```js
import { MonaCloud } from 'monacloud-cloud-sdk';

const token = process.env.MONACLOUD_TOKEN;
const sandbox = new MonaCloud({ token, sandbox: true });
const preview = await sandbox.createVps({ app_name: 'demo-app', package_slug: 'standard-1' });
const previewDone = await sandbox.waitJob(preview.id, { timeout: 60 });
console.log('sandbox:', previewDone.result);

const cloud = new MonaCloud({ token });
const job = await cloud.createVps({ app_name: 'demo-app', package_slug: 'standard-1' });
const done = await cloud.waitJob(job.id, { timeout: 600 });
console.log('production:', done.result);
```

`createVps()` và `createDatabase()` tự tạo header `Idempotency-Key`. Có thể truyền key ổn định bằng đối số thứ hai: `{ idempotencyKey: 'deploy-order-123' }`.

## Public API

- `prices()`, `packages()`, `me()`
- `createVps(payload)`, `createDatabase(payload)`
- `job(id)`, `waitJob(id, { timeout, pollInterval })`
- `services()`, `startService(id)`, `stopService(id)`, `rebuildService(id)`, `deleteService(id)`

Mọi lỗi API là `MonaCloudError` với `code`, `message`, `next_step`, `status` và `body`. Sandbox vẫn dùng header kỹ thuật `X-Vibecloud-Sandbox: 1`; token `vc_live_*` tiếp tục tương thích.

## Test offline

```bash
npm test
```

Xem [hướng dẫn AI agent](https://monacloud.vn/ai-agent).

**MONA Cloud SDK thuộc bộ MONA Cloud của The MONA Group.**
