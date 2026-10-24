/* Contract and fail-closed tests for the shared RINTIK API client. */
'use strict';

var assert = require('assert');
var apiLib = require('../lib/rintik-api');
var legacyHandler = require('../api/predict');

function response(status, body){
  return {ok: status >= 200 && status < 300, status: status, json: async function(){ return body; }};
}

function invokeLegacy(req){
  return new Promise(function(resolve, reject){
    var resolved = false;
    var res = {
      statusCode: 200,
      status: function(code){ this.statusCode = code; return this; },
      json: function(body){ resolved = true; resolve({status: this.statusCode, body: body}); }
    };
    Promise.resolve(legacyHandler(req, res)).then(function(){
      if(!resolved) reject(new Error('Legacy handler did not respond.'));
    }).catch(reject);
  });
}

async function main(){
  var calls = [];
  var fakeFetch = async function(url, init){
    calls.push({url: url, init: init || {}});
    return response(200, {ok: true});
  };
  var client = apiLib.createClient({baseUrl: 'http://127.0.0.1:8000/', fetchImpl: fakeFetch});
  await client.health();
  await client.listFeatures();
  await client.ingestDay('2023-08-29', {csv: 'fixture'}, 'day-key');
  await client.runDay('2023-08-29');
  await client.getDaySeries('2023-08-29');
  await client.getNextOfficialDemoInput();
  await client.resetDemoState('RESET_DEMO_STATE');
  await client.predictFull({rows: []});
  await client.monitorDay('2023-08-29');
  await client.createDemoAudit('pass', 'audit-key');
  await client.confirmIncident('incident-1', {demo_override: true}, 'confirm-key');

  assert.strictEqual(calls[0].url, 'http://127.0.0.1:8000/health');
  assert.strictEqual(calls[1].url, 'http://127.0.0.1:8000/v1/features');
  assert.strictEqual(calls[2].url, 'http://127.0.0.1:8000/v1/days/2023-08-29/ingest');
  assert.strictEqual(calls[2].init.headers['Idempotency-Key'], 'day-key');
  assert.strictEqual(calls[4].url, 'http://127.0.0.1:8000/v1/days/2023-08-29/series');
  assert.strictEqual(calls[5].url, 'http://127.0.0.1:8000/v1/demo/official-input/next');
  assert.strictEqual(calls[6].url, 'http://127.0.0.1:8000/v1/demo/reset');
  assert.deepStrictEqual(JSON.parse(calls[6].init.body), {confirmation: 'RESET_DEMO_STATE'});
  assert.strictEqual(calls[7].url, 'http://127.0.0.1:8000/predict');
  assert.strictEqual(calls[8].url, 'http://127.0.0.1:8000/v1/demo/days/2023-08-29/monitor');
  assert.strictEqual(calls[10].init.headers['Idempotency-Key'], 'confirm-key');
  // Session isolation contract: every backend call carries the same anonymous browser session id.
  var sessionId = calls[0].init.headers['X-Rintik-Session'];
  assert(/^[A-Za-z0-9_-]{16,64}$/.test(sessionId), 'session id must be 16-64 safe characters');
  calls.forEach(function(call){
    assert.strictEqual(call.init.headers['X-Rintik-Session'], sessionId, 'missing session header on ' + call.url);
  });
  assert.strictEqual(calls[2].init.headers['Content-Type'], 'application/json');
  assert.strictEqual(client.sessionId(), sessionId);
  assert.strictEqual(apiLib.SESSION_HEADER, 'X-Rintik-Session');
  var pinned = apiLib.createClient({baseUrl: 'http://b', fetchImpl: fakeFetch, sessionId: 'qa_session_0123456789'});
  await pinned.health();
  assert.strictEqual(calls[calls.length - 1].init.headers['X-Rintik-Session'], 'qa_session_0123456789');
  calls.pop();
  assert.strictEqual(apiLib.describeError({code: 'NETWORK_ERROR'}).indexOf('tidak ada hasil pengganti') >= 0, true);
  // R8: backend messages are English developer text; the page always shows Indonesian copy.
  assert.strictEqual(
    apiLib.describeError(new apiLib.RintikApiError('DUPLICATE_OPERATIONAL_TIMESTAMP', 'This half-hour slot already exists. Use the explicit edit action to replace it.', 409)),
    'Slot waktu ini sudah punya pembacaan. Untuk mengoreksinya, klik barisnya di tabel Pembacaan yang tersimpan, ubah nilainya, lalu Simpan koreksi.'
  );
  assert.strictEqual(
    apiLib.describeError(new apiLib.RintikApiError('VALUE_OUT_OF_RANGE', 'co2 must be between 300.5 and 2000 for this simulation.', 422)),
    'Nilai co2 harus di antara 300,5 dan 2000 (batas wajar simulasi).'
  );
  var unknownCopy = apiLib.describeError(new apiLib.RintikApiError('SOME_NEW_CODE', 'Something went wrong in English.', 422));
  assert.strictEqual(unknownCopy, 'Server menolak permintaan ini (SOME_NEW_CODE). Periksa data lalu coba lagi.');
  assert.strictEqual(unknownCopy.indexOf('English'), -1);
  assert.strictEqual(apiLib.describeError(new apiLib.RintikApiError('BACKEND_ERROR', 'RINTIK backend request failed.', 503)).indexOf('Server RINTIK sedang bermasalah'), 0);

  assert.strictEqual(client.exportDayUrl('2023-08-29'), 'http://127.0.0.1:8000/v1/days/2023-08-29/export.csv');

  var serverFailure = apiLib.createClient({
    baseUrl: 'http://backend',
    fetchImpl: async function(){
      return response(503, {error: {code: 'MONITORING_UNAVAILABLE', message: 'unavailable'}});
    }
  });
  await assert.rejects(
    function(){ return serverFailure.monitorDay('2023-08-29'); },
    function(error){
      return error instanceof apiLib.RintikApiError &&
        error.code === 'MONITORING_UNAVAILABLE' && error.status === 503;
    }
  );

  var invalidResponse = apiLib.createClient({
    baseUrl: 'http://frontend-not-backend',
    fetchImpl: async function(){
      return {ok: false, status: 501, json: async function(){ throw new SyntaxError('Unexpected token <'); }};
    }
  });
  await assert.rejects(
    function(){ return invalidResponse.predictFull({rows: []}); },
    function(error){ return error.code === 'INVALID_BACKEND_RESPONSE' && error.status === 501; }
  );

  var timedOut = apiLib.createClient({
    baseUrl: 'http://slow-backend',
    timeoutMs: 5,
    fetchImpl: function(url, init){
      return new Promise(function(resolve, reject){
        init.signal.addEventListener('abort', function(){ var error = new Error('aborted'); error.name = 'AbortError'; reject(error); });
      });
    }
  });
  await assert.rejects(
    function(){ return timedOut.health(); },
    function(error){ return error.code === 'TIMEOUT'; }
  );

  var networkFailure = apiLib.createClient({
    baseUrl: 'http://backend',
    fetchImpl: async function(){ throw new Error('offline'); }
  });
  await assert.rejects(
    function(){ return networkFailure.health(); },
    function(error){
      return error.code === 'NETWORK_ERROR' && /no fallback result/.test(error.message);
    }
  );

  var originalMode = process.env.MODEL_MODE;
  var originalUrl = process.env.MODEL_API_URL;
  var originalFetch = global.fetch;
  var validReq = {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: {rows: [{datetime: '2023-08-29 15:00:00', air_temperature: '26.8'}]}
  };
  try {
    process.env.MODEL_MODE = 'remote';
    process.env.MODEL_API_URL = 'http://unreachable';
    global.fetch = async function(){ throw new Error('offline'); };
    var remoteFailure = await invokeLegacy(validReq);
    assert.strictEqual(remoteFailure.status, 502);
    assert.strictEqual(remoteFailure.body.error.code, 'MODEL_UNAVAILABLE');
    assert.strictEqual(remoteFailure.body.source, null);
    assert.strictEqual(remoteFailure.body.simulation, false);
    assert.strictEqual(remoteFailure.body.predictions, undefined);

    process.env.MODEL_MODE = 'demo_stub';
    var explicitDemo = await invokeLegacy(validReq);
    assert.strictEqual(explicitDemo.status, 200);
    assert.strictEqual(explicitDemo.body.source, 'explicit_demo_stub');
    assert.strictEqual(explicitDemo.body.simulation, true);

    process.env.MODEL_MODE = 'unconfigured';
    delete process.env.MODEL_API_URL;
    var unconfigured = await invokeLegacy(validReq);
    assert.strictEqual(unconfigured.status, 503);
    assert.strictEqual(unconfigured.body.error.code, 'MODEL_MODE_NOT_CONFIGURED');
    assert.strictEqual(unconfigured.body.predictions, undefined);
  } finally {
    if(originalMode === undefined) delete process.env.MODEL_MODE;
    else process.env.MODEL_MODE = originalMode;
    if(originalUrl === undefined) delete process.env.MODEL_API_URL;
    else process.env.MODEL_API_URL = originalUrl;
    global.fetch = originalFetch;
  }

  console.log('RINTIK_API_CONTRACT_OK calls=' + calls.length + ' session=header failClosed=true explicitDemo=true timeout=true nonJson=true');
}

main().catch(function(error){
  console.error(error);
  process.exit(1);
});
