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
['data-inspection="model"','data-inspection="sensor"','trustScore','disagreementThreshold','thresholdAudit','Independent Accuracy Verification'].forEach(token=>assert(settings.includes(token),`settings.html missing ${token}`));

['createOperationalReading','updateOperationalReading','fillOperationalDay','runOperationalDay','resetOperationalSimulation','getNextOfficialDemoInput','resetDemoState'].forEach(token=>assert(flowJs.includes(token),`prediction flow missing API action ${token}`));
assert(flowJs.includes("var target='2023-09-06'"),'guided recovery date missing');
assert(!flowJs.includes('predictFull('),'Product flow must not use the stateless 734 route');
assert(flowCss.includes('@media (prefers-reduced-motion: reduce)'));
assert(flowCss.includes('@media (max-width: 700px)'));

console.log('RINTIK_PRODUCT_FLOW_OK home=byte-identical workflows=isolated manual=persistent explicit-fill=true demo=16-day settings=standalone');
