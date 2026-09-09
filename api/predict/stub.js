// STUB deterministik pengganti model asli (model fix belum ada).
// Meniru pipeline dua tahap secara sederhana: level harian + deviasi fisika + EWM 0.72.
// Murni JS, tanpa dependensi ML. Input sama selalu hasilkan output sama.
'use strict';
var ewmLib = require('../../lib/ewm');
var defaultsLib = require('../../lib/defaults');
var causalEwm = ewmLib.causalEwm;
var clamp = ewmLib.clamp;
var DEFAULTS = defaultsLib.DEFAULTS;

function tetensEs(T) {
  return 0.6108 * Math.exp((17.27 * T) / (T + 237.3));
}
function num(v, fallback) {
  var n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
}
function predictStub(rows) {
  // Kelompokkan per hari untuk level harian
  var dayMean = {};
  var dayCount = {};
  rows.forEach(function (r) {
    var day = String(r.datetime).slice(0, 10);
    var t = num(r.air_temperature, DEFAULTS.air_temperature);
    dayMean[day] = (dayMean[day] || 0) + t;
    dayCount[day] = (dayCount[day] || 0) + 1;
  });
  Object.keys(dayMean).forEach(function (day) {
    dayMean[day] = dayMean[day] / dayCount[day];
  });

  var raw = rows.map(function (r, i) {
    var day = String(r.datetime).slice(0, 10);
    var tMean = dayMean[day];
    var t = num(r.air_temperature, tMean);
    var level = 95 - 1.2 * (tMean - 19);
    level = clamp(level, 40, 95);
    var ratio = tetensEs(tMean) / tetensEs(t);
    var dev = level * ratio - level;
    var slot = i % 48;
    dev += 1.5 * Math.sin((2 * Math.PI * slot) / 48);
    return clamp(level + dev, 0, 100);
  });

  var smoothed = causalEwm(raw, 0.72).map(function (v) {
    return Number(clamp(v, 0, 100).toFixed(4));
  });

  var predictions = rows.map(function (r, i) {
    var dt = (r.datetime instanceof Date) ? fmtDate(r.datetime) : String(r.datetime);
    return { datetime: dt, air_humidity: smoothed[i] };
  });
  var mean = smoothed.reduce(function (a, b) { return a + b; }, 0) / smoothed.length;
  return {
    mode: 'stub',
    count: predictions.length,
    predictions: predictions,
    stats: {
      mean: Number(mean.toFixed(2)),
      min: Number(Math.min.apply(null, smoothed).toFixed(2)),
      max: Number(Math.max.apply(null, smoothed).toFixed(2))
    }
  };
}
module.exports = { predictStub: predictStub, tetensEs: tetensEs };
