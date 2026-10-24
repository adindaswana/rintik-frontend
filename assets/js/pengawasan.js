/* RINTIK · Pengawasan 90 Hari (demo sintetis). Semua skor, audit, dan keputusan dihitung backend
 * (POST /v1/audit/model-health); halaman ini hanya mengunggah CSV mentah dan menampilkan hasilnya.
 * Data dari server dan dari file selalu dirender lewat textContent (helper el()), tidak lewat innerHTML. */
(function(){
  'use strict';
  var BASE = window.RINTIK_resolveApiBase ? window.RINTIK_resolveApiBase() : (window.RINTIK_DEFAULT_API || 'http://127.0.0.1:8140');
  var MAX_BYTES = 5 * 1024 * 1024;
  var PAGE = 10;
  var STATUS = {sehat:{label:'Sehat', cls:'ok'}, waspada:{label:'Waspada', cls:'warn'}, kritis:{label:'Kritis', cls:'bad'}, tidak_dapat_dinilai:{label:'Tidak dapat dinilai', cls:'na'}};
  var ISSUE = {input_kritis:'Input kritis', anomali_input:'Anomali input', data_hilang:'Data hilang', drift:'Drift', pipeline:'Pipeline', output:'Output', ditahan:'Ditahan'};
  var COMPONENT = {Q:'Kualitas input', D:'Pergeseran input', P:'Kesehatan pipeline', O:'Kewajaran output'};
  var COLORS = {trust:'#1269e2', Q:'#2f9aa6', D:'#7b55a5', P:'#a66a17', O:'#b24b59'};
  var DECISION_CLS = {pertahankan:'ok', kandidat_pembaruan:'warn', investigasi:'bad', periode_belum_lengkap:'na'};
  var ERRORS = {
    MISSING_COLUMNS:'Kolom wajib belum lengkap.', UNEXPECTED_COLUMNS:'File berisi kolom di luar skema bukti (mis. label atau skor jadi), jadi ditolak.',
    DUPLICATE_TIMESTAMP:'Ada timestamp ganda.', INVALID_TIMESTAMP:'Ada timestamp yang tidak berformat YYYY-MM-DD HH:MM:SS.',
    TIMESTAMP_NOT_ALIGNED:'Ada timestamp di luar slot 30 menit.', MULTIPLE_SITES:'Satu file hanya boleh berisi satu site_id.',
    MISSING_SITE_ID:'Kolom site_id wajib terisi.', PERIOD_TOO_LONG:'Periode lebih dari 90 hari.', TOO_MANY_ROWS:'Maksimum 5.000 baris.',
    EMPTY_CSV:'CSV kosong.', INVALID_CSV:'CSV tidak dapat dibaca.', PAYLOAD_TOO_LARGE:'File melebihi 5 MB.', AUDIT_RULES_UNAVAILABLE:'Aturan audit di server tidak tersedia.',
    INVALID_BODY:'Permintaan ke server tidak valid.', INVALID_AS_OF:'Tanggal acuan (as_of) tidak valid.'
  };
  var state = {result:null, filtered:[], page:0, selected:null, series:{trust:true, Q:false, D:false, P:false, O:false}};
  var runToken = 0;

  function $(id){ return document.getElementById(id); }
  /* Build DOM without innerHTML: attrs {class,text,...}; kids = nodes or strings (as text). */
  function el(tag, attrs, kids){
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function(k){ var v = attrs[k]; if(v == null || v === false) return; if(k === 'class') node.className = v; else if(k === 'text') node.textContent = v; else node.setAttribute(k, v === true ? '' : String(v)); });
    append(node, kids); return node;
  }
  function append(node, kids){ (kids || []).forEach(function(c){ if(c == null || c === false) return; node.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); }); return node; }
  function fill(node, kids){ node.textContent = ''; return append(node, kids); }
  function list(tag, cls, items){ return el(tag, {class:cls}, (items || []).map(function(t){ return el('li', {text:t}); })); }
  function num(v){ return v == null || v === '' || !isFinite(v) ? null : Number(v); }
  function clamp(v){ v = num(v); return v == null ? 0 : Math.max(0, Math.min(100, v)); }
  function fmt(v, d){ v = num(v); return v == null ? '—' : v.toFixed(d == null ? 1 : d).replace('.', ','); }
  function pct(v){ return num(v) == null ? '—' : fmt(v * 100, 0) + '%'; }
  function int(v){ v = num(v); return v == null ? '—' : Math.round(v).toLocaleString('id-ID'); }
  var MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  function dshort(iso){ var p = String(iso).split('-'); return Number(p[2]) + ' ' + (MONTHS[Number(p[1]) - 1] || '?'); }
  function dlong(iso){ var p = String(iso).split('-'); return Number(p[2]) + ' ' + (MONTHS[Number(p[1]) - 1] || '?') + ' ' + p[0]; }
  function smooth(){ return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; }

  /* Navigation keeps ?api= (QA on localhost) like the other product pages. */
  document.querySelectorAll('[data-api-link]').forEach(function(link){ var url = new URL(link.getAttribute('href'), location.href); url.searchParams.set('api', BASE); link.href = url.pathname.split('/').pop() + '?' + url.searchParams.toString(); });

  /* ---------------- load + preview ---------------- */
  function showError(msg){ var box = $('pwError'); box.textContent = msg || ''; box.hidden = !msg; }
  function preview(text, name){
    var lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(function(l){ return l.length; });
    var header = (lines[0] || '').split(',');
    var rows = lines.slice(1);
    var first = rows[0] ? rows[0].split(',')[0] : '—', last = rows.length ? rows[rows.length - 1].split(',')[0] : '—';
    var days = {}; rows.forEach(function(r){ days[r.slice(0, 10)] = 1; });
    var stat = function(k, v){ return el('div', null, [el('dt', {text:k}), el('dd', {text:v})]); };
    fill($('pwPreviewStats'), [stat('File', name), stat('Baris', rows.length.toLocaleString('id-ID')), stat('Hari', String(Object.keys(days).length)), stat('Rentang waktu', first + ' → ' + last), stat('Kolom', String(header.length))]);
    var show = ['datetime', 'air_temperature', 'co2', 'pressure', 'rintik_p3', 'pipeline_stage', 'rh_reference', 'rh_reference_status'];
    var idx = show.map(function(c){ return header.indexOf(c); });
    fill($('pwPreviewTable'), [
      el('thead', null, [el('tr', null, show.map(function(c){ return el('th', {text:c}); }))]),
      el('tbody', null, rows.slice(0, 4).map(function(r){ var cells = r.split(','); return el('tr', null, idx.map(function(i){ return el('td', {text: i >= 0 && cells[i] !== undefined ? cells[i] : '—'}); })); }))
    ]);
    $('pwPreview').hidden = false;
  }
  /* Indonesian copy from lib/rintik-api.js describeError (shared with the other pages); never raw English backend text. */
  function describe(response, body){
    var err = body && body.error && typeof body.error === 'object' ? body.error : {}, api = window.RintikApi, msg;
    if(response.ok) return 'Server tidak mengembalikan hasil Pengawasan yang lengkap.';
    if(api && api.describeError && api.RintikApiError) msg = api.describeError(new api.RintikApiError(err.code || 'HTTP_' + response.status, typeof err.message === 'string' ? err.message : '', response.status));
    else msg = ERRORS[err.code] || 'Server menolak permintaan ini (' + (err.code || response.status) + ').';
    msg = String(msg).trim(); if(!/[.!?]$/.test(msg)) msg += '.';
    if(err.code === 'UNEXPECTED_COLUMNS' && !/bukti/.test(msg)) msg += ' File bukti hanya boleh berisi kolom skema: tanpa label, skor jadi, atau keputusan.';
    return msg;
  }
  async function run(text, name){
    var token = ++runToken;
    showError('');
    $('pwResults').hidden = true;  // never show the previous file's result while the new one is computed
    if(text.length > MAX_BYTES){ showError('File melebihi 5 MB.'); return; }
    preview(text, name);
    $('pwOverlay').hidden = false;
    try {
      var response = await fetch(BASE + '/v1/audit/model-health', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({csv: text})});
      var body = null; try { body = await response.json(); } catch(e) {}
      if(token !== runToken) return;
      if(!response.ok || !body || !body.days || !body.audit || !body.decision){
        showError(describe(response, body) + ' Tidak ada hasil pengganti yang dibuat.');
        $('pwResults').hidden = true;
        return;
      }
      state.result = body; state.page = 0; state.selected = null;
      $('pwDetail').hidden = true;
      $('pwResults').hidden = false;  // visible first so the chart can measure its real width
      render();
      $('pwSummaryTitle').scrollIntoView({behavior: smooth(), block:'start'});
    } catch(e){
      if(token !== runToken) return;
      showError('Server RINTIK tidak dapat dihubungi atau gagal menampilkan hasil. Periksa koneksi lalu coba lagi; tidak ada hasil pengganti yang dibuat.');
      $('pwResults').hidden = true;
    } finally { if(token === runToken) $('pwOverlay').hidden = true; }
  }
  document.querySelectorAll('[data-sample]').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var name = btn.getAttribute('data-sample');
      $('pwResults').hidden = true; showError('');
      var text;
      try { var r = await fetch('assets/data/audit90/' + encodeURIComponent(name)); if(!r.ok) throw new Error(); text = await r.text(); }
      catch(e){ showError('File contoh tidak dapat dimuat.'); return; }
      run(text, name);
    });
  });
  $('pwFile').addEventListener('change', function(){ var f = this.files && this.files[0]; if(f) readFile(f); this.value = ''; });
  var drop = $('pwDrop');
  ['dragover','dragenter'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('is-over'); }); });
  ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(){ drop.classList.remove('is-over'); }); });
  drop.addEventListener('drop', function(e){ e.preventDefault(); var f = e.dataTransfer.files[0]; if(f) readFile(f); });
  function readFile(file){
    $('pwResults').hidden = true;
    if(file.size > MAX_BYTES){ showError('File melebihi 5 MB.'); return; }
    var reader = new FileReader(); reader.onload = function(){ run(String(reader.result), file.name); }; reader.onerror = function(){ showError('File tidak dapat dibaca.'); }; reader.readAsText(file);
  }

  /* ---------------- render ---------------- */
  function render(){
    var r = state.result, s = r.summary, a = r.audit, d = r.decision, ds = r.dataset || {};
    $('pwPeriod').textContent = dlong(ds.period_start) + ' – ' + dlong(ds.period_end) + ' · ' + s.days_evaluated + ' hari · ' + int(ds.rows) + ' baris · lokasi ' + ds.site_id;
    $('pwRuleVersion').textContent = r.rule_version || '';
    var c = s.status_counts;
    $('ansHealth').textContent = 'Trust rata-rata ' + fmt(s.mean_trust);
    $('ansHealthNote').textContent = c.sehat + ' sehat · ' + c.waspada + ' waspada · ' + c.kritis + ' kritis' + (c.tidak_dapat_dinilai ? ' · ' + c.tidak_dapat_dinilai + ' tak dinilai' : '');
    $('ansAudit').textContent = a.available ? a.status_label : 'Belum tersedia';
    $('ansAuditNote').textContent = a.available && a.metrics && a.metrics.n ? 'RMSE ' + fmt(a.metrics.rmse, 2) + ' · bias ' + fmt(a.metrics.bias, 2) + ' · ' + a.metrics.n + ' pasangan' : (a.reason || '');
    $('ansDecision').textContent = d.title;
    $('ansDecisionNote').textContent = d.recovery ? d.recovery.label : '';
    document.querySelectorAll('.pw-answer').forEach(function(node, i){ node.className = 'pw-answer ' + (i === 1 ? auditCls(a) : i === 2 ? (DECISION_CLS[d.category] || 'na') : (c.kritis ? 'warn' : 'ok')); });
    renderKpis(); renderChart(); setupFilters(); applyFilters(); renderAudit(); renderDecision();
    fill($('pwDisclaimer'), (r.disclaimer || []).map(function(t){ return el('li', {text:t}); }));
  }
  function auditCls(a){ return !a.available ? 'na' : a.status === 'lolos' ? 'ok' : a.status === 'gagal' ? 'bad' : 'warn'; }
  function renderKpis(){
    var s = state.result.summary, c = s.status_counts;
    var items = [
      ['Trust rata-rata', fmt(s.mean_trust), 'skala 0–100 · kesehatan, bukan akurasi'],
      ['Hari sehat / waspada / kritis', c.sehat + ' / ' + c.waspada + ' / ' + c.kritis, (c.tidak_dapat_dinilai ? c.tidak_dapat_dinilai + ' hari tidak dapat dinilai' : 'semua hari dapat dinilai')],
      ['Hari dengan masalah input', String(s.days_with_input_issue), s.critical_input_days + ' hari input kritis gagal'],
      ['Pipeline gagal', s.pipeline_failed_days + ' hari', 'tidak menghasilkan P3'],
      ['Prediksi ditahan', int(s.withheld_slots) + ' slot', s.withheld_days + ' hari ditahan penuh'],
      ['Prediksi terbit', int(s.published_slots) + ' / ' + int(s.expected_slots), 'slot 30 menit']
    ];
    fill($('pwKpis'), items.map(function(k){ return el('div', {class:'pw-kpi'}, [el('span', {text:k[0]}), el('strong', {text:k[1]}), el('small', {text:k[2]})]); }));
  }

  /* ---------------- chart ---------------- */
  function svg(tag, attrs, text){ var node = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.keys(attrs || {}).forEach(function(k){ node.setAttribute(k, attrs[k]); }); if(text != null) node.textContent = text; return node; }
  function renderChart(){
    var box = $('pwChart'); box.textContent = '';
    var days = state.result.days, n = days.length;
    if(!n){ box.textContent = 'Tidak ada hari untuk digambar.'; return; }
    var width = Math.max(box.clientWidth || 800, 280), height = width < 560 ? 250 : 300, pad = {l:40, r:12, t:12, b:46};
    var x = function(i){ return pad.l + (n > 1 ? i / (n - 1) : 0) * (width - pad.l - pad.r); };
    var y = function(v){ return pad.t + (1 - clamp(v) / 100) * (height - pad.t - pad.b); };
    var root = svg('svg', {viewBox:'0 0 ' + width + ' ' + height, width:width, height:height, style:'height:' + height + 'px', role:'img', 'aria-label':'Grafik Trust Score harian ' + n + ' hari'});
    root.appendChild(svg('rect', {x:pad.l, y:y(100), width:width - pad.l - pad.r, height:y(85) - y(100), fill:'rgba(47,154,166,.07)'}));
    root.appendChild(svg('rect', {x:pad.l, y:y(85), width:width - pad.l - pad.r, height:y(70) - y(85), fill:'rgba(251,199,96,.10)'}));
    root.appendChild(svg('rect', {x:pad.l, y:y(70), width:width - pad.l - pad.r, height:y(0) - y(70), fill:'rgba(216,84,122,.05)'}));
    var win = state.result.audit.window;
    if(win){
      var wi = days.findIndex(function(d){ return d.date === win.start; });
      if(wi >= 0){ root.appendChild(svg('rect', {x:x(wi) - 3, y:pad.t, width:x(n - 1) - x(wi) + 6, height:height - pad.t - pad.b, fill:'rgba(18,105,226,.08)', stroke:'rgba(18,105,226,.35)', 'stroke-dasharray':'3 3'})); root.appendChild(svg('text', {x:x(n - 1), y:pad.t + 12, 'text-anchor':'end', 'font-size':'11', fill:'#0f55b8'}, 'Jendela audit')); }
    }
    [0, 25, 50, 70, 85, 100].forEach(function(v){
      root.appendChild(svg('line', {x1:pad.l, x2:width - pad.r, y1:y(v), y2:y(v), stroke: v === 70 || v === 85 ? '#9aaec4' : '#e3ebf3', 'stroke-dasharray': v === 70 || v === 85 ? '4 4' : ''}));
      root.appendChild(svg('text', {x:pad.l - 6, y:y(v) + 4, 'text-anchor':'end', 'font-size':'11', fill:'#5a6b80'}, String(v)));
    });
    var lastX = -1e9;
    days.forEach(function(d, i){
      var p = String(d.date).split('-');
      if((p[2] === '01' || p[2] === '15' || i === n - 1) && x(i) - lastX > 46){ lastX = x(i); root.appendChild(svg('text', {x:x(i), y:height - pad.b + 16, 'text-anchor': i === n - 1 ? 'end' : 'middle', 'font-size':'11', fill:'#5a6b80'}, dshort(d.date))); }
    });
    ['O', 'P', 'D', 'Q', 'trust'].forEach(function(key){
      if(!state.series[key]) return;
      var path = '', drawing = false;
      days.forEach(function(d, i){ var v = num(key === 'trust' ? d.trust : d.scores[key]); if(v == null){ drawing = false; return; } path += (drawing ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; drawing = true; });
      if(path) root.appendChild(svg('path', {d:path, fill:'none', stroke:COLORS[key], 'stroke-width': key === 'trust' ? 2.6 : 1.6, 'stroke-linejoin':'round', 'stroke-linecap':'round', opacity: key === 'trust' ? 1 : .85}));
    });
    days.forEach(function(d, i){ if(num(d.trust) != null && d.status === 'kritis') root.appendChild(svg('circle', {cx:x(i), cy:y(d.trust), r:3.6, fill:'#d8547a', stroke:'#fff', 'stroke-width':1.2})); });
    days.forEach(function(d, i){
      if(num(d.trust) == null && d.status === 'kritis') root.appendChild(svg('line', {x1:x(i), x2:x(i), y1:pad.t, y2:height - pad.b, stroke:'rgba(216,84,122,.35)', 'stroke-width':2}));
      var my = height - pad.b + 30;
      if(d.critical_input_failure) root.appendChild(svg('path', {d:'M' + x(i) + ' ' + (my - 5) + ' l4 7 h-8 z', fill:'#d8547a'}));
      else if(d.batch_failed) root.appendChild(svg('rect', {x:x(i) - 3.5, y:my - 4, width:7, height:7, fill:'#3b4a5e', transform:'rotate(45 ' + x(i) + ' ' + (my - .5) + ')'}));
      else if((d.issues || []).indexOf('anomali_input') >= 0) root.appendChild(svg('circle', {cx:x(i), cy:my, r:3, fill:'#e89a2c'}));
    });
    var focus = svg('line', {x1:pad.l, x2:pad.l, y1:pad.t, y2:height - pad.b, stroke:'#5a6b80', 'stroke-width':1, visibility:'hidden'});
    var hit = svg('rect', {x:pad.l, y:pad.t, width:width - pad.l - pad.r, height:height - pad.t, fill:'transparent', tabindex:'0', role:'slider', 'aria-label':'Pilih hari pada grafik dengan panah kiri/kanan; Enter membuka rincian', 'aria-valuemin':'1', 'aria-valuemax':String(n), 'aria-valuenow':'1', style:'cursor:pointer'});
    var tip = $('pwTooltip');
    function show(i, ev){
      i = Math.max(0, Math.min(n - 1, i)); var d = days[i];
      focus.setAttribute('x1', x(i)); focus.setAttribute('x2', x(i)); focus.setAttribute('visibility', 'visible'); hit.setAttribute('aria-valuenow', String(i + 1));
      var s = d.scores, reason = topReason(d), st = STATUS[d.status] || STATUS.tidak_dapat_dinilai;
      var scores = 'Trust ' + fmt(d.trust) + ' · Q ' + fmt(s.Q) + ' · D ' + fmt(s.D) + ' · P ' + fmt(s.P) + ' · O ' + fmt(s.O);
      hit.setAttribute('aria-valuetext', dlong(d.date) + ' · ' + st.label + ' · ' + scores + (reason ? ' — ' + reason : ''));
      fill(tip, [el('strong', {text: dlong(d.date) + ' · ' + st.label}), el('span', {text: scores}), reason ? el('em', {text: reason}) : null]);
      tip.hidden = false;
      var rect = root.getBoundingClientRect(), left = ev ? ev.clientX : rect.left + x(i), top = ev ? ev.clientY : rect.top + pad.t;
      tip.style.left = Math.max(8, Math.min(window.innerWidth - Math.min(300, window.innerWidth - 16) - 8, left + 14)) + 'px'; tip.style.top = Math.max(8, top - 70) + 'px';
    }
    function indexAt(ev){ var rect = root.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, (ev.clientX - rect.left - pad.l) / (rect.width - pad.l - pad.r))) * (n - 1)); }
    function hide(){ focus.setAttribute('visibility', 'hidden'); tip.hidden = true; }
    hit.addEventListener('mousemove', function(ev){ show(indexAt(ev), ev); });
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('blur', hide);
    hit.addEventListener('click', function(ev){ openDay(days[indexAt(ev)].date); });
    hit.addEventListener('keydown', function(ev){
      var cur = Number(hit.getAttribute('aria-valuenow')) - 1;
      if(ev.key === 'ArrowRight' || ev.key === 'ArrowLeft'){ ev.preventDefault(); show(cur + (ev.key === 'ArrowRight' ? 1 : -1) * (ev.shiftKey ? 7 : 1)); }
      else if(ev.key === 'Home' || ev.key === 'End'){ ev.preventDefault(); show(ev.key === 'Home' ? 0 : n - 1); }
      else if(ev.key === 'Enter'){ ev.preventDefault(); openDay(days[Math.max(0, cur)].date); }
    });
    root.appendChild(focus); root.appendChild(hit); box.appendChild(root);
  }
  function topReason(d){
    var reasons = d.reasons || {};
    if((d.critical_reasons || []).length) return 'Input kritis: ' + d.critical_reasons[0];
    if(d.batch_failed) return (reasons.P || [])[0] || 'Pipeline gagal';
    var worst = ['Q','D','P','O'].filter(function(k){ return num(d.scores[k]) != null; }).sort(function(a, b){ return d.scores[a] - d.scores[b]; })[0];
    return worst && d.scores[worst] < 95 && (reasons[worst] || [])[0] ? COMPONENT[worst] + ': ' + reasons[worst][0] : '';
  }
  document.querySelectorAll('[data-series]').forEach(function(cb){ cb.addEventListener('change', function(){ state.series[cb.getAttribute('data-series')] = cb.checked; if(state.result) renderChart(); }); });
  var resizeTimer; window.addEventListener('resize', function(){ clearTimeout(resizeTimer); resizeTimer = setTimeout(function(){ if(state.result && !$('pwResults').hidden) renderChart(); }, 150); });

  /* ---------------- daily history ---------------- */
  function setupFilters(){
    var days = state.result.days;
    ['fFrom','fTo'].forEach(function(id){ $(id).min = days[0].date; $(id).max = days[days.length - 1].date; $(id).value = ''; });
    $('fStatus').value = ''; $('fIssue').value = '';
  }
  function applyFilters(){
    var from = $('fFrom').value, to = $('fTo').value, st = $('fStatus').value, is = $('fIssue').value;
    state.filtered = state.result.days.filter(function(d){ return (!from || d.date >= from) && (!to || d.date <= to) && (!st || d.status === st) && (!is || (d.issues || []).indexOf(is) >= 0); });
    state.page = Math.min(state.page, Math.max(0, Math.ceil(state.filtered.length / PAGE) - 1));
    renderRows();
  }
  ['fFrom','fTo','fStatus','fIssue'].forEach(function(id){ $(id).addEventListener('change', function(){ if(!state.result) return; state.page = 0; applyFilters(); }); });
  $('fReset').addEventListener('click', function(){ if(!state.result) return; setupFilters(); state.page = 0; applyFilters(); });
  $('pgPrev').addEventListener('click', function(){ if(state.page > 0){ state.page--; renderRows(); } });
  $('pgNext').addEventListener('click', function(){ if((state.page + 1) * PAGE < state.filtered.length){ state.page++; renderRows(); } });
  function renderRows(){
    var body = $('pwDayRows'), rows = state.filtered, start = state.page * PAGE, pages = Math.max(1, Math.ceil(rows.length / PAGE));
    body.textContent = '';
    if(!rows.length) body.appendChild(el('tr', null, [el('td', {colspan:'9', class:'pw-empty', text:'Tidak ada hari yang cocok dengan filter.'})]));
    rows.slice(start, start + PAGE).forEach(function(d){
      var s = d.scores, st = STATUS[d.status] || STATUS.tidak_dapat_dinilai, issues = d.issues || [];
      var tr = el('tr', {tabindex:'0', role:'button', 'aria-label':'Rincian ' + dlong(d.date), class: state.selected === d.date ? 'is-selected' : null}, [
        el('td', {text:dlong(d.date)}),
        el('td', null, [el('span', {class:'pw-status ' + st.cls, text:st.label})]),
        el('td', null, [el('b', {text:fmt(d.trust)})]),
        el('td', {text:fmt(s.Q)}), el('td', {text:fmt(s.D)}), el('td', {text:fmt(s.P)}), el('td', {text:fmt(s.O)}),
        el('td', null, issues.length ? issues.map(function(k){ return el('span', {class:'pw-issue', text:ISSUE[k] || k}); }) : [el('span', {class:'pw-none', text:'—'})]),
        el('td', null, [d.published ? d.published_slots + ' / 48' : el('span', {class:'pw-held', text:'Ditahan'})])
      ]);
      tr.addEventListener('click', function(){ openDay(d.date, true); });
      tr.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openDay(d.date, true); } });
      body.appendChild(tr);
    });
    $('pgInfo').textContent = 'Halaman ' + (state.page + 1) + ' dari ' + pages + ' · ' + rows.length + ' hari';
    $('pgPrev').disabled = state.page === 0; $('pgNext').disabled = (state.page + 1) * PAGE >= rows.length;
  }
  function openDay(date, fromTable){
    var d = state.result.days.find(function(item){ return item.date === date; }); if(!d) return;
    state.selected = date;
    var i = state.filtered.findIndex(function(item){ return item.date === date; });
    if(i < 0){ setupFilters(); applyFilters(); i = state.filtered.findIndex(function(item){ return item.date === date; }); }
    state.page = Math.floor(Math.max(0, i) / PAGE); renderRows();
    var st = STATUS[d.status] || STATUS.tidak_dapat_dinilai, panel = $('pwDetail'), weights = state.result.weights || {}, reasons = d.reasons || {};
    fill(panel, [
      el('div', {class:'pw-detail-head'}, [el('div', null, [el('span', {class:'pw-kicker', text:'Rincian hari ke-' + d.day_index}), el('h3', {text:dlong(d.date)})]), el('span', {class:'pw-status ' + st.cls, text:st.label + ' · Trust ' + fmt(d.trust)})]),
      (d.critical_reasons || []).length ? el('div', {class:'pw-gate'}, [el('strong', {text:'Gerbang input kritis menahan hari ini'}), list('ul', null, d.critical_reasons)]) : null,
      el('div', {class:'pw-components'}, ['Q','D','P','O'].map(function(k){
        var v = d.scores[k];
        return el('article', null, [
          el('header', null, [el('span', null, [k + ' · ' + COMPONENT[k] + ' ', el('small', {text:'bobot ' + Math.round((num(weights[k]) || 0) * 100) + '%'})]), el('strong', {text:fmt(v)})]),
          el('div', {class:'pw-bar'}, [el('i', {style:'width:' + clamp(v) + '%'})]),
          list('ul', null, reasons[k])
        ]);
      })),
      el('p', {class:'pw-detail-foot', text:'Prediksi: ' + (d.published ? d.published_slots + ' slot terbit' : 'hari ditahan') + (d.withheld_slots ? ' · ' + d.withheld_slots + ' slot ditahan' : '') + ' · Trust = 0,40Q + 0,30D + 0,20P + 0,10O' + (num(d.trust) == null ? ' (tidak dihitung karena ada komponen yang tidak dapat dinilai)' : '')})
    ]);
    panel.hidden = false;
    if(fromTable !== false) panel.focus({preventScroll:true});
    panel.scrollIntoView({behavior: smooth(), block:'nearest'});
  }

  /* ---------------- audit ---------------- */
  function metricTile(label, value, rule, ok, note){
    return el('div', {class:'pw-metric' + (ok == null ? '' : ok ? ' ok' : ' bad')}, [el('span', {text:label}), el('strong', {text:value}), el('small', {text: rule + (note ? ' · ' + note : '')})]);
  }
  function miniTable(title, rows){
    return el('div', {class:'pw-mini'}, [el('h4', {text:title}), el('table', {class:'data-table'}, [
      el('thead', null, [el('tr', null, ['', 'Pasangan', 'RMSE', 'Bias'].map(function(h){ return el('th', {text:h}); }))]),
      el('tbody', null, rows.map(function(r){ var m = r[1] || {}; return el('tr', null, [el('td', {text:r[0]}), el('td', {text:m.n == null ? '—' : String(m.n)}), el('td', {text:fmt(m.rmse, 2)}), el('td', {text:fmt(m.bias, 2)})]); }))
    ])]);
  }
  function renderAudit(){
    var a = state.result.audit, box = $('pwAudit'), t = a.thresholds || {};
    $('pwAuditLead').textContent = a.definition || '';
    if(!a.available){ fill(box, [el('div', {class:'pw-audit-status na'}, [el('strong', {text:'Belum tersedia'}), el('span', {text:a.reason || ''})])]); return; }
    var m = a.metrics || {}, slots = num(a.window.slots) || 1, minPairs = num(t.min_pairs) || 0, enough = (num(m.n) || 0) >= minPairs, b = a.breakdown || {}, dn = b.day_night || {}, hu = b.humidity || {}, rej = a.rejected_reference || {};
    var kids = [
      el('div', {class:'pw-audit-status ' + auditCls(a)}, [el('strong', {text:a.status_label}), el('span', {text:(a.reason || '') + ' Jendela ' + dlong(a.window.start) + ' – ' + dlong(a.window.end) + ' (' + a.window.slots + ' slot).'})]),
      el('div', {class:'pw-metrics'}, [
        metricTile('RMSE', fmt(m.rmse, 2) + ' poin RH', 'batas ≤ ' + fmt(t.rmse_max, 1), enough && num(m.rmse) != null ? m.rmse <= t.rmse_max : null),
        metricTile('Bias (P3 − referensi)', fmt(m.bias, 2) + ' poin RH', 'batas |bias| ≤ ' + fmt(t.abs_bias_max, 1), enough && num(m.bias) != null ? Math.abs(m.bias) <= t.abs_bias_max : null, m.bias > 0 ? 'P3 terlalu tinggi' : m.bias < 0 ? 'P3 terlalu rendah' : ''),
        metricTile('MAE', fmt(m.mae, 2) + ' poin RH', 'dicatat, tanpa batas', null),
        metricTile('Pasangan valid', String(m.n), 'minimum ' + minPairs + ' dari ' + slots, enough),
        metricTile('Cakupan referensi', pct(a.reference_coverage), 'referensi terverifikasi di jendela', null),
        metricTile('P3 ditahan di jendela', a.withheld_in_window + ' slot', 'tidak ikut diaudit', null)
      ]),
      el('div', {class:'pw-pairbar', role:'img', 'aria-label':'Pasangan valid ' + m.n + ' dari minimum ' + minPairs}, [el('i', {style:'width:' + clamp((num(m.n) || 0) / slots * 100) + '%'}), el('b', {style:'left:' + clamp(minPairs / slots * 100) + '%'}), el('span', {text:m.n + ' pasangan · garis = minimum ' + minPairs})]),
      el('p', {class:'pw-rejected', text:'Tidak dipakai: ' + rej.missing_value + ' slot tanpa referensi, ' + rej.not_verified + ' belum terverifikasi, ' + rej.site_mismatch + ' beda lokasi, ' + rej.unreadable_or_out_of_range + ' tak valid, ' + rej.valid_but_prediction_withheld + ' referensi valid tetapi P3-nya ditahan.'}),
      el('div', {class:'pw-breakdown'}, [
        miniTable('Per hari', (b.by_day || []).map(function(r){ return [dshort(r.date), r]; })),
        miniTable('Siang / malam', [['Siang 06.00–18.00', dn.siang], ['Malam', dn.malam]]),
        miniTable('Kondisi kelembapan (referensi)', [['Kering ≤ 40%', hu.kering_ekstrem], ['Normal', hu.normal], ['Lembap ≥ 85%', hu.lembap_ekstrem]])
      ])
    ];
    if(a.spot_checks && a.spot_checks.length){
      kids.push(el('div', {class:'pw-spots'}, [el('h4', null, ['Titik cek referensi sebelumnya ', el('small', {text:'(tren saja, tidak menentukan status)'})]), el('div', null, a.spot_checks.map(function(s){ return el('span', null, [el('b', {text:dshort(s.date)}), ' bias ' + fmt(s.bias, 2) + ' · RMSE ' + fmt(s.rmse, 2)]); }))]));
    }
    fill(box, kids);
  }

  /* ---------------- decision ---------------- */
  function renderDecision(){
    var d = state.result.decision, f = d.factors || {}, rec = d.recovery || {reasons:[]}, cls = DECISION_CLS[d.category] || 'na';
    $('pwDecision').className = 'card pw-section pw-decision ' + cls;
    $('pwDecisionTitle').textContent = d.title;
    var factor = function(k, v){ return el('div', null, [el('dt', {text:k}), el('dd', {text:v})]); };
    fill($('pwDecisionBody'), [el('div', {class:'pw-decision-grid'}, [
      el('div', null, [el('h4', {text:'Alasan terukur'}), list('ul', 'pw-reasons', d.reasons), el('h4', {text:'Langkah tindak lanjut'}), list('ol', 'pw-steps', d.next_steps)]),
      el('aside', null, [
        el('div', {class:'pw-recovery ' + (rec.allowed ? 'ok' : 'bad')}, [el('strong', {text:rec.label}), list('ul', null, rec.reasons), el('small', {text:'Keputusan recovery terpisah dari keputusan pembaruan model.'})]),
        el('dl', {class:'pw-factors'}, [factor('Q rata-rata jendela', fmt(f.mean_Q_window)), factor('D rata-rata jendela', fmt(f.mean_D_window)), factor('P rata-rata jendela', fmt(f.mean_P_window)), factor('Trust rata-rata jendela', fmt(f.mean_trust_window)), factor('Hari input kritis gagal', String((f.critical_input_days || []).length)), factor('Slot P3 ditahan (90 hari)', int(f.withheld_slots_period))]),
        el('p', {class:'pw-retrain', text:d.retraining_note || ''})
      ])
    ])]);
  }
})();
