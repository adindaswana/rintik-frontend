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
    fmtDay: fmtDay
  };

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

    function showFile(name, metaLabel, valid){
      dzEmpty.hidden = true;
      dzFilled.hidden = false;
      dz.classList.add('filled');
      fileNameEl.textContent = name;
      fileMetaEl.textContent = metaLabel;
      csvAlert.hidden = false;
      csvAlert.className = 'alert ' + (valid ? 'alert-success' : 'alert-error');
      csvAlert.querySelector('.alert-text').textContent = valid ?
        'Data berhasil dibaca. File Anda siap untuk diproses.' :
        'Format file belum sesuai. Pastikan file berupa CSV dengan kolom yang benar.';
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
    function parseCsvText(text){
      var lines = String(text || '').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
      if(lines.length < 2) return [];
      var header = lines[0].split(',').map(function(s){ return s.trim(); });
      var rows = [];
      for(var i = 1; i < lines.length; i++){
        if(!lines[i].trim()) continue;
        var cells = lines[i].split(',');
        var obj = {};
        for(var j = 0; j < header.length; j++) obj[header[j]] = (cells[j] || '').trim();
        rows.push(obj);
      }
      return rows;
    }
    function headerOk(rows){
      if(!rows.length) return false;
      var h = Object.keys(rows[0]);
      return h.indexOf('datetime') !== -1 && h.indexOf('air_temperature') !== -1 && h.indexOf('co2') !== -1;
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
      showFile(file.name, (file.size/1024).toFixed(1)+' KB, memeriksa data...', true);
      var reader = new FileReader();
      reader.onload = function(){
        var rows = parseCsvText(reader.result);
        if(!headerOk(rows)){
          pendingRows = [];
          showFile(file.name, 'Isi file belum sesuai', false);
          return;
        }
        pendingRows = rows;
        showFile(file.name, (file.size/1024).toFixed(1)+' KB, ' + rows.length + ' data siap diproses', true);
        renderCsvPreview(rows.slice(0, 6));
      };
      reader.onerror = function(){
        pendingRows = [];
        showFile(file.name, 'File tidak bisa dibaca', false);
      };
      reader.readAsText(file);
    }

    function renderCsvPreview(sample){
      var rows = sample.map(function(r){
        return '<tr><td>'+esc(r.datetime)+'</td><td>'+esc(r.air_temperature)+'</td><td>'+esc(r.pressure)+'</td><td>Baik</td></tr>';
      }).join('');
      csvPreview.innerHTML =
        '<div class="csv-preview-head"><span>Pratinjau 6 baris pertama</span></div>'+
        '<div class="table-scroll"><table class="data-table"><thead><tr><th>Waktu</th><th>Suhu Udara</th><th>Tekanan</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
      csvPreview.hidden = false;
    }

    if(demoBtn){
      demoBtn.addEventListener('click', function(){
        var rows = [];
        var start = new Date('2023-08-29T15:00:00');
        for(var i = 0; i < 96; i++){
          var d = new Date(start.getTime() + i * 30 * 60000);
          var t = 24 + 3 * Math.sin((2 * Math.PI * ((i % 48) / 48 * 24 - 15)) / 24);
          rows.push({ datetime: fmtDate(d), air_temperature: t.toFixed(2), co2: '468.9', pressure: '1009.6' });
        }
        pendingRows = rows;
        showFile('contoh-data-sensor.csv', 'Contoh data siap diproses', true);
        renderCsvPreview(rows.slice(0, 6));
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
    formPredictBtn.addEventListener('click', function(){
      var alertBox = document.getElementById('formAlert');
      function fail(msg){
        if(alertBox){
          alertBox.hidden = false;
          alertBox.className = 'alert alert-error';
          alertBox.querySelector('.alert-text').textContent = msg;
        }
      }
      var fields = {};
      document.querySelectorAll('[data-tab-panel="manual"] [data-field]').forEach(function(inp){
        fields[inp.getAttribute('data-field')] = inp.value;
      });
      var startRaw = document.getElementById('manualStart');
      var daysRaw = document.getElementById('manualDays');
      var days = startRaw ? 3 : 3;
      days = daysRaw ? parseInt(daysRaw.value, 10) : 3;
      if(!(days >= 1 && days <= 15)){
        fail('Jumlah hari harus antara 1 sampai 15.');
        return;
      }
      var start = startRaw && startRaw.value ? new Date(startRaw.value) : new Date('2023-08-29T15:00:00');
      if(isNaN(start.getTime())){
        fail('Tanggal mulai belum valid.');
        return;
      }
      var total = days * 48;
      var rows = [];
      for(var i = 0; i < total; i++){
        var d = new Date(start.getTime() + i * 30 * 60000);
        var r = { datetime: fmtDate(d) };
        Object.keys(fields).forEach(function(k){ r[k] = fields[k]; });
        if(!r.air_temperature) r.air_temperature = '26.8';
        rows.push(r);
      }
      if(alertBox) alertBox.hidden = true;
      runPredictFlow(rows);
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
        a.querySelector('.alert-text').textContent = msg;
      } else {
        alert(msg);
      }
    }
    function go(){
      fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rows })
      }).then(function(res){
        if(!res.ok) throw new Error('bad');
        return res.json();
      }).then(function(data){
        try { localStorage.setItem('sfh_last_result', JSON.stringify({ savedAt: Date.now(), payload: data })); } catch(e){}
        window.location.href = 'hasil.html';
      }).catch(function(){
        fail('Terjadi kendala saat memproses. Periksa data Anda lalu coba lagi.');
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

  /* Hasil nyata dari API (localStorage). Fallback ke contoh statis bila dibuka langsung. */
  function toDateObj(s){
    var d = new Date(String(s).replace(' ', 'T'));
    return isNaN(d.getTime()) ? new Date() : d;
  }
  function loadStoredSeries(){
    try {
      var raw = localStorage.getItem('sfh_last_result');
      if(raw){
        var data = JSON.parse(raw).payload || JSON.parse(raw);
        var preds = data.predictions || [];
        if(preds.length){
          return preds.map(function(p){
            return { datetime: toDateObj(p.datetime), value: Number(p.air_humidity) };
          });
        }
      }
    } catch(e){}
    return generateSampleSeries(96, new Date('2023-08-29T15:00:00'), 20260226);
  }

  /* =========================================================
     HASIL PAGE
     ========================================================= */
  var hasilRoot = document.getElementById('hasilRoot');
  if(hasilRoot){
    var FULL_SERIES = loadStoredSeries();
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
        var lines = ['datetime,air_humidity'];
        FULL_SERIES.forEach(function(r){ lines.push(fmtDate(r.datetime)+','+r.value.toFixed(4)); });
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
