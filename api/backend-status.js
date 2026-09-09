// Internal: cek keterjangkauan layanan model (untuk pemanasan sebelum demo).
// Halaman status.html (tidak ditautkan di navigasi) memakai endpoint ini.
'use strict';
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Metode tidak didukung.' });
    return;
  }
  var base = process.env.MODEL_API_URL || '';
  if (!base) {
    res.status(200).json({ reachable: false, reason: ' Alamat layanan belum diisi.' });
    return;
  }
  try {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 15000) : null;
    var r = await fetch(base.replace(/\/$/, '') + '/health', ctrl ? { signal: ctrl.signal } : undefined);
    if (timer) clearTimeout(timer);
    res.status(200).json({ reachable: r.ok });
  } catch (e) {
    res.status(200).json({ reachable: false });
  }
};
