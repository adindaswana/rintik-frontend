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
  function operationalValues(result,monitoring){
    var predictions = result && result.predictions || [];
    if(!monitoring || !monitoring.sensor) return {values:predictionValues(result),source:'prediction'};
    var sensorMap = {}, recoveryMap = {};
    monitoring.sensor.values.forEach(function(row){ sensorMap[row.timestamp] = row.physical_rh; });
    (monitoring.recovery && monitoring.recovery.values || []).forEach(function(row){ recoveryMap[row.timestamp] = row.recovery_rh; });
    var usedRecovery = false;
    var values = predictions.map(function(row){
      var timestamp = timestampOf(row), sensor = sensorMap[timestamp];
      if(sensor !== null && sensor !== undefined && Number.isFinite(Number(sensor))) return Number(sensor);
      var recovery = recoveryMap[timestamp];
      if(recovery !== null && recovery !== undefined && Number.isFinite(Number(recovery))){ usedRecovery = true; return Number(recovery); }
      return null;
    }).filter(function(value){ return value !== null; });
    return {values:values,source:usedRecovery?'recovery':'sensor'};
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

  function setAlert(title,message,kind,options){
    var alert = $('flowAlert');
    if(!alert) return;
    options = options || {};
    $('flowAlertTitle').textContent = title;
    $('flowAlertMessage').textContent = message;
    alert.classList.toggle('is-info', kind === 'info');
    alert.hidden = false;
    if(options.focus !== false) alert.focus({preventScroll:true});
    if(options.scroll !== false) alert.scrollIntoView({behavior:'smooth',block:'nearest'});
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
    var svg = svgNode('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':'Grafik prediksi RINTIK dan data humidity operasional'});
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
    var html = '<span><i class="flow-line-key"></i>Prediksi RINTIK</span>';
    if(monitoring) html += '<span><i class="flow-line-key sensor"></i>Sensor humidity</span>';
    if(monitoring && monitoring.recovery && monitoring.recovery.values.length) html += '<span><i class="flow-line-key recovery"></i>Data operasional pengganti</span>';
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
    var complete = !state.health.next_expected_date;
    $('nextDate').textContent = complete ? 'Semua hari demo selesai' : 'Berikutnya · ' + formatDate(state.health.next_expected_date);
    if($('completionPanel')) $('completionPanel').hidden = state.mode !== 'demo' || !complete;
    updateProcessButton();
  }

  function updateProcessButton(){
    if(!$('processButton')) return;
    $('processButton').hidden = false;
    var complete = !state.health || !state.health.next_expected_date;
    $('processButton').disabled = state.busy || complete;
    if(complete){
      $('processButtonLabel').textContent = state.mode === 'demo' ? 'Demo sudah selesai' : 'Menunggu data sensor baru';
      $('processButtonSub').textContent = state.mode === 'demo' ? 'reset untuk mengulang' : 'riwayat tetap tersimpan';
      return;
    }
    if(state.mode === 'demo'){
      var completed = state.days.filter(function(day){ return day.status === 'completed'; }).length;
      var count = 16-completed;
      $('processButtonLabel').textContent = 'Jalankan ' + count + ' hari demo';
      $('processButtonSub').textContent = 'otomatis dan berurutan';
    } else {
      $('processButtonLabel').textContent = 'Proses data ' + shortDate(state.health.next_expected_date);
      $('processButtonSub').textContent = 'satu hari';
    }
  }

  function setBusy(active,total,index,date){
    state.busy = active;
    if($('processingPanel')) $('processingPanel').hidden = !active;
    if(active){
      $('processingTitle').textContent = total > 1 ? 'Memproses hari ' + index + ' dari ' + total : 'Memproses ' + formatDate(date);
      $('processingDetail').textContent = date ? 'Membaca sensor, menghitung humidity, dan menyimpan hasil…' : 'Mengambil data sensor berikutnya…';
      $('processProgress').max = total;
      $('processProgress').value = Math.max(0,index-1);
    }
    updateProcessButton();
    updateRecoveryShortcut();
  }

  function renderIncidents(){
    state.outageIncident = state.incidents.filter(function(incident){ return incident.type === 'sensor_outage'; }).slice(-1)[0] || null;
    updateRecoveryShortcut();
  }

  function updateRecoveryShortcut(){
    var button = $('prepareRecoveryButton');
    if(!button) return;
    var label = $('prepareRecoveryLabel'), sub = $('prepareRecoverySub');
    button.disabled = state.busy || !state.health;
    if(state.outageIncident){
      label.textContent = 'Buka hasil kerusakan sensor 6 Sep';
      sub.textContent = 'Lihat bagaimana data humidity tetap tersedia ketika sensor terputus.';
      return;
    }
    label.textContent = 'Tampilkan kerusakan sensor 6 Sep';
    sub.textContent = 'RINTIK menyiapkan hari yang diperlukan lalu membuka hasil recovery.';
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
    var values = predictionValues(result), operational = operationalValues(result,monitoring);
    $('latestDate').textContent = formatDate(result.date);
    $('latestStatus').textContent = 'Prediksi dan data humidity tersimpan dalam riwayat.';
    $('latestMean').textContent = fmtRh(mean(values));
    $('latestOperational').textContent = fmtRh(mean(operational.values));
    $('latestOperationalNote').textContent = operational.source === 'recovery' ? 'menggunakan estimasi RINTIK' : operational.source === 'sensor' ? 'dari sensor humidity' : 'estimasi tersedia';
    $('latestRows').textContent = result.predictions.length;
    var recoveryActive = operational.source === 'recovery';
    $('operationalBanner').hidden = !recoveryActive;
    if(monitoring){
      $('latestVerdict').textContent = verdictLabel(monitoring.assessment.verdict);
      $('latestSensor').textContent = sensorStateLabel(monitoring.sensor.state);
      $('latestSensorNote').textContent = recoveryActive ? 'data terputus · simulasi' : 'pembacaan tersedia';
    } else {
      $('latestVerdict').textContent = 'Tersimpan';
      $('latestSensor').textContent = 'Belum tersedia';
      $('latestSensorNote').textContent = 'prediksi tetap tersimpan';
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
      setSystem(true,'Sistem siap',state.health.next_expected_date ? 'Data ' + formatDate(state.health.next_expected_date) + ' siap diproses' : 'Menunggu data sensor berikutnya');
      updateReplayStatus();
      var completed = state.days.filter(function(day){ return day.status === 'completed'; });
      var target = preferredDate || localStorage.getItem('rintik_latest_daily_date') || (completed.length ? completed[completed.length-1].date : null);
      if(target && completed.some(function(day){ return day.date === target; })) await loadDate(target);
      else if(!completed.length) renderEmptyState();
      else renderIncidents();
      return true;
    } catch(error){
      setSystem(false,'Sistem belum terhubung','Periksa layanan RINTIK lalu coba lagi.');
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
    var target = state.mode === 'demo' ? 16-completed : 1;
    var simulationEnabled = true;
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
      setAlert('Data berhasil diproses',target > 1 ? 'Rangkaian demo selesai. Semua hasil tersimpan dan siap dijelajahi.' : 'Prediksi dan data humidity hari ini sudah tersimpan. Anda dapat melanjutkan ke hari berikutnya.','info');
    } catch(error){
      await refreshStatus(latest && latest.date);
      setAlert('Pemrosesan berhenti',errorMessage(error) + ' Hasil yang sudah selesai tetap tersimpan.');
    } finally { setBusy(false,target,target,state.health && state.health.next_expected_date); }
  }

  function focusLatestResult(){
    var content = $('latestContent');
    if(!content || content.hidden) return;
    content.focus({preventScroll:true});
    content.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }

  async function prepareRecovery(){
    if(state.busy || !state.health) return;
    var targetDate = '2023-09-06';
    var scenarioDates = ['2023-09-04','2023-09-05','2023-09-06'];
    var remaining = state.days.filter(function(day){ return day.status !== 'completed' && day.date <= targetDate; }).length;
    hideAlert();
    setBusy(true,Math.max(1,remaining),1,state.health.next_expected_date || targetDate);
    try {
      var index = 0;
      var health = await client.health();
      while(health.next_expected_date && health.next_expected_date <= targetDate){
        index += 1;
        setBusy(true,Math.max(1,remaining),index,health.next_expected_date);
        await processOne(true);
        $('processProgress').value = index;
        health = await client.health();
      }
      var days = (await client.listDays()).days || [];
      for(var dateIndex=0; dateIndex<scenarioDates.length; dateIndex++){
        if(days.some(function(day){ return day.date === scenarioDates[dateIndex] && day.status === 'completed'; })){
          await client.monitorDay(scenarioDates[dateIndex]);
        }
      }
      var incidents = (await client.listIncidents()).incidents || [];
      var incident = incidents.filter(function(item){ return item.type === 'sensor_outage' && item.date === targetDate; })[0];
      if(!incident) throw new Error('Skenario 6 September belum tersedia. Pastikan fixture resmi diproses kronologis dengan simulasi aktif.');
      if(incident.status !== 'confirmed_simulation'){
        await client.createDemoAudit('pass','prediction-audit-pass-' + incident.incident_id);
        await client.confirmIncident(incident.incident_id,{demo_override:true,note:'Explicit simulated technician action from guided recovery shortcut.'},'prediction-confirm-' + incident.incident_id);
      }
      await refreshStatus(targetDate);
      setAlert('Kerusakan sensor 6 September siap','Sensor humidity terputus. Data operasional tetap tersedia menggunakan estimasi RINTIK dan sumbernya ditandai dengan jelas.','info',{focus:false,scroll:false});
      focusLatestResult();
    } catch(error){
      await refreshStatus();
      setAlert('Recovery belum dapat disiapkan',errorMessage(error));
    } finally {
      setBusy(false,Math.max(1,remaining),Math.max(1,remaining),targetDate);
    }
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
      setManualResult('Contoh pembacaan dimuat. Data ini belum disimpan atau diproses.',false);
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
    var available = manualFeatureInputs().length - officialGaps.length;
    var gapText = officialGaps.length ? ' ' + officialGaps.length + ' nilai kosong dari sumber tetap dibiarkan kosong.' : '';
    setManualResult('Form diperiksa: ' + available + ' nilai sensor tersedia.' + gapText + ' Untuk membuat prediksi, sistem tetap memerlukan rangkaian data satu hari penuh.',false);
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
    $('demoPanel').hidden = mode !== 'demo';
    if(mode === 'demo'){
      $('modeExplanation').innerHTML = '<strong>Demo 16 Hari.</strong> Jalankan seluruh periode demo otomatis, termasuk skenario sensor humidity terputus dan recovery.';
    } else {
      $('modeExplanation').innerHTML = '<strong>Operasional Harian.</strong> Satu klik membaca data hari berikutnya, menghasilkan prediksi, dan menyimpan pembacaan humidity untuk dibandingkan.';
    }
    if(state.health) updateReplayStatus();
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
      if($('completionPanel')) $('completionPanel').hidden = true;
      renderEmptyState();
      await refreshStatus();
      setAlert('Demo siap diulang','Riwayat demo kembali ke hari pertama. Data sumber RINTIK tidak berubah.','info');
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
    $('processButton').addEventListener('click',runProcessing);
    $('prepareRecoveryButton').addEventListener('click',prepareRecovery);
    function openReset(){
      $('resetConfirmation').hidden = false;
      $('cancelResetButton').focus();
      $('resetConfirmation').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
    }
    $('openResetButton').addEventListener('click',openReset);
    $('completionResetButton').addEventListener('click',openReset);
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
    var values = predictionValues(result), operational = operationalValues(result,monitoring);
    $('resultDate').textContent = formatDate(result.date);
    $('resultStatus').textContent = 'Prediksi dan data humidity tersimpan dalam riwayat.';
    $('resultMean').textContent = fmtRh(mean(values)); $('resultMin').textContent = fmtRh(Math.min.apply(null,values)); $('resultMax').textContent = fmtRh(Math.max.apply(null,values));
    $('resultOperational').textContent = fmtRh(mean(operational.values));
    $('resultOperationalNote').textContent = operational.source === 'recovery' ? 'menggunakan estimasi RINTIK' : operational.source === 'sensor' ? 'dari sensor humidity' : 'estimasi tersedia';
    $('resultOperationalBanner').hidden = operational.source !== 'recovery';
    $('resultVerdict').textContent = monitoring ? verdictLabel(monitoring.assessment.verdict) : 'Tersimpan';
    $('resultLegend').innerHTML = legendHtml(monitoring);
    renderChart($('resultChart'),result,monitoring);
    var sensorMap = {}, recoveryMap = {};
    if(monitoring){ monitoring.sensor.values.forEach(function(row){ sensorMap[row.timestamp] = row.physical_rh; }); monitoring.recovery.values.forEach(function(row){ recoveryMap[row.timestamp] = row.recovery_rh; }); }
    $('resultTableBody').innerHTML = result.predictions.map(function(row){
      var timestamp = timestampOf(row), model = row.post_3 !== undefined ? row.post_3 : row.air_humidity;
      var sensor = sensorMap[timestamp], recovery = recoveryMap[timestamp];
      var effective = sensor !== undefined && sensor !== null ? sensor : recovery;
      return '<tr><td>' + timestamp + '</td><td>' + Number(model).toFixed(4) + '%</td><td>' + (sensor === undefined || sensor === null ? '—' : Number(sensor).toFixed(4) + '%') + '</td><td>' + (effective === undefined || effective === null ? '—' : Number(effective).toFixed(4) + '%') + '</td></tr>';
    }).join('');
    if(monitoring){
      var recoveryActive = monitoring.recovery && monitoring.recovery.values.length;
      $('resultSimulationSummary').textContent = recoveryActive ? 'Sensor humidity terputus. Data operasional hari ini menggunakan estimasi RINTIK.' : 'Sensor humidity tersedia dan dibandingkan dengan prediksi RINTIK.';
      $('resultProvenance').innerHTML = '<strong>Sumber data jelas</strong><span>' + (recoveryActive ? 'Nilai operasional pengganti berasal dari estimasi RINTIK; pembacaan sensor asli tetap tercatat sebagai data yang hilang.' : 'Prediksi dan pembacaan sensor disimpan sebagai dua sumber yang berbeda.') + '</span>';
    } else {
      $('resultSimulationSummary').textContent = 'Prediksi tersedia, tetapi pembacaan sensor humidity belum tersedia untuk tanggal ini.';
      $('resultProvenance').innerHTML = '<strong>Prediksi tersimpan</strong><span>Belum ada data sensor humidity untuk dibandingkan.</span>';
    }
    if($('resultNextAction')){
      var complete = state.health && !state.health.next_expected_date;
      $('resultNextAction').textContent = complete ? 'Kembali ke Prediksi' : 'Proses hari berikutnya';
    }
  }

  async function initResult(){
    try {
      var responses = await Promise.all([client.health(),client.listDays()]);
      state.health = responses[0]; state.days = responses[1].days || [];
      var completed = state.days.filter(function(day){ return day.status === 'completed'; });
      setSystem(true,'Hasil siap',completed.length ? 'Menampilkan data terakhir yang tersimpan' : 'Belum ada hasil tersimpan');
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
