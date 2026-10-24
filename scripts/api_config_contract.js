'use strict';
/* lib/rintik-config.js: ?api= may only point the public site at the official backend;
 * on localhost any http(s) backend is allowed for QA. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'rintik-config.js'), 'utf8');

function load(href, stored) {
  const store = new Map(stored ? [['rintik_api_url', stored]] : []);
  const location = new URL(href);
  const root = {
    location: { protocol: location.protocol, hostname: location.hostname, search: location.search },
    sessionStorage: { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)) }
  };
  root.self = root;
  vm.runInNewContext(source, { self: root, URL, URLSearchParams });
  return { base: root.RINTIK_resolveApiBase(), stored: store.get('rintik_api_url') };
}

const PUBLIC = 'https://rintik-backend.onrender.com';
// public site: foreign ?api= is ignored and never remembered
let r = load('https://rintik.vercel.app/predict?api=https://evil.example');
assert.strictEqual(r.base, PUBLIC);
assert.strictEqual(r.stored, PUBLIC);
// public site: a foreign value already stored (e.g. by the landing page script) is ignored too
r = load('https://rintik.vercel.app/hasil', 'https://evil.example');
assert.strictEqual(r.base, PUBLIC);
assert.strictEqual(r.stored, PUBLIC);
// public site: javascript:/data:/credentials are rejected
assert.strictEqual(load('https://rintik.vercel.app/predict?api=javascript:alert(1)').base, PUBLIC);
assert.strictEqual(load('https://rintik.vercel.app/predict?api=data:text/html,x').base, PUBLIC);
assert.strictEqual(load('https://rintik.vercel.app/predict?api=https://user:pw@rintik-backend.onrender.com').base, PUBLIC);
// public site: a look-alike host is not the official origin
assert.strictEqual(load('https://rintik.vercel.app/predict?api=https://rintik-backend.onrender.com.evil.example').base, PUBLIC);
assert.strictEqual(load('https://rintik.vercel.app/predict?api=http://rintik-backend.onrender.com').base, PUBLIC);
// public site: the official backend may be named explicitly
assert.strictEqual(load('https://rintik.vercel.app/predict?api=https://rintik-backend.onrender.com/').base, PUBLIC);
// localhost: QA may point at any local backend; legacy port 8000 is migrated
assert.strictEqual(load('http://127.0.0.1:4273/predict?api=http://127.0.0.1:8240').base, 'http://127.0.0.1:8240');
assert.strictEqual(load('http://127.0.0.1:4273/predict?api=http://127.0.0.1:8240/').stored, 'http://127.0.0.1:8240');
assert.strictEqual(load('http://127.0.0.1:4273/predict', 'http://127.0.0.1:8000').base, 'http://127.0.0.1:8140');
assert.strictEqual(load('http://127.0.0.1:4273/predict', 'http://127.0.0.1:8240').base, 'http://127.0.0.1:8240');
assert.strictEqual(load('http://localhost:4273/predict').base, 'http://127.0.0.1:8140');
// localhost: non-http schemes are still rejected
assert.strictEqual(load('http://localhost:4273/predict?api=javascript:alert(1)').base, 'http://127.0.0.1:8140');

console.log('RINTIK_API_CONFIG_OK publicAllowlist=true localOverride=true legacyMigration=true');
