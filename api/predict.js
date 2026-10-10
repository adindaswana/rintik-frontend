// Legacy compatibility adapter. REAL mode fails closed; demo stub is explicit.
'use strict';
var stubLib = require('./predict/stub');
var remoteLib = require('./predict/remote');
var validateLib = require('../lib/validate');

function parseCsvBody(text) {
  var lines = String(text || '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  var header = lines[0].split(',').map(function (s) { return s.trim(); });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var cells = lines[i].split(',');
    var obj = {};
    for (var j = 0; j < header.length; j++) obj[header[j]] = (cells[j] || '').trim();
    rows.push(obj);
  }
  return rows;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metode tidak didukung.' });
    return;
  }
  try {
    var rows = [];
    var ct = String((req.headers && req.headers['content-type']) || '');
    if (ct.indexOf('text/csv') !== -1 && typeof req.body === 'string') {
      rows = parseCsvBody(req.body);
    } else if (typeof req.body === 'string') {
      try { rows = parseCsvBody(req.body); } catch (e) { rows = []; }
      if (!rows.length) {
        try { rows = JSON.parse(req.body).rows || []; } catch (e2) { rows = []; }
      }
    } else if (req.body && Array.isArray(req.body.rows)) {
      rows = req.body.rows;
    } else if (Array.isArray(req.body)) {
      rows = req.body;
    }
    var check = validateLib.validateRows(rows);
    if (!check.ok) {
      res.status(400).json({ error: check.message });
      return;
    }
    var mode = process.env.MODEL_MODE || 'unconfigured';
    var result;
    if (mode === 'remote' && process.env.MODEL_API_URL) {
      try {
        result = await remoteLib.predictRemote(rows);
      } catch (e) {
        res.status(502).json({
          error: {
            code: 'MODEL_UNAVAILABLE',
            message: 'Layanan model RINTIK tidak tersedia; tidak ada prediksi pengganti yang dibuat.'
          },
          source: null,
          simulation: false
        });
        return;
      }
    } else if (mode === 'demo_stub') {
      result = stubLib.predictStub(rows);
    } else {
      res.status(503).json({
        error: {
          code: 'MODEL_MODE_NOT_CONFIGURED',
          message: 'MODEL_MODE harus remote untuk hasil model atau demo_stub untuk simulasi eksplisit.'
        },
        source: null,
        simulation: false
      });
      return;
    }
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: 'Terjadi kendala saat memproses. Coba lagi.' });
  }
};
