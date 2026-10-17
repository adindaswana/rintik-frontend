/* RINTIK front-end logic (vanilla JS, no dependencies) */
(function(){
  "use strict";

  /* ---------------- Nav / mobile menu ---------------- */
  var navToggle = document.querySelector('.nav-toggle');
  var mobileMenu = document.querySelector('.mobile-menu');
  if(navToggle && mobileMenu){
    navToggle.addEventListener('click', function(){
      mobileMenu.classList.toggle('open');
    });
  }

  /* ---------------- Tabs (Prediksi page) ---------------- */
  document.querySelectorAll('[data-tabs]').forEach(function(group){
    var btns = group.querySelectorAll('.tab-btn');
    var panels = document.querySelectorAll('[data-tab-panel]');
    btns.forEach(function(btn){
      btn.addEventListener('click', function(){
        btns.forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        var target = btn.getAttribute('data-tab');
        panels.forEach(function(p){
          p.classList.toggle('active', p.getAttribute('data-tab-panel') === target);
        });
      });
    });
  });

  /* ---------------- Accordion (Form Manual) ---------------- */
  document.querySelectorAll('.accordion-head').forEach(function(head){
    head.addEventListener('click', function(){
      var item = head.closest('.accordion-item');
      item.classList.toggle('open');
    });
  });

  /* ---------------- Deterministic sample data engine ---------------- */
  function mulberry32(a){
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function tetensEs(T){
    return 0.6108 * Math.exp((17.27 * T) / (T + 237.3));
  }

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

  function generateSampleSeries(totalSlots, startDate, seed){
    totalSlots = totalSlots || 720;
    startDate = startDate || new Date('2023-08-29T00:00:00');
    var rng = mulberry32(seed || 20260101);
    var slotsPerDay = 48;
    var series = [];
    var prevSmoothed = null;
    var alpha = 0.72;

    for(var i=0;i<totalSlots;i++){
      var dayIdx = Math.floor(i / slotsPerDay);
      var slotInDay = i % slotsPerDay;
      var hourFrac = slotInDay / slotsPerDay * 24;

      var seasonal = 1.2 * Math.sin((2*Math.PI*dayIdx)/40);
      var level = 89 + seasonal + (rng()-0.5)*0.6;
      level = clamp(level, 83, 94);

      var T = 24.0 + 3.0*Math.sin((2*Math.PI*(hourFrac-15))/24) + (rng()-0.5)*0.4;
      var es = tetensEs(T);
      var ea = tetensEs(19) * 0.94;

      var ratio = ea/es;
      var dev = (ratio - 1) * 18 + 1.5*Math.sin((2*Math.PI*slotInDay)/48 + Math.PI) * 0.55;
      var raw = level + dev;
      raw = clamp(raw, 30, 98);

      var smoothed = prevSmoothed === null ? raw : (alpha*raw + (1-alpha)*prevSmoothed);
      prevSmoothed = smoothed;
      smoothed = clamp(smoothed, 30, 98);

      var dt = new Date(startDate.getTime() + i*30*60000);
      series.push({
        datetime: dt,
        value: Number(smoothed.toFixed(2))
      });
    }
    return series;
  }

  function fmtDate(d){
    var pad = function(n){ return String(n).padStart(2,'0'); };
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':00';
  }
  function fmtShort(d){
    var pad = function(n){ return String(n).padStart(2,'0'); };
    return pad(d.getDate())+'/'+pad(d.getMonth()+1);
  }
  var DAY_NAMES = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  function fmtDay(d){ return DAY_NAMES[d.getDay()]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'); }

  window.RINTIK = {
    generateSampleSeries: generateSampleSeries,
    fmtDate: fmtDate,
    fmtShort: fmtShort,
    fmtDay: fmtDay,
    renderKpiRing: function(el){ renderKpiRing(el); }
  };

  var publicPredictionLib = window.RintikPublicPrediction;
  var publicApiClient = null;
  var apiParams = new URLSearchParams(window.location.search);
  var publicApiBase = apiParams.get('api') || sessionStorage.getItem('rintik_api_url') || (window.RINTIK_DEFAULT_API||'http://127.0.0.1:8140');
  if(apiParams.get('api')) sessionStorage.setItem('rintik_api_url', publicApiBase);
  if(window.RintikApi && publicPredictionLib){
    publicApiClient = window.RintikApi.createClient({baseUrl: publicApiBase});
  }

  /* ---------------- Dropzone (Prediksi > Upload CSV) ---------------- */
  var dz = document.getElementById('dropzone');
  if(dz){
    var fileInput = document.getElementById('fileInput');
    var dzEmpty = document.getElementById('dzEmpty');
    var dzFilled = document.getElementById('dzFilled');
    var fileNameEl = document.getElementById('fileName');
    var fileMetaEl = document.getElementById('fileMeta');
    var csvPreview = document.getElementById('csvPreview');
    var csvAlert = document.getElementById('csvAlert');
    var predictBtn = document.getElementById('predictBtnCsv');
    var removeFileBtn = document.getElementById('removeFile');
    var demoBtn = document.getElementById('demoBtn');

    function showFile(name, metaLabel, valid, message){
      dzEmpty.hidden = true;
      dzFilled.hidden = false;
      dz.classList.add('filled');
      fileNameEl.textContent = name;
      fileMetaEl.textContent = metaLabel;
      csvAlert.hidden = false;
      csvAlert.className = 'alert ' + (valid ? 'alert-success' : 'alert-error');
      csvAlert.querySelector('.alert-text').textContent = message || (valid ?
        'Struktur data didukung. Backend tetap akan memverifikasi fixture dan kronologi sebelum inferensi.' :
        'Format file belum sesuai. Pastikan file berupa CSV dengan kolom resmi yang benar.');
      if(predictBtn) predictBtn.disabled = !valid;
    }

    function resetDz(){
      dzEmpty.hidden = false;
      dzFilled.hidden = true;
      dz.classList.remove('filled');
      csvAlert.hidden = true;
      csvPreview.hidden = true;
      if(predictBtn) predictBtn.disabled = true;
      fileInput.value = '';
      pendingRows = [];
    }

    dz.addEventListener('click', function(e){
      if(dz.classList.contains('filled')) return;
      fileInput.click();
    });
    dz.addEventListener('dragover', function(e){ e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', function(){ dz.classList.remove('drag'); });
    dz.addEventListener('drop', function(e){
      e.preventDefault(); dz.classList.remove('drag');
      var f = e.dataTransfer.files[0];
      if(f) handleFile(f);
    });
    fileInput.addEventListener('change', function(){
      if(fileInput.files[0]) handleFile(fileInput.files[0]);
    });
    if(removeFileBtn){
      removeFileBtn.addEventListener('click', function(e){ e.stopPropagation(); resetDz(); });
    }

    var pendingRows = [];

    function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    function classificationMessage(classification){
      if(classification.workflow === 'daily_batch'){
        return 'Satu tanggal resmi (' + classification.date + ', ' + classification.rowCount + ' baris) siap diverifikasi dan diproses sebagai daily batch.';
      }
      return 'Kandidat test.csv resmi 734 baris siap diverifikasi checksum-nya melalui endpoint kompatibilitas.';
    }

    function handleFile(file){
      if(!/\.csv$/i.test(file.name)){
        showFile(file.name, 'File belum sesuai', false);
        return;
      }
      if(file.size > 5 * 1024 * 1024){
        showFile(file.name, 'Ukuran file terlalu besar', false);
        return;
      }
      if(!publicPredictionLib){
        showFile(file.name, 'Komponen integrasi tidak tersedia', false, 'Klien backend RINTIK gagal dimuat. Muat ulang halaman sebelum mencoba lagi.');
        return;
      }
      showFile(file.name, (file.size/1024).toFixed(1)+' KB, memeriksa data...', false, 'Membaca dan memeriksa struktur CSV...');
      var reader = new FileReader();
      reader.onload = function(){
        try {
          var rows = publicPredictionLib.parseCsvText(reader.result);
          var classification = publicPredictionLib.classifyRows(rows);
          if(!classification.ok){
            pendingRows = [];
            showFile(file.name, rows.length + ' baris, kontrak tidak didukung', false, classification.message);
            return;
          }
          pendingRows = rows;
          showFile(file.name, (file.size/1024).toFixed(1)+' KB, ' + rows.length + ' baris', true, classificationMessage(classification));
          renderCsvPreview(rows.slice(0, 6), classification);
        } catch(error){
          pendingRows = [];
          showFile(file.name, 'CSV tidak valid', false, publicPredictionLib.errorMessage(error));
        }
      };
      reader.onerror = function(){
        pendingRows = [];
        showFile(file.name, 'File tidak bisa dibaca', false);
      };
      reader.readAsText(file);
    }

    function renderCsvPreview(sample, classification){
      var rows = sample.map(function(r){
        return '<tr><td>'+esc(r.datetime)+'</td><td>'+esc(r.air_temperature)+'</td><td>'+esc(r.pressure)+'</td><td>Pratinjau</td></tr>';
      }).join('');
      csvPreview.innerHTML =
        '<div class="csv-preview-head"><span>Pratinjau 6 baris pertama · '+esc(classification.workflow === 'daily_batch' ? 'daily batch' : 'kompatibilitas 734 titik')+'</span></div>'+
        '<div class="table-scroll"><table class="data-table"><thead><tr><th>Waktu</th><th>Suhu Udara</th><th>Tekanan</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
      csvPreview.hidden = false;
    }

    if(demoBtn){
      demoBtn.addEventListener('click', async function(){
        if(!publicApiClient || !publicPredictionLib){
          showFile('fixture-resmi.csv', 'Backend belum terhubung', false, 'Klien backend RINTIK tidak tersedia.');
          return;
        }
        demoBtn.disabled = true;
        try {
          var fixture = await publicApiClient.getNextOfficialDemoInput();
          if(fixture.source !== 'official_test_csv' || fixture.simulation !== false || fixture.prediction_produced !== false){
            throw new publicPredictionLib.PublicPredictionError('INVALID_FIXTURE_PROVENANCE', 'Backend tidak mengembalikan fixture input resmi yang terverifikasi.');
          }
          var rows = publicPredictionLib.parseCsvText(fixture.csv);
          var classification = publicPredictionLib.classifyRows(rows);
          if(!classification.ok || classification.workflow !== 'daily_batch' || classification.date !== fixture.date){
            throw new publicPredictionLib.PublicPredictionError('INVALID_FIXTURE_SHAPE', 'Fixture contoh tidak cocok dengan kontrak daily batch.');
          }
          pendingRows = rows;
          showFile('official-test-' + fixture.date + '.csv', fixture.row_count + ' baris · fixture resmi', true, 'Contoh memakai input test resmi untuk tanggal berikutnya; ini bukan data sintetis dan belum merupakan prediksi.');
          renderCsvPreview(rows.slice(0, 6), classification);
        } catch(error){
          pendingRows = [];
          showFile('fixture-resmi.csv', 'Contoh tidak dapat dimuat', false, publicPredictionLib.errorMessage(error));
        } finally {
          demoBtn.disabled = false;
        }
      });
    }

    if(predictBtn){
      predictBtn.addEventListener('click', function(){
        if(!pendingRows.length){
          showFile('data-sensor.csv', 'Pilih file yang valid dulu', false);
          return;
        }
        runPredictFlow(pendingRows);
      });
    }
  }

  /* ---------------- Form manual submit ---------------- */
  var formPredictBtn = document.getElementById('predictBtnForm');
  if(formPredictBtn){
    document.querySelectorAll('[data-tab-panel="manual"] input').forEach(function(input){ input.disabled = true; });
    formPredictBtn.addEventListener('click', function(){
      var alertBox = document.getElementById('formAlert');
      function fail(msg){
        if(alertBox){
          alertBox.hidden = false;
          alertBox.className = 'alert alert-error';
          alertBox.querySelector('.alert-text').textContent = msg;
        }
      }
      fail('Form manual tidak didukung oleh model frozen final karena input harus cocok dengan fixture test resmi dan urutan daily batch. Gunakan unggah CSV atau Contoh Data Resmi.');
    });
  }

  /* ---------------- Loading overlay + API + redirect ---------------- */
  function runPredictFlow(rows){
    var overlay = document.getElementById('loadingOverlay');
    function fail(msg){
      if(overlay) overlay.hidden = true;
      var a = document.getElementById('csvAlert') || document.getElementById('formAlert');
      if(a){
        a.hidden = false;
        a.className = 'alert alert-error';
        a.setAttribute('role', 'alert');
        a.setAttribute('tabindex', '-1');
        a.querySelector('.alert-text').textContent = msg;
        a.scrollIntoView({behavior: 'smooth', block: 'center'});
        a.focus({preventScroll: true});
      } else {
        alert(msg);
      }
    }
    if(runPredictFlow.active) return;
    runPredictFlow.active = true;
    if(predictBtn) predictBtn.disabled = true;
    if(formPredictBtn) formPredictBtn.disabled = true;
    if(demoBtn) demoBtn.disabled = true;
    try { localStorage.removeItem('sfh_last_result'); } catch(e){}
    function restore(){
      runPredictFlow.active = false;
      if(predictBtn) predictBtn.disabled = !pendingRows.length;
      if(formPredictBtn) formPredictBtn.disabled = false;
      if(demoBtn) demoBtn.disabled = false;
    }
    function go(){
      if(!publicApiClient || !publicPredictionLib){
        restore();
        fail('Klien backend RINTIK tidak tersedia. Muat ulang halaman lalu coba lagi.');
        return;
      }
      publicPredictionLib.processRows(rows, publicApiClient).then(function(result){
        try { localStorage.setItem('sfh_last_result', JSON.stringify({ savedAt: Date.now(), payload: result.payload, meta: result.meta })); } catch(e){}
        window.location.href = 'hasil.html';
      }).catch(function(error){
        restore();
        fail(publicPredictionLib.errorMessage(error));
      });
    }
    if(!overlay){ go(); return; }
    overlay.hidden = false;
    var steps = overlay.querySelectorAll('.loading-step');
    var i = 0;
    function tick(){
      if(i>0) steps[i-1].classList.remove('active');
      if(i>0) steps[i-1].classList.add('done');
      if(i < steps.length){
        steps[i].classList.add('active');
        i++;
        setTimeout(tick, 300);
      } else {
        go();
      }
    }
    tick();
  }

  document.querySelectorAll('[data-scroll-to]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var sel = btn.getAttribute('data-scroll-to');
      var el = document.querySelector(sel);
      if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
  document.querySelectorAll('[data-open-file]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var fi = document.getElementById('fileInput');
      if(fi) fi.click();
    });
  });

  /* =========================================================
     KPI rings (shared across Beranda + Hasil)
     ========================================================= */
  function renderKpiRing(el){
    var pct = parseFloat(el.getAttribute('data-pct')) || 0;
    var color = el.getAttribute('data-color') || '#1269E2';
    var size = 56, stroke = 6;
    var r = (size - stroke)/2;
    var c = 2*Math.PI*r;
    var offset = c * (1 - pct/100);
    el.innerHTML =
      '<svg class="kpi-ring-svg" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'+
      '<circle class="kpi-ring-bg" cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" stroke-width="'+stroke+'"/>'+
      '<circle class="kpi-ring-fg" cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" stroke-width="'+stroke+'" stroke="'+color+'" stroke-dasharray="'+c+'" stroke-dashoffset="'+c+'"/>'+
      '</svg>'+
      '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:'+color+'">'+el.getAttribute('data-label')+'</span>';
    var fg = el.querySelector('.kpi-ring-fg');
    requestAnimationFrame(function(){
      setTimeout(function(){ fg.style.strokeDashoffset = offset; }, 60);
    });
  }
  document.querySelectorAll('.kpi-ring').forEach(function(el){
    renderKpiRing(el);
  });

  function drawSparkline(container, values, color, area){
    var W = container.clientWidth || 500, H = 180;
    var pad = {t:10,r:10,b:22,l:34};
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    min = Math.floor(min/2)*2 - 2; max = Math.ceil(max/2)*2 + 2;
    function x(i){ return pad.l + (i/(values.length-1)) * (W-pad.l-pad.r); }
    function y(v){ return pad.t + (1 - (v-min)/(max-min)) * (H-pad.t-pad.b); }
    var d = values.map(function(v,i){ return (i===0?'M':'L')+x(i).toFixed(1)+','+y(v).toFixed(1); }).join(' ');
    var areaD = d + ' L'+x(values.length-1).toFixed(1)+','+(H-pad.b)+' L'+x(0).toFixed(1)+','+(H-pad.b)+' Z';
    var gridLines = '';
    var steps = 4;
    var labels = '';
    for(var s=0;s<=steps;s++){
      var v = min + (max-min)*s/steps;
      var yy = y(v);
      gridLines += '<line x1="'+pad.l+'" y1="'+yy.toFixed(1)+'" x2="'+(W-pad.r)+'" y2="'+yy.toFixed(1)+'" stroke="#E1E9F1" stroke-width="1"/>';
      labels += '<text x="'+(pad.l-8)+'" y="'+(yy+4).toFixed(1)+'" font-size="10" fill="#9AACC0" text-anchor="end">'+Math.round(v)+'</text>';
    }
    var gid = 'grad-'+Math.random().toString(36).slice(2,8);
    container.innerHTML =
      '<svg class="mini-chart-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">'+
      '<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+color+'" stop-opacity="0.35"/>'+
      '<stop offset="100%" stop-color="'+color+'" stop-opacity="0"/>'+
      '</linearGradient></defs>'+
      gridLines + labels +
      (area ? '<path d="'+areaD+'" fill="url(#'+gid+')" stroke="none"/>' : '') +
      '<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'+
      '</svg>';
  }

  /* mini chart on homepage */
  var miniChartEl = document.getElementById('miniChart');
  if(miniChartEl){
    var miniSeries = generateSampleSeries(96, new Date('2023-08-29T00:00:00'), 7).map(function(r){return r.value;});
    drawSparkline(miniChartEl, miniSeries, '#1269E2', true);
  }
  var previewChartEl = document.getElementById('previewChart');
  if(previewChartEl){
    var pSeries = generateSampleSeries(96, new Date('2023-08-29T00:00:00'), 99).map(function(r){return r.value;});
    var W = previewChartEl.clientWidth || 300, H = 110, pad=4;
    var min = Math.min.apply(null,pSeries), max = Math.max.apply(null,pSeries);
    function x(i){ return pad + (i/(pSeries.length-1))*(W-2*pad); }
    function y(v){ return pad + (1-(v-min)/(max-min))*(H-2*pad); }
    var d = pSeries.map(function(v,i){ return (i===0?'M':'L')+x(i).toFixed(1)+','+y(v).toFixed(1); }).join(' ');
    previewChartEl.innerHTML = '<svg width="100%" height="'+H+'" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><path d="'+d+'" fill="none" stroke="#1269E2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /* Hasil nyata dari API. Missing/invalid data fails closed without sample output. */
  function toDateObj(s){
    var d = new Date(String(s).replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }
  function loadStoredResult(){
    try {
      var raw = localStorage.getItem('sfh_last_result');
      if(raw){
        var stored = JSON.parse(raw);
        var data = stored.payload || stored;
        if(data.source !== 'real_original_pth' || data.simulation !== false) return null;
        var preds = data.predictions || [];
        if(preds.length){
          var normalized = preds.map(function(p){
            return { datetime: toDateObj(p.datetime), value: Number(p.air_humidity) };
          }).filter(function(p){ return p.datetime && Number.isFinite(p.value); });
          return normalized.length === preds.length ? {series: normalized, meta: stored.meta || {}, savedAt: stored.savedAt || null} : null;
        }
      }
    } catch(e){}
    return null;
  }

  /* =========================================================
     HASIL PAGE
     ========================================================= */
  var hasilRoot = document.getElementById('hasilRoot');
  if(hasilRoot){
    var storedResult = loadStoredResult();
    if(!storedResult || !storedResult.series.length){
      hasilRoot.innerHTML = '<div class="container"><div class="alert alert-error"><div class="alert-text">Belum ada hasil model RINTIK yang valid. Buka halaman Prediksi dan proses CSV melalui backend; halaman ini tidak membuat prediksi contoh.</div></div><div class="action-row"><a class="btn btn-primary" href="predict.html">Buka Prediksi</a><a class="btn btn-secondary" href="dashboard.html">Dashboard Operator</a></div></div>';
      return;
    }
    var FULL_SERIES = storedResult.series;
    var provenance = document.getElementById('resultProvenance');
    if(provenance){
      if(storedResult.meta.workflow === 'daily_batch'){
        provenance.className = 'alert ' + (storedResult.meta.monitoringStatus === 'unavailable' ? 'alert-info' : 'alert-success');
        provenance.querySelector('.alert-text').textContent = 'Hasil model asli untuk daily batch ' + storedResult.meta.date + ' telah dipersistenkan.' +
          (storedResult.meta.monitoringStatus === 'unavailable' ? ' Monitoring operator belum tersedia: ' + storedResult.meta.monitoringWarning : ' Hasil tersedia pada Dashboard Operator; sensor fisik simulasi tetap merupakan data terpisah.');
      } else {
        provenance.className = 'alert alert-info';
        provenance.querySelector('.alert-text').textContent = 'Hasil model asli ini berasal dari endpoint kompatibilitas submission 734 titik. Jalur ini stateless dan tidak mengisi replay harian Dashboard Operator.';
      }
      provenance.hidden = false;
    }
    var values = FULL_SERIES.map(function(r){ return r.value; });
    var avg = values.reduce(function(a,b){return a+b;},0)/values.length;
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);

    document.getElementById('kpiAvg').textContent = avg.toFixed(1)+'%';
    document.getElementById('kpiMin').textContent = min.toFixed(1)+'%';
    document.getElementById('kpiMax').textContent = max.toFixed(1)+'%';

    var rangeText = document.getElementById('resultRange');
    if(rangeText){
      var d0 = FULL_SERIES[0].datetime, d1 = FULL_SERIES[FULL_SERIES.length-1].datetime;
      var months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
      rangeText.textContent = 'Periode ' + d0.getDate()+' '+months[d0.getMonth()]+' sampai '+d1.getDate()+' '+months[d1.getMonth()]+' '+d1.getFullYear();
    }

    /* forecast strip */
    var forecastEl = document.getElementById('forecastStrip');
    if(forecastEl){
      var perDay = {};
      FULL_SERIES.forEach(function(r){
        var key = r.datetime.toDateString();
        if(!perDay[key]) perDay[key] = [];
        perDay[key].push(r.value);
      });
      var iconDefs = [
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.2"/><path d="M12 2.4v1.4M12 14v1.4M4.6 8h1.4M18 8h1.4M6.9 2.9l1 1M17.1 2.9l-1 1"/><path d="M7 17.5a4 4 0 010-8 5 5 0 019.6-1.6A3.6 3.6 0 0117 17.5H7z"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 17.5a4 4 0 010-8 5 5 0 019.6-1.6A3.6 3.6 0 0117 17.5H7z"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 15.5a4 4 0 010-8 5 5 0 019.6-1.6A3.6 3.6 0 0117 15.5H7z"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/></svg>'
      ];
      var html = '';
      Object.keys(perDay).forEach(function(key, idx){
        var arr = perDay[key];
        var dmax = Math.max.apply(null, arr), dmin = Math.min.apply(null, arr);
        var d = new Date(key);
        var icon = iconDefs[idx % iconDefs.length];
        html += '<div class="forecast-day"><div class="fd-date">'+fmtDay(d)+'</div>'+
          '<div class="fd-icon">'+icon+'</div>'+
          '<div class="fd-val">'+dmax.toFixed(0)+'% / '+dmin.toFixed(0)+'%</div>'+
          '<div class="fd-range">tertinggi / terendah</div></div>';
      });
      forecastEl.innerHTML = html;
    }

    /* main chart */
    var chartWrap = document.getElementById('mainChart');
    var tooltip = document.getElementById('chartTooltip');
    var brushStart = document.getElementById('brushStart');
    var brushEnd = document.getElementById('brushEnd');
    var brushLabels = document.getElementById('brushLabels');
    var viewStart = 0, viewEnd = values.length-1;

    function renderMainChart(){
      var W = chartWrap.clientWidth || 900, H = 320;
      var pad = {t:16,r:20,b:30,l:44};
      var slice = values.slice(viewStart, viewEnd+1);
      var dateSlice = FULL_SERIES.slice(viewStart, viewEnd+1).map(function(r){return r.datetime;});
      var min0 = Math.min.apply(null, slice), max0 = Math.max.apply(null, slice);
      min0 = Math.floor(min0/2)*2 - 2; max0 = Math.ceil(max0/2)*2 + 2;
      function x(i){ return pad.l + (i/(slice.length-1)) * (W-pad.l-pad.r); }
      function y(v){ return pad.t + (1 - (v-min0)/(max0-min0)) * (H-pad.t-pad.b); }
      var d = slice.map(function(v,i){ return (i===0?'M':'L')+x(i).toFixed(1)+','+y(v).toFixed(1); }).join(' ');
      var areaD = d + ' L'+x(slice.length-1).toFixed(1)+','+(H-pad.b)+' L'+x(0).toFixed(1)+','+(H-pad.b)+' Z';

      var gridLines='', labels='';
      var steps=4;
      for(var s=0;s<=steps;s++){
        var v = min0 + (max0-min0)*s/steps;
        var yy = y(v);
        gridLines += '<line x1="'+pad.l+'" y1="'+yy.toFixed(1)+'" x2="'+(W-pad.r)+'" y2="'+yy.toFixed(1)+'" stroke="#E1E9F1" stroke-width="1"/>';
        labels += '<text x="'+(pad.l-8)+'" y="'+(yy+4).toFixed(1)+'" font-size="10.5" fill="#9AACC0" text-anchor="end">'+Math.round(v)+'</text>';
      }
      var xTicks = '';
      var tickCount = Math.min(6, slice.length);
      for(var tI=0; tI<tickCount; tI++){
        var idx = Math.round(tI * (slice.length-1) / (tickCount-1 || 1));
        var xx = x(idx);
        xTicks += '<text x="'+xx.toFixed(1)+'" y="'+(H-8)+'" font-size="10.5" fill="#9AACC0" text-anchor="middle">'+fmtShort(dateSlice[idx])+'</text>';
      }

      var color = '#1269E2';
      var gid = 'mgrad';
      var pointsG = slice.map(function(v,i){ return '<circle class="hover-pt" data-i="'+i+'" cx="'+x(i).toFixed(1)+'" cy="'+y(v).toFixed(1)+'" r="10" fill="transparent"/>'; }).join('');

      chartWrap.innerHTML =
        '<svg width="100%" height="'+H+'" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" id="chartSvg">'+
        '<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0%" stop-color="'+color+'" stop-opacity="0.32"/>'+
        '<stop offset="100%" stop-color="'+color+'" stop-opacity="0"/>'+
        '</linearGradient></defs>'+
        gridLines + xTicks + labels +
        '<path d="'+areaD+'" fill="url(#'+gid+')" stroke="none"/>'+
        '<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'+
        pointsG +
        '</svg>';

      var svgEl = document.getElementById('chartSvg');
      svgEl.querySelectorAll('.hover-pt').forEach(function(pt){
        pt.addEventListener('mousemove', function(){
          var i = parseInt(pt.getAttribute('data-i'),10);
          var rect = chartWrap.getBoundingClientRect();
          var val = slice[i];
          var dt = dateSlice[i];
          tooltip.style.opacity = 1;
          tooltip.style.left = (pt.cx.baseVal.value / W * rect.width) + 'px';
          tooltip.style.top = (pt.cy.baseVal.value / H * H - 42) + 'px';
          tooltip.innerHTML = '<strong>'+val.toFixed(1)+'%</strong><br>'+fmtDate(dt);
        });
        pt.addEventListener('mouseleave', function(){ tooltip.style.opacity = 0; });
      });
    }
    renderMainChart();
    window.addEventListener('resize', renderMainChart);

    if(brushStart && brushEnd){
      function updateBrush(){
        var s = parseInt(brushStart.value,10), e = parseInt(brushEnd.value,10);
        if(s > e-10){ s = e-10; brushStart.value = s; }
        viewStart = s; viewEnd = e;
        brushLabels.innerHTML = '<span>'+fmtShort(FULL_SERIES[viewStart].datetime)+'</span><span>'+fmtShort(FULL_SERIES[viewEnd].datetime)+'</span>';
        renderMainChart();
      }
      brushStart.addEventListener('input', updateBrush);
      brushEnd.addEventListener('input', updateBrush);
    }

    if(brushStart && brushEnd){
      brushStart.max = String(FULL_SERIES.length - 1);
      brushEnd.max = String(FULL_SERIES.length - 1);
      brushEnd.value = String(FULL_SERIES.length - 1);
      viewEnd = FULL_SERIES.length - 1;
    }

    /* action buttons (desktop action-row + mobile sticky bar share this class) */
    document.querySelectorAll('.download-csv-btn').forEach(function(downloadBtn){
      downloadBtn.addEventListener('click', function(){
        var workflow = storedResult.meta.workflow || 'unknown';
        var lines = ['datetime,air_humidity,prediction_source,simulation,workflow'];
        FULL_SERIES.forEach(function(r){ lines.push(fmtDate(r.datetime)+','+r.value.toFixed(4)+',real_original_pth,false,'+workflow); });
        var blob = new Blob([lines.join('\n')], {type:'text/csv'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var d = new Date();
        function p2(n){ return String(n).padStart(2, '0'); }
        a.href = url;
        a.download = 'prediksi_kelembapan_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes()) + '.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    });

    /* results table */
    var tableBody = document.getElementById('resultTableBody');
    var cardsWrap = document.getElementById('resultCards');
    var searchInput = document.getElementById('searchInput');
    var pageSizeSelect = document.getElementById('pageSizeSelect');
    var paginationInfo = document.getElementById('paginationInfo');
    var pageBtnsWrap = document.getElementById('pageBtns');
    var currentPage = 1;

    function getFiltered(){
      var q = (searchInput.value||'').trim();
      if(!q) return FULL_SERIES;
      return FULL_SERIES.filter(function(r){ return fmtDate(r.datetime).indexOf(q) !== -1; });
    }

    function renderTable(){
      var pageSize = parseInt(pageSizeSelect.value,10);
      var filtered = getFiltered();
      var totalPages = Math.max(1, Math.ceil(filtered.length/pageSize));
      currentPage = Math.min(currentPage, totalPages);
      var startIdx = (currentPage-1)*pageSize;
      var pageRows = filtered.slice(startIdx, startIdx+pageSize);

      tableBody.innerHTML = pageRows.map(function(r){
        return '<tr><td>'+fmtDate(r.datetime)+'</td><td class="up">'+r.value.toFixed(1)+'%</td></tr>';
      }).join('');

      cardsWrap.innerHTML = pageRows.map(function(r){
        return '<div class="result-card-row"><div class="rd">'+fmtDate(r.datetime)+'</div><div class="rv">'+r.value.toFixed(1)+'%</div></div>';
      }).join('');

      paginationInfo.textContent = 'Menampilkan '+(filtered.length===0?0:startIdx+1)+' sampai '+Math.min(startIdx+pageSize, filtered.length)+' dari '+filtered.length+' baris';

      var btns = '';
      var maxBtns = 5;
      var startPage = Math.max(1, currentPage - 2);
      var endPage = Math.min(totalPages, startPage+maxBtns-1);
      startPage = Math.max(1, endPage-maxBtns+1);
      btns += '<button class="page-btn" data-p="prev" '+(currentPage===1?'disabled':'')+'>\u2039</button>';
      for(var p=startPage;p<=endPage;p++){
        btns += '<button class="page-btn '+(p===currentPage?'active':'')+'" data-p="'+p+'">'+p+'</button>';
      }
      btns += '<button class="page-btn" data-p="next" '+(currentPage===totalPages?'disabled':'')+'>\u203a</button>';
      pageBtnsWrap.innerHTML = btns;
      pageBtnsWrap.querySelectorAll('.page-btn').forEach(function(b){
        b.addEventListener('click', function(){
          var val = b.getAttribute('data-p');
          if(val==='prev') currentPage = Math.max(1,currentPage-1);
          else if(val==='next') currentPage = Math.min(totalPages,currentPage+1);
          else currentPage = parseInt(val,10);
          renderTable();
        });
      });
    }
    if(tableBody){
      searchInput.addEventListener('input', function(){ currentPage=1; renderTable(); });
      pageSizeSelect.addEventListener('change', function(){ currentPage=1; renderTable(); });
      renderTable();
    }
  }
})();
