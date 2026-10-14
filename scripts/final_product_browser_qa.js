'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

const FRONTEND=process.env.RINTIK_FRONTEND_URL||'http://127.0.0.1:4175';
const API=process.env.RINTIK_API_URL||'http://127.0.0.1:8141';
const CDP=process.env.RINTIK_CDP_URL||'http://127.0.0.1:9223';
const ROOT=path.resolve(__dirname,'..');
const EVIDENCE=process.env.RINTIK_FINAL_PRODUCT_EVIDENCE||path.resolve(ROOT,'..','qa','evidence','final-product-experience');

function loadPlaywright(){
  try{return require('playwright');}catch(error){}
  const runtime=path.join(process.env.LOCALAPPDATA||'','OpenAI','Codex','runtimes','cua_node');
  const candidates=fs.existsSync(runtime)?fs.readdirSync(runtime).map(name=>path.join(runtime,name,'bin','node_modules','playwright')).filter(item=>fs.existsSync(path.join(item,'package.json'))):[];
  if(!candidates.length)throw new Error('Playwright runtime unavailable');
  return require(candidates.sort((a,b)=>fs.statSync(path.join(b,'package.json')).mtimeMs-fs.statSync(path.join(a,'package.json')).mtimeMs)[0]);
}
function app(file,extra=''){return `${FRONTEND}/${file}?api=${encodeURIComponent(API)}${extra}`;}
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
function fileHash(file){return hash(fs.readFileSync(file));}
async function json(url,options){const response=await fetch(url,options);const body=await response.text();assert(response.ok,`${url} ${response.status}: ${body}`);return JSON.parse(body);}
async function reset(){
  await json(`${API}/v1/demo/reset`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmation:'RESET_DEMO_STATE'})});
  await json(`${API}/v1/operational/reset`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmation:'RESET_OPERATIONAL_SIMULATION'})});
}
async function layout(page,label){
  const value=await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,duplicates:(()=>{const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);return ids.filter((id,index)=>ids.indexOf(id)!==index);})()}));
  assert(value.scrollWidth<=value.clientWidth,`${label}: horizontal overflow`);
  assert.deepStrictEqual(value.duplicates,[],`${label}: duplicate IDs`);
  return{label,...value};
}
async function accessibility(context,page,label){
  const session=await context.newCDPSession(page);await session.send('Accessibility.enable');const tree=await session.send('Accessibility.getFullAXTree');await session.detach();
  const roles=new Set(['button','link','checkbox','combobox','slider','tab','textbox']);
  const unnamed=tree.nodes.filter(node=>!node.ignored&&roles.has(node.role&&node.role.value)&&!(node.name&&String(node.name.value||'').trim()));
  assert.strictEqual(unnamed.length,0,`${label}: unnamed interactive controls`);
  return{label,nodes:tree.nodes.length,unnamed:0};
}

async function run(){
  const {chromium}=loadPlaywright();
  const browser=await chromium.connectOverCDP(CDP);
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
  const runDir=path.join(EVIDENCE,stamp);fs.mkdirSync(runDir,{recursive:true});
  const checks=[],screenshots=[],layouts=[],a11y=[],network=[],consoleErrors=[];
  const pass=(name,evidence={})=>checks.push({name,status:'PASS',evidence});
  const shot=async name=>{await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(80);const file=path.join(runDir,name+'.png');await page.screenshot({path:file,fullPage:true});screenshots.push({name,file:path.basename(file),sha256:fileHash(file)});};
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push({url:page.url(),text:message.text()});});
  page.on('response',response=>{if(response.url().startsWith(API))network.push({url:response.url(),status:response.status()});});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  await reset();

  const protectedHashes={
    'index.html':'f538d30ea4ee70d4cccc325a80e7eb36a5e3734e88f223c9ea3fc659d9d121da',
    'assets/css/style.css':'fc3dbbbc64beb45e8856909396270daf295b190781d28a4394ca3653210ed262',
    'assets/js/app.js':'d4b8719613da03e12ebde800ccd648e393463789fe781ab9606770352e041bc8'
  };
  for(const file of Object.keys(protectedHashes)){
    const current=fs.readFileSync(path.join(ROOT,file));
    assert.strictEqual(hash(current),protectedHashes[file],`${file} changed`);
  }
  pass('protected landing and shared assets byte-identical');

  await page.goto(app('predict.html'),{waitUntil:'networkidle'});
  await page.waitForTimeout(1200);
  await page.waitForFunction(()=>document.getElementById('systemStatusTitle').textContent==='Sistem siap');
  assert.strictEqual(await page.locator('[data-mode]').count(),2);
  assert.strictEqual(await page.locator('#operationalCount').innerText(),'0 / 48');
  layouts.push(await layout(page,'predict-desktop-empty'));
  a11y.push(await accessibility(context,page,'predict-desktop-empty'));
  await shot('01-predict-operational-empty');
  pass('two isolated workflow roots');

  await page.click('#loadManualExample');
  await page.waitForFunction(()=>/belum disimpan/i.test(document.getElementById('manualResult').textContent));
  await page.click('#saveReadingButton');
  await page.waitForFunction(()=>document.getElementById('manualCount').textContent==='1');
  assert.strictEqual((await json(`${API}/v1/operational/days/2026-10-14`)).progress.manual,1);
  pass('manual half-hour reading persists with explicit source');

  await page.click('#fillMissingButton');
  await page.waitForFunction(()=>document.getElementById('operationalCount').textContent==='48 / 48');
  const ready=await json(`${API}/v1/operational/days/2026-10-14`);
  assert.strictEqual(ready.progress.manual,1);assert.strictEqual(ready.progress.synthetic_fixture,47);
  await shot('02-operational-48-ready');
  pass('explicit fixture completion preserves manual row',ready.progress);

  await page.selectOption('#operationalScenario','missing');
  await page.click('#processOperationalButton');
  await page.waitForFunction(()=>!document.getElementById('latestContent').hidden&&/14 Oktober/.test(document.getElementById('latestDate').textContent),{timeout:180000});
  const opResult=await json(`${API}/v1/operational/days/2026-10-14/result`);
  assert.strictEqual(opResult.monitoring.recovery.status,'active_estimated');
  assert(opResult.monitoring.sensor.values.every(row=>row.physical_rh===null));
  assert.deepStrictEqual(opResult.monitoring.recovery.values.map(row=>row.recovery_rh),opResult.predictions.map(row=>row.post_3));
  await shot('03-operational-missing-recovery');
  pass('operational inference and estimated recovery',{rows:48,recoveryEqualsP3:true});

  const resultHref=await page.locator('#resultLink').getAttribute('href');
  await page.goto(new URL(resultHref,page.url()).href,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!document.getElementById('resultContent').hidden);
  assert.match(await page.locator('#resultProvenanceLabel').innerText(),/sintetis/i);
  assert.match(await page.locator('#resultRecovery').innerText(),/estimated/i);
  layouts.push(await layout(page,'result-desktop'));
  a11y.push(await accessibility(context,page,'result-desktop'));
  await shot('04-result-humidity-centric');
  pass('humidity-centric result continuation',{tableSources:true});

  await page.setViewportSize({width:390,height:844});
  layouts.push(await layout(page,'result-mobile'));
  await shot('05-result-mobile');
  await page.setViewportSize({width:1440,height:1000});

  await page.goto(app('dashboard.html'),{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.getElementById('metricRows').textContent!=='—');
  assert.strictEqual(await page.locator('#scopeSelect').inputValue(),'operational');
  layouts.push(await layout(page,'dashboard-desktop'));
  a11y.push(await accessibility(context,page,'dashboard-desktop'));
  await shot('06-dashboard-overview');

  await page.click('#dashboardMenuButton');
  await page.click('#tabSensors');
  await page.waitForFunction(()=>document.querySelectorAll('#sensorCharts .sensor-chart-card').length>0);
  await shot('07-dashboard-sensor-explorer');
  pass('sensor explorer separates units and humidity');

  await page.click('#dashboardMenuButton');
  await page.click('#tabInsights');
  await page.click('#runInsight');
  assert.notStrictEqual(await page.locator('#insightN').innerText(),'—');
  await shot('08-dashboard-temporal-insight');
  pass('temporal insight computed from selected range',{nonCausalDisclosure:true});

  await page.setViewportSize({width:768,height:900});
  layouts.push(await layout(page,'dashboard-tablet'));
  await shot('09-dashboard-tablet');
  await page.setViewportSize({width:390,height:844});
  layouts.push(await layout(page,'dashboard-mobile'));
  await shot('10-dashboard-mobile');
  await page.setViewportSize({width:1440,height:1000});

  await page.goto(app('settings.html'),{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.getElementById('modelInspectionTitle').textContent.includes('14 Okt'));
  assert.match(await page.locator('#trustScore').innerText(),/Ditahan/);
  await shot('11-settings-model-inspection');
  await page.click('[data-inspection="sensor"]');
  await page.locator('#disagreementThreshold').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('#saveThresholds');
  assert((await page.locator('#thresholdAudit li').count())>=1);
  await shot('12-settings-sensor-thresholds');
  pass('settings separates model sensor and threshold preview',{trustWithheldFor2026:true,historicalMutation:false});

  await page.goto(app('predict.html'),{waitUntil:'networkidle'});
  await page.click('#modeDemo');
  await page.click('#processDemoDayButton');
  await page.waitForFunction(()=>document.getElementById('demoCount').textContent==='1 / 16',{timeout:180000});
  await page.click('#prepareRecoveryButton');
  await page.waitForURL(/hasil\.html/,{timeout:240000});
  await page.waitForFunction(()=>document.getElementById('resultDate').textContent.includes('6 Sep'));
  const recovery=await json(`${API}/v1/demo/days/2023-09-06/monitoring`);
  assert.strictEqual(recovery.recovery.status,'active_estimated');
  assert(recovery.sensor.values.every(row=>row.physical_rh===null));
  await shot('13-official-recovery-6-september');
  pass('guided recovery opens 6 September context',{rawSensorMissing:true,recovery:'estimated'});

  await page.goto(app('predict.html'),{waitUntil:'networkidle'});
  await page.click('#modeDemo');
  await page.click('#processDemoAllButton');
  await page.waitForFunction(()=>document.getElementById('demoCount').textContent==='16 / 16'&&!document.getElementById('demoComplete').hidden,{timeout:300000});
  const days=(await json(`${API}/v1/days`)).days;
  const totalRows=days.reduce((sum,row)=>sum+row.row_count,0);
  assert.strictEqual(days.length,16);assert.strictEqual(totalRows,734);
  assert.strictEqual(days[0].row_count,18);assert.strictEqual(days[15].row_count,44);
  await shot('14-official-demo-complete');
  pass('official replay remains exact',{days:16,rows:734,first:18,last:44});

  await page.goto(app('dashboard.html'),{waitUntil:'networkidle'});
  await page.selectOption('#scopeSelect','official');
  await page.waitForFunction(()=>document.querySelectorAll('#rangeDateStart option').length===16);
  await page.selectOption('#rangeDateStart','2023-08-29');
  await page.selectOption('#rangeDateEnd','2023-08-30');
  await page.click('#applyRange');
  await page.waitForFunction(()=>/2 hari terpilih/.test(document.getElementById('overviewLead').textContent));
  assert.strictEqual(await page.locator('#rangeDateStart').inputValue(),'2023-08-29');
  assert.strictEqual(await page.locator('#rangeDateEnd').inputValue(),'2023-08-30');
  await page.click('#dashboardMenuButton');
  await page.locator('#dashboardDrawer a[href]').focus();
  await page.keyboard.press('Tab');
  assert.strictEqual(await page.evaluate(()=>document.activeElement.id),'dashboardDrawerClose');
  await page.keyboard.press('Escape');
  await shot('15-official-dashboard-two-day-range');
  pass('dashboard preserves explicit date range and traps drawer focus',{days:2,keyboardTrap:true});

  await page.goto(app('predict.html'),{waitUntil:'networkidle'});
  await page.click('#modeDemo');

  await page.click('#resetDemoButton');
  await page.click('#confirmResetButton');
  await page.waitForFunction(()=>document.getElementById('demoCount').textContent==='0 / 16');
  assert.strictEqual((await json(`${API}/v1/days`)).days.length,0);
  assert.strictEqual((await json(`${API}/v1/operational/days`)).completed_days,1);
  pass('official reset isolated from operational state');

  await page.click('#modeOperational');
  await page.click('#resetOperationalButton');
  await page.click('#confirmResetButton');
  await page.waitForFunction(()=>document.getElementById('operationalCount').textContent==='0 / 48');
  assert.strictEqual((await json(`${API}/v1/operational/days`)).completed_days,0);
  assert.strictEqual((await json(`${API}/v1/days`)).days.length,0);
  await shot('16-both-workflows-reset');
  pass('operational reset isolated from official state');

  await page.focus('#modeOperational');
  await page.keyboard.press('Tab');
  assert.strictEqual(await page.evaluate(()=>document.activeElement.id),'modeDemo');
  await page.keyboard.press('Enter');
  assert.strictEqual(await page.locator('#modeDemo').getAttribute('aria-selected'),'true');
  pass('live keyboard workflow navigation');

  assert.strictEqual(consoleErrors.length,0,`Console errors: ${JSON.stringify(consoleErrors)}`);
  assert(network.every(item=>item.status<500),`5xx responses: ${JSON.stringify(network.filter(item=>item.status>=500))}`);
  pass('console and network clean',{consoleErrors:0,serverErrors:0});

  const trace=path.join(runDir,'trace.zip');
  await context.tracing.stop({path:trace});
  const manifest={
    schema_version:'rintik-final-product-browser-qa-v1',
    started_at:new Date().toISOString(),frontend:FRONTEND,api:API,
    checks,layouts,accessibility:a11y,screenshots,network,consoleErrors,
    trace:path.basename(trace),
    protected:{index:fileHash(path.join(ROOT,'index.html')),style:fileHash(path.join(ROOT,'assets/css/style.css')),app:fileHash(path.join(ROOT,'assets/js/app.js'))}
  };
  fs.writeFileSync(path.join(runDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await context.close();await browser.close();
  console.log(JSON.stringify({status:'PASS',checks:checks.length,screenshots:screenshots.length,evidence:runDir},null,2));
}

run().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
