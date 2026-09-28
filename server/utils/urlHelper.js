const config = require('../config');

/**
 * Dynamically resolves the base URL for generating public URLs.
 * 1. If an explicit string URL is provided, uses it.
 * 2. If BASE_URL env var is explicitly configured with a custom non-localhost domain, uses it.
 * 3. If an Express Request object is provided, dynamically resolves proto and host (respects X-Forwarded-Proto/Host).
 * 4. Otherwise falls back to BASE_URL or config.baseUrl or http://localhost:3000.
 *
 * @param {import('express').Request|string|null} reqOrBase 
 * @returns {string} Resolved base URL (e.g. "https://my-server.com" or "http://192.168.1.100:3000")
 */
function getBaseUrl(reqOrBase) {
  // 1. Explicit string passed
  if (typeof reqOrBase === 'string' && reqOrBase.trim()) {
    return reqOrBase.trim().replace(/\/+$/, '');
  }

  // 2. Custom BASE_URL in environment (if user explicitly set a production domain)
  const envBaseUrl = process.env.BASE_URL ? process.env.BASE_URL.trim().replace(/\/+$/, '') : '';
  const isCustomEnv = envBaseUrl &&
    !envBaseUrl.includes('localhost') &&
    !envBaseUrl.includes('127.0.0.1');

  if (isCustomEnv) {
    return envBaseUrl;
  }

  // 3. Dynamic resolution from Express request
  if (reqOrBase && typeof reqOrBase.get === 'function') {
    const rawProto = reqOrBase.headers['x-forwarded-proto'] || reqOrBase.protocol || 'http';
    const proto = rawProto.split(',')[0].trim();
    const host = reqOrBase.headers['x-forwarded-host'] || reqOrBase.get('host');
    if (host) {
      return `${proto}://${host}`;
    }
  }

  // 4. Fallback
  if (envBaseUrl) {
    return envBaseUrl;
  }

  return (config && config.baseUrl) || 'http://localhost:3000';
}

module.exports = {
  getBaseUrl
};
