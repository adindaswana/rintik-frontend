// Validasi payload di sisi server. Pesan generik, tanpa bocorkan istilah teknis ke UI.
'use strict';
var EXPECTED_COLS = [
  'datetime', 'env_id', 'co2', 'pressure', 'air_temperature', 'env_battery',
  'soil_ec_line1', 'soil_humidity_line1', 'soil_temp_line1',
  'soil_ec_line2', 'soil_humidity_line2', 'soil_temp_line2',
  'soil_ec_line3', 'soil_humidity_line3', 'soil_temp_line3',
  'water_volume_line1', 'water_volume_line2', 'water_volume_line3',
  'gdd', 'standard_day_degree', 'daily_mean_temperature',
  'daily_max_above_Tbase', 'daily_max', 'daily_max_reduction', 'ontario_units'
];
function isValidDatetime(s) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(String(s).replace(' ', 'T')));
}
function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, message: 'Data kosong. Periksa kembali file atau form Anda.' };
  }
  if (rows.length > 2000) {
    return { ok: false, message: 'Data terlalu besar. Gunakan file yang lebih kecil.' };
  }
  for (var i = 0; i < rows.length; i++) {
    if (!isValidDatetime(rows[i].datetime)) {
      return { ok: false, message: 'Format waktu baris ' + (i + 1) + ' belum sesuai. Gunakan format YYYY-MM-DD HH:MM:SS.' };
    }
  }
  return { ok: true };
}
module.exports = { EXPECTED_COLS: EXPECTED_COLS, validateRows: validateRows, isValidDatetime: isValidDatetime };
