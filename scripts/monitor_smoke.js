// Uji api/monitor.js dengan req/res tiruan dan fetch yang di-mock (tanpa jaringan).
'use strict';
var path = require('path');
var fs = require('fs');
var handler = require('../api/monitor');

var mockResp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'data', 'mock_monitor_response.json'), 'utf8'));

function mkRes() {
  var r = { code: 0, body: null };
  r.status = function (c) { r.code = c; return r; };
  r.json = function (b) { r.body = b; return r; };
  return r;
}
function rows(n, withHum) {
  var out = [];
  for (var i = 0; i < n; i++) {
    var h = String(i % 24).padStart(2, '0');
    var o = { datetime: '2023-08-15 ' + h + ':00:00', air_temperature: '25' };
    if (withHum) o.air_humidity = String(70 + (i % 5));
    out.push(o);
  }
  return out;
}
function fakeFetch(impl) {
  var calls = [];
  global.fetch = function (url, opts) { calls.push({ url: url, opts: opts }); return impl(url, opts); };
  return calls;
}
function jsonResponse(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body); } });
}

var cases = [];
function test(name, fn) { cases.push({ name: name, fn: fn }); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }

test('sukses: diteruskan ke /monitor, comparator p3, jawaban utuh', async function () {
  process.env.MODEL_API_URL = 'https://model.example/';
  var calls = fakeFetch(function () { return jsonResponse(200, mockResp); });
  var res = mkRes();
  await handler({ method: 'POST', body: { rows: rows(10, true), comparator: 'p3' } }, res);
  eq(res.code, 200, 'status');
  eq(calls.length, 1, 'jumlah fetch');
  eq(calls[0].url, 'https://model.example/monitor', 'url');
  var sent = JSON.parse(calls[0].opts.body);
  eq(sent.comparator, 'p3', 'comparator');
  eq(sent.rows.length, 10, 'rows');
  eq(res.body.summary.dugaan_malfungsi, mockResp.summary.dugaan_malfungsi, 'summary');
  eq(!!calls[0].opts.signal, true, 'timeout signal');
});

test('sukses: body string JSON + comparator asing jadi p3', async function () {
  process.env.MODEL_API_URL = 'https://model.example';
  var calls = fakeFetch(function () { return jsonResponse(200, mockResp); });
  var res = mkRes();
  await handler({ method: 'POST', body: JSON.stringify({ rows: rows(3, true), comparator: 'hack' }) }, res);
  eq(res.code, 200, 'status');
  eq(JSON.parse(calls[0].opts.body).comparator, 'p3', 'comparator default');
});

test('backend 503 (bangun): 503 + pesan bangun, tanpa stub', async function () {
  process.env.MODEL_API_URL = 'https://model.example';
  fakeFetch(function () { return jsonResponse(503, { error: 'x' }); });
  var res = mkRes();
  await handler({ method: 'POST', body: { rows: rows(5, true) } }, res);
  eq(res.code, 503, 'status');
  eq(res.body.error, 'Model sedang bangun, coba lagi dalam 1 menit.', 'pesan');
  eq(res.body.days, undefined, 'tidak ada hasil palsu');
});

test('backend 404 (endpoint belum dideploy): 503', async function () {
  process.env.MODEL_API_URL = 'https://model.example';
  fakeFetch(function () { return jsonResponse(404, { detail: 'Not Found' }); });
  var res = mkRes();
  await handler({ method: 'POST', body: { rows: rows(5, true) } }, res);
  eq(res.code, 503, 'status');
});

test('jaringan putus / timeout: 503', async function () {
  process.env.MODEL_API_URL = 'https://model.example';
  fakeFetch(function () { return Promise.reject(new Error('The operation was aborted due to timeout')); });
  var res = mkRes();
  await handler({ method: 'POST', body: { rows: rows(5, true) } }, res);
  eq(res.code, 503, 'status');
  eq(res.body.code, 'upstream_unreachable', 'code');
});

test('backend 422 menolak data: 400 + pesan backend', async function () {
  process.env.MODEL_API_URL = 'https://model.example';
  fakeFetch(function () { return jsonResponse(422, { error: 'Kolom kurang.' }); });
  var res = mkRes();
  await handler({ method: 'POST', body: { rows: rows(5, true) } }, res);
  eq(res.code, 400, 'status');
  eq(res.body.error, 'Kolom kurang.', 'pesan diteruskan');
});

test('jawaban backend tidak lengkap: 502', async function () {
  process.env.MODEL_API_URL = 'https://model.example';
  fakeFetch(function () { return jsonResponse(200, { predictions: [] }); });
  var res = mkRes();
  await handler({ method: 'POST', body: { rows: rows(5, true) } }, res);
  eq(res.code, 502, 'status');
});

test('MODEL_API_URL kosong: 503, fetch tidak dipanggil', async function () {
  delete process.env.MODEL_API_URL;
  var calls = fakeFetch(function () { return jsonResponse(200, mockResp); });
  var res = mkRes();
  await handler({ method: 'POST', body: { rows: rows(5, true) } }, res);
  eq(res.code, 503, 'status');
  eq(calls.length, 0, 'fetch');
});

function expect400(name, body, re) {
  test('validasi: ' + name, async function () {
    process.env.MODEL_API_URL = 'https://model.example';
    var calls = fakeFetch(function () { return jsonResponse(200, mockResp); });
    var res = mkRes();
    await handler({ method: 'POST', body: body }, res);
    eq(res.code, 400, 'status');
    eq(calls.length, 0, 'fetch tidak dipanggil');
    if (!re.test(res.body.error)) throw new Error('pesan: ' + res.body.error);
  });
}
expect400('tanpa air_humidity', { rows: rows(5, false) }, /air_humidity/);
expect400('rows kosong', { rows: [] }, /kosong/i);
expect400('datetime salah', { rows: [{ datetime: '15/08/2023 00:00', air_humidity: '70' }] }, /Format waktu/);
expect400('lebih dari 2000 baris', { rows: rows(2001, true) }, /terlalu besar/);
expect400('air_humidity bukan angka', { rows: [{ datetime: '2023-08-15 00:00:00', air_humidity: 'abc' }] }, /bukan angka/);
expect400('air_humidity kosong semua', { rows: [{ datetime: '2023-08-15 00:00:00', air_humidity: '' }] }, /kosong/);

test('metode GET: 405', async function () {
  var res = mkRes();
  await handler({ method: 'GET' }, res);
  eq(res.code, 405, 'status');
});

(async function () {
  var fail = 0;
  for (var i = 0; i < cases.length; i++) {
    try { await cases[i].fn(); console.log('ok   ' + cases[i].name); }
    catch (e) { fail++; console.log('FAIL ' + cases[i].name + ' -> ' + e.message); }
  }
  console.log(fail ? ('MONITOR_SMOKE_FAIL ' + fail) : 'MONITOR_SMOKE_OK ' + cases.length);
  process.exit(fail ? 1 : 0);
})();
