'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FRONTEND = process.env.RINTIK_FRONTEND_URL || 'http://127.0.0.1:4174';
const API = process.env.RINTIK_API_URL || 'http://127.0.0.1:8140';
const CDP = process.env.RINTIK_CDP_URL || 'http://127.0.0.1:9223';
const EVIDENCE = process.env.RINTIK_RUNTIME_EVIDENCE || path.resolve(__dirname, '..', '..', 'qa', 'evidence', 'runtime-backend-recovery');

function loadPlaywright() {
  try { return require('playwright'); } catch (error) {}
  const runtime = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'runtimes', 'cua_node');
  const candidates = fs.existsSync(runtime)
    ? fs.readdirSync(runtime).map(name => path.join(runtime, name, 'bin', 'node_modules', 'playwright')).filter(item => fs.existsSync(path.join(item, 'package.json')))
    : [];
  if (!candidates.length) throw new Error('Playwright runtime unavailable');
  return require(candidates.sort((a, b) => fs.statSync(path.join(b, 'package.json')).mtimeMs - fs.statSync(path.join(a, 'package.json')).mtimeMs)[0]);
}

async function run() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.connectOverCDP(CDP);
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => sessionStorage.setItem('rintik_api_url', 'http://127.0.0.1:8000'));
  const page = await context.newPage();
  const requests = [];
  const responses = [];
  const consoleErrors = [];
  page.on('request', request => {
    if (/127\.0\.0\.1:(8000|8140)/.test(request.url())) requests.push(request.url());
  });
  page.on('response', response => {
    if (response.url().startsWith(API)) responses.push({ url: response.url(), status: response.status() });
  });
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  fs.mkdirSync(EVIDENCE, { recursive: true });
  const screenshot = path.join(EVIDENCE, 'predict-system-ready.png');
  let report;
  try {
    await page.goto(`${FRONTEND}/predict.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const observed = await page.evaluate(() => ({
      status: document.getElementById('systemStatusTitle')?.textContent,
      alert: document.getElementById('globalAlertMessage')?.textContent,
      storedApi: sessionStorage.getItem('rintik_api_url')
    }));
    assert.strictEqual(observed.status, 'Sistem siap', `unexpected startup status: ${JSON.stringify(observed)}`);
    assert.strictEqual(observed.storedApi, API, 'legacy local API URL was not migrated');
    assert(requests.some(url => url.startsWith(API)), 'no request reached the official local API');
    assert(!requests.some(url => url.startsWith('http://127.0.0.1:8000')), 'a request still reached the legacy API port');
    assert(responses.length >= 3 && responses.every(item => item.status === 200), 'startup API requests did not all return 200');
    assert.deepStrictEqual(consoleErrors, [], 'browser console contains errors');
    report = {
      generated_at: new Date().toISOString(), status: 'PASS', frontend: FRONTEND, api: API,
      migrated_from: 'http://127.0.0.1:8000', stored_api_after_load: observed.storedApi,
      requests, responses, console_errors: consoleErrors, screenshot: path.basename(screenshot)
    };
  } catch (error) {
    const observed = await page.evaluate(() => ({
      status: document.getElementById('systemStatusTitle')?.textContent,
      alert: document.getElementById('globalAlertMessage')?.textContent,
      storedApi: sessionStorage.getItem('rintik_api_url')
    })).catch(() => ({}));
    report = {
      generated_at: new Date().toISOString(), status: 'FAIL', frontend: FRONTEND, api: API,
      error: error.message, observed, requests, responses, console_errors: consoleErrors,
      screenshot: path.basename(screenshot)
    };
  } finally {
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(EVIDENCE, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await context.close();
    await browser.close();
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== 'PASS') process.exitCode = 1;
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
