# MONA Cloud SDK cho AI agent — Node.js

Khởi tạo `MonaCloud` với token Bearer. Luôn chạy `sandbox: true` trước khi tạo tài nguyên thật; SDK sẽ gửi header kỹ thuật `X-Vibecloud-Sandbox: 1`.

```js
import { MonaCloud } from 'monacloud-cloud-sdk';

const cloud = new MonaCloud({
  token: process.env.MONACLOUD_TOKEN,
  sandbox: true,
});

const job = await cloud.createVps({
  app_name: 'agent-demo',
  package_slug: 'standard-1',
});
const result = await cloud.waitJob(job.id);
console.log(result);
```

API mặc định: `https://api.monacloud.vn`. Xem quy trình đầy đủ tại `https://monacloud.vn/ai-agent`.
