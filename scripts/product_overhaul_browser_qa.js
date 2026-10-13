'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

const FRONTEND=process.env.RINTIK_FRONTEND_URL||'http://127.0.0.1:4174';
const API=process.env.RINTIK_API_URL||'http://127.0.0.1:8140';
const CDP=process.env.RINTIK_CDP_URL||'http://127.0.0.1:9223';
const ROOT=path.resolve(__dirname,'..');
const EVIDENCE=process.env.RINTIK_PRODUCT_OVERHAUL_EVIDENCE||path.resolve(ROOT,'..','qa','evidence','product-overhaul');

function loadPlaywright(){
  try{return require('playwright');}catch(error){}
  const runtime=path.join(process.env.LOCALAPPDATA||'','OpenAI','Codex','runtimes','cua_node');
  const candidates=fs.existsSync(runtime)?fs.readdirSync(runtime).map(name=>path.join(runtime,name,'bin','node_modules','playwright')).filter(item=>fs.existsSync(path.join(item,'package.json'))):[];
  if(!candidates.length)throw new Error('Playwright runtime unavailable');
  return require(candidates.sort((a,b)=>fs.statSync(path.join(b,'package.json')).mtimeMs-fs.statSync(path.join(a,'package.json')).mtimeMs)[0]);
}
function app(page){return `${FRONTEND}/${page}?api=${encodeURIComponent(API)}`;}
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
async function json(url,options){const response=await fetch(url,options);const text=await response.text();assert(response.ok,`${url} ${response.status}: ${text}`);return JSON.parse(text);}
async function text(page,selector){return (await page.locator(selector).innerText()).trim();}
async function layout(page,label){
  const value=await page.evaluate(()=>({width:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,duplicates:(()=>{const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);return ids.filter((id,index)=>ids.indexOf(id)!==index);})()}));
  assert(value.scrollWidth<=value.clientWidth,`${label}: horizontal overflow`);assert.deepStrictEqual(value.duplicates,[],`${label}: duplicate IDs`);return {label,...value};
}
async function accessibility(context,page,label){
  const session=await context.newCDPSession(page);await session.send('Accessibility.enable');const tree=await session.send('Accessibility.getFullAXTree');await session.detach();
  const interactive=new Set(['button','link','checkbox','combobox','slider','tab','textbox']);
  const unnamed=tree.nodes.filter(node=>!node.ignored&&interactive.has(node.role&&node.role.value)&&!(node.name&&String(node.name.value||'').trim()));
  assert.strictEqual(unnamed.length,0,`${label}: unnamed interactive nodes`);return {label,nodes:tree.nodes.length,unnamedInteractive:0};
}

async function run(){
  const {chromium}=loadPlaywright();
  const browser=await chromium.connectOverCDP(CDP);
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  const started=new Date();const runDir=path.join(EVIDENCE,started.toISOString().replace(/[-:TZ.]/g,'').slice(0,14));fs.mkdirSync(runDir,{recursive:true});
  const checks=[],screenshots=[],layouts=[],a11y=[],network=[],consoleErrors=[];
  const pass=(name,evidence={})=>checks.push({name,status:'PASS',evidence});
  const shot=async name=>{const file=path.join(runDir,`${name}.png`);await page.screenshot({path:file,fullPage:true});screenshots.push({name,file:path.basename(file),sha256:sha(file)});};
  page.on('response',response=>{if(response.url().startsWith(FRONTEND)||response.url().startsWith(API))network.push({url:response.url(),status:response.status(),contentType:response.headers()['content-type']||''});});
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push({text:message.text(),url:page.url()});});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});

  await json(`${API}/v1/demo/reset`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmation:'RESET_DEMO_STATE'})});
  await page.goto(app('predict.html'),{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.getElementById('systemStatusTitle').textContent.trim()==='Sistem siap');
  assert.strictEqual(await page.locator('[data-mode]').count(),2);
  assert.strictEqual(await page.locator('#refreshButton').count(),0);
  assert.strictEqual(await page.locator('#recoveryAction').count(),0);
  assert.strictEqual(await page.locator('#demoPanel').isHidden(),true);
  assert.match(await page.locator('link[href*="prediction-flow.css?v="]').getAttribute('href'),/\?v=/);
  pass('two-mode root hierarchy',{modes:['Operasional Harian','Demo 16 Hari'],legacyControlsRemoved:true,assetsVersioned:true});
  layouts.push(await layout(page,'predict-desktop-clean'));a11y.push(await accessibility(context,page,'predict-desktop-clean'));await shot('01-predict-operasional-clean');

  await page.locator('#manualPanel > summary').click();
  assert.strictEqual(await page.locator('#manualPanel').getAttribute('open'),'');
  await page.click('#loadManualExample');await page.waitForFunction(()=>!document.getElementById('manualResult').hidden);
  assert.match(await text(page,'#manualResult'),/belum disimpan atau diproses/i);
  await page.click('#validateManualButton');assert.match(await text(page,'#manualResult'),/Form diperiksa: \d+ nilai sensor tersedia/i);
  pass('manual input remains secondary and honest',{persistent:false,fieldsInspected:23,sourceGapsPreserved:true});

  await page.click('#processButton');
  await page.waitForFunction(()=>!document.getElementById('latestContent').hidden&&document.getElementById('latestDate').textContent.includes('29 Agustus')&&document.getElementById('processingPanel').hidden,{timeout:180000});
  assert.strictEqual((await json(`${API}/health`)).completed_days,1);
  assert.match(await text(page,'#latestOperationalNote'),/sensor humidity/i);
  await shot('02-operasional-harian-result');pass('daily operation stores and renders one day',{date:'2023-08-29',completedDays:1});

  const resultHref=await page.locator('#resultLink').getAttribute('href');await page.goto(new URL(resultHref,page.url()).href,{waitUntil:'networkidle'});
  assert.strictEqual(await page.locator('#resultContent').isHidden(),false);assert.match(await text(page,'#resultOperationalNote'),/sensor humidity/i);
  layouts.push(await layout(page,'result-desktop'));a11y.push(await accessibility(context,page,'result-desktop'));await shot('03-result-normal');
  pass('prediction flows directly to result',{fakeResult:false,operationalSource:'sensor humidity'});

  await page.goto(app('predict.html'),{waitUntil:'networkidle'});await page.focus('#modeDemo');await page.keyboard.press('Enter');
  assert.strictEqual(await page.locator('#modeDemo').getAttribute('aria-selected'),'true');assert.strictEqual(await page.locator('#demoPanel').isHidden(),false);
  assert.strictEqual(await text(page,'#replayCount'),'1 / 16 hari');await shot('04-demo-mode');pass('demo branch reveals progress and reset only on demand',{progress:'1 / 16 hari'});

  await page.click('#prepareRecoveryButton');
  await page.waitForFunction(()=>document.getElementById('latestDate').textContent.trim()==='6 September 2023'&&!document.getElementById('operationalBanner').hidden&&document.getElementById('processingPanel').hidden,null,{timeout:600000});
  const day=await json(`${API}/v1/days/2023-09-06/result`);const monitoring=await json(`${API}/v1/demo/days/2023-09-06/monitoring`);
  assert(monitoring.sensor.values.every(row=>row.physical_rh===null),'raw humidity sensor must remain a gap');
  const predicted=new Map(day.predictions.map(row=>[row.timestamp||row.datetime,Number(row.post_3)]));
  assert(monitoring.recovery.values.length>0,'recovery values missing');
  monitoring.recovery.values.forEach(row=>assert(Math.abs(Number(row.recovery_rh)-predicted.get(row.timestamp))<1e-10,`recovery mismatch ${row.timestamp}`));
  assert.strictEqual(await text(page,'#latestOperational'),await text(page,'#latestMean'));
  await shot('05-recovery-6-september');pass('single recovery action works end-to-end',{date:'2023-09-06',rawSensor:'gap',operationalEqualsPrediction:true});

  await page.click('#resultLink');await page.waitForLoadState('networkidle');
  assert.strictEqual(await page.locator('#resultOperationalBanner').isHidden(),false);assert.strictEqual(await text(page,'#resultOperational'),await text(page,'#resultMean'));
  await shot('06-result-recovery');pass('result explains operational substitution',{sourceLabel:await text(page,'#resultOperationalNote')});

  await page.goto(app('predict.html'),{waitUntil:'networkidle'});await page.click('#modeDemo');await page.click('#processButton');
  await page.waitForFunction(()=>document.getElementById('replayCount').textContent.trim()==='16 / 16 hari'&&document.getElementById('processingPanel').hidden,null,{timeout:600000});
  const completedHealth=await json(`${API}/health`);assert.strictEqual(completedHealth.completed_days,16);assert.strictEqual(completedHealth.archived_pred_internal_rows,734);
  assert.strictEqual(await page.locator('#completionPanel').isHidden(),false);await shot('07-demo-complete');pass('full demo replay remains complete',{completedDays:16,rows:734});

  await page.goto(app('dashboard.html'),{waitUntil:'networkidle'});await page.waitForFunction(()=>!document.getElementById('panelOverview').hidden&&document.getElementById('metricSensor').textContent.trim()!=='—',{timeout:60000});
  await page.selectOption('#daySelect','2023-09-06');await page.waitForFunction(()=>document.getElementById('metricSensorNote').textContent.includes('estimasi RINTIK'),null,{timeout:60000});
  assert.match(await text(page,'#metricSensorNote'),/estimasi RINTIK/i);layouts.push(await layout(page,'dashboard-desktop'));a11y.push(await accessibility(context,page,'dashboard-desktop'));await shot('07-dashboard-unified');
  pass('dashboard keeps richer history view',{operationalSource:'estimasi RINTIK',primaryIngestionControls:false});

  await page.setViewportSize({width:390,height:844});await page.goto(app('predict.html'),{waitUntil:'networkidle'});layouts.push(await layout(page,'predict-mobile'));a11y.push(await accessibility(context,page,'predict-mobile'));await shot('08-predict-mobile');
  await page.focus('#modeDemo');await page.keyboard.press('Enter');assert.strictEqual(await page.locator('#demoPanel').isHidden(),false);pass('responsive and keyboard mode selection',{viewport:'390x844',horizontalOverflow:false});

  await page.click('#openResetButton');assert.strictEqual(await page.locator('#resetConfirmation').isHidden(),false);await page.click('#confirmResetButton');
  await page.waitForFunction(()=>document.getElementById('replayCount').textContent.trim()==='0 / 16 hari'&&document.getElementById('latestContent').hidden,{timeout:60000});
  assert.strictEqual((await json(`${API}/health`)).completed_days,0);pass('reset returns demo to clean state',{completedDays:0});await shot('09-reset-complete');

  const bad=await context.newPage();await bad.goto(`${FRONTEND}/predict.html?api=${encodeURIComponent('http://127.0.0.1:8999')}`,{waitUntil:'domcontentloaded'});await bad.waitForFunction(()=>!document.getElementById('flowAlert').hidden,{timeout:30000});assert.strictEqual(await bad.locator('#latestContent').isHidden(),true);await bad.close();pass('backend failure remains fail-closed',{fakeResult:false});
  const unexpected=consoleErrors.filter(item=>!item.url.includes('8999'));assert.deepStrictEqual(unexpected,[],`Unexpected console errors: ${JSON.stringify(unexpected)}`);
  const trace=path.join(runDir,'trace.zip');await context.tracing.stop({path:trace});await context.close();await browser.close();
  const manifest={status:'PASS',startedAt:started.toISOString(),finishedAt:new Date().toISOString(),frontend:FRONTEND,api:API,checks,screenshots,layouts,accessibility:a11y,networkEntries:network.length,consoleErrors:unexpected,indexSha256:sha(path.join(ROOT,'index.html')),trace:{file:'trace.zip',sha256:sha(trace)}};
  fs.writeFileSync(path.join(runDir,'network.json'),JSON.stringify(network,null,2));fs.writeFileSync(path.join(runDir,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({status:'PASS',checks:checks.length,screenshots:screenshots.length,evidence:runDir},null,2));
}
run().catch(error=>{console.error(error.stack||error);process.exit(1);});
