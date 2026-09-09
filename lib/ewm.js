// Causal EWM low-pass, alpha 0.72. Murni JS, tanpa dependensi.
'use strict';
function causalEwm(values, alpha) {
  var a = (typeof alpha === 'number') ? alpha : 0.72;
  var out = new Array(values.length);
  var prev = null;
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var s = (prev === null) ? v : (a * v + (1 - a) * prev);
    out[i] = s;
    prev = s;
  }
  return out;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
module.exports = { causalEwm: causalEwm, clamp: clamp };
