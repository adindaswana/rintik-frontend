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

// Re-pinned at the handoff merge with origin/main: adds the Pemeriksaan nav link (index.html)
// and the Pemeriksaan page styles/helpers (style.css, app.js) contributed on main.
const protectedHashes={
  'index.html':'2b65ddb87f429a6518b530930db7be88805b22c2dd6289ae1775f64bfb7d96dc',
  'assets/css/style.css':'6da7b18c8b0324479f6352421be9c778a12e226d0abca81adaad6ef01a43c287',
  'assets/js/app.js':'db8805026fd38c82a0f7f21c4e90208b31262bf801bc22df187eebd7967bce8a'
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
