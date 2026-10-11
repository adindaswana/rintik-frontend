'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = process.env.RINTIK_FRONTEND_URL || 'http://127.0.0.1:4174';
const API_URL = process.env.RINTIK_API_URL || 'http://127.0.0.1:8140';
const CDP_URL = process.env.RINTIK_CDP_URL || 'http://127.0.0.1:9223';
const PROTOTYPE_DIR = path.resolve(__dirname, '..', '..');
const EVIDENCE_DIR = process.env.RINTIK_M5_EVIDENCE_DIR
  ? path.resolve(process.env.RINTIK_M5_EVIDENCE_DIR)
  : path.join(PROTOTYPE_DIR, 'qa', 'evidence', 'm5-final-readiness', 'manual-run');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PROTOTYPE_DIR, 'demo', 'fixtures', 'day_manifest.json'), 'utf8'));
const MODEL_SHA = 'adce8fda2f465679ea6e8fe31124822a45a555b9dc154e12076ef5b6140699b0';
const STATE_SHA = 'a24da3473bf42a10fb9bde05e37495e5b69adffde9193dd4648daa9e0898996e';

function loadPlaywright(){
  if(process.env.RINTIK_PLAYWRIGHT_MODULE) return require(process.env.RINTIK_PLAYWRIGHT_MODULE);
  try { return require('playwright'); } catch(error) {}
  const local = process.env.LOCALAPPDATA;
  if(!local) throw new Error('Playwright is unavailable and LOCALAPPDATA is not set.');
  const runtimeRoot = path.join(local, 'OpenAI', 'Codex', 'runtimes', 'cua_node');
  if(!fs.existsSync(runtimeRoot)) throw new Error('No local Playwright/Codex browser runtime was found.');
  const candidates = fs.readdirSync(runtimeRoot)
    .map(name => path.join(runtimeRoot, name, 'bin', 'node_modules', 'playwright'))
    .filter(candidate => fs.existsSync(path.join(candidate, 'package.json')))
    .sort((a,b) => fs.statSync(path.join(b, 'package.json')).mtimeMs - fs.statSync(path.join(a, 'package.json')).mtimeMs);
  if(!candidates.length) throw new Error('No bundled Playwright module was found.');
  return require(candidates[0]);
}

function sha256(file){
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function elapsedMs(start){ return Math.round(Number(process.hrtime.bigint() - start) / 1e6); }
function dashboardUrl(){ return `${FRONTEND_URL}/dashboard.html?api=${encodeURIComponent(API_URL)}`; }
function predictUrl(){ return `${FRONTEND_URL}/predict.html?api=${encodeURIComponent(API_URL)}`; }
async function text(page, selector){ return (await page.locator(selector).innerText()).trim(); }
async function capture(page, file){
  if(await page.locator('#toastRegion .toast').count()){
    await page.waitForFunction(() => !document.querySelector('#toastRegion .toast'), null, {timeout:6000});
  }
  await page.evaluate(() => window.scrollTo(0,0));
  await page.waitForTimeout(180);
  await page.screenshot({path:path.join(EVIDENCE_DIR, file), fullPage:false, animations:'disabled'});
  return file;
}
async function waitSettled(page){
  await page.waitForFunction(() => {
    const loading=document.getElementById('loadingLayer');
    const alert=document.getElementById('globalAlert');
    const empty=document.getElementById('emptyState');
    const panel=Array.from(document.querySelectorAll('.view-panel')).some(item=>!item.hidden);
    return loading && loading.hidden && ((alert&&!alert.hidden)||(empty&&!empty.hidden)||panel);
  }, null, {timeout:120000});
}
async function activateView(page, view){
  await page.click(`.nav-tab[data-view="${view}"]`);
  await page.waitForFunction(expected => {
    const tab=document.querySelector(`.nav-tab[data-view="${expected}"]`);
    const panel=document.getElementById(`panel${expected[0].toUpperCase()}${expected.slice(1)}`);
    return tab && tab.getAttribute('aria-selected')==='true' && panel && !panel.hidden;
  }, view);
}
async function processDay(page, item, completedCount){
  const started=process.hrtime.bigint();
  await page.waitForFunction(() => !document.getElementById('processButton').disabled);
  await page.click('#processButton');
  await page.waitForFunction(expected => document.getElementById('replayCount').textContent.trim()===expected && document.getElementById('processingPanel').hidden,`${completedCount} / 16 hari`,{timeout:120000});
  assert.strictEqual(await text(page, '#latestRows'), `${item.rows}/48`);
  assert((await text(page, '#latestStatus')).includes('Model original'));
  return {
    date:item.date,
    rows:item.rows,
    fixture:item.file,
    fixture_sha256:sha256(fixture),
    elapsed_ms:elapsedMs(started),
  };
}

async function run(){
  fs.mkdirSync(EVIDENCE_DIR, {recursive:true});
  const {chromium}=loadPlaywright();
  const browser=await chromium.connectOverCDP(CDP_URL);
  const contextOptions={
    viewport:{width:1366,height:768},
    locale:'id-ID',
    colorScheme:'light',
    reducedMotion:'no-preference',
    acceptDownloads:true,
  };
  // Video is optional because an offline venue may not have Playwright's
  // separate FFmpeg binary. Screenshots plus a full trace are always captured.
  if(process.env.RINTIK_RECORD_VIDEO==='1'){
    contextOptions.recordVideo={dir:EVIDENCE_DIR,size:{width:1366,height:768}};
  }
  const context=await browser.newContext(contextOptions);
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  const page=await context.newPage();
  const video=page.video();
  const consoleEvents=[];
  const requests=[];
  const dayTimings=[];
  const screenshots=[];
  const started=process.hrtime.bigint();
  let outcome='FAIL';
  let failure=null;
  let auditDownload=null;
  let csvDownload=null;

  page.on('console', message => {
    if(['error','warning'].includes(message.type())) consoleEvents.push({type:message.type(),text:message.text()});
  });
  page.on('pageerror', error => consoleEvents.push({type:'pageerror',text:error.message}));
  page.on('request', request => requests.push({method:request.method(),url:request.url()}));

  try {
    await page.goto(predictUrl(), {waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(() => !document.getElementById('processButton').disabled,{timeout:30000});
    assert.strictEqual(await page.locator('#latestEmpty').isHidden(), false, 'Clean rehearsal must begin without a model result.');
    assert((await text(page, '#nextDate')).includes('29 Agustus 2023'));
    screenshots.push(await capture(page, '00-clean-empty-state-1366x768.png'));

    for(let index=0;index<MANIFEST.calendar_dates.length;index++){
      const item=MANIFEST.calendar_dates[index];
      dayTimings.push(await processDay(page,item,index+1));
      if(item.date==='2023-08-29') screenshots.push(await capture(page,'01-first-partial-18-of-48.png'));
      if(item.date==='2023-09-03') screenshots.push(await capture(page,'02-normal-before-fault.png'));
      if(item.date==='2023-09-04'){
        assert((await text(page,'#latestVerdict')).includes('Dugaan malfungsi'));
        screenshots.push(await capture(page,'03-stuck-suspected.png'));
      }
      if(item.date==='2023-09-06'){
        assert((await text(page,'#latestVerdict')).includes('Dugaan outage'));
        assert((await text(page,'#latestSensor')).includes('Terputus'));
        assert.strictEqual(await page.locator('#recoveryAction').isHidden(),false);
        screenshots.push(await capture(page,'04-outage-recovery-restricted.png'));
        await page.click('#recoveryAction');
        await page.waitForFunction(() => document.querySelector('#latestLegend .recovery') && document.getElementById('processingPanel').hidden,{timeout:60000});
        screenshots.push(await capture(page,'05-outage-estimated-recovery.png'));
      }
      if(item.date==='2023-09-07'){
        assert((await text(page,'#latestVerdict')).toLowerCase().includes('pulih'));
        screenshots.push(await capture(page,'06-simulated-repaired.png'));
      }
    }

    assert.strictEqual(await text(page,'#replayCount'),'16 / 16 hari');
    assert.strictEqual(await page.locator('#processButton').isDisabled(),true);
    await page.goto(dashboardUrl(), {waitUntil:'domcontentloaded',timeout:30000});
    await waitSettled(page);
    assert.strictEqual(await text(page,'#runConsoleTitle'),'Replay test selesai');
    assert.strictEqual(await page.locator('#daySelect option').count(),16);
    assert.strictEqual(await page.inputValue('#daySelect'),'2023-09-13');
    assert.strictEqual(await text(page,'#metricRows'),'44/48');
    screenshots.push(await capture(page,'07-final-partial-44-of-48.png'));

    await activateView(page,'settings');
    const diagnostic=await text(page,'#diagnosticJson');
    assert(diagnostic.includes(MODEL_SHA));
    assert(diagnostic.includes(STATE_SHA));
    screenshots.push(await capture(page,'08-final-technical-lineage.png'));
    await activateView(page,'overview');

    const csvPromise=page.waitForEvent('download');
    await page.click('#exportCsvButton');
    const csv=await csvPromise;
    csvDownload=path.join(EVIDENCE_DIR,'rintik-final-day-export.csv');
    await csv.saveAs(csvDownload);
    const csvText=fs.readFileSync(csvDownload,'utf8');
    assert.strictEqual(csvText.trimEnd().split(/\r?\n/).length,45);
    assert(csvText.includes('real_original_pth'));
    assert(csvText.includes('prediction_source'));

    const auditPromise=page.waitForEvent('download');
    await page.click('#exportAuditButton');
    const audit=await auditPromise;
    auditDownload=path.join(EVIDENCE_DIR,'rintik-final-audit.json');
    await audit.saveAs(auditDownload);
    const auditJson=JSON.parse(fs.readFileSync(auditDownload,'utf8'));
    assert.strictEqual(auditJson.result.source,'real_original_pth');
    assert.strictEqual(auditJson.monitoring.simulation,true);
    assert.strictEqual(auditJson.monitoring.provenance.model_input,false);
    assert.strictEqual(auditJson.monitoring.provenance.accuracy_ground_truth,false);

    await page.reload({waitUntil:'domcontentloaded'});
    await waitSettled(page);
    assert.strictEqual(await page.locator('#daySelect option').count(),16);
    assert.strictEqual(await page.inputValue('#daySelect'),'2023-09-13');
    assert.strictEqual(await text(page,'#metricRows'),'44/48');
    screenshots.push(await capture(page,'09-reload-persistence.png'));

    const external=requests.filter(entry => {
      const url=new URL(entry.url);
      return !['127.0.0.1','localhost'].includes(url.hostname);
    });
    assert.deepStrictEqual(external,[],`External browser requests detected: ${JSON.stringify(external)}`);
    const errors=consoleEvents.filter(entry=>['error','pageerror'].includes(entry.type));
    assert.deepStrictEqual(errors,[],`Browser errors detected: ${JSON.stringify(errors)}`);
    outcome='PASS';
  } catch(error){
    failure=error.stack||String(error);
    throw error;
  } finally {
    const tracePath=path.join(EVIDENCE_DIR,'m5-recorded-demo-trace.zip');
    await context.tracing.stop({path:tracePath}).catch(error=>{ if(!failure) failure=String(error); });
    await page.close().catch(()=>{});
    await context.close().catch(()=>{});
    if(video){
      await video.saveAs(path.join(EVIDENCE_DIR,'m5-recorded-demo.webm')).catch(error=>{ if(!failure) failure=String(error); });
    }
    fs.writeFileSync(path.join(EVIDENCE_DIR,'RECORDED_DEMO_NOTICE.txt'),
      'RECORDED DEMO — RINTIK local prototype replay. Sensor RH faults and technician/audit actions are synthetic illustrations, not field-validation evidence.\n');
    // The PowerShell wrapper still owns and writes rehearsal-console.log at
    // this point. It creates the final all-file manifest after closing that
    // transcript; hash only stable browser-owned artifacts here.
    const artifactNames=fs.readdirSync(EVIDENCE_DIR).filter(name=>
      !['m5-rehearsal-results.json','rehearsal-console.log','m5-evidence-manifest.json'].includes(name)
    ).sort();
    const artifactHashes={};
    for(const name of artifactNames){
      const candidate=path.join(EVIDENCE_DIR,name);
      if(fs.statSync(candidate).isFile()) artifactHashes[name]=sha256(candidate);
    }
    const report={
      status:outcome,
      label:'RECORDED DEMO EVIDENCE — synthetic sensor faults are illustrative, not field validation',
      generated_at:new Date().toISOString(),
      frontend:FRONTEND_URL,
      api:API_URL,
      cdp:CDP_URL,
      model_sha256:MODEL_SHA,
      state_sha256:STATE_SHA,
      days:dayTimings.length,
      rows:dayTimings.reduce((sum,item)=>sum+item.rows,0),
      total_elapsed_ms:elapsedMs(started),
      day_timings:dayTimings,
      external_browser_requests:requests.filter(entry=>{
        try { return !['127.0.0.1','localhost'].includes(new URL(entry.url).hostname); }
        catch(error){ return false; }
      }),
      console_events:consoleEvents,
      screenshots,
      video_recorded:Boolean(video),
      trace_recorded:fs.existsSync(path.join(EVIDENCE_DIR,'m5-recorded-demo-trace.zip')),
      csv_export:csvDownload&&path.basename(csvDownload),
      audit_export:auditDownload&&path.basename(auditDownload),
      failure,
      artifacts_sha256:artifactHashes,
    };
    fs.writeFileSync(path.join(EVIDENCE_DIR,'m5-rehearsal-results.json'),JSON.stringify(report,null,2));
  }
  console.log(JSON.stringify({status:outcome,days:dayTimings.length,rows:dayTimings.reduce((sum,item)=>sum+item.rows,0),total_elapsed_ms:elapsedMs(started),evidence:EVIDENCE_DIR},null,2));
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error.stack||error);process.exit(1);});
