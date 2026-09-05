'use strict';

const { randomUUID } = require('node:crypto');

const DEFAULT_BASE_URL = 'https://api.monacloud.vn';
const TOP_UP_NEXT_STEP = 'nạp ví tại https://monacloud.vn/console';
const STATUS_CODES = Object.freeze({
  400: 'bad_request',
  401: 'auth_required',
  402: 'insufficient_funds',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'validation_error',
  429: 'rate_limited',
});

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function segment(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} không được để trống`);
  return encodeURIComponent(text);
}

function nestedString(payload, key) {
  if (typeof payload[key] === 'string' && payload[key]) return payload[key];
  const detail = asObject(payload.detail);
  if (typeof detail[key] === 'string' && detail[key]) return detail[key];
  const error = asObject(payload.error);
  return typeof error[key] === 'string' && error[key] ? error[key] : undefined;
}

function validationMessage(detail) {
  if (!Array.isArray(detail)) return undefined;
  const messages = detail
    .map((entry) => asObject(entry).msg)
    .filter((value) => typeof value === 'string' && value);
  return messages.length ? messages.join('; ') : undefined;
}

function defaultNextStep(status) {
  if (status === 401 || status === 403) return 'kiểm tra token và quyền truy cập rồi thử lại';
  if (status === 404) return 'kiểm tra ID tài nguyên rồi thử lại';
  if (status === 409 || status === 422 || status === 400) return 'kiểm tra tham số request rồi thử lại';
  if (status === 429) return 'chờ một lúc rồi thử lại';
  if (status >= 500) return 'kiểm tra trạng thái MONA Cloud rồi thử lại';
  return 'kiểm tra request rồi thử lại';
}

class MonaCloudError extends Error {
  constructor(code, message, nextStep, options = {}) {
    super(message);
    this.name = 'MonaCloudError';
    this.code = code;
    this.next_step = nextStep;
    this.nextStep = nextStep;
    this.status = options.status;
    this.body = options.body;
    this.request_id = options.requestId;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      next_step: this.next_step,
      ...(this.request_id ? { request_id: this.request_id } : {}),
    };
  }
}

function apiError(status, payload, requestId) {
  const parsed = asObject(payload);
  const detail = parsed.detail;
  const code = status === 402
    ? 'insufficient_funds'
    : nestedString(parsed, 'code') || STATUS_CODES[status] || `http_${status}`;
  const message = nestedString(parsed, 'message')
    || (typeof detail === 'string' && detail)
    || validationMessage(detail)
    || `MONA Cloud API lỗi HTTP ${status}`;
  const nextStep = status === 402
    ? TOP_UP_NEXT_STEP
    : nestedString(parsed, 'next_step') || defaultNextStep(status);
  return new MonaCloudError(code, message, nextStep, {
    status,
    body: payload,
    requestId: requestId || nestedString(parsed, 'request_id'),
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class MonaCloud {
  constructor({ token, baseUrl = DEFAULT_BASE_URL, sandbox = false, fetch: fetchImpl } = {}) {
    if (typeof token !== 'string' || !token.trim()) {
      throw new TypeError('token là bắt buộc');
    }
    this.token = token.trim();
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.sandbox = Boolean(sandbox);
    this._fetch = fetchImpl || globalThis.fetch;
    if (typeof this._fetch !== 'function') {
      throw new TypeError('Môi trường cần fetch built-in (Node.js >=20)');
    }
  }

  prices() {
    return this._request('GET', '/api/prices');
  }

  packages() {
    return this._request('GET', '/api/packages');
  }

  createVps(payload, options = {}) {
    return this._request('POST', '/api/lxc', {
      body: payload,
      headers: { 'Idempotency-Key': options.idempotencyKey || randomUUID() },
    });
  }

  createDatabase(payload, options = {}) {
    return this._request('POST', '/api/databases', {
      body: payload,
      headers: { 'Idempotency-Key': options.idempotencyKey || randomUUID() },
    });
  }

  job(id) {
    return this._request('GET', `/api/jobs/${segment(id, 'job id')}`);
  }

  async waitJob(id, { timeout = 300, pollInterval = 1 } = {}) {
    if (!Number.isFinite(timeout) || timeout < 0) throw new RangeError('timeout phải là số không âm');
    if (!Number.isFinite(pollInterval) || pollInterval < 0) {
      throw new RangeError('pollInterval phải là số không âm');
    }
    const startedAt = Date.now();
    while (true) {
      const current = await this.job(id);
      if (current && ['succeeded', 'done'].includes(current.status)) return current;
      if (current && ['failed', 'cancelled'].includes(current.status)) {
        throw new MonaCloudError(
          current.status === 'cancelled' ? 'job_cancelled' : 'job_failed',
          current.error || `Job ${id} ${current.status}`,
          current.status === 'failed' ? 'kiểm tra job.error rồi tạo lại tài nguyên' : 'tạo một job mới',
          { body: current },
        );
      }
      const elapsed = (Date.now() - startedAt) / 1000;
      if (elapsed >= timeout) {
        throw new MonaCloudError(
          'wait_timeout',
          `Job ${id} chưa hoàn tất sau ${timeout} giây`,
          'gọi job(id) để tiếp tục kiểm tra trạng thái',
          { body: current },
        );
      }
      await sleep(Math.min(pollInterval, Math.max(0, timeout - elapsed)) * 1000);
    }
  }

  services() {
    return this._request('GET', '/api/services');
  }

  startService(id) {
    return this._request('POST', `/api/services/${segment(id, 'service id')}/start`);
  }

  stopService(id) {
    return this._request('POST', `/api/services/${segment(id, 'service id')}/stop`);
  }

  rebuildService(id) {
    return this._request('POST', `/api/services/${segment(id, 'service id')}/rebuild`);
  }

  deleteService(id) {
    return this._request('DELETE', `/api/services/${segment(id, 'service id')}`);
  }

  me() {
    return this._request('GET', '/api/me');
  }

  async _request(method, path, { body, headers: customHeaders = {} } = {}) {
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.token}`,
      ...(this.sandbox ? { 'X-Vibecloud-Sandbox': '1' } : {}),
      ...customHeaders,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await this._fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new MonaCloudError(
        'network_error',
        `Không kết nối được MONA Cloud: ${error instanceof Error ? error.message : String(error)}`,
        'kiểm tra kết nối mạng và baseUrl rồi thử lại',
      );
    }

    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        if (!response.ok) payload = { message: text.slice(0, 1000) };
        else {
          throw new MonaCloudError(
            'invalid_json',
            `MONA Cloud trả response không phải JSON (HTTP ${response.status})`,
            'kiểm tra baseUrl hoặc trạng thái API rồi thử lại',
            { status: response.status, body: text },
          );
        }
      }
    }
    if (!response.ok) {
      throw apiError(response.status, payload, response.headers.get('x-request-id'));
    }
    return payload;
  }
}

module.exports = { MonaCloud, MonaCloudError };
