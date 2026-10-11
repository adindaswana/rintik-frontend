/* Contract tests for public CSV classification and real-model routing. */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var publicLib = require('../lib/public-prediction');

var prototypeDir = path.resolve(__dirname, '..', '..');
var officialCsv = fs.readFileSync(path.join(prototypeDir, 'reference', 'official', 'test.csv'), 'utf8');
var officialRows = publicLib.parseCsvText(officialCsv);

async function main(){
  var fullClass = publicLib.classifyRows(officialRows);
  assert.strictEqual(fullClass.ok, true);
  assert.strictEqual(fullClass.workflow, 'full_submission_compatibility');
  assert.strictEqual(fullClass.rowCount, 734);

  var firstDate = officialRows[0].datetime.slice(0, 10);
  var oneDay = officialRows.filter(function(row){ return row.datetime.slice(0, 10) === firstDate; });
  var dayClass = publicLib.classifyRows(oneDay);
  assert.strictEqual(dayClass.ok, true);
  assert.strictEqual(dayClass.workflow, 'daily_batch');
  assert.strictEqual(dayClass.rowCount, 18);

  assert.throws(
    function(){ publicLib.parseCsvText('a,b\n"not closed,1'); },
    function(error){ return error.code === 'MALFORMED_CSV'; }
  );
  assert.strictEqual(publicLib.classifyRows([{datetime: '2023-08-29 15:00:00'}]).code, 'SCHEMA_MISMATCH');
  assert.strictEqual(publicLib.classifyRows(officialRows.slice(0, 96)).code, 'UNSUPPORTED_BATCH_SHAPE');
  var duplicate = oneDay.slice(); duplicate[1] = Object.assign({}, duplicate[1], {datetime: duplicate[0].datetime});
  assert.strictEqual(publicLib.classifyRows(duplicate).code, 'DUPLICATE_TIMESTAMP');

  var calls = [];
  var dailyClient = {
    ingestDay: async function(date, payload, key){ calls.push(['ingest', date, payload.rows.length, key]); return {status: 'ingested'}; },
    runDay: async function(date){
      calls.push(['run', date]);
      return {
        run_id: 'run-public-day', source: 'real_original_pth', simulation: false,
        pipeline_version: 'frozen-daily', model_sha256: 'model', state_sha256: 'state',
        predictions: oneDay.map(function(row, index){ return {timestamp: row.datetime, air_humidity: 70 + index / 10}; })
      };
    },
    monitorDay: async function(date){ calls.push(['monitor', date]); return {mode: 'synthetic_demo', simulation: true, rintik: {source: 'real_original_pth'}}; }
  };
  var daily = await publicLib.processRows(oneDay, dailyClient);
  assert.strictEqual(daily.meta.workflow, 'daily_batch');
  assert.strictEqual(daily.meta.persistedToDailyState, true);
  assert.strictEqual(daily.payload.predictions.length, 18);
  assert.strictEqual(daily.payload.predictions[0].datetime, oneDay[0].datetime);
  assert.deepStrictEqual(calls.map(function(call){ return call[0]; }), ['ingest', 'run', 'monitor']);

  var fullClient = {
    predictFull: async function(payload){
      return {
        source: 'real_original_pth', simulation: false, model_sha256: 'model', state_sha256: 'state', pipeline_version: 'full',
        predictions: payload.rows.map(function(row){ return {datetime: row.datetime, air_humidity: 75}; })
      };
    }
  };
  var full = await publicLib.processRows(officialRows, fullClient);
  assert.strictEqual(full.meta.workflow, 'full_submission_compatibility');
  assert.strictEqual(full.meta.persistedToDailyState, false);
  assert.strictEqual(full.meta.modelSha256, 'model');
  assert.strictEqual(full.payload.predictions.length, 734);

  await assert.rejects(
    function(){ return publicLib.processRows(oneDay, {ingestDay: dailyClient.ingestDay, runDay: async function(){ return {source: 'explicit_demo_stub', simulation: true, predictions: []}; }, monitorDay: dailyClient.monitorDay}); },
    function(error){ return error.code === 'INVALID_PROVENANCE'; }
  );
  assert.match(publicLib.errorMessage({code: 'INVALID_BACKEND_RESPONSE'}), /non-JSON/);
  assert.match(publicLib.errorMessage({code: 'NETWORK_ERROR'}), /tidak dapat dijangkau/);

  console.log('RINTIK_PUBLIC_PREDICTION_OK full=734 daily=18 invalid=fail-closed provenance=real-only');
}

main().catch(function(error){ console.error(error); process.exit(1); });
