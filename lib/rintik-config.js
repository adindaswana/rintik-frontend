/* Alamat backend RINTIK.
 * - Dibuka di laptop (localhost / 127.0.0.1 / file:) -> backend lokal port 8140 (alur demo tim).
 * - Dibuka dari situs publik -> backend publik di Hugging Face Spaces.
 * Parameter ?api=... tetap bisa menimpa keduanya. */
(function (root) {
  'use strict';
  var PUBLIC_API = 'https://HF_SPACE_PLACEHOLDER.hf.space';
  var LOCAL_API = 'http://127.0.0.1:8140';
  var loc = root.location || {};
  var isLocal = loc.protocol === 'file:' || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(loc.hostname || '');
  root.RINTIK_PUBLIC_API = PUBLIC_API;
  root.RINTIK_LOCAL_API = LOCAL_API;
  root.RINTIK_DEFAULT_API = isLocal ? LOCAL_API : PUBLIC_API;
})(typeof self !== 'undefined' ? self : this);
