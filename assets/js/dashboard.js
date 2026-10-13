(function(){
  'use strict';

  var apiLib = window.RintikApi;
  var dataLib = window.RintikDashboardData;
  if(!apiLib || !dataLib) return;

  var params = new URLSearchParams(window.location.search);
  var baseUrl = params.get('api') || sessionStorage.getItem('rintik_api_url') || 'http://127.0.0.1:8000';
  var client = apiLib.createClient({baseUrl: baseUrl});
  var COLORS = ['#146b4a','#2367a3','#9a5d0b','#7a4e9c','#b34d70','#387d7a','#705d4b'];
  var DEFAULT_FEATURES = ['air_temperature','co2','pressure','soil_humidity_line2'];
  var state = {
    health: null,
    catalog: null,
    days: [],
    incidents: [],
    bundle: null,
    selectedDate: null,
    selectedFeatures: restoreFeatures(),
    rangeStart: 0,
    rangeEnd: 0
  };

  function $(id){ return document.getElementById(id); }
  function clear(node){ while(node && node.firstChild) node.removeChild(node.firstChild); }
  function node(tag, className, text){
    var element = document.createElement(tag);
    if(className) element.className = className;
    if(text !== undefined) element.textContent = text;
    return element;
  }
  function svgNode(tag, attrs, text){
    var element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function(key){ element.setAttribute(key, attrs[key]); });
    if(text !== undefined) element.textContent = text;
    return element;
  }
  function formatDate(value){
    if(!value) return '—';
    var parts = String(value).slice(0,10).split('-');
    var months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return Number(parts[2]) + ' ' + months[Number(parts[1]) - 1] + ' ' + parts[0];
  }
  function formatTime(timestamp){ return String(timestamp || '').slice(11,16); }
  function mean(values){
    var numbers = values.filter(function(value){
      return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
    }).map(Number);
    return numbers.length ? numbers.reduce(function(sum, value){ return sum + value; }, 0) / numbers.length : null;
  }
  function restoreFeatures(){
    try {
      var saved = JSON.parse(sessionStorage.getItem('rintik_selected_features'));
      return Array.isArray(saved) ? saved : DEFAULT_FEATURES.slice();
    } catch(error){ return DEFAULT_FEATURES.slice(); }
  }
  function saveFeatures(){ sessionStorage.setItem('rintik_selected_features', JSON.stringify(state.selectedFeatures)); }

  function setLoading(active, title, detail){
    $('loadingLayer').hidden = !active;
    if(title) $('loadingTitle').textContent = title;
    if(detail) $('loadingDetail').textContent = detail;
  }
  function setService(kind, text){
    var element = $('serviceState');
    element.classList.remove('is-online','is-degraded','is-offline');
    element.classList.add('is-' + kind);
    $('serviceStateText').textContent = text;
  }
  function showAlert(title, message){
    $('globalAlertTitle').textContent = title;
    $('globalAlertMessage').textContent = message;
    $('globalAlert').hidden = false;
  }
  function hideAlert(){ $('globalAlert').hidden = true; }
  function toast(message, error){
    var item = node('div', 'toast' + (error ? ' is-error' : ''), message);
    $('toastRegion').appendChild(item);
    window.setTimeout(function(){
      item.style.opacity = '0'; item.style.transform = 'translateY(6px)';
      window.setTimeout(function(){ item.remove(); }, 190);
    }, 3600);
  }
  function errorMessage(error){
    if(error && error.message) return error.message;
    return 'Terjadi kegagalan yang tidak dikenali.';
  }

  function setupProductNavigation(){
    document.querySelectorAll('[data-api-link]').forEach(function(link){
      var url = new URL(link.getAttribute('href'),window.location.href);
      url.searchParams.set('api',baseUrl);
      link.href = url.pathname.split('/').pop() + '?' + url.searchParams.toString();
    });
    var toggle=document.querySelector('.nav-toggle'),menu=document.querySelector('.mobile-menu');
    if(toggle && menu) toggle.addEventListener('click',function(){
      var open=!menu.classList.contains('open');
      menu.classList.toggle('open',open);
      toggle.setAttribute('aria-expanded',String(open));
    });
  }

  function setDashboardDrawer(open, restoreFocus){
    var drawer = $('dashboardDrawer');
    var backdrop = $('dashboardDrawerBackdrop');
    var trigger = $('dashboardMenuButton');
    if(!drawer || !backdrop || !trigger) return;
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    drawer.inert = !open;
    backdrop.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('dashboard-drawer-open', open);
    if(open) $('dashboardDrawerClose').focus();
    else if(restoreFocus !== false) trigger.focus();
  }

  function setupDashboardDrawer(){
    var drawer = $('dashboardDrawer');
    var trigger = $('dashboardMenuButton');
    var close = $('dashboardDrawerClose');
    var backdrop = $('dashboardDrawerBackdrop');
    if(!drawer || !trigger || !close || !backdrop) return;
    setDashboardDrawer(false, false);
    trigger.addEventListener('click', function(){ setDashboardDrawer(true, false); });
    close.addEventListener('click', function(){ setDashboardDrawer(false, true); });
    backdrop.addEventListener('click', function(){ setDashboardDrawer(false, true); });
    drawer.addEventListener('keydown', function(event){
      if(event.key !== 'Tab') return;
      var focusable = Array.prototype.slice.call(drawer.querySelectorAll('button:not([disabled]),a[href],select:not([disabled]),input:not([disabled])')).filter(function(item){ return item.offsetParent !== null; });
      if(!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
      else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
    });
    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape' && drawer.classList.contains('is-open')) setDashboardDrawer(false, true);
    });
  }

  function activateView(view, focus, renderVisible){
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.nav-tab'));
    var selectedButton = tabs.find(function(tab){ return tab.dataset.view === view; }) || tabs[0];
    tabs.forEach(function(tab){
        var selected = tab === selectedButton;
        tab.classList.toggle('is-active', selected);
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        var panel = $('panel' + tab.dataset.view.charAt(0).toUpperCase() + tab.dataset.view.slice(1));
        panel.hidden = !selected || !state.bundle;
    });
    if(renderVisible !== false && state.bundle){
      if(selectedButton.dataset.view === 'overview'){
        renderRhChart();
        renderRhTable();
      }
      if(selectedButton.dataset.view === 'sensors') renderSensorCharts();
    }
    if($('dashboardMenuLabel')){
      var labels = {overview:'Ringkasan',sensors:'Sensor Explorer',settings:'Settings / Technical Details'};
      $('dashboardMenuLabel').textContent = labels[selectedButton.dataset.view] || 'Menu Dashboard';
    }
    if(focus !== false) selectedButton.focus();
  }

  function setupTabs(){
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.nav-tab'));
    tabs.forEach(function(tab, index){
      tab.addEventListener('click', function(){ activateView(tab.dataset.view); setDashboardDrawer(false, true); });
      tab.addEventListener('keydown', function(event){
        if(event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        var next = index;
        if(event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if(event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if(event.key === 'Home') next = 0;
        if(event.key === 'End') next = tabs.length - 1;
        activateView(tabs[next].dataset.view);
      });
    });
  }

  async function refresh(){
    hideAlert();
    setLoading(true, 'Memeriksa sistem RINTIK', 'Memverifikasi model, state, dan data tersimpan…');
    try {
      var responses = await Promise.all([client.health(), client.listDays(), client.listFeatures(), client.listIncidents()]);
      state.health = responses[0];
      state.days = responses[1].days || [];
      state.catalog = responses[2];
      state.incidents = responses[3].incidents || [];
      sessionStorage.setItem('rintik_api_url', baseUrl);
      setService(state.health.status === 'degraded' ? 'degraded' : 'online', state.health.status === 'degraded' ? 'Sistem perlu diperiksa' : 'Sistem siap');
      renderRunConsoleState();
      renderFeatureSelector();
      renderDaySelector();
      var completed = state.days.filter(function(day){ return day.status === 'completed'; });
      if(completed.length){
        var target = state.selectedDate && completed.some(function(day){ return day.date === state.selectedDate; }) ? state.selectedDate : completed[completed.length - 1].date;
        await loadDay(target, false);
      } else {
        state.bundle = null;
        showEmpty(true);
      }
    } catch(error){
      state.bundle = null;
      showEmpty(true);
      setService('offline', 'Sistem tidak terhubung');
      showAlert('Backend RINTIK tidak tersedia', errorMessage(error) + ' Tidak ada prediksi pengganti yang dibuat.');
    } finally { setLoading(false); }
  }

  function renderDaySelector(){
    var select = $('daySelect'); clear(select);
    var completed = state.days.filter(function(day){ return day.status === 'completed'; });
    if(!completed.length){
      select.appendChild(new Option('Belum ada tanggal', ''));
      select.disabled = true;
    } else {
      completed.forEach(function(day){
        var suffix = day.row_count === 48 ? '' : ' · parsial ' + day.row_count + '/48';
        select.appendChild(new Option(formatDate(day.date) + suffix, day.date));
      });
      select.disabled = false;
      if(state.selectedDate) select.value = state.selectedDate;
    }
    updateDayArrows();
  }
  function updateDayArrows(){
    var completed = state.days.filter(function(day){ return day.status === 'completed'; });
    var index = completed.findIndex(function(day){ return day.date === state.selectedDate; });
    $('previousDay').disabled = index <= 0;
    $('nextDay').disabled = index < 0 || index >= completed.length - 1;
  }
  function showEmpty(show){
    $('emptyState').hidden = !show;
    ['panelOverview','panelSensors','panelSettings'].forEach(function(id){ $(id).hidden = true; });
    $('exportCsvButton').disabled = show;
    $('exportAuditButton').disabled = show;
  }

  function renderRunConsoleState(){
    var nextDate = state.health && state.health.next_expected_date;
    $('runConsoleTitle').textContent = nextDate ? 'Berikutnya · ' + formatDate(nextDate) : 'Replay test selesai';
    $('nextDateSummary').textContent = nextDate ? 'Ambil dan proses fixture resmi berikutnya melalui halaman Prediksi.' : 'Seluruh 16 tanggal tersedia untuk dieksplorasi.';
  }

  async function loadDay(date, showLoader){
    if(showLoader !== false) setLoading(true, 'Memuat ' + formatDate(date), 'Menyelaraskan hasil model, monitoring, dan input sensor…');
    hideAlert();
    try {
      var result = await client.getDayResult(date);
      var monitoring;
      try { monitoring = await client.getMonitoring(date); }
      catch(error){
        if(error.code !== 'MONITORING_NOT_FOUND') throw error;
        monitoring = await client.monitorDay(date);
      }
      var series = await client.getDaySeries(date);
      dataLib.validateDayBundle(result, monitoring, series);
      state.bundle = {result: result, monitoring: monitoring, series: series};
      state.selectedDate = date;
      state.rangeStart = 0;
      state.rangeEnd = result.predictions.length - 1;
      showEmpty(false);
      renderDaySelector();
      activateView(params.get('view') || 'overview', false, false);
      renderAll();
    } catch(error){
      state.bundle = null;
      showEmpty(true);
      showAlert('Data tanggal tidak dapat ditampilkan', errorMessage(error));
    } finally { if(showLoader !== false) setLoading(false); }
  }

  function renderAll(){
    renderOverview();
    renderRhChart();
    renderRhTable();
    renderSensorCharts();
    renderSettings();
  }

  function verdictPresentation(verdict){
    var map = {
      monitoring: ['Normal · simulasi','verdict-good'],
      monitoring_repaired_simulation: ['Sensor pulih · simulasi','verdict-good'],
      suspected_sensor_malfunction: ['Dugaan malfungsi · simulasi','verdict-warning'],
      suspected_sensor_outage: ['Dugaan sensor terputus · simulasi','verdict-danger']
    };
    return map[verdict] || ['Status belum dikenali','verdict-neutral'];
  }
  function readableReason(reason){ return dataLib.readableReason(reason); }

  function renderOverview(){
    var result = state.bundle.result;
    var monitoring = state.bundle.monitoring;
    var predictions = result.predictions;
    var modelValues = predictions.map(function(row){ return row.post_3; });
    var presentation = verdictPresentation(monitoring.assessment.verdict);
    $('verdictBadge').textContent = presentation[0];
    $('verdictBadge').className = 'verdict-badge ' + presentation[1];
    $('overviewLead').textContent = formatDate(result.date) + ' · prediksi, data operasional, dan kondisi sensor humidity.';
    $('metricRows').textContent = predictions.length + '/48';
    $('metricRowsNote').textContent = predictions.length === 48 ? 'batch harian lengkap' : 'potongan parsial dataset resmi';
    $('metricMean').textContent = mean(modelValues).toFixed(1) + '%';
    var recovery = dataLib.recoveryPresentation(monitoring);
    var recoveryByTime = {};
    (monitoring.recovery.values || []).forEach(function(row){ recoveryByTime[row.timestamp] = row.recovery_rh; });
    var operational = monitoring.sensor.values.map(function(row){
      return row.physical_rh === null || row.physical_rh === undefined ? recoveryByTime[row.timestamp] : row.physical_rh;
    });
    var operationalMean = mean(operational);
    $('metricSensor').textContent = operationalMean === null ? 'Tidak tersedia' : operationalMean.toFixed(1) + '%';
    $('metricSensorNote').textContent = recovery.showSeries ? 'estimasi RINTIK saat sensor terputus' : 'dari sensor humidity';
    $('metricRecovery').textContent = recovery.showSeries ? 'Aktif · estimasi' : recovery.status;
    $('metricRecoveryNote').textContent = recovery.showSeries ? 'menggunakan estimasi RINTIK' : recovery.note;
    $('recoveryLegend').hidden = !recovery.showSeries;

    $('diagnosisState').textContent = presentation[0];
    $('diagnosisCopy').textContent = monitoring.assessment.verdict.indexOf('suspected_') === 0 ?
      'Sistem menemukan konflik pada sensor demo. Status tetap dugaan sampai tindakan simulasi dicatat.' :
      'Tidak ada diagnosis kegagalan baru pada tanggal terpilih.';
    clear($('reasonList'));
    var reasons = monitoring.assessment.reasons || [];
    if(!reasons.length) reasons = ['Tidak ada sinyal konflik pada aturan demo'];
    reasons.forEach(function(reason){ $('reasonList').appendChild(node('li','',readableReason(reason))); });
    $('gateStatus').textContent = recovery.gate;
    $('gateReason').textContent = recovery.gateReason;
    var incident = monitoring.incident;
    $('confirmIncidentButton').hidden = !incident || incident.status !== 'suspected';

    var timeline = $('storyTimeline'); clear(timeline);
    var completeCount = state.days.filter(function(day){ return day.status === 'completed'; }).length;
    [
      ['Replay', completeCount + '/16 tanggal selesai'],
      ['Konteks', result.window.date_count + ' hari kalender tersedia'],
      ['Insiden', incident ? readableReason(incident.status) : 'Tidak ada kejadian sensor'],
      ['Audit', readableReason(monitoring.audit.outcome) + ' · simulasi']
    ].forEach(function(item){ var li=node('li'); li.appendChild(node('strong','',item[0])); li.appendChild(node('span','',item[1])); timeline.appendChild(li); });
    $('exportCsvButton').disabled = false;
    $('exportAuditButton').disabled = false;
  }

  function setRangeInputs(){
    var last = state.bundle.result.predictions.length - 1;
    ['rangeStart','rangeEnd'].forEach(function(id){ $(id).max = String(last); });
    $('rangeStart').value = String(state.rangeStart);
    $('rangeEnd').value = String(state.rangeEnd);
    var points = state.bundle.result.predictions;
    $('rangeLabel').textContent = formatTime(points[state.rangeStart].timestamp) + '–' + formatTime(points[state.rangeEnd].timestamp);
  }

  function pathForSegment(segment, timestamps, x, y){
    return segment.map(function(point, index){
      var sourceIndex = timestamps.indexOf(point.timestamp);
      return (index ? 'L' : 'M') + x(sourceIndex).toFixed(2) + ' ' + y(point.value).toFixed(2);
    }).join(' ');
  }

  function renderRhChart(){
    var container = $('rhChart'); clear(container);
    setRangeInputs();
    var monitoring = state.bundle.monitoring;
    var timestamps = state.bundle.result.predictions.map(function(row){ return row.timestamp; });
    var start = state.rangeStart, end = state.rangeEnd;
    var visible = timestamps.slice(start,end + 1);
    var width = Math.max(container.clientWidth || 720, 320), height = 310;
    var pad = {left: 45,right: 14,top: 14,bottom: 31};
    var x = function(index){ return pad.left + ((index - start) / Math.max(1,end - start)) * (width - pad.left - pad.right); };
    var y = function(value){ return pad.top + (1 - Number(value) / 100) * (height - pad.top - pad.bottom); };
    var svg = svgNode('svg',{viewBox:'0 0 '+width+' '+height,focusable:'false'});
    [0,25,50,75,100].forEach(function(value){
      svg.appendChild(svgNode('line',{x1:pad.left,y1:y(value),x2:width-pad.right,y2:y(value),stroke:'#dce5e1','stroke-width':'1'}));
      svg.appendChild(svgNode('text',{x:pad.left-8,y:y(value)+4,fill:'#60716a','font-size':'10','text-anchor':'end'},String(value)));
    });
    var tickCount = Math.min(6,visible.length);
    for(var tick=0;tick<tickCount;tick++){
      var relative = Math.round(tick * (visible.length - 1) / Math.max(1,tickCount - 1));
      svg.appendChild(svgNode('text',{x:x(start+relative),y:height-8,fill:'#60716a','font-size':'10','text-anchor':'middle'},formatTime(visible[relative])));
    }
    var series = [
      {color:'#146b4a',dash:'',width:2.7,values:monitoring.rintik.values.map(function(row){ return {timestamp:row.timestamp,value:row.p3}; })},
      {color:'#606b67',dash:'7 5',width:2.2,values:monitoring.sensor.values.map(function(row){ return {timestamp:row.timestamp,value:row.physical_rh}; })},
      {color:'#2367a3',dash:'2 5',width:2.7,values:monitoring.recovery.values.map(function(row){ return {timestamp:row.timestamp,value:row.recovery_rh}; })}
    ];
    series.forEach(function(item){
      dataLib.segments(item.values.slice(start,end+1)).forEach(function(segment){
        svg.appendChild(svgNode('path',{d:pathForSegment(segment,timestamps,x,y),fill:'none',stroke:item.color,'stroke-width':item.width,'stroke-dasharray':item.dash,'stroke-linecap':'round','stroke-linejoin':'round'}));
      });
    });
    var hit = svgNode('rect',{class:'plot-hit',x:pad.left,y:pad.top,width:width-pad.left-pad.right,height:height-pad.top-pad.bottom,fill:'transparent',tabindex:'0',role:'slider','aria-label':'Titik waktu grafik kelembapan','aria-valuemin':String(start),'aria-valuemax':String(end),'aria-valuenow':String(start),'aria-valuetext':formatTime(timestamps[start])});
    function showAt(index,event){
      index = Math.max(start,Math.min(end,index));
      var model = monitoring.rintik.values[index];
      var physical = monitoring.sensor.values[index];
      var recovery = monitoring.recovery.values.find(function(row){ return row.timestamp === model.timestamp; });
      var lines = [formatTime(model.timestamp),'RINTIK: '+Number(model.p3).toFixed(2)+' %RH','Sensor simulasi: '+(physical.physical_rh === null ? 'gap' : Number(physical.physical_rh).toFixed(2)+' %RH')];
      if(recovery) lines.push('Recovery estimated: '+Number(recovery.recovery_rh).toFixed(2)+' %RH');
      hit.setAttribute('aria-valuenow',String(index));
      hit.setAttribute('aria-valuetext',lines.join('. '));
      var tooltip = $('rhTooltip'); clear(tooltip);
      tooltip.appendChild(node('strong','',lines[0]));
      lines.slice(1).forEach(function(line){ tooltip.appendChild(node('div','',line)); });
      tooltip.hidden = false;
      if(event){ tooltip.style.left = Math.min(window.innerWidth - 260,event.clientX + 12)+'px'; tooltip.style.top = Math.max(12,event.clientY - 64)+'px'; }
    }
    hit.addEventListener('mousemove',function(event){
      var rect = svg.getBoundingClientRect();
      var ratio = (event.clientX - rect.left - pad.left * rect.width / width) / ((width-pad.left-pad.right) * rect.width / width);
      showAt(start + Math.round(Math.max(0,Math.min(1,ratio))*(end-start)),event);
    });
    hit.addEventListener('mouseleave',function(){ $('rhTooltip').hidden=true; });
    hit.addEventListener('focus',function(event){ showAt(start,event); });
    hit.addEventListener('blur',function(){ $('rhTooltip').hidden=true; });
    hit.addEventListener('keydown',function(event){
      if(event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      var current = Number(hit.dataset.index || start);
      current += event.key === 'ArrowRight' ? 1 : -1;
      current = Math.max(start,Math.min(end,current)); hit.dataset.index=String(current); showAt(current,event);
    });
    svg.appendChild(hit); container.appendChild(svg);
    container.setAttribute('aria-label','Grafik '+formatDate(state.selectedDate)+', estimasi RINTIK, sensor fisik simulasi, dan recovery estimated bila aktif. Tabel data tersedia melalui tombol Tampilkan tabel.');
  }

  function renderRhTable(){
    var container = $('rhDataTable'); clear(container);
    var table=node('table'), caption=node('caption','visually-hidden','Data kelembapan dan sumber untuk '+formatDate(state.selectedDate));
    var thead=node('thead'), header=node('tr');
    ['Waktu','RINTIK P3 (%RH)','Sensor simulasi (%RH)','Recovery estimated (%RH)'].forEach(function(label){ header.appendChild(node('th','',label)); });
    thead.appendChild(header); table.appendChild(caption); table.appendChild(thead);
    var body=node('tbody'), monitoring=state.bundle.monitoring;
    var recoveryMap={}; monitoring.recovery.values.forEach(function(row){ recoveryMap[row.timestamp]=row.recovery_rh; });
    monitoring.rintik.values.slice(state.rangeStart,state.rangeEnd+1).forEach(function(row,index){
      var absolute=state.rangeStart+index, tr=node('tr'), physical=monitoring.sensor.values[absolute].physical_rh;
      [row.timestamp,Number(row.p3).toFixed(4),physical===null?'gap':Number(physical).toFixed(4),recoveryMap[row.timestamp]===undefined?'—':Number(recoveryMap[row.timestamp]).toFixed(4)].forEach(function(value){ tr.appendChild(node('td','',value)); });
      body.appendChild(tr);
    });
    table.appendChild(body); container.appendChild(table);
  }

  function renderFeatureSelector(){
    if(!state.catalog) return;
    var container=$('featureGroups'); clear(container);
    state.catalog.groups.forEach(function(group){
      var section=node('section','feature-group'), button=node('button','feature-group-button');
      button.type='button'; button.setAttribute('aria-expanded','true'); button.setAttribute('aria-controls','feature-options-'+group.id);
      button.appendChild(node('span','',group.label)); button.appendChild(node('span','','⌄'));
      var options=node('div','feature-options'); options.id='feature-options-'+group.id;
      group.features.forEach(function(feature){
        var label=node('label','feature-option'); label.dataset.search=(feature.label+' '+feature.key+' '+feature.unit).toLowerCase();
        var checkbox=document.createElement('input'); checkbox.type='checkbox'; checkbox.value=feature.key; checkbox.checked=state.selectedFeatures.indexOf(feature.key)>=0;
        var copy=node('span'); copy.appendChild(node('strong','',feature.label)); if(feature.note) copy.appendChild(node('small','',feature.note));
        label.appendChild(checkbox); label.appendChild(copy); label.appendChild(node('span','feature-unit',feature.unit)); options.appendChild(label);
        checkbox.addEventListener('change',function(){
          if(checkbox.checked && state.selectedFeatures.indexOf(feature.key)<0) state.selectedFeatures.push(feature.key);
          if(!checkbox.checked) state.selectedFeatures=state.selectedFeatures.filter(function(key){ return key!==feature.key; });
          saveFeatures(); renderSensorCharts();
        });
      });
      button.addEventListener('click',function(){
        var collapsed=section.classList.toggle('is-collapsed'); button.setAttribute('aria-expanded',String(!collapsed));
      });
      section.appendChild(button); section.appendChild(options); container.appendChild(section);
    });
  }

  function renderSensorCharts(){
    var charts=$('sensorCharts'); clear(charts);
    if(!state.bundle || !state.catalog){ $('sensorEmpty').hidden=false; return; }
    var grouped=dataLib.groupSelectedByUnit(state.catalog,state.selectedFeatures);
    var units=Object.keys(grouped); $('sensorEmpty').hidden=units.length>0;
    units.forEach(function(unit){
      var features=grouped[unit], card=node('article','card sensor-chart-card'), header=node('header'), titles=node('div');
      titles.appendChild(node('h2','',unit)); titles.appendChild(node('p','',features.length+' seri · unit yang sama'));
      var tags=node('div','series-tags'); features.forEach(function(feature,index){ var tag=node('span','series-tag'); var swatch=node('i'); swatch.style.setProperty('--tag-color',COLORS[index%COLORS.length]); tag.appendChild(swatch); tag.appendChild(document.createTextNode(feature.label)); tags.appendChild(tag); });
      header.appendChild(titles); header.appendChild(tags); card.appendChild(header);
      var chart=node('div','sensor-chart'); card.appendChild(chart); charts.appendChild(card);
      renderSensorSvg(chart,features,unit);
    });
  }

  function renderSensorSvg(container,features,unit){
    var points=state.bundle.series.points, start=state.rangeStart, end=state.rangeEnd;
    var visible=points.slice(start,end+1), all=[];
    features.forEach(function(feature){ visible.forEach(function(point){ var value=point.values[feature.key]; if(value!==null && Number.isFinite(Number(value))) all.push(Number(value)); }); });
    if(!all.length){ container.appendChild(node('div','inline-empty','Semua nilai pada rentang ini kosong.')); return; }
    var min=Math.min.apply(null,all), max=Math.max.apply(null,all); if(min===max){ min-=1; max+=1; } else { var margin=(max-min)*.08; min-=margin; max+=margin; }
    var width=Math.max(container.clientWidth||680,300),height=230,pad={left:52,right:12,top:12,bottom:28};
    var x=function(index){return pad.left+((index-start)/Math.max(1,end-start))*(width-pad.left-pad.right);};
    var y=function(value){return pad.top+(1-(Number(value)-min)/(max-min))*(height-pad.top-pad.bottom);};
    var svg=svgNode('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':'Grafik '+features.map(function(feature){return feature.label;}).join(', ')+' dalam '+unit});
    for(var line=0;line<4;line++){ var value=min+(max-min)*line/3,yy=y(value); svg.appendChild(svgNode('line',{x1:pad.left,y1:yy,x2:width-pad.right,y2:yy,stroke:'#dce5e1'})); svg.appendChild(svgNode('text',{x:pad.left-7,y:yy+4,fill:'#60716a','font-size':'9','text-anchor':'end'},value.toFixed(Math.abs(value)<10?1:0))); }
    var timestamps=points.map(function(point){return point.timestamp;});
    features.forEach(function(feature,index){
      var values=points.map(function(point){return {timestamp:point.timestamp,value:point.values[feature.key]};});
      dataLib.segments(values.slice(start,end+1)).forEach(function(segment){ svg.appendChild(svgNode('path',{d:pathForSegment(segment,timestamps,x,y),fill:'none',stroke:COLORS[index%COLORS.length],'stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round'})); });
    });
    var hit=svgNode('rect',{x:pad.left,y:pad.top,width:width-pad.left-pad.right,height:height-pad.top-pad.bottom,fill:'transparent',class:'plot-hit'});
    hit.addEventListener('mousemove',function(event){
      var rect=svg.getBoundingClientRect(),ratio=(event.clientX-rect.left-pad.left*rect.width/width)/((width-pad.left-pad.right)*rect.width/width),index=start+Math.round(Math.max(0,Math.min(1,ratio))*(end-start));
      var tooltip=$('rhTooltip'); clear(tooltip); tooltip.appendChild(node('strong','',formatTime(points[index].timestamp)));
      features.forEach(function(feature){ var value=points[index].values[feature.key]; tooltip.appendChild(node('div','',feature.label+': '+(value===null?'gap':Number(value).toFixed(2)+' '+unit))); });
      tooltip.hidden=false; tooltip.style.left=Math.min(window.innerWidth-260,event.clientX+12)+'px'; tooltip.style.top=Math.max(12,event.clientY-64)+'px';
    });
    hit.addEventListener('mouseleave',function(){$('rhTooltip').hidden=true;}); svg.appendChild(hit); container.appendChild(svg);
  }

  function addDetail(list,label,value){ list.appendChild(node('dt','',label)); list.appendChild(node('dd','',value===null||value===undefined?'—':String(value))); }
  function renderSettings(){
    var result=state.bundle.result,monitoring=state.bundle.monitoring,lineage=$('lineageDetails'); clear(lineage);
    addDetail(lineage,'Run ID',result.run_id); addDetail(lineage,'Sumber','real_original_pth'); addDetail(lineage,'Model SHA256',result.model_sha256); addDetail(lineage,'State SHA256',result.state_sha256); addDetail(lineage,'Pipeline',result.pipeline_version); addDetail(lineage,'Window',result.window.mode); addDetail(lineage,'Rentang konteks',result.window.start_date+' → '+result.window.end_date); addDetail(lineage,'Baris konteks',result.window.row_count);
    var health=$('healthComponents'); clear(health);
    var labels={input_quality:'Input quality',data_drift:'Data drift',pipeline_health:'Pipeline health',output_plausibility:'Output plausibility'};
    Object.keys(labels).forEach(function(key){ var value=monitoring.health.components[key],row=node('div','health-row'); row.appendChild(node('span','',labels[key])); var track=node('div','health-track'),fill=node('div','health-fill'); fill.style.width=Math.max(0,Math.min(100,value))+'%'; track.appendChild(fill); row.appendChild(track); row.appendChild(node('strong','',Number(value).toFixed(0))); health.appendChild(row); });
    var score=node('div','health-row'); score.appendChild(node('span','','Trust Score')); var scoreTrack=node('div','health-track'),scoreFill=node('div','health-fill'); scoreFill.style.width=monitoring.health.trust_score+'%'; scoreTrack.appendChild(scoreFill); score.appendChild(scoreTrack); score.appendChild(node('strong','',Number(monitoring.health.trust_score).toFixed(0))); health.appendChild(score);
    var audit=$('auditDetails'); clear(audit); addDetail(audit,'Status',monitoring.audit.status); addDetail(audit,'Outcome',monitoring.audit.outcome); addDetail(audit,'Referensi independen',monitoring.audit.independent_reference?'Ya':'Tidak'); addDetail(audit,'Recovery otomatis',monitoring.audit.allows_automatic_recovery?'Diizinkan':'Tidak diizinkan'); addDetail(audit,'Evidence label',monitoring.audit.label); addDetail(audit,'Dibuat',monitoring.audit.created_at);
    $('diagnosticJson').textContent=JSON.stringify({health:state.health,result:result,monitoring:monitoring,series:{schema_version:state.bundle.series.schema_version,row_count:state.bundle.series.row_count,source:state.bundle.series.source}},null,2);
  }

  async function confirmIncident(){
    var incident=state.bundle && state.bundle.monitoring.incident; if(!incident) return;
    setLoading(true,'Mencatat konfirmasi simulasi','Health dan audit diperiksa sebelum recovery…');
    try {
      await client.confirmIncident(incident.incident_id,{demo_override:true,note:'Explicit simulated technician action from operator dashboard.'},'dashboard-confirm-'+incident.incident_id);
      await loadDay(state.selectedDate,false); toast('Aksi teknisi simulasi tercatat; recovery tetap berlabel estimated.');
    } catch(error){ showAlert('Konfirmasi ditolak',errorMessage(error)); toast(errorMessage(error),true); }
    finally { setLoading(false); }
  }
  async function applyAudit(){
    var scenario=$('auditScenario').value; setLoading(true,'Memperbarui audit simulasi','Menguji recovery gate tanpa mengubah model…');
    try { await client.createDemoAudit(scenario,'dashboard-audit-'+scenario+'-'+Date.now()); await loadDay(state.selectedDate,false); toast('Status audit simulasi diperbarui: '+scenario+'.'); }
    catch(error){ showAlert('Audit simulasi gagal',errorMessage(error)); toast(errorMessage(error),true); }
    finally { setLoading(false); }
  }

  function downloadBlob(content,type,name){ var blob=new Blob([content],{type:type}),url=URL.createObjectURL(blob),anchor=document.createElement('a'); anchor.href=url; anchor.download=name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }
  async function exportCsv(){
    if(!state.selectedDate) return;
    setLoading(true,'Menyiapkan export','Memuat data dengan lineage dari backend…');
    try { var response=await fetch(client.exportDayUrl(state.selectedDate)); if(!response.ok){ var body=await response.json(); throw new Error(body.error&&body.error.message?body.error.message:'Export gagal.'); } downloadBlob(await response.text(),'text/csv;charset=utf-8','rintik-'+state.selectedDate+'.csv'); toast('CSV ber-provenance berhasil dibuat.'); }
    catch(error){ showAlert('Export gagal',errorMessage(error)); }
    finally { setLoading(false); }
  }

  function bindControls(){
    $('retryButton').addEventListener('click',refresh);
    $('daySelect').addEventListener('change',function(){ if(this.value) loadDay(this.value,true); });
    $('previousDay').addEventListener('click',function(){ navigateDay(-1); });
    $('nextDay').addEventListener('click',function(){ navigateDay(1); });
    $('rangeStart').addEventListener('input',updateRange);
    $('rangeEnd').addEventListener('input',updateRange);
    $('resetRange').addEventListener('click',function(){ state.rangeStart=0; state.rangeEnd=state.bundle.result.predictions.length-1; renderRhChart(); renderRhTable(); renderSensorCharts(); });
    $('toggleRhTable').addEventListener('click',function(){ var hidden=$('rhDataTable').hidden; $('rhDataTable').hidden=!hidden; this.setAttribute('aria-expanded',String(hidden)); this.textContent=hidden?'Sembunyikan tabel':'Tampilkan tabel'; });
    $('confirmIncidentButton').addEventListener('click',confirmIncident);
    $('applyAuditButton').addEventListener('click',applyAudit);
    $('exportCsvButton').addEventListener('click',exportCsv);
    $('exportAuditButton').addEventListener('click',function(){ if(state.bundle) downloadBlob(dataLib.auditJson(state.bundle),'application/json','rintik-audit-'+state.selectedDate+'.json'); });
    $('copyDiagnostics').addEventListener('click',async function(){ try { await navigator.clipboard.writeText($('diagnosticJson').textContent); toast('Diagnostic JSON disalin.'); } catch(error){ toast('Clipboard tidak tersedia pada browser ini.',true); } });
    $('sensorSearch').addEventListener('input',function(){ var query=this.value.trim().toLowerCase(); document.querySelectorAll('.feature-option').forEach(function(option){ option.hidden=query && option.dataset.search.indexOf(query)<0; }); });
    $('clearSensors').addEventListener('click',function(){ state.selectedFeatures=[]; saveFeatures(); renderFeatureSelector(); renderSensorCharts(); });
    $('resetSensors').addEventListener('click',function(){ state.selectedFeatures=DEFAULT_FEATURES.slice(); saveFeatures(); renderFeatureSelector(); renderSensorCharts(); });
    var resizeTimer; window.addEventListener('resize',function(){ window.clearTimeout(resizeTimer); resizeTimer=window.setTimeout(function(){ if(state.bundle){ renderRhChart(); renderSensorCharts(); } },120); });
  }
  function navigateDay(offset){ var completed=state.days.filter(function(day){return day.status==='completed';}),index=completed.findIndex(function(day){return day.date===state.selectedDate;}),target=completed[index+offset]; if(target) loadDay(target.date,true); }
  function updateRange(){
    var start=Number($('rangeStart').value),end=Number($('rangeEnd').value);
    if(start>=end){ if(this.id==='rangeStart') start=Math.max(0,end-1); else end=Math.min(Number($('rangeEnd').max),start+1); }
    state.rangeStart=start; state.rangeEnd=end; renderRhChart(); renderRhTable(); renderSensorCharts();
  }

  setupProductNavigation(); setupDashboardDrawer(); setupTabs(); bindControls(); refresh();
})();
