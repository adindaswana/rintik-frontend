// Adapter POST /api/predict. Pilih stub vs layanan model asli berdasar ENV.
// Default: stub. Frontend tidak menampilkan field mode ke pengguna.
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
    var useRemote = process.env.MODEL_MODE === 'remote' && process.env.MODEL_API_URL;
    var result;
    if (useRemote) {
      try {
        result = await remoteLib.predictRemote(rows);
      } catch (e) {
        result = stubLib.predictStub(rows);
      }
    } else {
      result = stubLib.predictStub(rows);
    }
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: 'Terjadi kendala saat memproses. Coba lagi.' });
  }
};
