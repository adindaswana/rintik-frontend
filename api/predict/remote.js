// Integrasi model asli (FastAPI terpisah, lihat MODEL_TODO.md).
// Gagal/timeout di sini ditangani pemanggil dengan fallback ke stub.
'use strict';
async function predictRemote(rows) {
  var base = process.env.MODEL_API_URL || '';
  if (!base) {
    throw new Error('MODEL_API_URL belum diisi.');
  }
  var res = await fetch(base.replace(/\/$/, '') + '/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: rows }),
    signal: (typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(50000) : undefined
  });
  if (!res.ok) {
    throw new Error('Layanan prediksi menjawab ' + res.status + '.');
  }
  return res.json();
}
module.exports = { predictRemote: predictRemote };
