(function(){
  'use strict';

  var apiLib = window.RintikApi;
  var predictionLib = window.RintikPublicPrediction;
  if(!apiLib || !predictionLib) return;

  var params = new URLSearchParams(window.location.search);
  var baseUrl = params.get('api') || sessionStorage.getItem('rintik_api_url') || 'http://127.0.0.1:8000';
  sessionStorage.setItem('rintik_api_url', baseUrl);
  var client = apiLib.createClient({baseUrl: baseUrl, timeoutMs: 120000});
  var pageKind = document.body.getAttribute('data-flow-page');
  var state = {mode:'daily',busy:false,health:null,days:[],incidents:[],result:null,monitoring:null,outageIncident:null,catalog:null};

  function $(id){ return document.getElementById(id); }
  function mean(values){ return values.length ? values.reduce(function(sum,value){ return sum + value; },0) / values.length : null; }
  function fmtRh(value){ return value === null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(1) + '%'; }
  function formatDate(value){
    if(!value) return '—';
    var parts = String(value).slice(0,10).split('-');
    var months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return Number(parts[2]) + ' ' + months[Number(parts[1]) - 1] + ' ' + parts[0];
  }
  function shortDate(value){
    var parts = String(value).slice(0,10).split('-');
    var months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return Number(parts[2]) + ' ' + months[Number(parts[1]) - 1];
  }
  function predictionValues(result){
    return (result && result.predictions || []).map(function(row){
      var value = row.post_3 !== undefined ? row.post_3 : row.air_humidity;
      return Number(value);
    }).filter(Number.isFinite);
  }
  function timestampOf(row){ return row.timestamp || row.datetime; }
  function sensorStateLabel(value){
    var labels = {available_simulated:'Normal · simulasi',stuck_simulated:'Stuck · simulasi',missing_simulated:'Terputus · simulasi',simulated_repaired:'Pulih · simulasi'};
    return labels[value] || 'Tidak dijalankan';
  }
  function verdictLabel(value){
    var labels = {monitoring:'Normal · simulasi',monitoring_repaired_simulation:'Pulih · simulasi',suspected_sensor_malfunction:'Dugaan malfungsi',suspected_sensor_outage:'Dugaan outage'};
    return labels[value] || 'Model asli';
  }
  function errorMessage(error){ return predictionLib.errorMessage(error); }

  function setupNavigation(){
    document.querySelectorAll('[data-api-link]').forEach(function(link){
      var url = new URL(link.getAttribute('href'), window.location.href);
      url.searchParams.set('api', baseUrl);
      link.href = url.pathname.split('/').pop() + '?' + url.searchParams.toString();
    });
    var toggle = document.querySelector('.nav-toggle');
    var menu = document.querySelector('.mobile-menu');
    if(toggle && menu){
      toggle.addEventListener('click', function(){
        var open = !menu.classList.contains('open');
        menu.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
  }

  function setSystem(online,title,detail){
    var box = $('systemStatus');
    if(!box) return;
    box.classList.toggle('is-online', online);
    box.classList.toggle('is-error', !online);
    $('systemStatusTitle').textContent = title;
    $('systemStatusDetail').textContent = detail;
  }

  function setAlert(title,message,kind){
    var alert = $('flowAlert');
    if(!alert) return;
    $('flowAlertTitle').textContent = title;
    $('flowAlertMessage').textContent = message;
    alert.classList.toggle('is-info', kind === 'info');
    alert.hidden = false;
    alert.focus({preventScroll:true});
    alert.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function hideAlert(){ if($('flowAlert')) $('flowAlert').hidden = true; }

  function svgNode(tag,attrs,text){
    var element = document.createElementNS('http://www.w3.org/2000/svg',tag);
    Object.keys(attrs || {}).forEach(function(key){ element.setAttribute(key,attrs[key]); });
    if(text !== undefined) element.textContent = text;
    return element;
  }
  function seriesPath(values,x,y){
    var path = '', drawing = false;
    values.forEach(function(value,index){
      if(value === null || value === undefined || !Number.isFinite(Number(value))){ drawing = false; return; }
      path += (drawing ? 'L' : 'M') + x(index).toFixed(2) + ' ' + y(Number(value)).toFixed(2) + ' ';
      drawing = true;
    });
    return path.trim();
  }
  function renderChart(container,result,monitoring){
    while(container.firstChild) container.removeChild(container.firstChild);
    var predictions = result && result.predictions || [];
    if(!predictions.length){
      var empty = document.createElement('div'); empty.className = 'flow-chart-empty'; empty.textContent = 'Grafik belum tersedia.'; container.appendChild(empty); return;
    }
    var model = predictions.map(function(row){ return Number(row.post_3 !== undefined ? row.post_3 : row.air_humidity); });
    var sensor = monitoring && monitoring.sensor ? monitoring.sensor.values.map(function(row){ return row.physical_rh; }) : [];
    var recoveryMap = {};
    if(monitoring && monitoring.recovery) monitoring.recovery.values.forEach(function(row){ recoveryMap[row.timestamp] = row.recovery_rh; });
    var recovery = predictions.map(function(row){ var value = recoveryMap[timestampOf(row)]; return value === undefined ? null : value; });
    var width = Math.max(container.clientWidth || 620,320), height = 260;
    var pad = {left:38,right:10,top:14,bottom:27};
    var x = function(index){ return pad.left + index / Math.max(1,predictions.length - 1) * (width - pad.left - pad.right); };
    var y = function(value){ return pad.top + (1 - Number(value) / 100) * (height - pad.top - pad.bottom); };
    var svg = svgNode('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':'Grafik estimasi RINTIK'+(monitoring?', sensor humidity simulasi, dan recovery estimated bila tersedia':'')});
    [0,25,50,75,100].forEach(function(value){
      svg.appendChild(svgNode('line',{x1:pad.left,y1:y(value),x2:width-pad.right,y2:y(value),stroke:'#dce5e1','stroke-width':'1'}));
      svg.appendChild(svgNode('text',{x:pad.left-7,y:y(value)+4,fill:'#718079','font-size':'9','text-anchor':'end'},String(value)));
    });
    var modelPath = seriesPath(model,x,y);
    if(modelPath) svg.appendChild(svgNode('path',{d:modelPath,fill:'none',stroke:'#146b4a','stroke-width':'2.8','stroke-linecap':'round','stroke-linejoin':'round'}));
    var sensorPath = seriesPath(sensor,x,y);
    if(sensorPath) svg.appendChild(svgNode('path',{d:sensorPath,fill:'none',stroke:'#68736e','stroke-width':'2.1','stroke-dasharray':'7 5','stroke-linecap':'round','stroke-linejoin':'round'}));
    var recoveryPath = seriesPath(recovery,x,y);
    if(recoveryPath) svg.appendChild(svgNode('path',{d:recoveryPath,fill:'none',stroke:'#2367a3','stroke-width':'2.7','stroke-dasharray':'2 5','stroke-linecap':'round','stroke-linejoin':'round'}));
    var first = timestampOf(predictions[0]), last = timestampOf(predictions[predictions.length - 1]);
    svg.appendChild(svgNode('text',{x:pad.left,y:height-7,fill:'#718079','font-size':'9'},String(first).slice(11,16)));
    svg.appendChild(svgNode('text',{x:width-pad.right,y:height-7,fill:'#718079','font-size':'9','text-anchor':'end'},String(last).slice(11,16)));
    container.appendChild(svg);
  }

  function legendHtml(monitoring){
    var html = '<span><i class="flow-line-key"></i>RINTIK P3</span>';
    if(monitoring) html += '<span><i class="flow-line-key sensor"></i>Sensor RH · simulasi</span>';
    if(monitoring && monitoring.recovery && monitoring.recovery.values.length) html += '<span><i class="flow-line-key recovery"></i>Recovery · estimated</span>';
    return html;
  }

  async function monitoringForDate(date){
    try { return await client.getMonitoring(date); }
    catch(error){ if(error.code === 'MONITORING_NOT_FOUND') return null; throw error; }
  }

  function storeLatestDate(date){
    localStorage.setItem('rintik_latest_daily_date',date);
  }

  function updateReplayStatus(){
    if(!$('replayCount')) return;
    var completed = state.days.filter(function(day){ return day.status === 'completed'; }).length;
    $('replayCount').textContent = completed + ' / 16 hari';
    $('replayProgress').style.width = (completed / 16 * 100).toFixed(2) + '%';
    $('nextDate').textContent = state.health.next_expected_date ? 'Berikutnya · ' + formatDate(state.health.next_expected_date) : 'Seluruh 16 tanggal resmi telah selesai';
    updateProcessButton();
  }

  function updateProcessButton(){
    if(!$('processButton')) return;
    if(state.mode === 'manual'){
      $('processButton').hidden = true;
      return;
    }
    $('processButton').hidden = false;
    var complete = !state.health || !state.health.next_expected_date;
    $('processButton').disabled = state.busy || complete;
    if(complete){
      $('processButtonLabel').textContent = 'Replay resmi selesai';
      $('processButtonSub').textContent = '16 / 16 hari';
      return;
    }
    if(state.mode === 'batch'){
      var completed = state.days.filter(function(day){ return day.status === 'completed'; }).length;
      var count = Math.min(15,16-completed);
      $('processButtonLabel').textContent = 'Proses hingga ' + count + ' hari berikutnya';
      $('processButtonSub').textContent = 'daily batch berurutan';
    } else {
      $('processButtonLabel').textContent = 'Ambil & proses ' + shortDate(state.health.next_expected_date);
      $('processButtonSub').textContent = '1 daily batch';
    }
  }

  function setBusy(active,total,index,date){
    state.busy = active;
    if($('processingPanel')) $('processingPanel').hidden = !active;
    if(active){
      $('processingTitle').textContent = total > 1 ? 'Memproses hari ' + index + ' dari ' + total : 'Memproses ' + formatDate(date);
      $('processingDetail').textContent = date ? 'Fitur ' + date + ' → model frozen → P1–P3 · RH simulasi → pembanding' : 'Mengambil data sensor resmi berikutnya…';
      $('processProgress').max = total;
      $('processProgress').value = Math.max(0,index-1);
    }
    updateProcessButton();
  }

  function renderIncidents(){
    if(!$('incidentList')) return;
    var container = $('incidentList'); container.innerHTML = '';
    if(!state.incidents.length){
      var empty = document.createElement('div'); empty.className = 'incident-item'; empty.innerHTML = '<strong>Belum ada gangguan simulasi</strong><span>Replay belum mencapai skenario stuck/outage.</span>'; container.appendChild(empty);
    } else {
      state.incidents.forEach(function(incident){
        var item = document.createElement('div'); item.className = 'incident-item' + (incident.type === 'sensor_outage' ? ' is-outage' : '');
        var title = incident.type === 'sensor_outage' ? 'Sensor terputus · simulasi' : 'Sensor stuck · simulasi';
        item.innerHTML = '<strong>' + title + '</strong><span>' + shortDate(incident.date) + ' · ' + (incident.status === 'confirmed_simulation' ? 'recovery dicatat' : 'menunggu aksi simulasi') + '</span>';
        container.appendChild(item);
      });
    }
    state.outageIncident = state.incidents.filter(function(incident){ return incident.type === 'sensor_outage'; }).slice(-1)[0] || null;
    var action = $('recoveryAction');
    if(action){
      action.hidden = !state.outageIncident;
      if(state.outageIncident) action.textContent = state.outageIncident.status === 'confirmed_simulation' ? 'Lihat recovery pada ' + shortDate(state.outageIncident.date) : 'Konfirmasi outage simulasi & tampilkan recovery';
    }
  }

  function renderEmptyState(){
    state.result = null;
    state.monitoring = null;
    state.incidents = [];
    state.outageIncident = null;
    if($('latestContent')) $('latestContent').hidden = true;
    if($('latestEmpty')) $('latestEmpty').hidden = false;
    renderIncidents();
  }

  function renderLatest(result,monitoring){
    if(!$('latestContent')) return;
    state.result = result; state.monitoring = monitoring;
    $('latestEmpty').hidden = true; $('latestContent').hidden = false;
    var values = predictionValues(result), minimum = Math.min.apply(null,values), maximum = Math.max.apply(null,values);
    $('latestDate').textContent = formatDate(result.date);
    $('latestStatus').textContent = 'Model original · snapshot daily tersimpan · ' + (result.window ? result.window.date_count : 1) + ' hari konteks';
    $('latestMean').textContent = fmtRh(mean(values));
    $('latestRange').textContent = minimum.toFixed(1) + '–' + maximum.toFixed(1) + '%';
    $('latestRows').textContent = result.predictions.length + '/48';
    if(monitoring){
      $('latestVerdict').textContent = verdictLabel(monitoring.assessment.verdict);
      $('latestSensor').textContent = sensorStateLabel(monitoring.sensor.state);
      $('latestSensorNote').textContent = 'bukan ground truth';
    } else {
      $('latestVerdict').textContent = 'Model asli';
      $('latestSensor').textContent = 'Tidak dijalankan';
      $('latestSensorNote').textContent = 'simulasi dimatikan';
    }
    $('latestLegend').innerHTML = legendHtml(monitoring);
    renderChart($('latestChart'),result,monitoring);
    var href = new URL('hasil.html',window.location.href); href.searchParams.set('api',baseUrl); href.searchParams.set('date',result.date); $('resultLink').href = href.pathname.split('/').pop() + '?' + href.searchParams.toString();
    storeLatestDate(result.date);
    renderIncidents();
  }

  async function loadDate(date){
    var result = await client.getDayResult(date);
    var monitoring = await monitoringForDate(date);
    renderLatest(result,monitoring);
    return {result:result,monitoring:monitoring};
  }

  async function refreshStatus(preferredDate){
    hideAlert();
    try {
      var responses = await Promise.all([client.health(),client.listDays(),client.listIncidents()]);
      state.health = responses[0]; state.days = responses[1].days || []; state.incidents = responses[2].incidents || [];
      setSystem(true,'Model dan state siap',state.health.completed_days + '/16 tanggal selesai · model frozen terverifikasi');
      updateReplayStatus();
      var completed = state.days.filter(function(day){ return day.status === 'completed'; });
      var target = preferredDate || localStorage.getItem('rintik_latest_daily_date') || (completed.length ? completed[completed.length-1].date : null);
      if(target && completed.some(function(day){ return day.date === target; })) await loadDate(target);
      else if(!completed.length) renderEmptyState();
      else renderIncidents();
      return true;
    } catch(error){
      setSystem(false,'Backend tidak tersedia','Tidak ada hasil pengganti yang dibuat.');
      setAlert('Sistem RINTIK belum siap',errorMessage(error));
      if($('processButton')) $('processButton').disabled = true;
      return false;
    }
  }

  async function processOne(simulationEnabled){
    var fixture = await client.getNextOfficialDemoInput();
    var rows = predictionLib.parseCsvText(fixture.csv);
    var classification = predictionLib.classifyRows(rows);
    if(!classification.ok || classification.workflow !== 'daily_batch' || classification.date !== fixture.date){
      throw new predictionLib.PublicPredictionError('INVALID_FIXTURE_SHAPE','Fixture resmi tidak cocok dengan kontrak daily batch.');
    }
    var processed = await predictionLib.processRows(rows,client,{monitoringEnabled:simulationEnabled});
    return {date:fixture.date,processed:processed};
  }

  async function runProcessing(){
    if(state.busy || !state.health || !state.health.next_expected_date) return;
    hideAlert();
    var completed = state.days.filter(function(day){ return day.status === 'completed'; }).length;
    var target = state.mode === 'batch' ? Math.min(15,16-completed) : 1;
    var simulationEnabled = $('faultSimulation').checked;
    var latest = null;
    setBusy(true,target,1,state.health.next_expected_date);
    try {
      for(var index=1; index<=target; index++){
        var next = await client.health();
        if(!next.next_expected_date) break;
        setBusy(true,target,index,next.next_expected_date);
        latest = await processOne(simulationEnabled);
        $('processProgress').value = index;
        $('processingDetail').textContent = formatDate(latest.date) + ' selesai dan tersimpan.';
      }
      await refreshStatus(latest && latest.date);
      setAlert('Siklus akuisisi selesai',target > 1 ? 'Daily batch berurutan selesai. Prediksi dan seri pembanding RH simulasi telah disimpan terpisah.' : 'Fitur lingkungan, prediksi RINTIK, dan pembanding RH simulasi untuk hari ini telah tersimpan. Tekan lagi untuk hari berikutnya.','info');
    } catch(error){
      await refreshStatus(latest && latest.date);
      setAlert('Pemrosesan dihentikan',errorMessage(error) + ' Daily batch yang sudah selesai tetap tersimpan; tidak ada hasil palsu yang dibuat.');
    } finally { setBusy(false,target,target,state.health && state.health.next_expected_date); }
  }

  async function applyRecovery(){
    if(!state.outageIncident || state.busy) return;
    var incident = Object.assign({},state.outageIncident);
    hideAlert();
    setBusy(true,1,1,incident.date);
    try {
      if(incident.status !== 'confirmed_simulation'){
        await client.createDemoAudit('pass','prediction-audit-pass-' + incident.incident_id);
        await client.confirmIncident(incident.incident_id,{demo_override:true,note:'Explicit simulated technician action from prediction workspace.'},'prediction-confirm-' + incident.incident_id);
      }
      await refreshStatus(incident.date);
      if($('latestContent')) $('latestContent').scrollIntoView({behavior:'smooth',block:'start'});
      setAlert('Recovery simulasi ditampilkan','Sensor fisik yang hilang tetap kosong. Garis biru adalah estimasi RINTIK dan tidak menggantikan raw sensor secara diam-diam.','info');
    } catch(error){ setAlert('Recovery simulasi ditolak',errorMessage(error)); }
    finally { setBusy(false,1,1,incident.date); }
  }

  function manualFeatureInputs(){
    return Array.prototype.slice.call(document.querySelectorAll('[data-manual-feature]'));
  }

  function renderManualCatalog(catalog){
    state.catalog = catalog;
    var container = $('manualGroups');
    container.innerHTML = '';
    catalog.groups.forEach(function(group,index){
      var details = document.createElement('details');
      details.className = 'manual-group'; details.open = index === 0;
      var summary = document.createElement('summary'); summary.textContent = group.label + ' ';
      var count = document.createElement('span'); count.textContent = '· ' + group.features.length + ' fitur';
      summary.appendChild(count); details.appendChild(summary);
      var grid = document.createElement('div'); grid.className = 'manual-field-grid';
      group.features.forEach(function(feature){
        var field = document.createElement('div'); field.className = 'manual-field';
        var label = document.createElement('label'); label.htmlFor = 'manual-' + feature.key; label.textContent = feature.label;
        var input = document.createElement('input'); input.id = 'manual-' + feature.key; input.type = 'number'; input.step = 'any'; input.inputMode = 'decimal'; input.dataset.manualFeature = feature.key; input.autocomplete = 'off';
        var unit = document.createElement('small'); unit.textContent = feature.unit || '';
        field.appendChild(label); field.appendChild(input); field.appendChild(unit); grid.appendChild(field);
      });
      details.appendChild(grid); container.appendChild(details);
    });
  }

  function setManualResult(message,isError){
    var result = $('manualResult');
    result.textContent = message;
    result.classList.toggle('is-error',Boolean(isError));
    result.hidden = false;
  }

  async function loadManualExample(){
    if(state.busy) return;
    hideAlert();
    $('loadManualExample').disabled = true;
    $('validateManualButton').disabled = true;
    try {
      var row;
      if(state.health && state.health.next_expected_date){
        var fixture = await client.getNextOfficialDemoInput();
        var rows = predictionLib.parseCsvText(fixture.csv);
        var keys = manualFeatureInputs().map(function(input){ return input.dataset.manualFeature; });
        row = rows.find(function(candidate){
          return keys.every(function(key){ return candidate[key] !== '' && Number.isFinite(Number(candidate[key])); });
        }) || rows[0];
      } else {
        var completed = state.days.filter(function(day){ return day.status === 'completed'; });
        if(!completed.length) throw new Error('Belum ada fixture sensor yang dapat dibaca.');
        var series = await client.getDaySeries(completed[completed.length-1].date);
        var point = series.points.find(function(candidate){
          return Object.keys(candidate.values).every(function(key){
            return candidate.values[key] !== null && Number.isFinite(Number(candidate.values[key]));
          });
        }) || series.points[0];
        row = Object.assign({datetime:point.timestamp},point.values);
      }
      $('manualTimestamp').value = String(row.datetime || row.timestamp || '').replace(' ','T').slice(0,16);
      manualFeatureInputs().forEach(function(input){
        var value = row[input.dataset.manualFeature];
        input.value = value === null || value === undefined || value === '' ? '' : value;
        input.dataset.officialMissing = input.value === '' ? 'true' : 'false';
      });
      setManualResult('Snapshot sensor resmi dimuat ke form. Nilai ini belum disimpan dan belum menjalankan inferensi.',false);
    } catch(error){ setManualResult(errorMessage(error),true); }
    finally {
      $('loadManualExample').disabled = false;
      $('validateManualButton').disabled = false;
    }
  }

  function validateManual(){
    var missing = [];
    var officialGaps = [];
    if(!$('manualTimestamp').value) missing.push('timestamp');
    manualFeatureInputs().forEach(function(input){
      if(input.value === '' && input.dataset.officialMissing === 'true') officialGaps.push(input.dataset.manualFeature);
      else if(input.value === '' || !Number.isFinite(Number(input.value))) missing.push(input.dataset.manualFeature);
    });
    if(missing.length){
      setManualResult('Isian belum valid. Lengkapi nilai numerik untuk: ' + missing.join(', ') + '.',true);
      return;
    }
    var gapText = officialGaps.length ? ' ' + officialGaps.length + ' gap resmi dipertahankan: ' + officialGaps.join(', ') + '.' : '';
    setManualResult('Validasi form PASS: 23/23 fitur diperiksa.' + gapText + ' Isian tetap berupa draft inspeksi; inferensi daily membutuhkan batch resmi lengkap dan terverifikasi hash.',false);
  }

  function clearManual(){
    $('manualTimestamp').value = '';
    manualFeatureInputs().forEach(function(input){ input.value = ''; delete input.dataset.officialMissing; });
    $('manualResult').hidden = true;
  }

  function selectMode(mode){
    state.mode = mode;
    document.querySelectorAll('[data-mode]').forEach(function(item){
      item.setAttribute('aria-selected',String(item.dataset.mode === mode));
    });
    var manual = mode === 'manual';
    document.querySelector('.flow-grid').classList.toggle('is-manual',manual);
    $('manualPanel').hidden = !manual;
    $('simulationControl').hidden = manual;
    if(manual){
      $('modeExplanation').innerHTML = '<strong>Form Manual.</strong> Gunakan untuk melihat dan memeriksa 23 fitur sensor. Satu observasi tidak memenuhi kontrak batch temporal, sehingga tidak disimpan atau diinferensikan.';
    } else if(mode === 'batch'){
      $('modeExplanation').innerHTML = '<strong>Mode batch.</strong> Sistem tetap menjalankan siklus akuisisi tanggal satu per satu secara kronologis, maksimal 15 hari. Ini bukan perubahan rolling window model.';
    } else {
      $('modeExplanation').innerHTML = '<strong>Mode harian.</strong> Satu klik mengambil fitur lingkungan, menjalankan model dan P1 → P2 → P3, lalu menyimpan prediksi bersama RH simulasi yang tetap terpisah.';
    }
    updateProcessButton();
  }

  async function resetDemo(){
    if(state.busy) return;
    state.busy = true;
    updateProcessButton();
    $('confirmResetButton').disabled = true;
    try {
      await client.resetDemoState('RESET_DEMO_STATE');
      localStorage.removeItem('rintik_latest_daily_date');
      $('resetConfirmation').hidden = true;
      renderEmptyState();
      await refreshStatus();
      setAlert('Data demo direset','Replay kembali ke tanggal pertama. Model frozen, sidecar, dan fixture resmi tidak berubah.','info');
    } catch(error){ setAlert('Reset demo gagal',errorMessage(error)); }
    finally {
      state.busy = false;
      $('confirmResetButton').disabled = false;
      updateProcessButton();
    }
  }

  function bindPredict(){
    document.querySelectorAll('[data-mode]').forEach(function(button){
      button.addEventListener('click',function(){
        selectMode(button.dataset.mode);
      });
    });
    $('faultSimulation').addEventListener('change',function(){ $('scenarioSchedule').hidden = !this.checked; });
    $('processButton').addEventListener('click',runProcessing);
    $('refreshButton').addEventListener('click',function(){ refreshStatus(); });
    $('recoveryAction').addEventListener('click',applyRecovery);
    $('openResetButton').addEventListener('click',function(){
      $('resetConfirmation').hidden = false;
      $('cancelResetButton').focus();
    });
    $('cancelResetButton').addEventListener('click',function(){
      $('resetConfirmation').hidden = true;
      $('openResetButton').focus();
    });
    $('confirmResetButton').addEventListener('click',resetDemo);
    $('loadManualExample').addEventListener('click',loadManualExample);
    $('validateManualButton').addEventListener('click',validateManual);
    $('clearManualButton').addEventListener('click',clearManual);
    window.addEventListener('resize',function(){ if(state.result) renderChart($('latestChart'),state.result,state.monitoring); });
    client.listFeatures().then(renderManualCatalog).catch(function(error){ $('manualGroups').textContent = errorMessage(error); });
    selectMode('daily');
    refreshStatus();
  }

  function renderResultPage(result,monitoring){
    state.result = result; state.monitoring = monitoring;
    $('resultEmpty').hidden = true; $('resultContent').hidden = false;
    var values = predictionValues(result);
    $('resultDate').textContent = formatDate(result.date);
    $('resultStatus').textContent = 'Snapshot daily tersimpan · ' + (result.window ? result.window.mode.replace(/_/g,' ') : 'daily batch');
    $('resultMean').textContent = fmtRh(mean(values)); $('resultMin').textContent = fmtRh(Math.min.apply(null,values)); $('resultMax').textContent = fmtRh(Math.max.apply(null,values)); $('resultRows').textContent = result.predictions.length + '/48';
    $('resultVerdict').textContent = monitoring ? verdictLabel(monitoring.assessment.verdict) : 'Model asli';
    $('resultLegend').innerHTML = legendHtml(monitoring);
    renderChart($('resultChart'),result,monitoring);
    var sensorMap = {}, recoveryMap = {};
    if(monitoring){ monitoring.sensor.values.forEach(function(row){ sensorMap[row.timestamp] = row.physical_rh; }); monitoring.recovery.values.forEach(function(row){ recoveryMap[row.timestamp] = row.recovery_rh; }); }
    $('resultTableBody').innerHTML = result.predictions.map(function(row){
      var timestamp = timestampOf(row), model = row.post_3 !== undefined ? row.post_3 : row.air_humidity;
      var sensor = sensorMap[timestamp], recovery = recoveryMap[timestamp];
      return '<tr><td>' + timestamp + '</td><td>' + Number(model).toFixed(4) + '%</td><td>' + (sensor === undefined || sensor === null ? '—' : Number(sensor).toFixed(4) + '%') + '</td><td>' + (recovery === undefined ? '—' : Number(recovery).toFixed(4) + '%') + '</td></tr>';
    }).join('');
    if(monitoring){
      var recoveryActive = monitoring.recovery && monitoring.recovery.values.length;
      $('resultSimulationSummary').textContent = sensorStateLabel(monitoring.sensor.state) + '. ' + (recoveryActive ? 'Recovery estimated aktif dan raw sensor tetap dipertahankan sebagai gap.' : 'Tidak ada recovery estimated aktif pada tanggal ini.');
      $('resultProvenance').innerHTML = '<strong>Perbandingan simulasi yang terpisah</strong><span>RINTIK berasal dari checkpoint original. RH fisik dibuat untuk demonstrasi, tidak menjadi input model atau ground truth akurasi.</span>';
    } else {
      $('resultSimulationSummary').textContent = 'Hasil model tersedia. Monitoring sensor simulasi tidak dijalankan untuk tanggal ini.';
      $('resultProvenance').innerHTML = '<strong>Hasil model asli</strong><span>Output berasal dari checkpoint frozen. Tidak ada data sensor humidity sintetis pada tampilan ini.</span>';
    }
  }

  async function initResult(){
    try {
      var responses = await Promise.all([client.health(),client.listDays()]);
      state.health = responses[0]; state.days = responses[1].days || [];
      setSystem(true,'Hasil tersinkron',state.health.completed_days + '/16 tanggal tersimpan di backend');
      var completed = state.days.filter(function(day){ return day.status === 'completed'; });
      if(!completed.length) return;
      var requested = params.get('date') || localStorage.getItem('rintik_latest_daily_date');
      var target = completed.some(function(day){ return day.date === requested; }) ? requested : completed[completed.length-1].date;
      var result = await client.getDayResult(target), monitoring = await monitoringForDate(target);
      renderResultPage(result,monitoring); storeLatestDate(target);
    } catch(error){ setSystem(false,'Hasil tidak tersedia','Backend gagal merespons.'); $('resultEmpty').querySelector('p').textContent = errorMessage(error) + ' Tidak ada hasil pengganti yang dibuat.'; }
    window.addEventListener('resize',function(){ if(state.result) renderChart($('resultChart'),state.result,state.monitoring); });
  }

  setupNavigation();
  if(pageKind === 'predict') bindPredict();
  if(pageKind === 'result') initResult();
})();
