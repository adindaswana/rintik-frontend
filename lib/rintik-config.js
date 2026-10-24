/* Alamat backend RINTIK.
 * - Dibuka di laptop (localhost / 127.0.0.1 / file:) -> backend lokal port 8140 (alur demo tim).
 * - Dibuka dari situs publik -> backend publik di Render.
 * Parameter ?api=... dapat menimpa alamat itu, tetapi di situs publik hanya untuk backend resmi:
 * tautan dengan ?api= ke server lain tidak boleh membuat halaman mengirim data ke sana. */
(function (root) {
  'use strict';
  var PUBLIC_API = 'https://rintik-backend.onrender.com';
  var LOCAL_API = 'http://127.0.0.1:8140';
  var LEGACY_LOCAL_API = 'http://127.0.0.1:8000';
  var STORAGE_KEY = 'rintik_api_url';
  var loc = root.location || {};
  var isLocal = loc.protocol === 'file:' || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(loc.hostname || '');
  root.RINTIK_PUBLIC_API = PUBLIC_API;
  root.RINTIK_LOCAL_API = LOCAL_API;
  root.RINTIK_DEFAULT_API = isLocal ? LOCAL_API : PUBLIC_API;

  function allowedApi(value) {
    if (!value) return false;
    var parsed;
    try { parsed = new URL(value); } catch (error) { return false; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (isLocal) return true;
    return parsed.origin === new URL(PUBLIC_API).origin;
  }

  /* Satu sumber untuk semua script halaman: ?api=, lalu nilai yang diingat di tab ini, lalu default. */
  root.RINTIK_resolveApiBase = function () {
    var requested = null, stored = null;
    try { requested = new URLSearchParams(loc.search || '').get('api'); } catch (error) {}
    try { stored = root.sessionStorage.getItem(STORAGE_KEY); } catch (error) {}
    var base = allowedApi(requested) ? requested
      : (allowedApi(stored) && String(stored).replace(/\/$/, '') !== LEGACY_LOCAL_API ? stored : root.RINTIK_DEFAULT_API);
    base = String(base).replace(/\/$/, '');
    try { root.sessionStorage.setItem(STORAGE_KEY, base); } catch (error) {}
    return base;
  };
})(typeof self !== 'undefined' ? self : this);
