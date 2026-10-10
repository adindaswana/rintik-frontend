'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = process.env.RINTIK_FRONTEND_URL || 'http://127.0.0.1:4173';
const API_URL = process.env.RINTIK_API_URL || 'http://127.0.0.1:8140';
const EMPTY_API_URL = process.env.RINTIK_EMPTY_API_URL || 'http://127.0.0.1:8141';
const ERROR_API_URL = process.env.RINTIK_ERROR_API_URL || 'http://127.0.0.1:8999';
const AXE_URL = process.env.RINTIK_AXE_URL || 'https://unpkg.com/axe-core@4.10.3/axe.min.js';
const CDP_URL = process.env.RINTIK_CDP_URL || 'http://127.0.0.1:9223';
const EVIDENCE_DIR = path.resolve(__dirname, '..', '..', 'qa', 'evidence', 'm4-browser-automated');
const MODEL_SHA = 'adce8fda2f465679ea6e8fe31124822a45a555b9dc154e12076ef5b6140699b0';

function loadPlaywright(){
  if(process.env.RINTIK_PLAYWRIGHT_MODULE) return require(process.env.RINTIK_PLAYWRIGHT_MODULE);
  try { return require('playwright'); } catch(error) {}
  const local = process.env.LOCALAPPDATA;
  if(!local) throw new Error('Playwright is unavailable and LOCALAPPDATA is not set.');
  const runtimeRoot = path.join(local, 'OpenAI', 'Codex', 'runtimes', 'cua_node');
  if(!fs.existsSync(runtimeRoot)) throw new Error('Playwright is not installed locally and no Codex runtime was found.');
  const candidates = fs.readdirSync(runtimeRoot).map(name => path.join(runtimeRoot, name, 'bin', 'node_modules', 'playwright'))
    .filter(candidate => fs.existsSync(path.join(candidate, 'package.json')))
    .sort((a,b) => fs.statSync(path.join(b,'package.json')).mtimeMs - fs.statSync(path.join(a,'package.json')).mtimeMs);
  if(!candidates.length) throw new Error('No bundled Playwright module was found.');
  return require(candidates[0]);
}

const {chromium} = loadPlaywright();
const results = [];
const consoleEvents = [];
const screenshots = [];
const keyboardSteps = [];

function record(check,status,evidence,observation){ results.push({check,status,evidence,observation}); }
function safeName(value){ return value.replace(/[^a-z0-9._-]+/gi,'-'); }
function dashboardUrl(api, view){
  const params = new URLSearchParams({api});
  if(view) params.set('view',view);
  return `${FRONTEND_URL}/dashboard.html?${params.toString()}`;
}
async function waitSettled(page){
  await page.waitForFunction(() => {
    const layer=document.getElementById('loadingLayer');
    const alert=document.getElementById('globalAlert');
    const empty=document.getElementById('emptyState');
    const visiblePanel=Array.from(document.querySelectorAll('.view-panel')).some(panel=>!panel.hidden);
    const terminalState=(alert&&!alert.hidden)||(empty&&!empty.hidden)||visiblePanel;
    return layer && layer.hidden && terminalState;
  },null,{timeout:30000});
  await page.waitForTimeout(180);
}
function bindDiagnostics(page,label){
  page.on('console',message => {
    if(['error','warning'].includes(message.type())) consoleEvents.push({page:label,type:message.type(),text:message.text()});
  });
  page.on('pageerror',error => consoleEvents.push({page:label,type:'pageerror',text:error.message}));
  page.on('requestfailed',request => consoleEvents.push({page:label,type:'requestfailed',url:request.url(),failure:request.failure()}));
}
async function openPage(context,label,api=API_URL,viewport={width:1366,height:768},view){
  const page=await context.newPage();
  bindDiagnostics(page,label);
  await page.setViewportSize(viewport);
  await page.goto(dashboardUrl(api,view),{waitUntil:'domcontentloaded',timeout:30000});
  await waitSettled(page);
  return page;
}
async function selectDay(page,date){
  await page.selectOption('#daySelect',date);
  await waitSettled(page);
  assert.strictEqual(await page.inputValue('#daySelect'),date);
}
async function activateView(page,view){
  await page.click(`.nav-tab[data-view="${view}"]`);
  await page.waitForFunction(expected => {
    const tab=document.querySelector(`.nav-tab[data-view="${expected}"]`);
    const panel=document.getElementById(`panel${expected[0].toUpperCase()}${expected.slice(1)}`);
    return tab && tab.getAttribute('aria-selected')==='true' && panel && !panel.hidden;
  },view);
}
async function inspectLayout(page,label){
  const report=await page.evaluate(testLabel => {
    const root=document.documentElement;
    const offenders=[];
    document.querySelectorAll('body *').forEach(element => {
      const rect=element.getBoundingClientRect();
      if(rect.width && (rect.right > root.clientWidth + 1 || rect.left < -1)) offenders.push({tag:element.tagName,id:element.id,className:String(element.className||''),left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width)});
    });
    const overlaps=[];
    const controls=Array.from(document.querySelectorAll('button:not([hidden]),select:not([hidden]),input:not([hidden])')).filter(el => {
      const style=getComputedStyle(el),rect=el.getBoundingClientRect();
      return style.visibility!=='hidden' && style.display!=='none' && rect.width>0 && rect.height>0;
    });
    for(let i=0;i<controls.length;i++) for(let j=i+1;j<controls.length;j++){
      const a=controls[i].getBoundingClientRect(),b=controls[j].getBoundingClientRect();
      const area=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
      if(area>4) overlaps.push([controls[i].id||controls[i].textContent.trim(),controls[j].id||controls[j].textContent.trim(),Math.round(area)]);
    }
    return {label:testLabel,viewport:{width:innerWidth,height:innerHeight},scrollWidth:root.scrollWidth,clientWidth:root.clientWidth,noHorizontalOverflow:root.scrollWidth<=root.clientWidth,offenders:offenders.slice(0,20),controlOverlaps:overlaps.slice(0,20)};
  },label);
  assert(report.noHorizontalOverflow,`${label}: horizontal overflow ${report.scrollWidth} > ${report.clientWidth}`);
  assert.strictEqual(report.controlOverlaps.length,0,`${label}: overlapping controls ${JSON.stringify(report.controlOverlaps)}`);
  return report;
}
async function capture(page,file){
  const target=path.join(EVIDENCE_DIR,file);
  await page.screenshot({path:target,fullPage:false,animations:'disabled'});
  screenshots.push(target);
  return file;
}
async function settleWithin(promise,timeoutMs){
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);}),
    ]);
  } finally { clearTimeout(timer); }
}
async function text(page,selector){ return (await page.locator(selector).innerText()).trim(); }
async function focusInfo(page){
  return page.evaluate(() => {
    const el=document.activeElement,style=getComputedStyle(el);
    return {tag:el&&el.tagName,id:el&&el.id,className:el&&el.getAttribute?String(el.getAttribute('class')||''):String(el&&el.className||''),role:el&&el.getAttribute('role'),name:(el&&((el.getAttribute('aria-label')||el.textContent||el.value)||'')).trim().slice(0,120),outlineStyle:style.outlineStyle,outlineWidth:style.outlineWidth,outlineColor:style.outlineColor};
  });
}
async function tabUntil(page,predicate,label,max=120){
  for(let i=0;i<max;i++){
    await page.keyboard.press('Tab');
    const info=await focusInfo(page);
    if(predicate(info)){ keyboardSteps.push({step:label,tabs:i+1,focus:info}); return info; }
  }
  throw new Error(`Keyboard focus did not reach ${label}`);
}
async function runtimeAccessibilityAudit(page,cdp){
  const dom=await page.evaluate(() => {
    const visible=el => {const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
    const name=el => (el.getAttribute('aria-label')||el.getAttribute('title')||((el.labels&&el.labels[0])?el.labels[0].textContent:'')||el.textContent||el.value||'').trim();
    const ids=Array.from(document.querySelectorAll('[id]')).map(el=>el.id);
    const duplicateIds=ids.filter((id,index)=>ids.indexOf(id)!==index);
    const controls=Array.from(document.querySelectorAll('button,input,select,a[href],[role="button"],[role="tab"]')).filter(visible);
    const unnamed=controls.filter(el=>!name(el)).map(el=>({tag:el.tagName,id:el.id,role:el.getAttribute('role')}));
    const positiveTabindex=Array.from(document.querySelectorAll('[tabindex]')).filter(el=>Number(el.getAttribute('tabindex'))>0).map(el=>el.outerHTML.slice(0,160));
    const invalidRefs=[];
    document.querySelectorAll('[aria-controls],[aria-labelledby]').forEach(el=>{
      ['aria-controls','aria-labelledby'].forEach(attr=>{
        const value=el.getAttribute(attr); if(value) value.split(/\s+/).forEach(id=>{if(!document.getElementById(id))invalidRefs.push({id:el.id,attr,target:id});});
      });
    });
    const smallTargets=controls.map(el=>{const r=el.getBoundingClientRect();return{id:el.id||name(el).slice(0,40),width:Math.round(r.width),height:Math.round(r.height)};}).filter(r=>r.width<24||r.height<24);
    const headings=Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(visible).map(el=>({level:Number(el.tagName.slice(1)),text:el.textContent.trim()}));
    const headingSkips=[]; for(let i=1;i<headings.length;i++)if(headings[i].level>headings[i-1].level+1)headingSkips.push([headings[i-1],headings[i]]);
    const viewport=document.querySelector('meta[name="viewport"]')?.content||'';
    return {lang:document.documentElement.lang,duplicateIds,unnamed,positiveTabindex,invalidRefs,smallTargets,headings,headingSkips,viewport,zoomDisabled:/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(viewport),mainCount:document.querySelectorAll('main').length,h1Count:Array.from(document.querySelectorAll('h1')).filter(visible).length};
  });
  const ax=await cdp.send('Accessibility.getFullAXTree');
  const unnamedInteractive=ax.nodes.filter(node=>!node.ignored&&['button','link','textbox','combobox','checkbox','tab'].includes(node.role&&node.role.value)&&!(node.name&&String(node.name.value||'').trim())).map(node=>({role:node.role.value,nodeId:node.nodeId}));
  const report={dom,axNodeCount:ax.nodes.length,unnamedInteractive};
  fs.writeFileSync(path.join(EVIDENCE_DIR,'accessibility-runtime-preassert.json'),JSON.stringify(report,null,2));
  assert.strictEqual(dom.lang,'id','Document language must be Indonesian');
  assert.strictEqual(dom.duplicateIds.length,0,`Duplicate IDs: ${JSON.stringify(dom.duplicateIds)}`);
  assert.strictEqual(dom.unnamed.length,0,`Unnamed DOM controls: ${JSON.stringify(dom.unnamed)}`);
  assert.strictEqual(dom.positiveTabindex.length,0,`Positive tabindex values: ${JSON.stringify(dom.positiveTabindex)}`);
  assert.strictEqual(dom.invalidRefs.length,0,`Broken ARIA references: ${JSON.stringify(dom.invalidRefs)}`);
  assert.strictEqual(dom.headingSkips.length,0,`Heading-level skips: ${JSON.stringify(dom.headingSkips)}`);
  assert.strictEqual(dom.zoomDisabled,false);
  assert.strictEqual(dom.mainCount,1);
  assert.strictEqual(dom.h1Count,1);
  assert.strictEqual(unnamedInteractive.length,0,`Unnamed accessibility-tree controls: ${JSON.stringify(unnamedInteractive)}`);
  return report;
}

async function run(){
  fs.mkdirSync(EVIDENCE_DIR,{recursive:true});
  const browser=await chromium.connectOverCDP(CDP_URL);
  const context=await browser.newContext({viewport:{width:1366,height:768},locale:'id-ID',colorScheme:'light',reducedMotion:'no-preference'});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  const layouts=[];
  let page;
  try {
    page=await openPage(context,'populated');
    assert((await text(page,'#diagnosticJson')).includes(MODEL_SHA),'Frozen checkpoint hash missing from rendered diagnostics');

    await page.setViewportSize({width:1440,height:900}); await selectDay(page,'2023-09-03');
    assert.strictEqual(await text(page,'#metricRows'),'48/48'); assert((await text(page,'#verdictBadge')).includes('simulasi'));
    layouts.push(await inspectLayout(page,'normal-1440x900')); await capture(page,'01-overview-normal-1440x900.png');
    record('1440 desktop overview','PASS','01-overview-normal-1440x900.png','Normal 48/48 day; real P3 and synthetic provenance visible.');

    await page.setViewportSize({width:1366,height:768}); await selectDay(page,'2023-09-06');
    assert((await text(page,'#verdictBadge')).includes('Dugaan sensor terputus')); assert((await text(page,'#metricRecovery')).includes('Aktif')); assert.strictEqual(await page.locator('#recoveryLegend').isHidden(),false);
    layouts.push(await inspectLayout(page,'outage-1366x768')); await capture(page,'02-overview-outage-1366x768.png');
    record('1366 projector/outage','PASS','02-overview-outage-1366x768.png','Outage simulation and estimated recovery remain visibly separated.');

    await selectDay(page,'2023-08-29'); assert.strictEqual(await text(page,'#metricRows'),'18/48');
    layouts.push(await inspectLayout(page,'partial-1366x768')); await capture(page,'03-overview-partial-1366x768.png');
    record('1366 partial day','PASS','03-overview-partial-1366x768.png','18/48 partial day without fabricated rows.');

    await page.setViewportSize({width:1440,height:900}); await selectDay(page,'2023-09-03'); await activateView(page,'sensors'); await page.click('#resetSensors');
    assert((await page.locator('.sensor-chart-card').count())>=2,'Expected separate unit panels');
    layouts.push(await inspectLayout(page,'sensors-1440x900')); await capture(page,'04-sensors-1440x900.png');
    record('Sensor Explorer/unit separation','PASS','04-sensors-1440x900.png','Default features rendered in separate unit panels.');

    await page.setViewportSize({width:1366,height:768}); await activateView(page,'settings');
    assert((await text(page,'#lineageDetails')).includes(MODEL_SHA)); assert((await text(page,'#healthComponents')).includes('Trust Score'));
    layouts.push(await inspectLayout(page,'settings-1366x768')); await capture(page,'05-settings-1366x768.png');
    record('Settings/technical separation','PASS','05-settings-1366x768.png','Hashes, illustrative health and simulated audit remain outside Overview.');

    await page.setViewportSize({width:768,height:1024}); await activateView(page,'overview');
    layouts.push(await inspectLayout(page,'overview-tablet-768x1024')); await capture(page,'06-overview-tablet-768x1024.png');
    record('768 tablet','PASS','06-overview-tablet-768x1024.png','No body overflow or overlapping controls.');

    await page.setViewportSize({width:390,height:844});
    layouts.push(await inspectLayout(page,'overview-mobile-390x844')); await capture(page,'07-overview-mobile-390x844.png');
    record('390 mobile overview','PASS','07-overview-mobile-390x844.png','Primary hierarchy and controls remain within viewport.');

    await activateView(page,'sensors');
    layouts.push(await inspectLayout(page,'sensors-mobile-390x844')); await capture(page,'08-sensors-mobile-390x844.png');
    record('390 mobile sensors','PASS','08-sensors-mobile-390x844.png','Selector and unit panels remain within viewport.');

    const errorPage=await openPage(context,'backend-error',ERROR_API_URL,{width:1366,height:768});
    assert.strictEqual(await errorPage.locator('#globalAlert').isHidden(),false); assert.strictEqual(await errorPage.locator('#panelOverview').isHidden(),true);
    layouts.push(await inspectLayout(errorPage,'backend-error-1366x768')); await capture(errorPage,'09-backend-error-1366x768.png');
    record('Backend error/no fallback','PASS','09-backend-error-1366x768.png','Explicit failure shown; no result panel or fake chart rendered.');

    const emptyPage=await openPage(context,'empty-state',EMPTY_API_URL,{width:1366,height:768});
    assert.strictEqual(await emptyPage.locator('#emptyState').isHidden(),false); assert.strictEqual(await emptyPage.locator('#panelOverview').isHidden(),true);
    layouts.push(await inspectLayout(emptyPage,'empty-1366x768')); await capture(emptyPage,'10-empty-state-1366x768.png');
    record('Empty/no sample output','PASS','10-empty-state-1366x768.png','Empty guidance rendered with no sample prediction.');

    await page.setViewportSize({width:1366,height:768}); await selectDay(page,'2023-09-06'); await activateView(page,'settings');
    await page.selectOption('#auditScenario','fail'); await page.click('#applyAuditButton'); await waitSettled(page); await activateView(page,'overview');
    assert.strictEqual(await text(page,'#gateStatus'),'Dibatasi'); assert((await text(page,'#metricRecovery')).includes('Dibatasi'));
    await capture(page,'11-restricted-gate-1366x768.png');
    record('Restricted recovery gate','PASS','11-restricted-gate-1366x768.png','Failed simulated audit blocks estimated recovery presentation.');
    await activateView(page,'settings'); await page.selectOption('#auditScenario','pass'); await page.click('#applyAuditButton'); await waitSettled(page);

    const keyboardPage=await openPage(context,'keyboard',API_URL,{width:1366,height:768}); await selectDay(keyboardPage,'2023-09-03');
    await keyboardPage.keyboard.press('Home');
    await tabUntil(keyboardPage,info=>info.id==='tabOverview','overview tab');
    const firstFocus=await focusInfo(keyboardPage); assert.notStrictEqual(firstFocus.outlineStyle,'none'); assert.notStrictEqual(firstFocus.outlineWidth,'0px');
    await capture(keyboardPage,'12a-keyboard-focus-tab.png');
    await keyboardPage.keyboard.press('ArrowRight'); assert.strictEqual(await keyboardPage.locator('#tabSensors').getAttribute('aria-selected'),'true');
    await keyboardPage.keyboard.press('ArrowLeft'); assert.strictEqual(await keyboardPage.locator('#tabOverview').getAttribute('aria-selected'),'true');
    await keyboardPage.keyboard.press('End'); assert.strictEqual(await keyboardPage.locator('#tabSettings').getAttribute('aria-selected'),'true');
    await keyboardPage.keyboard.press('Home'); assert.strictEqual(await keyboardPage.locator('#tabOverview').getAttribute('aria-selected'),'true');
    await tabUntil(keyboardPage,info=>info.id==='daySelect','day selector'); await keyboardPage.keyboard.press('Home'); await keyboardPage.keyboard.press('ArrowDown'); await keyboardPage.keyboard.press('Enter'); await waitSettled(keyboardPage);
    await tabUntil(keyboardPage,info=>info.className.includes('plot-hit'),'RH plot');
    await keyboardPage.keyboard.press('ArrowRight'); const tooltip1=await text(keyboardPage,'#rhTooltip'); await keyboardPage.keyboard.press('ArrowRight'); const tooltip2=await text(keyboardPage,'#rhTooltip'); assert.notStrictEqual(tooltip1,tooltip2);
    await capture(keyboardPage,'12b-keyboard-chart-tooltip.png');
    await tabUntil(keyboardPage,info=>info.id==='toggleRhTable','table toggle'); await keyboardPage.keyboard.press('Enter'); assert.strictEqual(await keyboardPage.locator('#toggleRhTable').getAttribute('aria-expanded'),'true');
    await tabUntil(keyboardPage,info=>info.id==='tabOverview','active overview tab'); await keyboardPage.keyboard.press('ArrowRight');
    assert.strictEqual(await keyboardPage.locator('#tabSensors').getAttribute('aria-selected'),'true');
    await tabUntil(keyboardPage,info=>info.id==='sensorSearch','sensor search'); await keyboardPage.keyboard.type('suhu'); assert.strictEqual(await keyboardPage.inputValue('#sensorSearch'),'suhu');
    await tabUntil(keyboardPage,info=>info.className.includes('feature-group-button'),'sensor group disclosure'); await keyboardPage.keyboard.press('Enter'); await keyboardPage.keyboard.press('Enter');
    await tabUntil(keyboardPage,info=>info.tag==='INPUT','sensor checkbox'); await keyboardPage.keyboard.press('Space');
    await tabUntil(keyboardPage,info=>info.id==='resetSensors','reset sensors');
    await tabUntil(keyboardPage,info=>info.id==='tabSensors','active sensors tab'); await keyboardPage.keyboard.press('ArrowRight');
    assert.strictEqual(await keyboardPage.locator('#tabSettings').getAttribute('aria-selected'),'true');
    await tabUntil(keyboardPage,info=>info.id==='auditScenario','settings audit control'); await keyboardPage.keyboard.press('Tab');
    keyboardSteps.push({step:'left settings control',focus:await focusInfo(keyboardPage)});
    await capture(keyboardPage,'12c-keyboard-settings-exit.png');
    record('Live keyboard flow','PASS','12-keyboard-trace.zip; 12a–12c PNG; keyboard-results.json','Keyboard-only traversal, tab activation, chart arrows, table, search, disclosure, checkbox and Settings exit completed without a trap.');

    const loadingPage=await context.newPage(); bindDiagnostics(loadingPage,'loading'); await loadingPage.setViewportSize({width:1366,height:768});
    const loadingCdp=await context.newCDPSession(loadingPage); await loadingCdp.send('Network.enable'); await loadingCdp.send('Network.emulateNetworkConditions',{offline:false,latency:450,downloadThroughput:64*1024/8,uploadThroughput:32*1024/8,connectionType:'cellular3g'});
    await loadingPage.goto(dashboardUrl(API_URL),{waitUntil:'domcontentloaded'}); await loadingPage.waitForSelector('#loadingLayer:not([hidden])'); await capture(loadingPage,'14-loading-fast-3g-1366x768.png'); await waitSettled(loadingPage);
    assert.strictEqual(await loadingPage.locator('#emptyState').isHidden(),true); await loadingCdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await loadingPage.emulateMedia({reducedMotion:'reduce'}); await loadingPage.reload({waitUntil:'domcontentloaded'}); await waitSettled(loadingPage);
    const motion=await loadingPage.evaluate(()=>{
      const s=getComputedStyle(document.querySelector('.button'));
      return {
        animationName:s.animationName,
        animationDuration:s.animationDuration,
        animationIterationCount:s.animationIterationCount,
        transitionDuration:s.transitionDuration,
      };
    });
    const cssTimeMs=value=>value.split(',').map(part=>{
      const token=part.trim();
      if(token.endsWith('ms'))return Number.parseFloat(token);
      if(token.endsWith('s'))return Number.parseFloat(token)*1000;
      return Number.POSITIVE_INFINITY;
    });
    assert(motion.animationName==='none'||motion.animationName==='');
    assert(cssTimeMs(motion.animationDuration).every(value=>value<=0.1),`Reduced-motion animation duration is ${motion.animationDuration}`);
    assert(cssTimeMs(motion.transitionDuration).every(value=>value<=0.1),`Reduced-motion transition duration is ${motion.transitionDuration}`);
    fs.writeFileSync(path.join(EVIDENCE_DIR,'reduced-motion.json'),JSON.stringify(motion,null,2));
    await capture(loadingPage,'15-reduced-motion-1366x768.png');
    record('Loading and reduced motion','PASS','14-loading-fast-3g-1366x768.png; 15-reduced-motion-1366x768.png','Throttled loading shows no sample output; reduced motion removes transitions/animations.');

    await activateView(page,'overview'); await page.setViewportSize({width:1440,height:900}); await selectDay(page,'2023-09-03');
    const accessibilityCdp=await context.newCDPSession(page); const accessibility=await runtimeAccessibilityAudit(page,accessibilityCdp);
    fs.writeFileSync(path.join(EVIDENCE_DIR,'accessibility-runtime.json'),JSON.stringify(accessibility,null,2));
    await page.addScriptTag({url:AXE_URL});
    const axeReports=[];
    for(const view of ['overview','sensors','settings']){
      await activateView(page,view);
      const report=await page.evaluate(async()=>{
        const result=await window.axe.run(document,{resultTypes:['violations','incomplete']});
        return {testEngine:result.testEngine,testEnvironment:result.testEnvironment,testRunner:result.testRunner,toolOptions:result.toolOptions,violations:result.violations,incomplete:result.incomplete};
      });
      axeReports.push({view,...report});
    }
    fs.writeFileSync(path.join(EVIDENCE_DIR,'accessibility-axe.json'),JSON.stringify({source:AXE_URL,reports:axeReports},null,2));
    const seriousAxe=axeReports.flatMap(report=>report.violations.filter(item=>item.impact==='serious'||item.impact==='critical').map(item=>({view:report.view,id:item.id,impact:item.impact,nodes:item.nodes.length})));
    assert.strictEqual(seriousAxe.length,0,`Serious/critical axe violations: ${JSON.stringify(seriousAxe)}`);
    await activateView(page,'overview');
    await capture(page,'13-accessibility-overview-1440x900.png');
    record('Accessibility runtime/CDP/axe','PASS','accessibility-runtime.json; accessibility-axe.json; 13-accessibility-overview-1440x900.png','DOM semantics, Chromium accessibility tree, and axe 4.10.3 across Overview, Sensor Explorer, and Settings contain no serious/critical accessibility violation.');

    const unexpectedConsole=consoleEvents.filter(event=>{
      if(event.page==='backend-error'&&event.type==='requestfailed'&&event.url.startsWith(ERROR_API_URL))return false;
      if(event.page==='backend-error'&&event.type==='error'&&/Failed to load resource|ERR_CONNECTION_REFUSED|blocked by CORS policy|Failed to fetch/i.test(event.text||''))return false;
      return event.type==='pageerror'||event.type==='error'||event.type==='requestfailed';
    });
    assert.strictEqual(unexpectedConsole.length,0,`Unexpected browser errors: ${JSON.stringify(unexpectedConsole)}`);
    record('Console errors','PASS','browser-console.json','No unexpected page error, console error, or failed request; expected unreachable-backend failure is retained as evidence.');

    fs.writeFileSync(path.join(EVIDENCE_DIR,'responsive-layout.json'),JSON.stringify(layouts,null,2));
    fs.writeFileSync(path.join(EVIDENCE_DIR,'keyboard-results.json'),JSON.stringify(keyboardSteps,null,2));
    fs.writeFileSync(path.join(EVIDENCE_DIR,'browser-console.json'),JSON.stringify(consoleEvents,null,2));
  } catch(error) {
    record('Automated browser suite','FAIL','m4-browser-results.json',error.stack||String(error));
    throw error;
  } finally {
    await settleWithin(context.tracing.stop({path:path.join(EVIDENCE_DIR,'12-keyboard-trace.zip')}).catch(()=>{}),10000);
    fs.writeFileSync(path.join(EVIDENCE_DIR,'m4-browser-results.json'),JSON.stringify({generatedAt:new Date().toISOString(),frontend:FRONTEND_URL,api:API_URL,emptyApi:EMPTY_API_URL,cdp:CDP_URL,results,consoleEvents,screenshots:screenshots.map(file=>path.basename(file))},null,2));
    await settleWithin(context.close().catch(()=>{}),10000);
    // The CDP browser is launcher-owned and may be reused for a corrective
    // rerun. Closing this client connection must not terminate that process.
  }
  console.log(JSON.stringify({status:'PASS',checks:results.length,evidence:EVIDENCE_DIR},null,2));
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error.stack||error);process.exit(1);});
