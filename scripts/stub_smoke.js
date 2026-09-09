// Smoke test stub: deterministik, format output benar.
'use strict';
var stub = require('../api/predict/stub');
var rows = [];
var start = new Date('2023-08-29T15:00:00');
function p(n) { return String(n).padStart(2, '0'); }
for (var i = 0; i < 96; i++) {
  var d = new Date(start.getTime() + i * 30 * 60000);
  var s = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':00';
  rows.push({ datetime: s, air_temperature: '26.8' });
}
var a = stub.predictStub(rows);
var b = stub.predictStub(rows);
var det = JSON.stringify(a) === JSON.stringify(b);
var inRange = a.predictions.every(function (x) { return x.air_humidity >= 0 && x.air_humidity <= 100; });
console.log('count=' + a.count + ' deterministic=' + det + ' inRange=' + inRange + ' mean=' + a.stats.mean);
if (a.count !== 96 || !det || !inRange) { process.exit(1); }
console.log('STUB_SMOKE_OK');
