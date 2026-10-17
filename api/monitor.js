// Adapter POST /api/monitor: teruskan ke layanan model (MODEL_API_URL + '/monitor').
// SENGAJA tanpa fallback stub: halaman Pemeriksaan membandingkan bacaan sensor dengan
// tebakan model, jadi perbandingan palsu lebih berbahaya daripada pesan error.
'use strict';
var validateLib = require('../lib/validate');

var TIMEOUT_MS = 50000;
var COMPARATORS = ['p3', 'inti'];
var MSG_WAKING = 'Model sedang bangun, coba lagi dalam 1 menit.';
var MSG_NOT_READY = 'Layanan pemeriksaan belum tersedia. Coba lagi nanti.';
var MSG_BAD_ANSWER = 'Jawaban layanan pemeriksaan tidak lengkap. Coba lagi sebentar lagi.';

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

// Kolom bacaan sensor kelembapan wajib ada di setiap baris; nilainya boleh kosong
// (dihitung "data kurang" oleh layanan), tapi kalau diisi harus berupa angka.
function validateHumidity(rows) {
  var filled = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r || typeof r !== 'object' || !Object.prototype.hasOwnProperty.call(r, 'air_humidity')) {
      return { ok: false, message: 'Kolom bacaan sensor kelembapan (air_humidity) wajib ada. Baris ' + (i + 1) + ' belum memilikinya.' };
    }
    var v = r.air_humidity;
    if (isBlank(v)) continue;
    if (!isFinite(Number(v))) {
      return { ok: false, message: 'Bacaan sensor kelembapan pada baris ' + (i + 1) + ' bukan angka.' };
    }
    filled++;
  }
  if (!filled) {
    return { ok: false, message: 'Semua bacaan sensor kelembapan kosong. Tidak ada yang bisa diperiksa.' };
  }
  return { ok: true };
}

function readBody(req) {
  var body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (Array.isArray(body)) body = { rows: body };
  return body && typeof body === 'object' ? body : {};
}

function looksValid(data) {
  return data && typeof data === 'object' &&
    Array.isArray(data.days) && Array.isArray(data.predictions) &&
    data.summary && typeof data.summary === 'object';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metode tidak didukung.' });
    return;
  }
  var body = readBody(req);
  var rows = Array.isArray(body.rows) ? body.rows : [];
  var check = validateLib.validateRows(rows);
  if (!check.ok) {
    res.status(400).json({ error: check.message });
    return;
  }
  var hum = validateHumidity(rows);
  if (!hum.ok) {
    res.status(400).json({ error: hum.message });
    return;
  }
  var comparator = COMPARATORS.indexOf(body.comparator) !== -1 ? body.comparator : 'p3';

  var base = process.env.MODEL_API_URL || '';
  if (!base) {
    res.status(503).json({ error: MSG_NOT_READY, code: 'not_configured' });
    return;
  }

  var upstream;
  try {
    upstream = await fetch(base.replace(/\/$/, '') + '/monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: rows, comparator: comparator }),
      signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(TIMEOUT_MS) : undefined
    });
  } catch (e) {
    // Jaringan putus atau timeout 50 detik: biasanya layanan gratis sedang bangun.
    res.status(503).json({ error: MSG_WAKING, code: 'upstream_unreachable' });
    return;
  }

  var data = null;
  try { data = await upstream.json(); } catch (e) { data = null; }

  if (!upstream.ok) {
    if (upstream.status >= 400 && upstream.status < 500 && upstream.status !== 404 && upstream.status !== 408 && upstream.status !== 429) {
      var msg = data && (typeof data.error === 'string' ? data.error : (data.error && typeof data.error.message === 'string' ? data.error.message : (typeof data.detail === 'string' ? data.detail : '')));
      res.status(400).json({ error: msg || 'Data belum sesuai untuk diperiksa. Periksa kembali file Anda.', code: 'upstream_rejected' });
      return;
    }
    res.status(503).json({ error: MSG_WAKING, code: 'upstream_' + upstream.status });
    return;
  }
  if (!looksValid(data)) {
    res.status(502).json({ error: MSG_BAD_ANSWER, code: 'upstream_bad_shape' });
    return;
  }
  res.status(200).json(data);
};
