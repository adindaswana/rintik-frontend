'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname,'..');
function read(file){ return fs.readFileSync(path.join(root,file),'utf8'); }
function sha(file){ return crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'); }
function assertUniqueIds(html,label){
  const ids=Array.from(html.matchAll(/\bid="([^"]+)"/g),match=>match[1]);
  assert.strictEqual(new Set(ids).size,ids.length,`${label} must not contain duplicate IDs`);
}

const expected={
  'index.html':'f538d30ea4ee70d4cccc325a80e7eb36a5e3734e88f223c9ea3fc659d9d121da',
  'assets/css/style.css':'fc3dbbbc64beb45e8856909396270daf295b190781d28a4394ca3653210ed262',
  'assets/js/app.js':'d4b8719613da03e12ebde800ccd648e393463789fe781ab9606770352e041bc8'
};
Object.entries(expected).forEach(([file,hash])=>assert.strictEqual(sha(file),hash,`${file} changed despite protected-home invariant`));

const predict=read('predict.html');
const result=read('hasil.html');
const dashboard=read('dashboard.html');
const flowJs=read('assets/js/prediction-flow.js');
const flowCss=read('assets/css/prediction-flow.css');

assertUniqueIds(predict,'predict.html');
assertUniqueIds(result,'hasil.html');
assertUniqueIds(dashboard,'dashboard.html');

['data-mode="daily"','data-mode="batch"','faultSimulation','processButton','latestContent','recoveryAction','prediction-flow.js'].forEach(token=>assert(predict.includes(token),`predict.html missing ${token}`));
assert(!predict.includes('type="file"'),'Prediction must not require File Explorer');
assert(!predict.includes('Form Manual'),'Unsupported manual form must be removed');
assert(!predict.includes('assets/js/app.js'),'Prediction must not mutate or depend on shared home behavior');
assert(!result.includes('assets/js/app.js'),'Result must not mutate or depend on shared home behavior');
assert(!predict.includes('assets/css/style.css') && !result.includes('assets/css/style.css'),'Product flow must stay isolated from protected home styling and its external font import');
assert(result.includes('resultChart') && result.includes('resultTableBody') && result.includes('Eksplorasi seluruh riwayat'));
assert(!dashboard.includes('dayFile') && !dashboard.includes('processDayButton') && !dashboard.includes('chooseFileButton'),'Dashboard must not own primary ingestion controls');
assert(dashboard.includes('Buka alur Prediksi'));

assert(flowJs.includes('getNextOfficialDemoInput'));
assert(flowJs.includes("Math.min(15,16-completed)"));
assert(flowJs.includes('monitoringEnabled:simulationEnabled'));
assert(flowJs.includes("createDemoAudit('pass'"));
assert(flowJs.includes('confirmIncident'));
assert(!flowJs.includes('predictFull('),'Product replay must use daily persistence, not the stateless 734 route');
assert(flowCss.includes('@media (prefers-reduced-motion: reduce)'));
assert(flowCss.includes('@media (max-width: 700px)'));

console.log('RINTIK_PRODUCT_FLOW_OK home=byte-identical daily=true batch15=sequential simulation=explicit dashboard=input-free');
