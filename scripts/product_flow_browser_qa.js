'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

const FRONTEND_URL=process.env.RINTIK_FRONTEND_URL||'http://127.0.0.1:4174';
const API_URL=process.env.RINTIK_API_URL||'http://127.0.0.1:8142';
const CDP_URL=process.env.RINTIK_CDP_URL||'http://127.0.0.1:9223';
const ROOT=path.resolve(__dirname,'..');
const PROTOTYPE=path.resolve(ROOT,'..');
const EVIDENCE_ROOT=process.env.RINTIK_PRODUCT_FLOW_EVIDENCE||path.join(PROTOTYPE,'qa','evidence','post-m5-product-flow');
const MODEL_SHA='adce8fda2f465679ea6e8fe31124822a45a555b9dc154e12076ef5b6140699b0';

function loadPlaywright(){
  try{return require('playwright');}catch(error){}
  const runtimeRoot=path.join(process.env.LOCALAPPDATA||'','OpenAI','Codex','runtimes','cua_node');
  const candidates=fs.existsSync(runtimeRoot)?fs.readdirSync(runtimeRoot).map(name=>path.join(runtimeRoot,name,'bin','node_modules','playwright')).filter(candidate=>fs.existsSync(path.join(candidate,'package.json'))):[];
  if(!candidates.length)throw new Error('Playwright runtime unavailable.');
  return require(candidates.sort((a,b)=>fs.statSync(path.join(b,'package.json')).mtimeMs-fs.statSync(path.join(a,'package.json')).mtimeMs)[0]);
}
function stamp(){return new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);}
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function appUrl(page){return `${FRONTEND_URL}/${page}?api=${encodeURIComponent(API_URL)}`;}
async function text(page,selector){return(await page.locator(selector).innerText()).trim();}
async function noOverflow(page,label){
  const report=await page.evaluate(name=>({label:name,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,duplicateIds:(()=>{const ids=Array.from(document.querySelectorAll('[id]')).map(el=>el.id);return ids.filter((id,index)=>ids.indexOf(id)!==index);})()}),label);
  assert(report.scrollWidth<=report.clientWidth,`${label} overflows horizontally`);
  assert.deepStrictEqual(report.duplicateIds,[],`${label} has duplicate IDs`);
  return report;
}
async function accessibilityTree(context,page,label){
  const session=await context.newCDPSession(page);
  await session.send('Accessibility.enable');
  const tree=await session.send('Accessibility.getFullAXTree');
  await session.detach();
  const interactive=new Set(['button','link','checkbox','combobox','slider','tab','textbox']);
  const unnamed=tree.nodes.filter(node=>!node.ignored&&interactive.has(node.role&&node.role.value)&&!(node.name&&String(node.name.value||'').trim())).map(node=>({role:node.role.value,nodeId:node.nodeId}));
  assert.deepStrictEqual(unnamed,[],`${label} has unnamed interactive accessibility nodes`);
  return {label,nodes:tree.nodes.length,unnamedInteractive:unnamed.length};
}

async function run(){
  const runDir=path.join(EVIDENCE_ROOT,stamp());fs.mkdirSync(runDir,{recursive:true});
  const {chromium}=loadPlaywright();
  const browser=await chromium.connectOverCDP(CDP_URL);
  const context=await browser.newContext({viewport:{width:1440,height:900},locale:'id-ID',reducedMotion:'no-preference'});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  const page=await context.newPage();
  const checks=[],network=[],consoleEvents=[],screenshots=[],layouts=[],accessibility=[];
  const pass=(check,evidence)=>checks.push({check,status:'PASS',evidence});
  const shot=async name=>{const file=name+'.png';await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);await page.screenshot({path:path.join(runDir,file),fullPage:true,animations:'disabled'});screenshots.push(file);return file;};
  page.on('response',response=>{if(response.url().startsWith(API_URL)||response.url().startsWith(FRONTEND_URL))network.push({method:response.request().method(),url:response.url(),status:response.status(),contentType:response.headers()['content-type']||null});});
  page.on('requestfailed',request=>network.push({method:request.method(),url:request.url(),status:'FAILED',failure:request.failure()}));
  page.on('console',message=>{if(['error','warning'].includes(message.type()))consoleEvents.push({type:message.type(),text:message.text(),url:page.url()});});
  page.on('pageerror',error=>consoleEvents.push({type:'pageerror',text:error.message,url:page.url()}));

  const resetResponse=await fetch(`${API_URL}/v1/demo/reset`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'RESET_DEMO_STATE'})});
  assert.strictEqual(resetResponse.status,200,await resetResponse.text());
  const initial=await(await fetch(`${API_URL}/health`)).json();
  assert.strictEqual(initial.ready,true);assert.strictEqual(initial.completed_days,0);assert.strictEqual(initial.model_sha256,MODEL_SHA);
  pass('isolated frozen baseline',{completedDays:0,modelSha256:initial.model_sha256});

  await page.goto(`${FRONTEND_URL}/index.html`,{waitUntil:'domcontentloaded'});
  await page.evaluate(apiUrl=>sessionStorage.setItem('rintik_api_url',apiUrl),API_URL);
  await page.getByRole('link',{name:'Buat Prediksi Sekarang'}).first().click();
  await page.waitForURL(/predict\.html/);
  pass('home-to-prediction journey',{indexUntouched:true,navigation:'Buat Prediksi Sekarang'});
  await page.waitForFunction(()=>!document.getElementById('processButton').disabled,{timeout:30000});
  assert.strictEqual(await page.locator('input[type=file]').count(),0);
  assert.strictEqual(await page.getByText('Form Manual',{exact:true}).count(),1);
  assert.strictEqual(await text(page,'#replayCount'),'0 / 16 hari');
  layouts.push(await noOverflow(page,'predict-empty-1440x900'));
  pass('prediction workspace starts from explicit clean state',{dailyMode:true,batchMode:true,manualMode:true,fileInputs:0});

  await page.focus('#modeManual');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('[data-manual-feature]').length===23);
  assert.strictEqual(await page.locator('#processButton').isHidden(),true);
  await page.click('#loadManualExample');
  await page.waitForFunction(()=>document.getElementById('manualResult').textContent.includes('Snapshot sensor resmi'));
  await page.click('#validateManualButton');
  assert.match(await text(page,'#manualResult'),/23\/23 fitur.*draft inspeksi/i);
  assert.strictEqual((await(await fetch(`${API_URL}/health`)).json()).completed_days,0);
  await shot('00-manual-inspection-no-inference');
  pass('manual form is complete and honest',{features:23,persisted:false,inference:false});
  await page.click('#modeDaily');

  await page.click('#processButton');
  await page.waitForFunction(()=>document.getElementById('replayCount').textContent.trim()==='1 / 16 hari'&&document.getElementById('processingPanel').hidden,{timeout:120000});
  assert.strictEqual(await text(page,'#latestDate'),'29 Agustus 2023');
  assert.strictEqual(await text(page,'#latestRows'),'18/48');
  assert((await text(page,'#latestStatus')).includes('Model original'));
  await shot('01-daily-inline-result-desktop');
  pass('one-click daily processing',{date:'2023-08-29',rows:18,persisted:true,inlineResult:true});

  await page.click('#resultLink');
  await page.waitForURL(/hasil\.html/);
  await page.waitForFunction(()=>!document.getElementById('resultContent').hidden);
  assert.strictEqual(await text(page,'#resultDate'),'29 Agustus 2023');
  assert.strictEqual(await text(page,'#resultRows'),'18/48');
  assert((await text(page,'#resultProvenance')).includes('checkpoint original'));
  await shot('02-result-continuation-desktop');
  pass('prediction-to-result continuity',{date:'2023-08-29',realModel:true});

  await page.goto(appUrl('predict.html'),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.getElementById('processButton').disabled);
  await page.click('#prepareRecoveryButton');
  await page.waitForFunction(()=>document.getElementById('replayCount').textContent.trim()==='9 / 16 hari'&&document.getElementById('processingPanel').hidden&&document.getElementById('latestDate').textContent.trim()==='6 September 2023'&&document.querySelector('#latestLegend .recovery'),null,{timeout:420000});
  assert.match(await text(page,'#flowAlert'),/Recovery 6 September siap/i);
  assert.strictEqual(await page.locator('#latestContent').evaluate(element=>document.activeElement===element),true);
  await shot('02b-guided-recovery-from-partial-state');
  pass('guided recovery prepares real chronological state',{completedDays:9,date:'2023-09-06',rawSensorGap:true,recovery:'estimated'});

  await page.focus('#modeBatch');await page.keyboard.press('Enter');
  assert.strictEqual(await page.locator('#modeBatch').getAttribute('aria-selected'),'true');
  assert.match(await text(page,'#modeExplanation'),/tanggal satu per satu.*maksimal 15 hari/i);
  await page.click('#processButton');
  await page.waitForFunction(()=>document.getElementById('replayCount').textContent.trim()==='16 / 16 hari'&&document.getElementById('processingPanel').hidden,null,{timeout:420000});
  assert.strictEqual(await text(page,'#latestDate'),'13 September 2023');
  assert.strictEqual(await page.locator('#incidentList .incident-item').count(),3);
  assert.strictEqual(await page.locator('#recoveryAction').isHidden(),false);
  assert.strictEqual(await page.locator('#completionPanel').isHidden(),false);
  assert.match(await text(page,'#completionPanel'),/fixture demonstrasi selesai.*tidak berhenti di hari ke-16.*adapter ingestion operasional/is);
  const finalHealth=await(await fetch(`${API_URL}/health`)).json();
  assert.strictEqual(finalHealth.completed_days,16);assert.strictEqual(finalHealth.archived_pred_internal_rows,734);
  await shot('03-batch-15-complete-with-fault-history');
  pass('batch mode is sequential daily persistence',{addedDays:7,totalDays:16,rows:734,incidents:3});

  await page.click('#recoveryAction');
  await page.waitForFunction(()=>document.getElementById('latestDate').textContent.trim()==='6 September 2023'&&document.querySelector('#latestLegend .recovery'),null,{timeout:60000});
  assert.match(await text(page,'#flowAlert'),/sensor fisik.*tetap kosong.*tidak menggantikan raw sensor/i);
  assert.match(await text(page,'#latestVerdict'),/outage/i);
  await shot('04-outage-estimated-recovery');
  pass('explicit simulated recovery',{date:'2023-09-06',rawSensorPreserved:true,recoverySource:'estimated'});
  assert.match(await text(page,'#recoveryAction'),/Lihat recovery pada 6 Sep/i);
  await page.click('#recoveryAction');
  await page.waitForFunction(()=>document.getElementById('latestDate').textContent.trim()==='6 September 2023'&&document.querySelector('#latestLegend .recovery'));
  pass('confirmed recovery can be reopened',{date:'2023-09-06',repeatClick:true});

  await page.click('#resultLink');
  await page.waitForFunction(()=>!document.getElementById('resultContent').hidden);
  assert.match(await text(page,'#resultSimulationSummary'),/Recovery estimated aktif/i);
  assert.strictEqual(await page.locator('#resultTableBody tr').count(),48);
  accessibility.push(await accessibilityTree(context,page,'result-recovery'));
  await page.setViewportSize({width:390,height:844});
  layouts.push(await noOverflow(page,'result-mobile-390x844'));
  await shot('05-result-recovery-mobile');
  pass('result mobile layout',{viewport:'390x844',horizontalOverflow:false,rows:48});

  await page.goto(appUrl('predict.html'),{waitUntil:'domcontentloaded'});
  await page.setViewportSize({width:768,height:1024});await page.waitForFunction(()=>document.getElementById('systemStatus').classList.contains('is-online'));
  layouts.push(await noOverflow(page,'predict-tablet-768x1024'));await shot('06-predict-complete-tablet');
  await page.setViewportSize({width:390,height:844});layouts.push(await noOverflow(page,'predict-mobile-390x844'));await shot('07-predict-complete-mobile');
  pass('prediction responsive layouts',{tablet:'768x1024',mobile:'390x844',horizontalOverflow:false});

  await page.goto(appUrl('dashboard.html'),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('loadingLayer').hidden&&!document.getElementById('panelOverview').hidden,{timeout:30000});
  assert.strictEqual(await page.locator('#dayFile').count(),0);assert.strictEqual(await page.locator('#processDayButton').count(),0);
  assert.strictEqual(await page.locator('#daySelect option').count(),16);
  assert.strictEqual(await page.locator('.nav-links a.active').innerText(),'Dashboard');
  await page.setViewportSize({width:1366,height:768});layouts.push(await noOverflow(page,'dashboard-input-free-1366x768'));await shot('08-dashboard-history-not-input');
  assert.strictEqual(await page.locator('#dashboardDrawer').getAttribute('aria-hidden'),'true');
  await page.click('#dashboardMenuButton');
  assert.strictEqual(await page.locator('#dashboardDrawer').getAttribute('aria-hidden'),'false');
  assert.match(await text(page,'#runConsoleTitle'),/Replay test selesai/);
  assert.strictEqual(await page.locator('#dashboardDrawerClose').evaluate(element=>document.activeElement===element),true);
  layouts.push(await noOverflow(page,'dashboard-drawer-open-1366x768'));await shot('08a-dashboard-section-drawer');
  await page.click('#tabSensors');
  assert.strictEqual(await page.locator('#panelSensors').isHidden(),false);
  assert.strictEqual(await page.locator('#dashboardDrawer').getAttribute('aria-hidden'),'true');
  assert.strictEqual(await text(page,'#dashboardMenuLabel'),'Sensor Explorer');
  accessibility.push(await accessibilityTree(context,page,'dashboard-sensor-explorer'));
  await page.click('#dashboardMenuButton');
  await page.keyboard.press('Escape');
  assert.strictEqual(await page.locator('#dashboardMenuButton').evaluate(element=>document.activeElement===element),true);
  pass('dashboard responsibility and drawer navigation',{dateOptions:16,primaryInputControls:0,drawerKeyboard:true,focusReturned:true});
  await page.setViewportSize({width:390,height:844});
  layouts.push(await noOverflow(page,'dashboard-navbar-mobile-390x844'));
  await page.click('.nav-toggle');
  assert.strictEqual(await page.locator('.mobile-menu').evaluate(element=>element.classList.contains('open')),true);
  await shot('08b-dashboard-unified-navbar-mobile');
  await page.click('.nav-toggle');
  await page.click('#dashboardMenuButton');
  assert.strictEqual(await page.locator('#dashboardDrawer').getAttribute('aria-hidden'),'false');
  layouts.push(await noOverflow(page,'dashboard-drawer-mobile-390x844'));
  await shot('08c-dashboard-drawer-mobile');
  await page.keyboard.press('Escape');
  pass('dashboard product navigation is responsive',{viewport:'390x844',menuExpanded:true,horizontalOverflow:false});

  await page.goto(appUrl('predict.html'),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('replayCount').textContent.trim()==='16 / 16 hari');
  await page.click('#openResetButton');
  assert.strictEqual(await page.locator('#resetConfirmation').isHidden(),false);
  await page.click('#confirmResetButton');
  await page.waitForFunction(()=>document.getElementById('replayCount').textContent.trim()==='0 / 16 hari'&&document.getElementById('latestContent').hidden,{timeout:30000});
  assert.strictEqual((await(await fetch(`${API_URL}/health`)).json()).completed_days,0);
  await shot('09-explicit-reset-to-clean-state');
  pass('explicit demo reset',{completedDays:0,resultVisible:false,frozenArtifactsUntouched:true});

  await page.click('#processButton');
  await page.waitForFunction(()=>document.getElementById('replayCount').textContent.trim()==='1 / 16 hari'&&document.getElementById('processingPanel').hidden,{timeout:120000});
  assert.strictEqual(await text(page,'#latestDate'),'29 Agustus 2023');
  pass('replay remains usable after reset',{completedDays:1,date:'2023-08-29'});

  await page.goto(`${FRONTEND_URL}/predict.html?api=${encodeURIComponent('http://127.0.0.1:8999')}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.getElementById('flowAlert').hidden,{timeout:30000});
  assert.match(await text(page,'#flowAlert'),/tidak dapat dijangkau/i);assert.strictEqual(await page.locator('#latestContent').isHidden(),true);
  await shot('10-backend-failure-no-fallback');
  pass('backend failure remains fail-closed',{fakeResult:false,actionableMessage:true});

  const unexpected=consoleEvents.filter(item=>!(/Failed to load resource/.test(item.text)&&item.url.includes('8999')));
  assert.deepStrictEqual(unexpected,[],`Unexpected console events: ${JSON.stringify(unexpected)}`);
  const trace=path.join(runDir,'trace.zip');await context.tracing.stop({path:trace});
  await context.close();await browser.close();
  const manifest={status:'PASS',generatedAt:new Date().toISOString(),frontendUrl:FRONTEND_URL,apiUrl:API_URL,checks,screenshots,layouts,accessibility,networkEntries:network.length,consoleEvents,indexSha256:sha(path.join(ROOT,'index.html')),modelSha256:finalHealth.model_sha256,stateSha256:finalHealth.state_sha256,trace:{file:'trace.zip',sha256:sha(trace)}};
  fs.writeFileSync(path.join(runDir,'network.json'),JSON.stringify(network,null,2));
  fs.writeFileSync(path.join(runDir,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({status:'PASS',checks:checks.length,screenshots:screenshots.length,evidence:runDir,traceSha256:manifest.trace.sha256},null,2));
}

run().catch(error=>{console.error(error.stack||error);process.exit(1);});
