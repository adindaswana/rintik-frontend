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

async function run(){
  const runDir=path.join(EVIDENCE_ROOT,stamp());fs.mkdirSync(runDir,{recursive:true});
  const {chromium}=loadPlaywright();
  const browser=await chromium.connectOverCDP(CDP_URL);
  const context=await browser.newContext({viewport:{width:1440,height:900},locale:'id-ID',reducedMotion:'no-preference'});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  const page=await context.newPage();
  const checks=[],network=[],consoleEvents=[],screenshots=[],layouts=[];
  const pass=(check,evidence)=>checks.push({check,status:'PASS',evidence});
  const shot=async name=>{const file=name+'.png';await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);await page.screenshot({path:path.join(runDir,file),fullPage:true,animations:'disabled'});screenshots.push(file);return file;};
  page.on('response',response=>{if(response.url().startsWith(API_URL)||response.url().startsWith(FRONTEND_URL))network.push({method:response.request().method(),url:response.url(),status:response.status(),contentType:response.headers()['content-type']||null});});
  page.on('requestfailed',request=>network.push({method:request.method(),url:request.url(),status:'FAILED',failure:request.failure()}));
  page.on('console',message=>{if(['error','warning'].includes(message.type()))consoleEvents.push({type:message.type(),text:message.text(),url:page.url()});});
  page.on('pageerror',error=>consoleEvents.push({type:'pageerror',text:error.message,url:page.url()}));

  const initial=await(await fetch(`${API_URL}/health`)).json();
  assert.strictEqual(initial.ready,true);assert.strictEqual(initial.completed_days,0);assert.strictEqual(initial.model_sha256,MODEL_SHA);
  pass('isolated frozen baseline',{completedDays:0,modelSha256:initial.model_sha256});

  await page.goto(appUrl('predict.html'),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.getElementById('processButton').disabled,{timeout:30000});
  assert.strictEqual(await page.locator('input[type=file]').count(),0);
  assert.strictEqual(await page.getByText('Form Manual',{exact:false}).count(),0);
  assert.strictEqual(await text(page,'#replayCount'),'0 / 16 hari');
  layouts.push(await noOverflow(page,'predict-empty-1440x900'));
  pass('prediction workspace replaces file/manual input',{dailyMode:true,batchMode:true,fileInputs:0});

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
  await page.focus('#modeBatch');await page.keyboard.press('Enter');
  assert.strictEqual(await page.locator('#modeBatch').getAttribute('aria-selected'),'true');
  assert.match(await text(page,'#modeExplanation'),/tanggal satu per satu.*maksimal 15 hari/i);
  await page.click('#processButton');
  await page.waitForFunction(()=>document.getElementById('replayCount').textContent.trim()==='16 / 16 hari'&&document.getElementById('processingPanel').hidden,null,{timeout:240000});
  assert.strictEqual(await text(page,'#latestDate'),'13 September 2023');
  assert.strictEqual(await page.locator('#incidentList .incident-item').count(),3);
  assert.strictEqual(await page.locator('#recoveryAction').isHidden(),false);
  const finalHealth=await(await fetch(`${API_URL}/health`)).json();
  assert.strictEqual(finalHealth.completed_days,16);assert.strictEqual(finalHealth.archived_pred_internal_rows,734);
  await shot('03-batch-15-complete-with-fault-history');
  pass('batch mode is sequential daily persistence',{addedDays:15,totalDays:16,rows:734,incidents:3});

  await page.click('#recoveryAction');
  await page.waitForFunction(()=>document.getElementById('latestDate').textContent.trim()==='6 September 2023'&&document.querySelector('#latestLegend .recovery'),null,{timeout:60000});
  assert.match(await text(page,'#flowAlert'),/sensor fisik.*tetap kosong.*tidak menggantikan raw sensor/i);
  assert.match(await text(page,'#latestVerdict'),/outage/i);
  await shot('04-outage-estimated-recovery');
  pass('explicit simulated recovery',{date:'2023-09-06',rawSensorPreserved:true,recoverySource:'estimated'});

  await page.click('#resultLink');
  await page.waitForFunction(()=>!document.getElementById('resultContent').hidden);
  assert.match(await text(page,'#resultSimulationSummary'),/Recovery estimated aktif/i);
  assert.strictEqual(await page.locator('#resultTableBody tr').count(),48);
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
  assert.match(await text(page,'#runConsoleTitle'),/Replay test selesai/);
  await page.setViewportSize({width:1366,height:768});layouts.push(await noOverflow(page,'dashboard-input-free-1366x768'));await shot('08-dashboard-history-not-input');
  pass('dashboard responsibility is history/exploration',{dateOptions:16,primaryInputControls:0});

  await page.goto(`${FRONTEND_URL}/predict.html?api=${encodeURIComponent('http://127.0.0.1:8999')}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.getElementById('flowAlert').hidden,{timeout:30000});
  assert.match(await text(page,'#flowAlert'),/tidak dapat dijangkau/i);assert.strictEqual(await page.locator('#latestContent').isHidden(),true);
  await shot('09-backend-failure-no-fallback');
  pass('backend failure remains fail-closed',{fakeResult:false,actionableMessage:true});

  const unexpected=consoleEvents.filter(item=>!(/Failed to load resource/.test(item.text)&&item.url.includes('8999')));
  assert.deepStrictEqual(unexpected,[],`Unexpected console events: ${JSON.stringify(unexpected)}`);
  const trace=path.join(runDir,'trace.zip');await context.tracing.stop({path:trace});
  await context.close();await browser.close();
  const manifest={status:'PASS',generatedAt:new Date().toISOString(),frontendUrl:FRONTEND_URL,apiUrl:API_URL,checks,screenshots,layouts,networkEntries:network.length,consoleEvents,indexSha256:sha(path.join(ROOT,'index.html')),modelSha256:finalHealth.model_sha256,stateSha256:finalHealth.state_sha256,trace:{file:'trace.zip',sha256:sha(trace)}};
  fs.writeFileSync(path.join(runDir,'network.json'),JSON.stringify(network,null,2));
  fs.writeFileSync(path.join(runDir,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({status:'PASS',checks:checks.length,screenshots:screenshots.length,evidence:runDir,traceSha256:manifest.trace.sha256},null,2));
}

run().catch(error=>{console.error(error.stack||error);process.exit(1);});
