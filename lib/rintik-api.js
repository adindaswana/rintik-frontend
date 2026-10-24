/* Fail-closed client for the RINTIK v1 backend contract. */
(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.RintikApi = factory();
  }
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  function RintikApiError(code, message, status){
    this.name = 'RintikApiError';
    this.code = code;
    this.message = message;
    this.status = status || 0;
    if(Error.captureStackTrace) Error.captureStackTrace(this, RintikApiError);
  }
  RintikApiError.prototype = Object.create(Error.prototype);
  RintikApiError.prototype.constructor = RintikApiError;

  var SESSION_KEY = 'rintik_session_id';
  var SESSION_HEADER = 'X-Rintik-Session';
  var SESSION_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
  var memorySessionId = null;

  function randomSessionId(){
    var cryptoImpl = typeof crypto !== 'undefined' ? crypto : null;
    if(cryptoImpl && typeof cryptoImpl.randomUUID === 'function'){
      return cryptoImpl.randomUUID().replace(/-/g, '');
    }
    if(cryptoImpl && typeof cryptoImpl.getRandomValues === 'function'){
      var bytes = new Uint8Array(16);
      cryptoImpl.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function(value){
        return ('0' + value.toString(16)).slice(-2);
      }).join('');
    }
    var fallback = '';
    while(fallback.length < 32) fallback += Math.random().toString(36).slice(2);
    return fallback.slice(0, 32);
  }

  function storageGet(kind){
    try {
      var store = typeof self !== 'undefined' && self[kind];
      return store ? store.getItem(SESSION_KEY) : null;
    } catch(error){ return null; }
  }

  function storageSet(kind, value){
    try {
      var store = typeof self !== 'undefined' && self[kind];
      if(!store) return false;
      store.setItem(SESSION_KEY, value);
      return store.getItem(SESSION_KEY) === value;
    } catch(error){ return false; }
  }

  /* One anonymous id per browser: localStorage, then sessionStorage, then memory.
   * The backend keeps a separate state per id, so visitors do not see or reset
   * each other's runs. The id is not a credential and holds no personal data. */
  function sessionId(){
    var stored = storageGet('localStorage') || storageGet('sessionStorage') || memorySessionId;
    if(stored && SESSION_PATTERN.test(stored)) return stored;
    var created = randomSessionId();
    if(!storageSet('localStorage', created)) storageSet('sessionStorage', created);
    memorySessionId = created;
    return created;
  }

  var ERROR_COPY = {
    NETWORK_ERROR: 'Server RINTIK tidak dapat dihubungi. Periksa koneksi lalu coba lagi; tidak ada hasil pengganti yang dibuat.',
    TIMEOUT: 'Server RINTIK terlalu lama menjawab (mungkin sedang bangun). Coba lagi sebentar lagi; tidak ada hasil pengganti yang dibuat.',
    INVALID_BACKEND_RESPONSE: 'Alamat server mengembalikan halaman yang bukan data RINTIK. Periksa alamat API.',
    MODEL_UNAVAILABLE: 'Model RINTIK belum siap di server. Tidak ada hasil pengganti yang dibuat.',
    MONITORING_UNAVAILABLE: 'Perbandingan sensor humidity sedang tidak tersedia. Estimasi RINTIK yang tersimpan tidak berubah.',
    MONITORING_NOT_FOUND: 'Perbandingan sensor belum dibuat untuk tanggal ini.',
    INVALID_SESSION: 'Penanda sesi browser tidak valid. Muat ulang halaman.',
    RESULT_NOT_FOUND: 'Hasil untuk tanggal ini tidak ditemukan (mungkin sudah direset).',
    RUN_NOT_FOUND: 'Hasil untuk tanggal ini tidak ditemukan (mungkin sudah direset).',
    OPERATIONAL_SIMULATION_UNAVAILABLE: 'Simulasi operasional sedang tidak tersedia di server.',
    DUPLICATE_OPERATIONAL_TIMESTAMP: 'Slot waktu ini sudah punya pembacaan. Untuk mengoreksinya, klik barisnya di tabel Pembacaan yang tersimpan, ubah nilainya, lalu Simpan koreksi.',
    OPERATIONAL_DAY_LOCKED: 'Tanggal ini sudah diproses sehingga datanya terkunci dan tidak dapat diubah.',
    OUT_OF_ORDER_OPERATIONAL_DATE: 'Tanggal diproses berurutan. Selesaikan tanggal aktif terlebih dahulu.',
    UNSUPPORTED_OPERATIONAL_DATE: 'Simulasi operasional hanya mencakup 14–25 Oktober 2026.',
    INVALID_OPERATIONAL_SLOT: 'Waktu pembacaan harus salah satu slot 30 menit (jam:00 atau jam:30) pada tanggal aktif.',
    OPERATIONAL_DAY_INCOMPLETE: 'Data hari ini belum lengkap 48 slot. Lengkapi slot yang kosong terlebih dahulu.',
    FIXTURE_SLOT_NOT_FOUND: 'Nilai contoh untuk slot ini tidak tersedia.',
    NON_FINITE_VALUE: 'Semua nilai sensor harus berupa angka.',
    INVALID_IDENTIFIER: 'ID lingkungan harus berupa bilangan bulat.',
    MISSING_COLUMNS: 'Masih ada nilai sensor yang belum diisi.',
    UNEXPECTED_COLUMNS: 'Data berisi kolom yang tidak dikenal oleh model.',
    INVALID_READING: 'Pembacaan tidak dapat dibaca. Periksa waktu dan angka yang diisi.',
    INVALID_HUMIDITY_SCENARIO: 'Pilih kondisi sensor humidity yang tersedia.',
    SCENARIO_COMPLETE: 'Seluruh 16 tanggal Demo Resmi sudah diproses. Lihat Hasil/Dashboard, atau klik Reset demo untuk mengulang.',
    OUT_OF_ORDER_DATE: 'Tanggal Demo Resmi harus diproses berurutan mulai dari tanggal berikutnya.',
    PREVIOUS_DAY_NOT_RUN: 'Selesaikan tanggal sebelumnya terlebih dahulu.',
    INPUT_CONFLICT: 'Tanggal ini sudah tersimpan dengan data berbeda. Data historis tidak ditimpa.',
    OFFICIAL_FIXTURE_MISMATCH: 'Data tidak sama dengan data uji resmi yang dipatok, sehingga ditolak.',
    OFFICIAL_SOURCE_UNAVAILABLE: 'Data uji resmi di server gagal pemeriksaan integritas. Proses dihentikan tanpa membuat prediksi.',
    INCIDENT_NOT_FOUND: 'Insiden sensor ini tidak ditemukan (mungkin sudah direset).',
    IDEMPOTENCY_KEY_CONFLICT: 'Permintaan yang sama pernah dikirim dengan isi berbeda. Muat ulang halaman lalu coba lagi.',
    RESET_CONFIRMATION_REQUIRED: 'Reset memerlukan konfirmasi.',
    TOO_MANY_ROWS: 'Data terlalu banyak untuk satu permintaan.',
    PAYLOAD_TOO_LARGE: 'Ukuran data terlalu besar (maksimum 5 MB).',
    TEMPORAL_STATE_DIVERGENCE: 'Pemeriksaan konsistensi histori gagal, jadi hasil tidak disimpan. Reset alur ini lalu ulangi.',
    PUBLICATION_ROW_MISMATCH: 'Jumlah baris hasil tidak sesuai, jadi hasil tidak disimpan.'
  };

  function describeError(error){
    var code = error && error.code;
    if(code && ERROR_COPY[code]) return ERROR_COPY[code];
    if(code === 'VALUE_OUT_OF_RANGE'){
      var range = /^(\w+) must be between (\S+) and (\S+)/.exec(error.message || '');
      return range ? 'Nilai ' + range[1] + ' harus di antara ' + range[2].replace('.', ',') + ' dan ' + range[3].replace('.', ',') + ' (batas wajar simulasi).' : 'Ada nilai sensor di luar batas wajar simulasi.';
    }
    if(error && error.status === 404) return 'Data yang diminta tidak ditemukan di server (mungkin sudah direset).';
    if(error && error.status >= 500) return 'Server RINTIK sedang bermasalah. Coba lagi sebentar lagi; tidak ada hasil pengganti yang dibuat.';
    /* Backend messages are English developer text; never show them raw on an Indonesian page. */
    if(error instanceof RintikApiError && error.status >= 400) return 'Server menolak permintaan ini (' + (code || error.status) + '). Periksa data lalu coba lagi.';
    return error && error.message ? error.message : 'Terjadi kesalahan yang tidak dikenali.';
  }

  function createClient(options){
    options = options || {};
    var fixedSessionId = options.sessionId && SESSION_PATTERN.test(options.sessionId) ? options.sessionId : null;
    var baseUrl = String(options.baseUrl || '').replace(/\/$/, '');
    var fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    var timeoutMs = Number(options.timeoutMs || 60000);
    if(!baseUrl) throw new Error('baseUrl is required.');
    if(!fetchImpl) throw new Error('A fetch implementation is required.');

    async function request(path, init){
      var response;
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = controller && timeoutMs > 0 ? setTimeout(function(){ controller.abort(); }, timeoutMs) : null;
      var requestInit = Object.assign({}, init || {});
      requestInit.headers = Object.assign({}, requestInit.headers || {});
      requestInit.headers[SESSION_HEADER] = fixedSessionId || sessionId();
      if(controller && !requestInit.signal) requestInit.signal = controller.signal;
      try {
        response = await fetchImpl(baseUrl + path, requestInit);
      } catch(error){
        if(timer) clearTimeout(timer);
        if(error && error.name === 'AbortError'){
          throw new RintikApiError(
            'TIMEOUT',
            'RINTIK backend timed out; no fallback result was generated.',
            0
          );
        }
        throw new RintikApiError(
          'NETWORK_ERROR',
          'RINTIK backend could not be reached; no fallback result was generated.',
          0
        );
      }
      if(timer) clearTimeout(timer);
      var body;
      try {
        body = await response.json();
      } catch(error){
        throw new RintikApiError(
          'INVALID_BACKEND_RESPONSE',
          'RINTIK backend returned a non-JSON response.',
          response.status
        );
      }
      if(!response.ok){
        var envelope = body && body.error;
        throw new RintikApiError(
          envelope && envelope.code ? envelope.code : 'BACKEND_ERROR',
          envelope && envelope.message ? envelope.message : 'RINTIK backend request failed.',
          response.status
        );
      }
      return body;
    }

    function jsonRequest(method, body, idempotencyKey){
      var headers = {'Content-Type': 'application/json'};
      if(idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      return {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      };
    }

    return {
      sessionId: function(){ return fixedSessionId || sessionId(); },
      health: function(){ return request('/health'); },
      listDays: function(){ return request('/v1/days'); },
      listFeatures: function(){ return request('/v1/features'); },
      ingestDay: function(date, payload, key){
        return request('/v1/days/' + encodeURIComponent(date) + '/ingest', jsonRequest('POST', payload, key));
      },
      runDay: function(date){
        return request('/v1/days/' + encodeURIComponent(date) + '/run', {method: 'POST'});
      },
      getDayResult: function(date){
        return request('/v1/days/' + encodeURIComponent(date) + '/result');
      },
      getDaySeries: function(date){
        return request('/v1/days/' + encodeURIComponent(date) + '/series');
      },
      getNextOfficialDemoInput: function(){
        return request('/v1/demo/official-input/next');
      },
      resetDemoState: function(confirmation){
        return request('/v1/demo/reset', jsonRequest('POST', {confirmation: confirmation}));
      },
      predictFull: function(payload){
        return request('/predict', jsonRequest('POST', payload));
      },
      exportDayUrl: function(date){
        return baseUrl + '/v1/days/' + encodeURIComponent(date) + '/export.csv';
      },
      monitorDay: function(date){
        return request('/v1/demo/days/' + encodeURIComponent(date) + '/monitor', {method: 'POST'});
      },
      getMonitoring: function(date){
        return request('/v1/demo/days/' + encodeURIComponent(date) + '/monitoring');
      },
      listIncidents: function(){ return request('/v1/demo/incidents'); },
      createDemoAudit: function(scenario, key){
        return request('/v1/demo/audits', jsonRequest('POST', {scenario: scenario}, key));
      },
      getCurrentAudit: function(){ return request('/v1/demo/audits/current'); },
      confirmIncident: function(incidentId, confirmation, key){
        return request(
          '/v1/demo/incidents/' + encodeURIComponent(incidentId) + '/confirm',
          jsonRequest('POST', confirmation, key)
        );
      },
      listOperationalDays: function(){ return request('/v1/operational/days'); },
      getOperationalDay: function(date){
        return request('/v1/operational/days/' + encodeURIComponent(date));
      },
      getOperationalFixtureReading: function(date, timestamp){
        return request('/v1/operational/days/' + encodeURIComponent(date) + '/fixture?timestamp=' + encodeURIComponent(timestamp));
      },
      createOperationalReading: function(date, reading){
        return request('/v1/operational/days/' + encodeURIComponent(date) + '/readings', jsonRequest('POST', {reading: reading}));
      },
      updateOperationalReading: function(date, reading){
        return request('/v1/operational/days/' + encodeURIComponent(date) + '/readings', jsonRequest('PUT', {reading: reading}));
      },
      fillOperationalDay: function(date){
        return request('/v1/operational/days/' + encodeURIComponent(date) + '/fill', {method: 'POST'});
      },
      runOperationalDay: function(date, scenario){
        return request('/v1/operational/days/' + encodeURIComponent(date) + '/run', jsonRequest('POST', {humidity_scenario: scenario}));
      },
      getOperationalResult: function(date){
        return request('/v1/operational/days/' + encodeURIComponent(date) + '/result');
      },
      getOperationalSeries: function(date){
        return request('/v1/operational/days/' + encodeURIComponent(date) + '/series');
      },
      resetOperationalSimulation: function(confirmation){
        return request('/v1/operational/reset', jsonRequest('POST', {confirmation: confirmation}));
      }
    };
  }

  return {
    createClient: createClient,
    RintikApiError: RintikApiError,
    sessionId: sessionId,
    describeError: describeError,
    SESSION_HEADER: SESSION_HEADER
  };
});
