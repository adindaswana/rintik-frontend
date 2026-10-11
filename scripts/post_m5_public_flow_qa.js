'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = process.env.RINTIK_FRONTEND_URL || 'http://127.0.0.1:4174';
const API_URL = process.env.RINTIK_API_URL || 'http://127.0.0.1:8140';
const CDP_URL = process.env.RINTIK_CDP_URL || 'http://127.0.0.1:9223';
const PROTOTYPE_DIR = path.resolve(__dirname, '..', '..');
const OFFICIAL_TEST = path.join(PROTOTYPE_DIR, 'reference', 'official', 'test.csv');
const FIXTURE_DIR = path.join(PROTOTYPE_DIR, 'demo', 'fixtures', 'inputs_original_test_by_day');
const DAY_MANIFEST = JSON.parse(fs.readFileSync(path.join(PROTOTYPE_DIR, 'demo', 'fixtures', 'day_manifest.json'), 'utf8'));
const EVIDENCE_DIR = process.env.RINTIK_POST_M5_EVIDENCE_DIR || path.join(PROTOTYPE_DIR, 'qa', 'evidence', 'post-m5-public-flow');
const MODEL_SHA = 'adce8fda2f465679ea6e8fe31124822a45a555b9dc154e12076ef5b6140699b0';
const STATE_SHA = 'a24da3473bf42a10fb9bde05e37495e5b69adffde9193dd4648daa9e0898996e';

function loadPlaywright(){
  try { return require('playwright'); } catch(error) {}
  const runtimeRoot = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'runtimes', 'cua_node');
  const candidates = fs.existsSync(runtimeRoot) ? fs.readdirSync(runtimeRoot)
    .map(name => path.join(runtimeRoot, name, 'bin', 'node_modules', 'playwright'))
    .filter(candidate => fs.existsSync(path.join(candidate, 'package.json'))) : [];
  if(!candidates.length) throw new Error('Playwright runtime is unavailable.');
  return require(candidates.sort((a,b) => fs.statSync(path.join(b,'package.json')).mtimeMs - fs.statSync(path.join(a,'package.json')).mtimeMs)[0]);
}

function sha256(file){ return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function predictUrl(api=API_URL){ return `${FRONTEND_URL}/predict.html?api=${encodeURIComponent(api)}`; }
function fixture(index){ return path.join(FIXTURE_DIR, DAY_MANIFEST.calendar_dates[index].file); }
function nowId(){ return new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14); }

async function main(){
  fs.mkdirSync(EVIDENCE_DIR, {recursive:true});
  const runDir = path.join(EVIDENCE_DIR, nowId());
  fs.mkdirSync(runDir, {recursive:true});
  const {chromium} = loadPlaywright();
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = await browser.newContext({viewport:{width:1366,height:768}, locale:'id-ID'});
  await context.tracing.start({screenshots:true, snapshots:true, sources:true});
  const network = [], consoleEvents = [], checks = [], screenshots = [];
  const page = await context.newPage();
  page.on('response', response => {
    const request = response.request();
    if(response.url().startsWith(API_URL) || response.url().startsWith(FRONTEND_URL)){
      network.push({method:request.method(),url:response.url(),status:response.status(),contentType:response.headers()['content-type'] || null});
    }
  });
  page.on('requestfailed', request => network.push({method:request.method(),url:request.url(),status:'FAILED',failure:request.failure()}));
  page.on('console', message => { if(['error','warning'].includes(message.type())) consoleEvents.push({type:message.type(),text:message.text(),url:page.url()}); });
  page.on('pageerror', error => consoleEvents.push({type:'pageerror',text:error.message,url:page.url()}));
  function pass(check,evidence){ checks.push({check,status:'PASS',evidence}); }
  async function shot(name, fullPage=false){ const file=name+'.png'; await page.screenshot({path:path.join(runDir,file),fullPage,animations:'disabled'}); screenshots.push(file); }
  async function alertText(){ return (await page.locator('#csvAlert .alert-text').innerText()).trim(); }
  async function openPredict(api=API_URL){ await page.goto(predictUrl(api),{waitUntil:'domcontentloaded'}); await page.evaluate(() => { localStorage.removeItem('sfh_last_result'); }); }

  const initialHealth = await (await fetch(`${API_URL}/health`)).json();
  assert.strictEqual(initialHealth.ready,true);
  assert.strictEqual(initialHealth.model_sha256,MODEL_SHA);
  assert.strictEqual(initialHealth.state_sha256,STATE_SHA);
  assert.strictEqual(initialHealth.completed_days,0,'QA requires an isolated empty database.');
  pass('isolated frozen backend baseline',{completedDays:0,modelSha256:initialHealth.model_sha256,stateSha256:initialHealth.state_sha256});
  const cors = await fetch(`${API_URL}/predict`,{method:'OPTIONS',headers:{Origin:FRONTEND_URL,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
  assert.strictEqual(cors.status,200);
  assert.strictEqual(cors.headers.get('access-control-allow-origin'),FRONTEND_URL);
  pass('CORS preflight for public frontend',{status:cors.status,allowOrigin:cors.headers.get('access-control-allow-origin')});

  await page.goto(`${FRONTEND_URL}/index.html?api=${encodeURIComponent(API_URL)}`,{waitUntil:'domcontentloaded'});
  assert.match(await page.locator('.preview-title div span').innerText(),/bukan keluaran model/i);
  await page.locator('a', {hasText:'Buat Prediksi Sekarang'}).first().focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/predict\.html/);
  pass('Beranda to Prediksi keyboard navigation',{url:page.url()});

  await page.click('#demoBtn');
  await page.waitForFunction(() => !document.getElementById('predictBtnCsv').disabled);
  assert.match(await page.locator('#fileName').innerText(),/official-test-2023-08-29/);
  assert.match(await alertText(),/input test resmi/i);
  await shot('01-official-example-loaded');
  const ingestBefore = network.filter(item => /\/ingest$/.test(item.url)).length;
  await page.evaluate(() => { document.getElementById('predictBtnCsv').click(); document.getElementById('predictBtnCsv').click(); });
  await page.waitForURL(/hasil\.html/,{timeout:120000});
  assert.match(await page.locator('#resultProvenance .alert-text').innerText(),/dipersistenkan.*Dashboard Operator/i);
  assert.strictEqual(await page.locator('#resultTableBody tr').count(),18);
  const ingestAfter = network.filter(item => /\/ingest$/.test(item.url)).length;
  assert.strictEqual(ingestAfter-ingestBefore,1,'Double submit must create one ingest request.');
  await shot('02-daily-result-real-model',true);
  pass('official example daily flow',{date:'2023-08-29',rows:18,doubleSubmitRequests:1,source:'real_original_pth'});

  const stateAfterDaily = await (await fetch(`${API_URL}/v1/days`)).json();
  assert.strictEqual(stateAfterDaily.runtime.completed_days,1);
  assert.strictEqual(stateAfterDaily.days[0].status,'completed');
  await page.goto(`${FRONTEND_URL}/dashboard.html?api=${encodeURIComponent(API_URL)}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.getElementById('loadingLayer').hidden && !document.getElementById('panelOverview').hidden,{timeout:30000});
  assert.strictEqual(await page.inputValue('#daySelect'),'2023-08-29');
  assert.strictEqual((await page.locator('#metricRows').innerText()).trim(),'18/48');
  await shot('03-operator-shared-daily-state');
  pass('Hasil and operator share persisted daily state',{completedDays:1,date:'2023-08-29',rows:'18/48'});

  await openPredict();
  const retryBefore = network.filter(item => /\/ingest$/.test(item.url)).length;
  await page.locator('#fileInput').setInputFiles(fixture(0));
  await page.waitForFunction(() => !document.getElementById('predictBtnCsv').disabled);
  await page.click('#predictBtnCsv');
  await page.waitForURL(/hasil\.html/,{timeout:120000});
  const retryAfter = network.filter(item => /\/ingest$/.test(item.url)).length;
  assert.strictEqual(retryAfter-retryBefore,1);
  const stateAfterRetry = await (await fetch(`${API_URL}/v1/days`)).json();
  assert.strictEqual(stateAfterRetry.runtime.completed_days,1);
  pass('same-date retry is idempotent',{completedDays:1,requestCount:1});

  await openPredict();
  await page.locator('#fileInput').setInputFiles(fixture(2));
  await page.waitForFunction(() => !document.getElementById('predictBtnCsv').disabled);
  await page.click('#predictBtnCsv');
  await page.waitForFunction(() => !document.getElementById('csvAlert').hidden && document.getElementById('loadingOverlay').hidden,{timeout:30000});
  assert.match(await alertText(),/belum menjadi batch berikutnya/i);
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('sfh_last_result')),null);
  await page.waitForTimeout(500);
  const errorBox = await page.locator('#csvAlert').boundingBox();
  assert(errorBox && errorBox.y >= 0 && errorBox.y < 768,'Error alert must be scrolled into the desktop viewport.');
  await shot('04-out-of-order-rejected');
  pass('out-of-order daily input fails closed',{message:await alertText(),storedResult:false,errorVisible:true});

  await openPredict();
  await page.locator('#fileInput').setInputFiles({name:'schema-mismatch.csv',mimeType:'text/csv',buffer:Buffer.from('datetime,air_temperature,co2\n2023-08-29 15:00:00,26,400\n')});
  await page.waitForFunction(() => !document.getElementById('csvAlert').hidden);
  assert.strictEqual(await page.locator('#predictBtnCsv').isDisabled(),true);
  assert.match(await alertText(),/Skema CSV tidak sesuai/i);
  pass('schema mismatch rejected before request',{message:await alertText()});

  await page.locator('#removeFile').click();
  await page.locator('#fileInput').setInputFiles({name:'malformed.csv',mimeType:'text/csv',buffer:Buffer.from('datetime,env_id\n"2023-08-29 15:00:00,1')});
  await page.waitForFunction(() => !document.getElementById('csvAlert').hidden);
  assert.strictEqual(await page.locator('#predictBtnCsv').isDisabled(),true);
  assert.match(await alertText(),/kutip CSV/i);
  pass('malformed CSV rejected before request',{message:await alertText()});

  await openPredict(FRONTEND_URL);
  await page.click('#demoBtn');
  await page.waitForFunction(() => !document.getElementById('csvAlert').hidden && /non-JSON/.test(document.querySelector('#csvAlert .alert-text').textContent));
  await shot('05-html-response-explained');
  pass('HTML response is not parsed as JSON',{message:await alertText()});

  await openPredict('http://127.0.0.1:8999');
  await page.click('#demoBtn');
  await page.waitForFunction(() => !document.getElementById('csvAlert').hidden && /tidak dapat dijangkau/.test(document.querySelector('#csvAlert .alert-text').textContent));
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('sfh_last_result')),null);
  await shot('06-network-failure-fail-closed');
  pass('network failure is actionable and fail-closed',{message:await alertText(),storedResult:false});

  await openPredict();
  const alteredLines = fs.readFileSync(OFFICIAL_TEST,'utf8').split(/\r?\n/);
  const alteredHeader = alteredLines[0].split(',');
  const alteredFirst = alteredLines[1].split(',');
  const co2Index = alteredHeader.indexOf('co2');
  alteredFirst[co2Index] = String(Number(alteredFirst[co2Index]) + 1);
  alteredLines[1] = alteredFirst.join(',');
  await page.locator('#fileInput').setInputFiles({name:'altered-test.csv',mimeType:'text/csv',buffer:Buffer.from(alteredLines.join('\n'))});
  await page.waitForFunction(() => !document.getElementById('predictBtnCsv').disabled);
  await page.click('#predictBtnCsv');
  await page.waitForFunction(() => !document.getElementById('csvAlert').hidden && document.getElementById('loadingOverlay').hidden,{timeout:30000});
  assert.match(await alertText(),/bukan test\.csv resmi/i);
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('sfh_last_result')),null);
  pass('altered 734-row fixture rejected by backend hash gate',{message:await alertText(),storedResult:false});

  await openPredict();
  await page.locator('#fileInput').setInputFiles(OFFICIAL_TEST);
  await page.waitForFunction(() => !document.getElementById('predictBtnCsv').disabled);
  assert.match(await alertText(),/734 baris.*checksum/i);
  await page.click('#predictBtnCsv');
  await page.waitForURL(/hasil\.html/,{timeout:120000});
  assert.match(await page.locator('#resultProvenance .alert-text').innerText(),/stateless.*tidak mengisi replay harian/i);
  assert.strictEqual(await page.locator('#paginationInfo').innerText(),'Menampilkan 1 sampai 20 dari 734 baris');
  const stateAfterFull = await (await fetch(`${API_URL}/v1/days`)).json();
  assert.strictEqual(stateAfterFull.runtime.completed_days,1,'Full compatibility route must not mutate daily state.');
  await shot('07-full-734-real-model',true);
  pass('official 734-row compatibility flow',{rows:734,dailyCompletedDays:1,source:'real_original_pth'});

  await page.setViewportSize({width:390,height:844});
  await page.reload({waitUntil:'domcontentloaded'});
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),true);
  await shot('08-mobile-full-result');
  pass('public result mobile viewport',{viewport:'390x844',horizontalOverflow:false});

  const duplicateIds = await page.evaluate(() => {
    const ids=Array.from(document.querySelectorAll('[id]')).map(el=>el.id); return ids.filter((id,index)=>ids.indexOf(id)!==index);
  });
  assert.deepStrictEqual(duplicateIds,[]);
  pass('basic accessibility structure',{duplicateIds:0,keyboardNavigation:true});

  const health = await (await fetch(`${API_URL}/health`)).json();
  assert.strictEqual(health.model_sha256,MODEL_SHA);
  assert.strictEqual(health.state_sha256,STATE_SHA);
  assert.strictEqual(health.completed_days,1);
  const unexpectedConsole = consoleEvents.filter(item => !/Failed to load resource/.test(item.text));
  assert.deepStrictEqual(unexpectedConsole,[]);
  pass('final frozen integrity and console',{modelSha256:health.model_sha256,stateSha256:health.state_sha256,completedDays:1,unexpectedConsole:0});

  const traceFile = path.join(runDir,'trace.zip');
  await context.tracing.stop({path:traceFile});
  await context.close();
  await browser.close();
  const manifest = {
    status:'PASS', generatedAt:new Date().toISOString(), frontendUrl:FRONTEND_URL, apiUrl:API_URL,
    checks, screenshots, networkEntries:network.length, consoleEvents, modelSha256:health.model_sha256,
    stateSha256:health.state_sha256, trace:{file:'trace.zip',sha256:sha256(traceFile)}
  };
  fs.writeFileSync(path.join(runDir,'network.json'),JSON.stringify(network,null,2));
  fs.writeFileSync(path.join(runDir,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence:runDir,networkEntries:network.length,traceSha256:manifest.trace.sha256},null,2));
}

main().catch(error => { console.error(error); process.exit(1); });
