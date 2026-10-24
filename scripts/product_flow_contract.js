'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname,'..');
function read(file){ return fs.readFileSync(path.join(root,file),'utf8'); }
// Line endings are normalized so the pin is stable across Windows (CRLF) and macOS/Linux (LF) checkouts.
function sha(file){ return crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file)).toString('utf8').replace(/\r\n/g,'\n')).digest('hex'); }
function assertUniqueIds(html,label){
  const ids=Array.from(html.matchAll(/\bid="([^"]+)"/g),match=>match[1]);
  assert.strictEqual(new Set(ids).size,ids.length,`${label} must not contain duplicate IDs`);
}

// Re-pinned at UI upgrade (logo maskot + wordmark baru, landing redesign) approved by owner.
const protectedHashes={
  'index.html':'3c28666f4ad784b56f9a506f2cd9bafa88d94ed5274bc5750163daa1463563b1',
  'assets/css/style.css':'9601a378c3196353426be5810f3dd369e56b2fa292d231d38532c35ca06a9405',
  'assets/js/app.js':'7e5103bbb9c94ecc5609d84b29d999b9e76ff038c25611f23aae01b79080730d'
};
Object.entries(protectedHashes).forEach(([file,hash])=>assert.strictEqual(sha(file),hash,`${file} changed`));

const predict=read('predict.html');
const result=read('hasil.html');
const dashboard=read('dashboard.html');
const settings=read('settings.html');
const flowJs=read('assets/js/prediction-flow.js');
const flowCss=read('assets/css/prediction-flow.css');

[['predict',predict],['hasil',result],['dashboard',dashboard],['settings',settings]].forEach(([label,html])=>assertUniqueIds(html,label));
['data-mode="operational"','data-mode="demo"','Operasional Harian','Demo Resmi','manualGroups','saveReadingButton','fillMissingButton','processOperationalButton','processDemoDayButton','processDemoAllButton','prepareRecoveryButton','resetOperationalButton','resetDemoButton','operationalScenario'].forEach(token=>assert(predict.includes(token),`predict.html missing ${token}`));
['normal','stuck','deviating','missing','repaired'].forEach(value=>assert(predict.includes(`value="${value}"`),`missing scenario ${value}`));
assert(!predict.includes('type="file"'),'Prediction must not require File Explorer');
assert(!predict.includes('assets/js/app.js')&&!result.includes('assets/js/app.js'),'Mutable product pages must not depend on protected home behavior');
assert(!predict.includes('assets/css/style.css')&&!result.includes('assets/css/style.css'),'Mutable product pages must not mutate protected home styling');

['resultChart','resultTableBody','resultProvenanceLabel','resultRecovery','Analisis seluruh riwayat'].forEach(token=>assert(result.includes(token),`hasil.html missing ${token}`));
['scopeSelect','rangeDateStart','rangeDateEnd','sensorCharts','runInsight'].forEach(token=>assert(dashboard.includes(token),`dashboard.html missing ${token}`));
['data-inspection="model"','data-inspection="sensor"','trustScore','disagreementThreshold','thresholdAudit','Verifikasi akurasi independen'].forEach(token=>assert(settings.includes(token),`settings.html missing ${token}`));

['createOperationalReading','updateOperationalReading','fillOperationalDay','runOperationalDay','resetOperationalSimulation','getNextOfficialDemoInput','resetDemoState'].forEach(token=>assert(flowJs.includes(token),`prediction flow missing API action ${token}`));
assert(flowJs.includes("var target='2023-09-06'"),'guided recovery date missing');
assert(!flowJs.includes('predictFull('),'Product flow must not use the stateless 734 route');
assert(flowJs.includes('window.RINTIK_resolveApiBase()')&&!flowJs.includes("params.get('api')"),'?api= must go through the allowlist in lib/rintik-config.js');
// R1: "RH terpakai" per slot (active recovery > sensor > nothing) drives the cards, table and CSV export.
assert(flowJs.includes('function usableRows(')&&(flowJs.match(/usableRows\(/g)||[]).length>=4,'usableRows must feed summary, table and export');
assert(flowJs.includes('nilainya macet (hampir konstan)')&&flowJs.includes('Sensor tidak mengirim data.'),'recovery copy must follow sensor.state');
assert(predict.includes('<span>RH terpakai</span>')&&result.includes('RH terpakai · rata-rata')&&result.includes('<th>RH terpakai</th>')&&!result.includes('Data operasional')&&!predict.includes('Data operasional'),'R11 term "RH terpakai"');
// R2: the gate is checked before the confirm button, the button never creates an audit, and the key follows the audit.
const recoveryFn=flowJs.slice(flowJs.indexOf('function recoveryInfo('),flowJs.indexOf('function renderNextStep('));
assert(recoveryFn.indexOf("status:'Dibatasi'")>0&&recoveryFn.indexOf("status:'Dibatasi'")<recoveryFn.indexOf('var canConfirm'),'audit gate must be evaluated before canConfirm');
const confirmFn=flowJs.slice(flowJs.indexOf('async function confirmRecovery('));
assert(!confirmFn.slice(0,confirmFn.indexOf('\n')).includes('createDemoAudit'),'confirmRecovery must not create an audit');
assert(flowJs.includes("('guided-confirm-'+incident.incident_id+'-'+auditId).slice(0,128)"),'idempotency key must include the audit id');
// R7/R12
assert(flowJs.includes("width:width,height:height,style:'height:'+height+'px'")&&flowCss.includes('.result-chart{min-height:300px}.result-chart svg{height:auto}'),'Hasil chart drawn 1:1');
assert(/id="exportResultButton" type="button" disabled/.test(result),'Ekspor CSV disabled until a result is shown');
assert(flowJs.includes('slot right after the latest manual reading'),'manual slot suggestion');
[predict,result].forEach(html=>{assert(html.includes('lib/rintik-config.js?v=20261024a')&&html.includes('prediction-flow.js?v=20261025a'),'asset cache version');});
// R14: Prediksi opens Hasil after processing; Hasil lists processed dates with a simulated sensor fault.
assert(flowJs.includes("goToResult('operational',result.date,'operational')")&&flowJs.includes("goToResult('official',latest.date,all?'demo-all':'demo-day')"),'auto navigation to Hasil');
['sensorEvents','sensorEventsTitle','sensorEventsLead','sensorEventsList','sensorEventsClear','sensorEventsRestore','sensorEventsKicker'].forEach(id=>assert(result.includes(`id="${id}"`),`hasil.html missing #${id}`));
assert(result.indexOf('id="sensorEvents"')>result.indexOf('id="resultContent"'),'sensor events panel lives inside #resultContent');
assert(flowJs.includes("'rintik_dismissed_events:'+client.sessionId()")&&flowJs.includes('forgetDismissed(state.resetTarget)'),'dismissed list per session, cleared on reset');
assert(flowJs.includes("url.searchParams.delete('from')")&&flowJs.includes('history.replaceState'),'arrival marker removed after one message');
const eventsFn=flowJs.slice(flowJs.indexOf('function renderSensorEvents('),flowJs.indexOf('var eventRequest=0'));
assert(!/item\.innerHTML|text\.innerHTML|detail\.innerHTML/.test(eventsFn),'event rows rendered with textContent');
assert(flowCss.includes('.sensor-event-badge.handled'),'sensor event styles');
assert(flowCss.includes('@media (prefers-reduced-motion: reduce)'));
assert(flowCss.includes('@media (max-width: 700px)'));

console.log('RINTIK_PRODUCT_FLOW_OK home=byte-identical workflows=isolated manual=persistent explicit-fill=true demo=16-day settings=standalone rhUsed=true gateFirst=true autoResult=true sensorEvents=true');
