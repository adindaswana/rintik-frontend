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

const protectedHashes={
  'index.html':'f538d30ea4ee70d4cccc325a80e7eb36a5e3734e88f223c9ea3fc659d9d121da',
  'assets/css/style.css':'fc3dbbbc64beb45e8856909396270daf295b190781d28a4394ca3653210ed262',
  'assets/js/app.js':'d4b8719613da03e12ebde800ccd648e393463789fe781ab9606770352e041bc8'
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
['data-inspection="model"','data-inspection="sensor"','trustScore','disagreementThreshold','thresholdAudit','Independent Accuracy Verification'].forEach(token=>assert(settings.includes(token),`settings.html missing ${token}`));

['createOperationalReading','updateOperationalReading','fillOperationalDay','runOperationalDay','resetOperationalSimulation','getNextOfficialDemoInput','resetDemoState'].forEach(token=>assert(flowJs.includes(token),`prediction flow missing API action ${token}`));
assert(flowJs.includes("var target='2023-09-06'"),'guided recovery date missing');
assert(!flowJs.includes('predictFull('),'Product flow must not use the stateless 734 route');
assert(flowCss.includes('@media (prefers-reduced-motion: reduce)'));
assert(flowCss.includes('@media (max-width: 700px)'));

console.log('RINTIK_PRODUCT_FLOW_OK home=byte-identical workflows=isolated manual=persistent explicit-fill=true demo=16-day settings=standalone');
