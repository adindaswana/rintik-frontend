/* Public prediction workflow adapter for the frozen RINTIK backend. */
(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.RintikPublicPrediction = factory();
  }
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  var INPUT_COLUMNS = [
    'datetime', 'env_id', 'co2', 'pressure', 'air_temperature', 'env_battery',
    'soil_ec_line1', 'soil_humidity_line1', 'soil_temp_line1',
    'soil_ec_line2', 'soil_humidity_line2', 'soil_temp_line2',
    'soil_ec_line3', 'soil_humidity_line3', 'soil_temp_line3',
    'water_volume_line1', 'water_volume_line2', 'water_volume_line3',
    'gdd', 'standard_day_degree', 'daily_mean_temperature',
    'daily_max_above_Tbase', 'daily_max', 'daily_max_reduction', 'ontario_units'
  ];

  function PublicPredictionError(code, message){
    this.name = 'PublicPredictionError';
    this.code = code;
    this.message = message;
    if(Error.captureStackTrace) Error.captureStackTrace(this, PublicPredictionError);
  }
  PublicPredictionError.prototype = Object.create(Error.prototype);
  PublicPredictionError.prototype.constructor = PublicPredictionError;

  function parseCsvRecords(text){
    text = String(text || '').replace(/^\uFEFF/, '');
    var records = [], record = [], field = '', quoted = false;
    for(var i = 0; i < text.length; i++){
      var ch = text[i];
      if(quoted){
        if(ch === '"' && text[i + 1] === '"'){
          field += '"'; i++;
        } else if(ch === '"'){
          quoted = false;
        } else {
          field += ch;
        }
      } else if(ch === '"'){
        if(field.length) throw new PublicPredictionError('MALFORMED_CSV', 'Tanda kutip CSV tidak valid.');
        quoted = true;
      } else if(ch === ','){
        record.push(field); field = '';
      } else if(ch === '\n' || ch === '\r'){
        if(ch === '\r' && text[i + 1] === '\n') i++;
        record.push(field); field = '';
        if(record.some(function(value){ return value !== ''; })) records.push(record);
        record = [];
      } else {
        field += ch;
      }
    }
    if(quoted) throw new PublicPredictionError('MALFORMED_CSV', 'Tanda kutip CSV tidak ditutup.');
    record.push(field);
    if(record.some(function(value){ return value !== ''; })) records.push(record);
    return records;
  }

  function parseCsvText(text){
    var records = parseCsvRecords(text);
    if(records.length < 2) throw new PublicPredictionError('EMPTY_CSV', 'CSV harus memiliki header dan sedikitnya satu baris data.');
    var header = records[0].map(function(value){ return value.trim(); });
    if(header.some(function(value){ return !value; })) throw new PublicPredictionError('INVALID_HEADER', 'Header CSV tidak boleh kosong.');
    if(new Set(header).size !== header.length) throw new PublicPredictionError('DUPLICATE_HEADER', 'Header CSV berisi nama kolom duplikat.');
    return records.slice(1).map(function(cells, index){
      if(cells.length !== header.length){
        throw new PublicPredictionError('MALFORMED_CSV', 'Jumlah kolom pada baris ' + (index + 2) + ' tidak sesuai header.');
      }
      var row = {};
      header.forEach(function(name, column){ row[name] = cells[column].trim(); });
      return row;
    });
  }

  function parseTimestamp(value){
    var match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(value || ''));
    if(!match) return null;
    var parts = match.slice(1).map(Number);
    var date = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
    if(date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 ||
       date.getDate() !== parts[2] || date.getHours() !== parts[3] ||
       date.getMinutes() !== parts[4] || date.getSeconds() !== parts[5]) return null;
    if((parts[4] !== 0 && parts[4] !== 30) || parts[5] !== 0) return null;
    return date;
  }

  function classifyRows(rows){
    if(!Array.isArray(rows) || !rows.length) return {ok: false, code: 'EMPTY_INPUT', message: 'Data kosong.'};
    var columns = Object.keys(rows[0]);
    var missing = INPUT_COLUMNS.filter(function(column){ return columns.indexOf(column) === -1; });
    var unexpected = columns.filter(function(column){ return INPUT_COLUMNS.indexOf(column) === -1; });
    if(missing.length || unexpected.length){
      var details = [];
      if(missing.length) details.push('kolom wajib belum ada: ' + missing.join(', '));
      if(unexpected.length) details.push('kolom tidak dikenal: ' + unexpected.join(', '));
      return {ok: false, code: 'SCHEMA_MISMATCH', message: 'Skema CSV tidak sesuai (' + details.join('; ') + ').'};
    }
    var dates = [], seen = new Set(), previous = null;
    for(var i = 0; i < rows.length; i++){
      var keys = Object.keys(rows[i]);
      if(keys.length !== INPUT_COLUMNS.length || INPUT_COLUMNS.some(function(column){ return keys.indexOf(column) === -1; })){
        return {ok: false, code: 'SCHEMA_MISMATCH', message: 'Skema pada baris ' + (i + 1) + ' tidak konsisten.'};
      }
      var timestamp = parseTimestamp(rows[i].datetime);
      if(!timestamp) return {ok: false, code: 'INVALID_TIMESTAMP', message: 'Timestamp baris ' + (i + 1) + ' harus berformat YYYY-MM-DD HH:MM:SS pada interval 30 menit.'};
      var raw = rows[i].datetime;
      if(seen.has(raw)) return {ok: false, code: 'DUPLICATE_TIMESTAMP', message: 'Timestamp duplikat ditemukan pada baris ' + (i + 1) + '.'};
      if(previous !== null && timestamp.getTime() <= previous) return {ok: false, code: 'NON_CHRONOLOGICAL', message: 'Timestamp harus tersusun naik secara kronologis.'};
      seen.add(raw); previous = timestamp.getTime();
      var day = raw.slice(0, 10);
      if(dates.indexOf(day) === -1) dates.push(day);
    }
    if(rows.length === 734 && dates.length === 16){
      return {ok: true, workflow: 'full_submission_compatibility', dates: dates, rowCount: rows.length};
    }
    if(dates.length === 1 && [18, 44, 48].indexOf(rows.length) !== -1){
      return {ok: true, workflow: 'daily_batch', date: dates[0], dates: dates, rowCount: rows.length};
    }
    return {
      ok: false,
      code: 'UNSUPPORTED_BATCH_SHAPE',
      message: 'Gunakan tepat satu tanggal resmi (18, 48, atau 44 baris) atau test.csv resmi lengkap 734 baris. Batch multi-tanggal lain tidak didukung.'
    };
  }

  function validateRealResult(result, expectedCount){
    if(!result || result.source !== 'real_original_pth' || result.simulation !== false || !Array.isArray(result.predictions)){
      throw new PublicPredictionError('INVALID_PROVENANCE', 'Backend tidak mengembalikan hasil checkpoint RINTIK yang terverifikasi.');
    }
    if(result.predictions.length !== expectedCount){
      throw new PublicPredictionError('INVALID_RESULT_COUNT', 'Jumlah hasil backend tidak sama dengan jumlah input.');
    }
  }

  async function processRows(rows, client){
    var classification = classifyRows(rows);
    if(!classification.ok) throw new PublicPredictionError(classification.code, classification.message);
    if(classification.workflow === 'full_submission_compatibility'){
      var full = await client.predictFull({rows: rows});
      validateRealResult(full, rows.length);
      return {
        payload: full,
        meta: {
          workflow: classification.workflow,
          modelSha256: full.model_sha256 || null,
          stateSha256: full.state_sha256 || null,
          pipelineVersion: full.pipeline_version || null,
          persistedToDailyState: false,
          label: 'Kompatibilitas submission resmi 734 titik'
        }
      };
    }
    var date = classification.date;
    await client.ingestDay(date, {rows: rows}, 'public-daily-' + date);
    var daily = await client.runDay(date);
    validateRealResult(daily, rows.length);
    var monitoringStatus = 'ready';
    var monitoringWarning = null;
    try {
      var monitoring = await client.monitorDay(date);
      if(!monitoring || monitoring.mode !== 'synthetic_demo' || monitoring.simulation !== true ||
         !monitoring.rintik || monitoring.rintik.source !== 'real_original_pth'){
        throw new PublicPredictionError('INVALID_MONITORING_PROVENANCE', 'Respons monitoring tidak memisahkan estimasi model dan sensor simulasi secara benar.');
      }
    } catch(error){
      monitoringStatus = 'unavailable';
      monitoringWarning = errorMessage(error);
    }
    return {
      payload: {
        count: daily.predictions.length,
        source: daily.source,
        simulation: daily.simulation,
        predictions: daily.predictions.map(function(row){
          return {datetime: row.datetime || row.timestamp, air_humidity: row.air_humidity};
        })
      },
      meta: {
        workflow: classification.workflow,
        date: date,
        runId: daily.run_id,
        pipelineVersion: daily.pipeline_version,
        modelSha256: daily.model_sha256,
        stateSha256: daily.state_sha256,
        monitoringStatus: monitoringStatus,
        monitoringWarning: monitoringWarning,
        persistedToDailyState: true,
        label: 'Daily batch resmi ' + date
      }
    };
  }

  function errorMessage(error){
    var code = error && error.code;
    var messages = {
      NETWORK_ERROR: 'Backend RINTIK tidak dapat dijangkau. Pastikan layanan lokal aktif dan alamat API benar; tidak ada prediksi pengganti yang dibuat.',
      TIMEOUT: 'Backend RINTIK tidak menjawab dalam batas waktu. Coba lagi setelah status layanan siap; tidak ada prediksi pengganti yang dibuat.',
      INVALID_BACKEND_RESPONSE: 'Alamat API mengembalikan halaman non-JSON. Periksa konfigurasi backend RINTIK, bukan alamat static frontend.',
      OFFICIAL_FIXTURE_MISMATCH: 'File 734 baris bukan test.csv resmi yang dipatok. Checksum/isinya ditolak oleh backend.',
      OUT_OF_ORDER_DATE: 'Tanggal ini belum menjadi batch berikutnya. Proses data test secara kronologis dari tanggal yang diminta dashboard.',
      PREVIOUS_DAY_NOT_RUN: 'Selesaikan inferensi tanggal sebelumnya sebelum memproses tanggal ini.',
      INPUT_CONFLICT: 'Tanggal tersebut sudah tersimpan dengan payload berbeda. Data historis tidak ditimpa.',
      SCENARIO_COMPLETE: 'Seluruh 16 tanggal resmi sudah selesai. Gunakan Dashboard Operator untuk meninjau hasil atau reset state demo secara eksplisit.',
      OFFICIAL_SOURCE_UNAVAILABLE: 'Fixture resmi gagal pemeriksaan integritas. Proses dihentikan tanpa membuat prediksi.',
      MODEL_UNAVAILABLE: 'Model frozen RINTIK tidak tersedia. Tidak ada prediksi pengganti yang dibuat.'
    };
    if(messages[code]) return messages[code];
    if(error instanceof PublicPredictionError) return error.message;
    if(error && error.message && !/unexpected token|failed to fetch/i.test(error.message)) return error.message;
    return 'Prediksi gagal secara aman. Periksa backend dan data, lalu coba lagi; tidak ada hasil palsu yang dibuat.';
  }

  return {
    INPUT_COLUMNS: INPUT_COLUMNS,
    PublicPredictionError: PublicPredictionError,
    parseCsvText: parseCsvText,
    classifyRows: classifyRows,
    processRows: processRows,
    errorMessage: errorMessage
  };
});
