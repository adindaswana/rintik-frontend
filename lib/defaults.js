// Nilai default median dari train.csv, dipakai saat field kosong.
// Sumber: dataset/train.csv (2.933 baris). Tetap di sisi server, jangan tampilkan ke UI.
'use strict';
var DEFAULTS = {
  env_id: 90253,
  co2: 468.935,
  pressure: 1009.63,
  air_temperature: 26.81,
  env_battery: 100,
  soil_ec_line1: 368.22,
  soil_humidity_line1: 25.66,
  soil_temp_line1: 23.61,
  soil_ec_line2: 300.56,
  soil_humidity_line2: 24.28,
  soil_temp_line2: 24.25,
  soil_ec_line3: 344.89,
  soil_humidity_line3: 22.04,
  soil_temp_line3: 24.645,
  water_volume_line1: 21318.575,
  water_volume_line2: 14040.355,
  water_volume_line3: 9748.93,
  gdd: 420.96,
  standard_day_degree: 17.67,
  daily_mean_temperature: 27.63,
  daily_max_above_Tbase: 27.02,
  daily_max: 37.07,
  daily_max_reduction: 16.94,
  ontario_units: 26.27
};
module.exports = { DEFAULTS: DEFAULTS };
