/* RINTIK - halaman Pemeriksaan (periksa.html). Vanilla JS, tanpa dependensi.
   Bergantung pada app.js (window.RINTIK) untuk format tanggal dan ring KPI.

   Sumber jawaban /monitor:
     - default                 : POST /api/monitor (proxy Vercel ke layanan model)
     - window.RINTIK_MONITOR_URL: POST ke URL itu (uji lokal ke backend lain)
     - ?mock=1                 : GET assets/data/mock_monitor_response.json (HANYA uji lokal)
   Query lain: ?demo=sehat|rusak memuat file contoh, &autorun=1 langsung memeriksa. */
(function(){
  "use strict";
  var root = document.getElementById('pkDropzone');
  if(!root) return;

  var R = window.RINTIK || {};
  var QS = new URLSearchParams(window.location.search);
  var MOCK = QS.get('mock') === '1';
  // Lokal (server statis tanpa /api): panggil backend RINTIK langsung, sama seperti halaman lain
  // (alamat dari window.RINTIK_resolveApiBase() di lib/rintik-config.js). Di situs terdeploy
  // tetap lewat proxy /api/monitor.
  function resolveMonitorUrl(){
    if(window.RINTIK_MONITOR_URL) return window.RINTIK_MONITOR_URL;
    var local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if(!local) return '/api/monitor';
    return (window.RINTIK_resolveApiBase ? window.RINTIK_resolveApiBase() : 'http://127.0.0.1:8140') + '/monitor';
  }
  var MONITOR_URL = resolveMonitorUrl();
  var LOG_KEY = 'rintik_runs';
  var LOG_MAX = 20;
  var MAX_ROWS = 2000;
  var DT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  var MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

  var STATUS = {
    sehat:            { label: 'Sehat',            cls: 'teal',  line: '#2F9AA6', band: 'rgba(47,154,166,.10)',  cap: '#8DDBE2' },
    waspada:          { label: 'Waspada',          cls: 'amber', line: '#E89A2C', band: 'rgba(251,199,96,.20)',  cap: '#FBC760' },
    dugaan_malfungsi: { label: 'Dugaan malfungsi', cls: 'rose',  line: '#D8547A', band: 'rgba(216,84,122,.12)',  cap: '#F087A6' },
    data_kurang:      { label: 'Data kurang',      cls: 'slate', line: '#9AACC0', band: 'rgba(154,172,192,.16)', cap: '#C9D6E4' }
  };
  function st(s){ return STATUS[s] || STATUS.data_kurang; }

  var LABELS = {
    co2: 'Kadar CO2 Udara', pressure: 'Tekanan Udara', air_temperature: 'Suhu Udara',
    soil_ec_line1: 'Konduktivitas Tanah (Jalur 1)', soil_humidity_line1: 'Kelembapan Tanah (Jalur 1)', soil_temp_line1: 'Suhu Tanah (Jalur 1)',
    soil_ec_line2: 'Konduktivitas Tanah (Jalur 2)', soil_humidity_line2: 'Kelembapan Tanah (Jalur 2)', soil_temp_line2: 'Suhu Tanah (Jalur 2)',
    soil_ec_line3: 'Konduktivitas Tanah (Jalur 3)', soil_humidity_line3: 'Kelembapan Tanah (Jalur 3)', soil_temp_line3: 'Suhu Tanah (Jalur 3)',
    water_volume_line1: 'Volume Air Terpakai (Jalur 1)', water_volume_line2: 'Volume Air Terpakai (Jalur 2)', water_volume_line3: 'Volume Air Terpakai (Jalur 3)',
    gdd: 'Akumulasi Panas Harian', standard_day_degree: 'Derajat Hari Standar', daily_mean_temperature: 'Rata-rata Suhu Harian',
    daily_max_above_Tbase: 'Selisih Suhu Maks. di Atas Ambang', daily_max: 'Suhu Maksimum Harian',
    daily_max_reduction: 'Pengurangan Suhu Maks. Harian', ontario_units: 'Satuan Panas Ontario'
  };

  /* ---------------- helpers ---------------- */
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function num(v){ if(v === null || v === undefined || String(v).trim() === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function signed(v, d){ if(v == null || !isFinite(v)) return '-'; var s = Math.abs(v).toFixed(d == null ? 1 : d); return (v > 0 ? '+' : (v < 0 ? '−' : '')) + s; }
  function fmtNum(v){
    if(v == null || !isFinite(v)) return '-';
    var a = Math.abs(v);
    return a >= 1000 ? Math.round(v).toLocaleString('id-ID') : (a >= 100 ? v.toFixed(0) : (a >= 10 ? v.toFixed(1) : v.toFixed(2)));
  }
  function toDate(s){ var d = new Date(String(s).replace(' ', 'T')); return isNaN(d.getTime()) ? null : d; }
  function dayLabel(dateStr){ var d = toDate(dateStr + ' 00:00:00'); return d && R.fmtDay ? R.fmtDay(d) : dateStr; }
  function longDate(dateStr){ var d = toDate(dateStr + ' 00:00:00'); return d ? d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() : dateStr; }
  function pad2(n){ return String(n).padStart(2,'0'); }

  function parseCsvText(text){
    var lines = String(text || '').replace(/^﻿/, '').trim().split(/\r?\n/);
    if(lines.length < 2) return { header: [], rows: [] };
    var header = lines[0].split(',').map(function(s){ return s.trim().replace(/^"|"$/g, ''); });
    var rows = [];
    for(var i = 1; i < lines.length; i++){
      if(!lines[i].trim()) continue;
      var cells = lines[i].split(',');
      var obj = {};
      for(var j = 0; j < header.length; j++) obj[header[j]] = (cells[j] || '').trim().replace(/^"|"$/g, '');
      rows.push(obj);
    }
    return { header: header, rows: rows };
  }

  /* Validasi sisi klien, pesannya sama dengan lib/validate.js + aturan air_humidity. */
  function validate(parsed){
    var rows = parsed.rows;
    if(!rows.length) return 'Data kosong. Periksa kembali file Anda.';
    if(parsed.header.indexOf('datetime') === -1) return 'Kolom waktu (datetime) belum ada di file.';
    if(parsed.header.indexOf('air_humidity') === -1) return 'Kolom bacaan sensor kelembapan (air_humidity) belum ada. Tanpa kolom ini tidak ada yang bisa dibandingkan.';
    if(rows.length > MAX_ROWS) return 'Data terlalu besar. Gunakan file yang lebih kecil (paling banyak 2000 baris).';
    var filled = 0;
    for(var i = 0; i < rows.length; i++){
      if(!DT_RE.test(rows[i].datetime) || !toDate(rows[i].datetime)) return 'Format waktu baris ' + (i + 1) + ' belum sesuai. Gunakan format YYYY-MM-DD HH:MM:SS.';
      var h = rows[i].air_humidity;
      if(h !== '' && num(h) === null) return 'Bacaan sensor kelembapan pada baris ' + (i + 1) + ' bukan angka.';
      if(h !== '') filled++;
    }
    if(!filled) return 'Semua bacaan sensor kelembapan kosong. Tidak ada yang bisa diperiksa.';
    return '';
  }

  /* ---------------- state ---------------- */
  var current = null; // { name, rows, isDemo, demoKind }
  var trainStats = null;
  var trainStatsPromise = null;
  function loadTrainStats(){
    if(!trainStatsPromise){
      trainStatsPromise = fetch('assets/data/train_stats.json').then(function(r){
        if(!r.ok) throw new Error('stats');
        return r.json();
      }).then(function(j){ trainStats = j; return j; });
    }
    return trainStatsPromise;
  }

  /* ---------------- upload UI ---------------- */
  var fileInput = $('pkFileInput'), dzEmpty = $('pkDzEmpty'), dzFilled = $('pkDzFilled');
  var fileNameEl = $('pkFileName'), fileMetaEl = $('pkFileMeta'), alertBox = $('pkAlert');
  var preview = $('pkPreview'), runBtn = $('pkRunBtn'), demoNote = $('pkDemoNote');

  function showAlert(kind, msg){
    alertBox.hidden = !msg;
    alertBox.className = 'alert alert-' + kind;
    alertBox.querySelector('.alert-text').textContent = msg || '';
  }
  function setFile(name, meta){
    dzEmpty.hidden = true; dzFilled.hidden = false; root.classList.add('filled');
    fileNameEl.textContent = name; fileMetaEl.textContent = meta;
  }
  function resetFile(){
    current = null;
    dzEmpty.hidden = false; dzFilled.hidden = true; root.classList.remove('filled');
    showAlert('success', ''); preview.hidden = true; demoNote.hidden = true;
    runBtn.disabled = true; fileInput.value = '';
    document.querySelectorAll('[data-demo]').forEach(function(b){ b.classList.remove('active'); });
  }

  function acceptText(name, text, sizeKb, demoKind){
    var parsed = parseCsvText(text);
    var err = validate(parsed);
    setFile(name, (sizeKb != null ? sizeKb.toFixed(1) + ' KB, ' : '') + (err ? 'isi belum sesuai' : parsed.rows.length + ' baris siap diperiksa'));
    demoNote.hidden = !demoKind;
    document.querySelectorAll('[data-demo]').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-demo') === demoKind); });
    if(demoKind){
      $('pkDemoNoteText').textContent = demoKind === 'rusak' ?
        'Sensor sintetis dibuat rusak: macet di 99% pada 4-5 September, mati pada 6 September, lalu pulih setelah diperbaiki.' :
        'Sensor sintetis sehat: mengikuti pola harian dengan sedikit gangguan acak, tanpa kerusakan.';
    }
    if(err){
      current = null; runBtn.disabled = true; preview.hidden = true;
      showAlert('error', err);
      return false;
    }
    current = { name: name, rows: parsed.rows, isDemo: !!demoKind, demoKind: demoKind || null };
    runBtn.disabled = false;
    showAlert('success', 'Data berhasil dibaca. Bacaan sensor kelembapan ditemukan.');
    renderPreview(parsed.rows.slice(0, 6));
    return true;
  }

  function renderPreview(sample){
    var body = sample.map(function(r){
      var h = num(r.air_humidity);
      return '<tr><td>' + esc(r.datetime) + '</td><td class="up">' + (h == null ? '<span class="muted-cell">kosong</span>' : h.toFixed(1) + '%') +
        '</td><td>' + esc(r.air_temperature || '-') + '</td><td>' + esc(r.pressure || '-') + '</td></tr>';
    }).join('');
    preview.innerHTML =
      '<div class="csv-preview-head"><span>Pratinjau 6 baris pertama</span></div>' +
      '<div class="table-scroll"><table class="data-table"><thead><tr><th>Waktu</th><th>Bacaan Sensor Kelembapan</th><th>Suhu Udara</th><th>Tekanan</th></tr></thead><tbody>' + body + '</tbody></table></div>';
    preview.hidden = false;
  }

  function handleFile(file){
    if(!/\.csv$/i.test(file.name)){ setFile(file.name, 'File belum sesuai'); showAlert('error', 'Gunakan file berformat CSV.'); runBtn.disabled = true; return; }
    if(file.size > 5 * 1024 * 1024){ setFile(file.name, 'Ukuran file terlalu besar'); showAlert('error', 'Ukuran file terlalu besar.'); runBtn.disabled = true; return; }
    var reader = new FileReader();
    reader.onload = function(){ acceptText(file.name, reader.result, file.size / 1024, null); };
    reader.onerror = function(){ setFile(file.name, 'File tidak bisa dibaca'); showAlert('error', 'File tidak bisa dibaca.'); };
    reader.readAsText(file);
  }

  function loadDemo(kind){
    var name = kind === 'rusak' ? 'demo_rusak.csv' : 'demo_sehat.csv';
    return fetch('assets/data/' + name).then(function(r){
      if(!r.ok) throw new Error('demo');
      return r.text();
    }).then(function(t){
      return acceptText(name, t, t.length / 1024, kind);
    }).catch(function(){
      showAlert('error', 'File contoh tidak bisa dimuat. Coba lagi.');
      return false;
    });
  }

  root.addEventListener('click', function(){ if(!root.classList.contains('filled')) fileInput.click(); });
  root.addEventListener('dragover', function(e){ e.preventDefault(); root.classList.add('drag'); });
  root.addEventListener('dragleave', function(){ root.classList.remove('drag'); });
  root.addEventListener('drop', function(e){ e.preventDefault(); root.classList.remove('drag'); var f = e.dataTransfer.files[0]; if(f) handleFile(f); });
  fileInput.addEventListener('change', function(){ if(fileInput.files[0]) handleFile(fileInput.files[0]); });
  $('pkRemoveFile').addEventListener('click', function(e){ e.stopPropagation(); resetFile(); });
  document.querySelectorAll('[data-demo]').forEach(function(b){
    b.addEventListener('click', function(){ loadDemo(b.getAttribute('data-demo')); });
  });
  // File contoh: input resmi periode uji (29 Agu-13 Sep) + kolom sensor kelembapan SINTETIS
  // (sehat, atau macet/mati dari skenario simulasi tim). Bukan pengukuran; aman di-host.
  fetch('assets/data/demo_sehat.csv', { method: 'HEAD' }).then(function(r){
    if(r.ok) $('pkDemoRow').hidden = false;
  }).catch(function(){});

  /* ---------------- run ---------------- */
  var overlay = $('pkOverlay');
  function runOverlay(){
    overlay.hidden = false;
    var steps = overlay.querySelectorAll('.loading-step');
    steps.forEach(function(s){ s.classList.remove('active', 'done'); });
    var i = 0, timer = null;
    function tick(){
      if(i > 0){ steps[i-1].classList.remove('active'); steps[i-1].classList.add('done'); }
      if(i < steps.length - 1){ steps[i].classList.add('active'); i++; timer = setTimeout(tick, 450); }
      else if(i === steps.length - 1){ steps[i].classList.add('active'); }
    }
    tick();
    return function(){ if(timer) clearTimeout(timer); overlay.hidden = true; };
  }

  function callMonitor(rows){
    if(MOCK){
      return fetch('assets/data/mock_monitor_response.json').then(function(r){
        if(!r.ok) throw { message: 'Mock tidak ditemukan.' };
        return r.json();
      });
    }
    return fetch(MONITOR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: rows, comparator: 'p3' })
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(j){
        if(!res.ok) throw { message: (j && j.error && (typeof j.error === 'string' ? j.error : j.error.message)) || 'Terjadi kendala saat memeriksa. Coba lagi.' };
        if(!j || !Array.isArray(j.days) || !Array.isArray(j.predictions)) throw { message: 'Jawaban layanan pemeriksaan tidak lengkap. Coba lagi sebentar lagi.' };
        return j;
      });
    }, function(){
      throw { message: 'Model sedang bangun, coba lagi dalam 1 menit.' };
    });
  }

  function run(){
    if(!current) return;
    var job = current;
    var stop = runOverlay();
    runBtn.disabled = true;
    var statsP = loadTrainStats().catch(function(){ return null; });
    callMonitor(job.rows).then(function(data){
      return statsP.then(function(){
        stop();
        renderResults(job, data);
        renderDrift(job.rows);
        saveRun(job, data);
        renderLog();
        scrollToResults();
      });
    }).catch(function(err){
      return statsP.then(function(){
        stop();
        renderFailure(job, (err && err.message) || 'Terjadi kendala saat memeriksa. Coba lagi.');
        renderDrift(job.rows);
        scrollToResults();
      });
    }).then(function(){ runBtn.disabled = !current; });
  }
  runBtn.addEventListener('click', run);

  function scrollToResults(){
    var el = $('pkResults');
    if(el && el.scrollIntoView) el.scrollIntoView({ behavior: QS.get('autorun') === '1' ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------------- results ---------------- */
  var lastData = null;

  function headBadges(job, data){
    var b = '';
    if(data && data._mock) b += '<span class="badge badge-amber"><span class="badge-dot"></span>Mode uji lokal: jawaban tiruan</span>';
    if(job.isDemo) b += '<span class="badge badge-violet"><span class="badge-dot"></span>Contoh sintetis periode uji (bukan pengukuran)</span>';
    b += '<span class="badge badge-slate">' + esc(job.name) + '</span>';
    $('pkHeadBadges').innerHTML = b;
  }

  function renderFailure(job, msg){
    $('pkResults').hidden = false;
    headBadges(job, null);
    $('pkRange').textContent = 'Perbandingan dengan tebakan RINTIK belum tersedia untuk file ini.';
    $('pkMonitorBlock').hidden = true;
    var e = $('pkResultError');
    e.hidden = false;
    e.querySelector('.alert-text').textContent = msg + ' Panel pergeseran input di bawah tetap dihitung di perangkat Anda.';
    showAlert('error', msg);
  }

  function renderResults(job, data){
    lastData = data;
    $('pkResults').hidden = false;
    $('pkResultError').hidden = true;
    $('pkMonitorBlock').hidden = false;
    headBadges(job, data);

    var days = data.days || [];
    var preds = data.predictions || [];
    var sum = data.summary || {};
    var total = days.length || 1;
    if(days.length){
      $('pkRange').textContent = 'Periode ' + longDate(days[0].date) + ' sampai ' + longDate(days[days.length-1].date) +
        ' · ' + days.length + ' hari · ' + (data.count || preds.length) + ' bacaan';
    }
    if(data.rule_version){
      document.querySelectorAll('.js-rule-note').forEach(function(n){
        n.textContent = 'Ambang ' + data.rule_version + ' dari simulasi 23 hari validasi, belum dikalibrasi untuk lokasi lain.';
      });
    }

    [['Sehat','sehat'],['Waspada','waspada'],['Dugaan','dugaan_malfungsi']].forEach(function(p){
      var k = sum[p[1]] || 0;
      var ring = $('pkRing' + p[0]);
      ring.setAttribute('data-pct', String(Math.round(k / total * 100)));
      ring.setAttribute('data-label', String(k));
      if(R.renderKpiRing) R.renderKpiRing(ring);
      if(QS.get('autorun') === '1'){ // tautan langsung: tanpa animasi agar tangkapan layar akurat
        var fg = ring.querySelector('.kpi-ring-fg');
        if(fg){ fg.style.transition = 'none'; fg.style.strokeDashoffset = String(2 * Math.PI * 25 * (1 - k / total)); }
      }
      $('pkKpi' + p[0]).textContent = k + ' dari ' + days.length + ' hari';
    });
    var foot = $('pkKpiFoot');
    var kurang = sum.data_kurang || 0;
    foot.hidden = !kurang;
    foot.textContent = kurang ? kurang + ' hari lain belum bisa dinilai karena bacaannya terlalu sedikit.' : '';

    renderChart();
    renderDays(days);
  }

  /* chart: 2 garis + pita status per hari */
  var chartWrap = $('pkChart'), tooltip = $('pkTooltip');
  function renderChart(){
    if(!lastData) return;
    var preds = lastData.predictions || [];
    var days = lastData.days || [];
    var comp = lastData.comparator || 'p3';
    var n = preds.length;
    if(n < 2){ chartWrap.innerHTML = ''; return; }
    var W = chartWrap.clientWidth || 900;
    var mobile = W < 560;
    var H = mobile ? 260 : 340;
    var pad = { t: 22, r: mobile ? 8 : 16, b: 30, l: mobile ? 30 : 40 };
    var sensor = preds.map(function(p){ return num(p.sensor); });
    var model = preds.map(function(p){ return num(p[comp]); });
    var all = sensor.concat(model).filter(function(v){ return v != null; });
    var lo = Math.max(0, Math.floor((Math.min.apply(null, all) - 3) / 10) * 10);
    var hi = Math.min(100, Math.ceil((Math.max.apply(null, all) + 3) / 10) * 10);
    if(hi - lo < 20) hi = Math.min(100, lo + 20);
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    function x(i){ return pad.l + (i / (n - 1)) * iw; }
    function y(v){ return pad.t + (1 - (v - lo) / (hi - lo)) * ih; }
    var step = iw / (n - 1);

    // pita per hari
    var dayStatus = {};
    days.forEach(function(d){ dayStatus[d.date] = d.status; });
    var spans = [];
    preds.forEach(function(p, i){
      var key = String(p.datetime).slice(0, 10);
      var last = spans[spans.length - 1];
      if(last && last.date === key) last.end = i; else spans.push({ date: key, start: i, end: i });
    });
    var bands = '', caps = '', seps = '', xl = '';
    var every = Math.max(1, Math.ceil(spans.length / (mobile ? 5 : 15)));
    spans.forEach(function(s, k){
      var x0 = k === 0 ? pad.l : x(s.start) - step / 2;
      var x1 = k === spans.length - 1 ? pad.l + iw : x(s.end) + step / 2;
      var S = st(dayStatus[s.date]);
      bands += '<rect x="' + x0.toFixed(1) + '" y="' + pad.t + '" width="' + Math.max(0, x1 - x0).toFixed(1) + '" height="' + ih + '" fill="' + S.band + '"/>';
      caps += '<rect x="' + (x0 + 1).toFixed(1) + '" y="' + (pad.t - 8) + '" width="' + Math.max(0, x1 - x0 - 2).toFixed(1) + '" height="4" rx="2" fill="' + S.cap + '"><title>' + esc(dayLabel(s.date) + ': ' + S.label) + '</title></rect>';
      if(k > 0) seps += '<line x1="' + x0.toFixed(1) + '" y1="' + pad.t + '" x2="' + x0.toFixed(1) + '" y2="' + (pad.t + ih) + '" stroke="#FFFFFF" stroke-width="1.5"/>';
      if(k % every === 0){
        var d = toDate(s.date + ' 00:00:00');
        xl += '<text x="' + ((x0 + x1) / 2).toFixed(1) + '" y="' + (H - 9) + '" font-size="10.5" fill="#7D8FA5" text-anchor="middle">' + (d ? pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) : '') + '</text>';
      }
    });

    var grid = '', yl = '';
    var ticks = mobile ? 4 : 5;
    for(var t = 0; t <= ticks; t++){
      var v = lo + (hi - lo) * t / ticks, yy = y(v);
      grid += '<line x1="' + pad.l + '" y1="' + yy.toFixed(1) + '" x2="' + (pad.l + iw) + '" y2="' + yy.toFixed(1) + '" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="1"/>' +
              '<line x1="' + pad.l + '" y1="' + yy.toFixed(1) + '" x2="' + (pad.l + iw) + '" y2="' + yy.toFixed(1) + '" stroke="#C9D6E4" stroke-opacity=".55" stroke-dasharray="2 4" stroke-width="1"/>';
      yl += '<text x="' + (pad.l - 8) + '" y="' + (yy + 3.5).toFixed(1) + '" font-size="10.5" fill="#7D8FA5" text-anchor="end">' + Math.round(v) + '</text>';
    }

    function path(arr){
      var d = '', pen = false;
      arr.forEach(function(v, i){
        if(v == null){ pen = false; return; }
        d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1);
        pen = true;
      });
      return d;
    }

    chartWrap.innerHTML =
      '<svg width="100%" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" id="pkChartSvg" role="img" aria-label="Grafik bacaan sensor dan tebakan RINTIK per 30 menit">' +
      bands + seps + grid + caps + yl + xl +
      '<text x="' + (pad.l - 8) + '" y="' + (pad.t - 12) + '" font-size="10" fill="#9AACC0" text-anchor="end">%</text>' +
      '<path d="' + path(model) + '" fill="none" stroke="#1269E2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>' +
      '<path d="' + path(sensor) + '" fill="none" stroke="#15366F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<g id="pkHover" style="display:none">' +
        '<line id="pkHoverLine" y1="' + pad.t + '" y2="' + (pad.t + ih) + '" stroke="#15366F" stroke-opacity=".35" stroke-width="1"/>' +
        '<circle id="pkHoverS" r="4" fill="#15366F" stroke="#fff" stroke-width="2"/>' +
        '<circle id="pkHoverM" r="4" fill="#1269E2" stroke="#fff" stroke-width="2"/>' +
      '</g>' +
      '<rect x="' + pad.l + '" y="' + pad.t + '" width="' + iw + '" height="' + ih + '" fill="transparent" id="pkHit"/>' +
      '</svg>';

    var svg = $('pkChartSvg'), hit = $('pkHit'), hov = $('pkHover');
    function move(ev){
      var rect = svg.getBoundingClientRect();
      var px = (ev.clientX - rect.left) / rect.width * W;
      var i = Math.max(0, Math.min(n - 1, Math.round((px - pad.l) / step)));
      var sv = sensor[i], mv = model[i], xi = x(i);
      hov.style.display = '';
      $('pkHoverLine').setAttribute('x1', xi); $('pkHoverLine').setAttribute('x2', xi);
      var hs = $('pkHoverS'), hm = $('pkHoverM');
      hs.style.display = sv == null ? 'none' : ''; if(sv != null){ hs.setAttribute('cx', xi); hs.setAttribute('cy', y(sv)); }
      hm.style.display = mv == null ? 'none' : ''; if(mv != null){ hm.setAttribute('cx', xi); hm.setAttribute('cy', y(mv)); }
      var S = st(dayStatus[String(preds[i].datetime).slice(0, 10)]);
      tooltip.innerHTML = '<div class="tt-time">' + esc(preds[i].datetime).slice(0, 16) + '</div>' +
        '<div class="tt-row"><i style="background:#15366F"></i>Bacaan sensor <b>' + (sv == null ? 'kosong' : sv.toFixed(1) + '%') + '</b></div>' +
        '<div class="tt-row"><i style="background:#1269E2"></i>Tebakan RINTIK <b>' + (mv == null ? '-' : mv.toFixed(1) + '%') + '</b></div>' +
        '<div class="tt-row tt-diff">Selisih <b>' + (sv == null || mv == null ? '-' : signed(sv - mv) + ' poin') + '</b><span class="tt-chip" style="background:' + S.cap + '">' + S.label + '</span></div>';
      tooltip.style.opacity = 1;
      var left = xi / W * rect.width;
      var tw = tooltip.offsetWidth || 180;
      left = Math.max(tw / 2 + 4, Math.min(rect.width - tw / 2 - 4, left));
      tooltip.style.left = left + 'px';
      tooltip.style.top = '6px';
    }
    function leave(){ hov.style.display = 'none'; tooltip.style.opacity = 0; }
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', leave);
  }
  var resizeT = null;
  window.addEventListener('resize', function(){ clearTimeout(resizeT); resizeT = setTimeout(renderChart, 120); });

  function renderDays(days){
    $('pkDays').innerHTML = days.map(function(d){
      var S = st(d.status);
      var hasOwn = d.reasons && d.reasons.length;
      var reasons = hasOwn ? d.reasons : (d.status === 'sehat' ? ['Bacaan sensor sejalan dengan tebakan RINTIK.'] : []);
      return '<article class="pk-day pk-day-' + S.cls + '">' +
        '<div class="pk-day-top"><span class="pk-day-date">' + esc(dayLabel(d.date)) + '</span>' +
        '<span class="badge badge-' + S.cls + '"><span class="badge-dot"></span>' + S.label + '</span></div>' +
        '<div class="pk-day-diff"><strong>' + signed(num(d.mean_diff)) + '</strong><span>poin selisih rata-rata</span></div>' +
        '<div class="pk-day-meta">' + (d.n != null ? d.n + ' bacaan' : '') + '</div>' +
        (reasons.length ? '<ul class="pk-day-reasons' + (hasOwn ? '' : ' pk-day-reasons-default') + '">' + reasons.map(function(r){ return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' : '') +
        '</article>';
    }).join('');
  }

  /* ---------------- drift (dihitung di browser) ---------------- */
  // Kenaikan harian: median harian dikurangi median hari kalender sebelumnya
  // (sama persis dengan scripts/build_monitor_assets.py).
  function median(a){ var s = a.slice().sort(function(p, q){ return p - q; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2; }
  function dailyIncrements(rows, col){
    var byDay = {};
    rows.forEach(function(r){
      var v = num(r[col]); if(v == null) return;
      var k = String(r.datetime).slice(0, 10);
      (byDay[k] = byDay[k] || []).push(v);
    });
    var keys = Object.keys(byDay).sort();
    var out = [], prevK = null, prevV = null;
    keys.forEach(function(k){
      var v = median(byDay[k]);
      if(prevK){
        var gap = Math.round((toDate(k + ' 00:00:00') - toDate(prevK + ' 00:00:00')) / 86400000);
        if(gap === 1) out.push(v - prevV);
      }
      prevK = k; prevV = v;
    });
    return out;
  }
  function computeDrift(rows){
    if(!trainStats) return [];
    var cols = trainStats.columns || {};
    var excluded = trainStats.excluded || ['env_id', 'env_battery'];
    return Object.keys(cols).filter(function(c){ return excluded.indexOf(c) === -1; }).map(function(c){
      var s = cols[c];
      var cum = !!s.daily_increment;
      var ref = cum ? s.daily_increment : s;
      var vals = cum ? dailyIncrements(rows, c) : rows.map(function(r){ return num(r[c]); }).filter(function(v){ return v != null; });
      var item = { col: c, label: LABELS[c] || c, cumulative: cum, n: vals.length, ref: ref, mean: null, z: null, outPct: null };
      if(!vals.length || !ref.sd) return item;
      var m = vals.reduce(function(a, b){ return a + b; }, 0) / vals.length;
      var out = vals.filter(function(v){ return v < ref.p1 || v > ref.p99; }).length;
      item.mean = m;
      item.z = (m - ref.mean) / ref.sd;
      item.outPct = out / vals.length * 100;
      return item;
    }).sort(function(a, b){
      if(a.z == null) return 1; if(b.z == null) return -1;
      return Math.abs(b.z) - Math.abs(a.z);
    });
  }

  var driftShowAll = false;
  var driftItems = [];
  function renderDrift(rows){
    driftItems = computeDrift(rows);
    var card = $('pkDriftCard');
    if(!driftItems.length){ card.hidden = true; return; }
    card.hidden = false;
    driftShowAll = false;
    paintDrift();
  }
  function zClass(z){ var a = Math.abs(z); return a >= 2 ? 'rose' : (a >= 1 ? 'amber' : 'teal'); }
  function paintDrift(){
    var outside = driftItems.filter(function(d){ return d.outPct != null && d.outPct > 50; }).length;
    $('pkDriftCount').textContent = outside ? outside + ' sensor di luar rentang latih' : 'Semua sensor dalam rentang latih';
    $('pkDriftCount').className = 'badge ' + (outside ? 'badge-rose' : 'badge-teal');
    var LIMIT = 8;
    var list = driftShowAll ? driftItems : driftItems.slice(0, LIMIT);
    var ZMAX = 4;
    $('pkDriftList').innerHTML =
      '<div class="drift-row drift-row-head"><span>Sensor</span><span>Skor geser</span><span class="dr-num">Rata-rata Anda</span><span class="dr-num">Rata-rata latih</span><span class="dr-num">Di luar rentang</span></div>' +
      list.map(function(d){
        var unitNote = d.cumulative ? '<span class="dr-sub">kenaikan per hari</span>' : '';
        if(d.z == null){
          return '<div class="drift-row drift-empty"><span class="dr-name">' + esc(d.label) + unitNote + '</span><span class="dr-na">Tidak ada data di file Anda</span><span></span><span></span><span></span></div>';
        }
        var zc = Math.max(-ZMAX, Math.min(ZMAX, d.z));
        var w = Math.abs(zc) / ZMAX * 50;
        var left = zc >= 0 ? 50 : 50 - w;
        var chip = d.outPct > 50 ? '<span class="badge badge-rose dr-chip">di luar rentang latih</span>' : '';
        return '<div class="drift-row">' +
          '<span class="dr-name">' + esc(d.label) + unitNote + chip + '</span>' +
          '<span class="dr-zcell"><span class="dr-track"><span class="dr-mid"></span><span class="dr-bar dr-' + zClass(d.z) + '" style="left:' + left.toFixed(1) + '%;width:' + Math.max(w, 0.8).toFixed(1) + '%"></span></span>' +
          '<b class="dr-z dr-z-' + zClass(d.z) + '">' + signed(d.z, 1) + (Math.abs(d.z) > ZMAX ? '' : '') + '</b></span>' +
          '<span class="dr-num" data-l="Rata-rata Anda">' + fmtNum(d.mean) + '</span>' +
          '<span class="dr-num" data-l="Rata-rata latih">' + fmtNum(d.ref.mean) + '</span>' +
          '<span class="dr-num dr-out' + (d.outPct > 50 ? ' dr-out-hi' : '') + '" data-l="Di luar rentang">' + Math.round(d.outPct) + '% <small>' + (d.cumulative ? 'hari' : 'baris') + '</small></span>' +
          '</div>';
      }).join('');
    var more = $('pkDriftMore');
    more.hidden = driftItems.length <= LIMIT;
    more.textContent = driftShowAll ? 'Tampilkan lebih sedikit' : 'Tampilkan semua ' + driftItems.length + ' sensor';
  }
  $('pkDriftMore').addEventListener('click', function(){ driftShowAll = !driftShowAll; paintDrift(); });

  /* ---------------- log (localStorage) ---------------- */
  function readLog(){
    try { var a = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; }
  }
  function writeLog(a){ try { localStorage.setItem(LOG_KEY, JSON.stringify(a.slice(0, LOG_MAX))); } catch(e){} }
  function saveRun(job, data){
    var s = data.summary || {};
    var entry = {
      waktu: new Date().toISOString(),
      file: job.name,
      baris: job.rows.length,
      ringkasan: { sehat: s.sehat || 0, waspada: s.waspada || 0, dugaan_malfungsi: s.dugaan_malfungsi || 0, data_kurang: s.data_kurang || 0 },
      comparator: data.comparator || 'p3',
      rule_version: data.rule_version || '-',
      contoh: job.isDemo
    };
    if(data._mock) entry.mock = true;
    var log = readLog();
    log.unshift(entry);
    writeLog(log);
  }
  function fmtWhen(iso){
    var d = new Date(iso); if(isNaN(d.getTime())) return '-';
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function renderLog(){
    var log = readLog();
    $('pkLogEmpty').hidden = log.length > 0;
    $('pkLogTableWrap').hidden = log.length === 0;
    $('pkLogDownload').disabled = $('pkLogClear').disabled = log.length === 0;
    function chipsOf(r){
      return '<span class="log-chips">' +
        '<span class="log-chip lc-teal" title="Sehat">' + (r.sehat || 0) + '</span>' +
        '<span class="log-chip lc-amber" title="Waspada">' + (r.waspada || 0) + '</span>' +
        '<span class="log-chip lc-rose" title="Dugaan malfungsi">' + (r.dugaan_malfungsi || 0) + '</span>' +
        (r.data_kurang ? '<span class="log-chip lc-slate" title="Data kurang">' + r.data_kurang + '</span>' : '') +
        '</span>';
    }
    $('pkLogCards').innerHTML = log.map(function(e){
      return '<div class="log-card"><div class="log-card-top"><strong>' + esc(e.file) + '</strong>' + chipsOf(e.ringkasan || {}) + '</div>' +
        '<div class="log-card-meta">' + fmtWhen(e.waktu) + ' \u00b7 ' + esc(e.baris) + ' baris \u00b7 ' + esc(e.comparator) + ' \u00b7 ' + esc(e.rule_version) +
        (e.contoh ? ' <span class="badge badge-violet">contoh</span>' : '') + (e.mock ? ' <span class="badge badge-amber">tiruan</span>' : '') + '</div></div>';
    }).join('');
    $('pkLogBody').innerHTML = log.map(function(e){
      var r = e.ringkasan || {};
      var chips = '<span class="log-chips">' +
        '<span class="log-chip lc-teal" title="Sehat">' + (r.sehat || 0) + '</span>' +
        '<span class="log-chip lc-amber" title="Waspada">' + (r.waspada || 0) + '</span>' +
        '<span class="log-chip lc-rose" title="Dugaan malfungsi">' + (r.dugaan_malfungsi || 0) + '</span>' +
        (r.data_kurang ? '<span class="log-chip lc-slate" title="Data kurang">' + r.data_kurang + '</span>' : '') +
        '</span>';
      return '<tr><td class="nowrap">' + fmtWhen(e.waktu) + '</td><td class="log-file">' + esc(e.file) +
        (e.contoh ? ' <span class="badge badge-violet">contoh</span>' : '') + (e.mock ? ' <span class="badge badge-amber">tiruan</span>' : '') +
        '</td><td>' + esc(e.baris) + '</td><td>' + chips + '</td><td>' + esc(e.comparator) + '</td><td>' + esc(e.rule_version) + '</td></tr>';
    }).join('');
  }
  $('pkLogDownload').addEventListener('click', function(){
    var log = readLog(); if(!log.length) return;
    var blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    a.href = url;
    a.download = 'log_pemeriksaan_rintik_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  $('pkLogClear').addEventListener('click', function(){
    if(!readLog().length) return;
    if(window.confirm && !window.confirm('Hapus semua log pemeriksaan di peramban ini?')) return;
    try { localStorage.removeItem(LOG_KEY); } catch(e){}
    renderLog();
  });

  /* ---------------- boot ---------------- */
  renderLog();
  loadTrainStats().catch(function(){});
  var qDemo = QS.get('demo');
  if(qDemo === 'sehat' || qDemo === 'rusak'){
    loadDemo(qDemo).then(function(ok){ if(ok && QS.get('autorun') === '1') run(); });
  }
})();
