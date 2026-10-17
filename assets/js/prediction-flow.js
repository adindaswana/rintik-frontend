(function(){
  'use strict';

  var apiLib = window.RintikApi;
  var predictionLib = window.RintikPublicPrediction;
  if(!apiLib || !predictionLib) return;

  var params = new URLSearchParams(window.location.search);
  var requestedApi = params.get('api');
  var storedApi = sessionStorage.getItem('rintik_api_url');
  var baseUrl = requestedApi || (!storedApi || storedApi === 'http://127.0.0.1:8000' ? (window.RINTIK_DEFAULT_API||'http://127.0.0.1:8140') : storedApi);
  sessionStorage.setItem('rintik_api_url',baseUrl);
  var client = apiLib.createClient({baseUrl:baseUrl,timeoutMs:120000});
  var pageKind = document.body.getAttribute('data-flow-page');
  var state = {
    mode:'operational', busy:false, health:null, officialDays:[], incidents:[],
    operational:null, operationalDay:null, catalog:null, editingTimestamp:null,
    result:null, monitoring:null, resultScope:null, resetTarget:null
  };

  function $(id){ return document.getElementById(id); }
  function finite(value){ return value !== null && value !== '' && Number.isFinite(Number(value)); }
  function mean(values){ return values.length ? values.reduce(function(sum,value){return sum+Number(value);},0)/values.length : null; }
  function fmtRh(value,digits){ return finite(value) ? Number(value).toFixed(digits === undefined ? 1 : digits)+'%' : '—'; }
  function formatDate(value){
    if(!value) return '—';
    var parts=String(value).slice(0,10).split('-');
    var months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return Number(parts[2])+' '+months[Number(parts[1])-1]+' '+parts[0];
  }
  function formatTime(value){ return String(value || '').slice(11,16); }
  function errorMessage(error){ return predictionLib.errorMessage(error); }
  function timestampOf(row){ return row.timestamp || row.datetime; }
  function predictionValues(result){ return (result && result.predictions || []).map(function(row){return Number(row.post_3 !== undefined?row.post_3:row.air_humidity);}).filter(Number.isFinite); }
  function monitoringOf(result,monitoring){ return monitoring || (result && result.monitoring) || null; }

  function setupNavigation(){
    document.querySelectorAll('[data-api-link]').forEach(function(link){
      var url=new URL(link.getAttribute('href'),window.location.href); url.searchParams.set('api',baseUrl);
      link.href=url.pathname.split('/').pop()+'?'+url.searchParams.toString();
    });
    var toggle=document.querySelector('.nav-toggle'), menu=document.querySelector('.mobile-menu');
    if(toggle&&menu) toggle.addEventListener('click',function(){var open=!menu.classList.contains('open');menu.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));});
  }

  function setSystem(online,title,detail){
    var box=$('systemStatus');
    if(box){box.classList.toggle('is-online',online);box.classList.toggle('is-error',!online);$('systemStatusTitle').textContent=title;$('systemStatusDetail').textContent=detail;}
    var runtime=$('navRuntime');
    if(runtime){runtime.classList.toggle('is-online',online);runtime.classList.toggle('is-error',!online);runtime.querySelector('span').textContent=online?'Sistem siap':'Tidak terhubung';}
  }
  function setAlert(title,message,kind,focus){
    var alert=$('flowAlert'); if(!alert) return;
    $('flowAlertTitle').textContent=title; $('flowAlertMessage').textContent=message;
    alert.classList.toggle('is-info',kind==='info'); alert.hidden=false;
    if(focus!==false){alert.focus({preventScroll:true});alert.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});}
  }
  function hideAlert(){if($('flowAlert'))$('flowAlert').hidden=true;}
  function setBusy(active,title,detail,total,value){
    state.busy=active;
    if($('processingPanel')){$('processingPanel').hidden=!active;if(active){$('processingTitle').textContent=title||'Memproses';$('processingDetail').textContent=detail||'Mohon tunggu…';$('processProgress').max=total||1;$('processProgress').value=value||0;}}
    document.querySelectorAll('button').forEach(function(button){if(button.id!=='cancelResetButton'&&button.id!=='confirmResetButton')button.disabled=active||button.dataset.originalDisabled==='true';});
    if(!active) updateControls();
  }

  function sensorStateLabel(value){
    var labels={available_simulated:'Normal · simulasi',stuck_simulated:'Stuck · simulasi',deviating_simulated:'Menyimpang · simulasi',missing_simulated:'Hilang · simulasi',simulated_repaired:'Pulih · simulasi'};
    return labels[value]||'Belum dibandingkan';
  }
  function verdictLabel(value){
    var labels={monitoring:'Normal · simulasi',monitoring_repaired_simulation:'Pulih · simulasi',suspected_sensor_malfunction:'Dugaan ketidakcocokan',suspected_sensor_outage:'Sensor tidak tersedia'};
    return labels[value]||'Estimasi tersimpan';
  }
  function operationalValues(result,monitoring){
    var model=result.predictions||[];
    if(!monitoring||!monitoring.sensor)return {values:predictionValues(result),source:'prediction'};
    var sensor={},recovery={},used=false;
    monitoring.sensor.values.forEach(function(row){sensor[row.timestamp]=row.physical_rh;});
    (monitoring.recovery&&monitoring.recovery.values||[]).forEach(function(row){recovery[row.timestamp]=row.recovery_rh;});
    var values=model.map(function(row){var time=timestampOf(row),physical=sensor[time];if(finite(physical))return Number(physical);if(finite(recovery[time])){used=true;return Number(recovery[time]);}return null;}).filter(function(value){return value!==null;});
    return {values:values,source:used?'recovery':'sensor'};
  }

  function svgNode(tag,attrs,text){var element=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.keys(attrs||{}).forEach(function(key){element.setAttribute(key,attrs[key]);});if(text!==undefined)element.textContent=text;return element;}
  function linePath(values,x,y){var path='',drawing=false;values.forEach(function(value,index){if(!finite(value)){drawing=false;return;}path+=(drawing?'L':'M')+x(index).toFixed(2)+' '+y(Number(value)).toFixed(2)+' ';drawing=true;});return path.trim();}
  function renderChart(container,result,monitoring,interactive){
    if(!container)return; container.innerHTML='';
    var rows=result&&result.predictions||[]; if(!rows.length){container.textContent='Grafik belum tersedia.';return;}
    monitoring=monitoringOf(result,monitoring);
    var model=predictionValues(result), sensor=monitoring&&monitoring.sensor?monitoring.sensor.values.map(function(row){return row.physical_rh;}):[];
    var recoveryMap={}; if(monitoring&&monitoring.recovery)(monitoring.recovery.values||[]).forEach(function(row){recoveryMap[row.timestamp]=row.recovery_rh;});
    var recovery=rows.map(function(row){var value=recoveryMap[timestampOf(row)];return value===undefined?null:value;});
    var width=Math.max(container.clientWidth||700,320),height=interactive?330:260,pad={left:42,right:14,top:18,bottom:30};
    var x=function(index){return pad.left+index/Math.max(1,rows.length-1)*(width-pad.left-pad.right);};
    var y=function(value){return pad.top+(1-Number(value)/100)*(height-pad.top-pad.bottom);};
    var svg=svgNode('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':'Grafik estimasi RINTIK dan sensor humidity simulasi'});
    [0,25,50,75,100].forEach(function(value){svg.appendChild(svgNode('line',{x1:pad.left,y1:y(value),x2:width-pad.right,y2:y(value),stroke:'#dce5e1'}));svg.appendChild(svgNode('text',{x:pad.left-7,y:y(value)+4,fill:'#718079','font-size':'9','text-anchor':'end'},value));});
    [{values:model,color:'#146b4a',width:3,dash:''},{values:sensor,color:'#6b7470',width:2.1,dash:'7 5'},{values:recovery,color:'#2367a3',width:2.8,dash:'2 5'}].forEach(function(series){var path=linePath(series.values,x,y);if(path)svg.appendChild(svgNode('path',{d:path,fill:'none',stroke:series.color,'stroke-width':series.width,'stroke-dasharray':series.dash,'stroke-linecap':'round','stroke-linejoin':'round'}));});
    [0,Math.floor((rows.length-1)/2),rows.length-1].forEach(function(index){svg.appendChild(svgNode('text',{x:x(index),y:height-7,fill:'#718079','font-size':'9','text-anchor':index===0?'start':index===rows.length-1?'end':'middle'},formatTime(timestampOf(rows[index]))));});
    if(interactive){
      var focus=svgNode('line',{x1:x(0),x2:x(0),y1:pad.top,y2:height-pad.bottom,stroke:'#9fb7ac','stroke-width':'1',hidden:'true'});
      var hit=svgNode('rect',{x:pad.left,y:pad.top,width:width-pad.left-pad.right,height:height-pad.top-pad.bottom,fill:'transparent',tabindex:'0',role:'slider','aria-label':'Jelajahi titik waktu grafik humidity','aria-valuemin':'0','aria-valuemax':String(rows.length-1),'aria-valuenow':'0'});
      function show(index,event){index=Math.max(0,Math.min(rows.length-1,index));focus.removeAttribute('hidden');focus.setAttribute('x1',x(index));focus.setAttribute('x2',x(index));hit.setAttribute('aria-valuenow',String(index));var physical=sensor[index],replacement=recovery[index];var copy=formatTime(timestampOf(rows[index]))+' · RINTIK '+fmtRh(model[index],2)+' · sensor '+(finite(physical)?fmtRh(physical,2):'gap')+(finite(replacement)?' · recovery '+fmtRh(replacement,2):'');hit.setAttribute('aria-valuetext',copy);var tooltip=$('resultTooltip');if(tooltip){tooltip.textContent=copy;tooltip.hidden=false;if(event){tooltip.style.left=Math.min(window.innerWidth-300,event.clientX+12)+'px';tooltip.style.top=Math.max(12,event.clientY-56)+'px';}}}
      hit.addEventListener('mousemove',function(event){var rect=svg.getBoundingClientRect(),ratio=(event.clientX-rect.left-pad.left*rect.width/width)/((width-pad.left-pad.right)*rect.width/width);show(Math.round(Math.max(0,Math.min(1,ratio))*(rows.length-1)),event);});
      hit.addEventListener('mouseleave',function(){focus.setAttribute('hidden','true');if($('resultTooltip'))$('resultTooltip').hidden=true;});
      hit.addEventListener('keydown',function(event){if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();show(Number(hit.getAttribute('aria-valuenow'))+(event.key==='ArrowRight'?1:-1));});
      svg.appendChild(focus);svg.appendChild(hit);
    }
    container.appendChild(svg);
  }
  function legendHtml(monitoring){var html='<span><i class="flow-line-key"></i>Estimasi RINTIK</span>';if(monitoring)html+='<span><i class="flow-line-key sensor"></i>Sensor humidity · simulasi</span>';if(monitoring&&monitoring.recovery&&monitoring.recovery.values.length)html+='<span><i class="flow-line-key recovery"></i>Recovery · estimated</span>';return html;}

  function rememberResult(scope,date){localStorage.setItem('rintik_latest_result',JSON.stringify({scope:scope,date:date}));}
  function latestPointer(){try{return JSON.parse(localStorage.getItem('rintik_latest_result')||'null');}catch(error){return null;}}
  async function loadResult(scope,date){
    if(scope==='operational'){var result=await client.getOperationalResult(date);return {result:result,monitoring:result.monitoring,scope:scope};}
    var official=await client.getDayResult(date), monitoring=null;try{monitoring=await client.getMonitoring(date);}catch(error){if(error.code!=='MONITORING_NOT_FOUND')throw error;}return {result:official,monitoring:monitoring,scope:'official'};
  }
  function renderLatest(bundle){
    if(!$('latestContent'))return;
    var result=bundle.result,monitoring=bundle.monitoring,scope=bundle.scope,values=predictionValues(result),operational=operationalValues(result,monitoring);
    state.result=result;state.monitoring=monitoring;state.resultScope=scope;$('latestEmpty').hidden=true;$('latestContent').hidden=false;
    $('latestScope').textContent=scope==='operational'?'Simulasi operasional 2026':'Demo resmi 2023';$('latestDate').textContent=formatDate(result.date);$('latestStatus').textContent=scope==='operational'?'Estimasi pada skenario sintetis tersimpan.':'Hasil replay fixture resmi tersimpan.';
    $('latestMean').textContent=fmtRh(mean(values));$('latestOperational').textContent=fmtRh(mean(operational.values));$('latestOperationalNote').textContent=operational.source==='recovery'?'recovery estimated':operational.source==='sensor'?'dari sensor simulasi':'estimasi RINTIK';$('latestRows').textContent=result.predictions.length;
    var sensorState=monitoring&&monitoring.sensor?(monitoring.sensor.state||monitoring.sensor_state):null,verdict=monitoring&&monitoring.assessment&&monitoring.assessment.verdict;
    $('latestSensor').textContent=sensorStateLabel(sensorState);$('latestSensorNote').textContent=monitoring?'bukan pengukuran terverifikasi':'belum dibandingkan';$('latestVerdict').textContent=verdictLabel(verdict);$('operationalBanner').hidden=operational.source!=='recovery';$('latestLegend').innerHTML=legendHtml(monitoring);renderChart($('latestChart'),result,monitoring,false);
    var url=new URL('hasil.html',window.location.href);url.searchParams.set('api',baseUrl);url.searchParams.set('scope',scope);url.searchParams.set('date',result.date);$('resultLink').href=url.pathname.split('/').pop()+'?'+url.searchParams.toString();rememberResult(scope,result.date);
  }

  function renderManualCatalog(catalog){
    state.catalog=catalog;var container=$('manualGroups');if(!container)return;container.innerHTML='';
    var groups=[{id:'identity',label:'Identitas pembacaan',features:[{key:'env_id',label:'ID lingkungan',unit:'ID'}]}].concat(catalog.groups||[]);
    groups.forEach(function(group,index){var details=document.createElement('details');details.className='manual-group';details.open=index===0;var summary=document.createElement('summary');summary.innerHTML=group.label+' <span>· '+group.features.length+' fitur</span>';details.appendChild(summary);var grid=document.createElement('div');grid.className='manual-field-grid';group.features.forEach(function(feature){var field=document.createElement('div');field.className='manual-field';var label=document.createElement('label');label.htmlFor='manual-'+feature.key;label.textContent=feature.label;var input=document.createElement('input');input.id='manual-'+feature.key;input.type='number';input.step='any';input.inputMode='decimal';input.dataset.manualFeature=feature.key;input.autocomplete='off';var unit=document.createElement('small');unit.textContent=feature.unit||'';field.appendChild(label);field.appendChild(input);field.appendChild(unit);grid.appendChild(field);});details.appendChild(grid);container.appendChild(details);});
  }
  function manualInputs(){return Array.prototype.slice.call(document.querySelectorAll('[data-manual-feature]'));}
  function setManualResult(message,error){var result=$('manualResult');result.textContent=message;result.classList.toggle('is-error',Boolean(error));result.hidden=false;}
  function clearManual(){if(!$('manualTimestamp'))return;$('manualTimestamp').value='';manualInputs().forEach(function(input){input.value='';});state.editingTimestamp=null;$('saveReadingButton').textContent='Simpan pembacaan';$('manualResult').hidden=true;setDefaultManualTimestamp();}
  function currentOperationalDate(){return state.operational&&state.operational.next_expected_date;}
  function setDefaultManualTimestamp(){var day=currentOperationalDate();if(!day||!$('manualTimestamp'))return;var missing=state.operationalDay&&state.operationalDay.missing_slots||[];var target=missing[0]||day+' 00:00:00';$('manualTimestamp').value=target.replace(' ','T').slice(0,16);$('manualTimestamp').min=day+'T00:00';$('manualTimestamp').max=day+'T23:30';}
  function populateReading(reading){$('manualTimestamp').value=String(reading.datetime).replace(' ','T').slice(0,16);manualInputs().forEach(function(input){input.value=reading[input.dataset.manualFeature];});}
  async function loadManualExample(){var day=currentOperationalDate();if(!day)return;var timestamp=$('manualTimestamp').value;if(!timestamp){setDefaultManualTimestamp();timestamp=$('manualTimestamp').value;}try{var response=await client.getOperationalFixtureReading(day,timestamp.replace('T',' ')+':00'.replace(/:00:00$/,':00'));populateReading(response.reading);state.editingTimestamp=null;$('saveReadingButton').textContent='Simpan pembacaan';setManualResult('Nilai fixture dimuat ke form dan belum disimpan.',false);}catch(error){setManualResult(errorMessage(error),true);}}
  function buildManualReading(){var timestamp=$('manualTimestamp').value;if(!timestamp)throw new Error('Pilih waktu pembacaan.');var reading={datetime:timestamp.replace('T',' ')+':00'};var missing=[];manualInputs().forEach(function(input){if(!finite(input.value))missing.push(input.dataset.manualFeature);else reading[input.dataset.manualFeature]=Number(input.value);});if(missing.length)throw new Error('Lengkapi nilai numerik: '+missing.join(', ')+'.');return reading;}
  async function saveReading(){var day=currentOperationalDate();if(!day)return;hideAlert();try{var reading=buildManualReading();setBusy(true,state.editingTimestamp?'Menyimpan koreksi':'Menyimpan pembacaan','Memvalidasi slot, satuan, dan rentang…');var response=state.editingTimestamp?await client.updateOperationalReading(day,reading):await client.createOperationalReading(day,reading);await refreshOperational();setManualResult((response.action==='updated'?'Koreksi':'Pembacaan')+' tersimpan sebagai sumber manual.',false);clearManual();}catch(error){setManualResult(errorMessage(error),true);}finally{setBusy(false);}}
  function editReading(timestamp){var row=(state.operationalDay.readings||[]).find(function(item){return item.timestamp===timestamp;});if(!row||state.operationalDay.locked)return;var reading=Object.assign({datetime:row.timestamp},row.values);populateReading(reading);state.editingTimestamp=timestamp;$('saveReadingButton').textContent='Simpan koreksi';$('manualTimestamp').focus();window.scrollTo({top:$('manualTimestamp').getBoundingClientRect().top+window.scrollY-130,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  function renderOperationalDay(){
    var summary=state.operational,day=summary&&summary.next_expected_date,data=state.operationalDay;if(!summary)return;
    if(!day){$('operationalDate').textContent='Periode 12 hari selesai';$('operationalCount').textContent='12 / 12 hari';$('operationalProgress').style.width='100%';$('readinessText').textContent='Reset operasional untuk memulai kembali.';return;}
    var progress=data.progress;$('operationalDate').textContent=formatDate(day);$('operationalCount').textContent=progress.available+' / 48';$('operationalProgress').style.width=(progress.available/48*100)+'%';$('manualCount').textContent=progress.manual;$('fixtureCount').textContent=progress.synthetic_fixture;$('readingState').textContent=progress.available+' valid';
    $('readinessText').textContent=progress.ready?'Semua slot tersedia. Estimasi harian siap diproses.':progress.available+' dari 48 slot tersedia; '+progress.missing+' masih kosong.';
    var process=$('processOperationalButton');process.disabled=state.busy||!progress.ready;process.querySelector('strong').textContent=progress.ready?'Data hari ini siap. Proses estimasi humidity.':'Data belum lengkap';process.querySelector('span').textContent=progress.available+' / 48 pembacaan';$('fillMissingButton').disabled=state.busy||progress.ready;
    var body=$('readingTableBody');body.innerHTML='';if(!data.readings.length){body.innerHTML='<tr><td colspan="7" class="table-empty">Belum ada pembacaan.</td></tr>';}else data.readings.forEach(function(row){var tr=document.createElement('tr');if(!data.locked){tr.tabIndex=0;tr.setAttribute('role','button');tr.setAttribute('aria-label','Edit pembacaan '+formatTime(row.timestamp));tr.addEventListener('click',function(){editReading(row.timestamp);});tr.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();editReading(row.timestamp);}});}var values=row.values,soil=[values.soil_humidity_line1,values.soil_humidity_line2,values.soil_humidity_line3].filter(finite);tr.innerHTML='<td>'+formatTime(row.timestamp)+'</td><td>'+Number(values.air_temperature).toFixed(1)+' °C</td><td>'+Number(values.co2).toFixed(0)+' ppm</td><td>'+Number(values.pressure).toFixed(1)+' hPa</td><td>'+Number(mean(soil)).toFixed(1)+'%</td><td><span class="source-pill '+row.source+'">'+(row.source==='manual'?'Manual':'Simulasi')+'</span></td><td><span class="valid-pill">Valid</span></td>';body.appendChild(tr);});
    setDefaultManualTimestamp();
  }
  async function refreshOperational(){state.operational=await client.listOperationalDays();var day=state.operational.next_expected_date;if(day)state.operationalDay=await client.getOperationalDay(day);else state.operationalDay=null;renderOperationalDay();}
  async function fillMissing(){var day=currentOperationalDate();if(!day)return;setBusy(true,'Melengkapi slot','Mengisi hanya slot kosong dari fixture sintetis…');try{var result=await client.fillOperationalDay(day);state.operationalDay=result;await refreshOperational();setAlert('Data hari ini lengkap',result.inserted_fixture_rows+' slot diisi dari fixture. Pembacaan manual tetap dipertahankan.','info');}catch(error){setAlert('Data tidak dapat dilengkapi',errorMessage(error));}finally{setBusy(false);}}
  async function processOperational(){var day=currentOperationalDate();if(!day)return;setBusy(true,'Memproses '+formatDate(day),'Menjalankan pipeline harian dan menyimpan hasil…');try{var result=await client.runOperationalDay(day,$('operationalScenario').value);renderLatest({result:result,monitoring:result.monitoring,scope:'operational'});await refreshOperational();setAlert('Estimasi humidity tersimpan','Hasil '+formatDate(day)+' siap dilihat dan tanggal berikutnya dapat disiapkan.','info',false);$('latestContent').focus();}catch(error){setAlert('Pemrosesan gagal',errorMessage(error));}finally{setBusy(false);}}

  async function processOfficialOne(){var fixture=await client.getNextOfficialDemoInput();var rows=predictionLib.parseCsvText(fixture.csv);var classification=predictionLib.classifyRows(rows);if(!classification.ok||classification.workflow!=='daily_batch'||classification.date!==fixture.date)throw new Error('Fixture resmi tidak cocok dengan kontrak daily batch.');var processed=await predictionLib.processRows(rows,client,{monitoringEnabled:true});var result=await client.getDayResult(fixture.date);return {date:fixture.date,result:result,monitoring:processed.monitoring};}
  function renderDemo(){var complete=state.health&&!state.health.next_expected_date,count=state.officialDays.filter(function(day){return day.status==='completed';}).length;$('demoCount').textContent=count+' / 16';$('demoProgress').style.width=(count/16*100)+'%';$('demoNextDate').textContent=complete?'Fixture demo selesai':'Berikutnya · '+formatDate(state.health&&state.health.next_expected_date);$('demoStatusText').textContent=count?count+' tanggal telah tersimpan secara kronologis.':'Belum ada tanggal yang diproses.';$('demoComplete').hidden=!complete;$('processDemoDayButton').disabled=state.busy||complete;$('processDemoAllButton').disabled=state.busy||complete;$('prepareRecoveryButton').disabled=state.busy;}
  async function refreshOfficial(){var responses=await Promise.all([client.health(),client.listDays(),client.listIncidents()]);state.health=responses[0];state.officialDays=responses[1].days||[];state.incidents=responses[2].incidents||[];renderDemo();}
  async function processDemo(all){if(!state.health||!state.health.next_expected_date)return;var count=state.officialDays.filter(function(day){return day.status==='completed';}).length,target=all?16-count:1,latest=null;setBusy(true,all?'Menjalankan demo resmi':'Memproses satu hari','Replay kronologis sedang berlangsung…',target,0);try{for(var i=0;i<target;i++){latest=await processOfficialOne();$('processProgress').value=i+1;$('processingDetail').textContent=formatDate(latest.date)+' selesai.';}await refreshOfficial();if(latest)renderLatest({result:latest.result,monitoring:latest.monitoring,scope:'official'});setAlert('Replay berhasil',all?'Seluruh tanggal yang tersisa sudah diproses.':'Satu tanggal selesai dan tersimpan.','info');}catch(error){await refreshOfficial();setAlert('Replay berhenti',errorMessage(error)+' Hasil yang sudah selesai tetap tersimpan.');}finally{setBusy(false);}}
  async function prepareRecovery(){var target='2023-09-06',latest=null;setBusy(true,'Menyiapkan outage 6 September','Memproses tanggal prasyarat secara kronologis…',9,0);try{var health=await client.health(),i=0;while(health.next_expected_date&&health.next_expected_date<=target){latest=await processOfficialOne();i++;$('processProgress').value=i;health=await client.health();}var incidents=(await client.listIncidents()).incidents||[],incident=incidents.find(function(item){return item.date===target&&item.type==='sensor_outage';});if(!incident)throw new Error('Skenario outage belum tersedia.');if(incident.status!=='confirmed_simulation'){await client.createDemoAudit('pass','guided-audit-'+incident.incident_id);await client.confirmIncident(incident.incident_id,{demo_override:true,note:'Guided recovery demonstration.'},'guided-confirm-'+incident.incident_id);}var bundle=await loadResult('official',target);renderLatest(bundle);await refreshOfficial();setAlert('Recovery 6 September siap','Sensor humidity tetap tercatat hilang; nilai pengganti tampil sebagai estimated.','info',false);var url=new URL('hasil.html',window.location.href);url.searchParams.set('api',baseUrl);url.searchParams.set('scope','official');url.searchParams.set('date',target);window.location.href=url.pathname.split('/').pop()+'?'+url.searchParams.toString();}catch(error){setAlert('Recovery belum siap',errorMessage(error));}finally{setBusy(false);}}

  function selectMode(mode){state.mode=mode;document.querySelectorAll('[data-mode]').forEach(function(button){button.setAttribute('aria-selected',String(button.dataset.mode===mode));});$('operationalPanel').hidden=mode!=='operational';$('demoPanel').hidden=mode!=='demo';sessionStorage.setItem('rintik_prediction_mode',mode);}
  function updateControls(){if(pageKind!=='predict')return;renderDemo();renderOperationalDay();}
  function openReset(target){state.resetTarget=target;$('resetDialogTitle').textContent=target==='official'?'Ulangi Demo Resmi?':'Ulangi Operasional Harian?';$('resetDialogText').textContent=target==='official'?'Hanya replay 2023, monitoring demo, dan recovery terkait yang dibersihkan.':'Hanya pembacaan dan hasil simulasi operasional 2026 yang dibersihkan.';$('resetDialog').showModal();}
  async function confirmReset(event){event.preventDefault();$('resetDialog').close();setBusy(true,'Mereset workflow','Membersihkan state run yang dipilih…');try{if(state.resetTarget==='official'){await client.resetDemoState('RESET_DEMO_STATE');if(latestPointer()&&latestPointer().scope==='official')localStorage.removeItem('rintik_latest_result');}else{await client.resetOperationalSimulation('RESET_OPERATIONAL_SIMULATION');if(latestPointer()&&latestPointer().scope==='operational')localStorage.removeItem('rintik_latest_result');}state.result=null;state.monitoring=null;$('latestContent').hidden=true;$('latestEmpty').hidden=false;await Promise.all([refreshOfficial(),refreshOperational()]);clearManual();setAlert('Workflow berhasil direset','Fixture dan artefak model tetap utuh. Anda dapat memulai kembali dari tanggal pertama.','info');}catch(error){setAlert('Reset gagal',errorMessage(error));}finally{setBusy(false);}}

  async function initPredict(){
    document.querySelectorAll('[data-mode]').forEach(function(button){button.addEventListener('click',function(){selectMode(button.dataset.mode);});});
    $('loadManualExample').addEventListener('click',loadManualExample);$('saveReadingButton').addEventListener('click',saveReading);$('clearManualButton').addEventListener('click',clearManual);$('fillMissingButton').addEventListener('click',fillMissing);$('processOperationalButton').addEventListener('click',processOperational);$('processDemoDayButton').addEventListener('click',function(){processDemo(false);});$('processDemoAllButton').addEventListener('click',function(){processDemo(true);});$('prepareRecoveryButton').addEventListener('click',prepareRecovery);$('resetOperationalButton').addEventListener('click',function(){openReset('operational');});$('resetDemoButton').addEventListener('click',function(){openReset('official');});$('confirmResetButton').addEventListener('click',confirmReset);
    window.addEventListener('resize',function(){if(state.result)renderChart($('latestChart'),state.result,state.monitoring,false);});
    try{var responses=await Promise.all([client.listFeatures(),refreshOfficial(),refreshOperational()]);renderManualCatalog(responses[0]);setSystem(true,'Sistem siap','Kedua workflow tersedia dan disimpan terpisah.');var pointer=latestPointer();if(pointer){try{renderLatest(await loadResult(pointer.scope,pointer.date));}catch(error){/* stale pointer is harmless */}}selectMode(sessionStorage.getItem('rintik_prediction_mode')||'operational');setDefaultManualTimestamp();}catch(error){setSystem(false,'Sistem belum siap','Backend tidak dapat dimuat.');setAlert('Tidak dapat memulai Prediksi',errorMessage(error));}
  }

  function resultDates(official,operational){var values=[];(operational.days||[]).filter(function(day){return day.status==='completed';}).forEach(function(day){values.push({scope:'operational',date:day.date,label:formatDate(day.date)+' · operasional 2026'});});(official||[]).filter(function(day){return day.status==='completed';}).forEach(function(day){values.push({scope:'official',date:day.date,label:formatDate(day.date)+' · demo resmi'});});return values.sort(function(a,b){return a.date.localeCompare(b.date);});}
  function extrema(rows){var values=predictionValues({predictions:rows}),min=Math.min.apply(null,values),max=Math.max.apply(null,values),minIndex=values.indexOf(min),maxIndex=values.indexOf(max);return {min:min,max:max,minTime:formatTime(timestampOf(rows[minIndex])),maxTime:formatTime(timestampOf(rows[maxIndex]))};}
  function renderInterpretation(result,monitoring){var values=predictionValues(result),first=values[0],last=values[values.length-1],delta=last-first,high=values.filter(function(value){return value>=80;}).length,low=values.filter(function(value){return value<50;}).length,items=[];items.push('Humidity '+(delta>=0?'meningkat':'menurun')+' '+Math.abs(delta).toFixed(1)+' poin dari awal hingga akhir data hari ini.');if(high)items.push(high+' interval berada pada ≥80% RH; ambang ini hanya deskriptif, bukan rekomendasi agronomis.');if(low)items.push(low+' interval berada di bawah 50% RH; interpretasikan sesuai konteks tanaman dan lokasi.');if(monitoring&&monitoring.assessment){var disagreement=monitoring.assessment.metrics&&monitoring.assessment.metrics.mean_absolute_disagreement_rh;if(finite(disagreement))items.push('Selisih absolut rerata terhadap sensor simulasi '+Number(disagreement).toFixed(1)+' poin RH; ini bukan ukuran akurasi lapangan.');if(monitoring.recovery&&monitoring.recovery.values.length)items.push(monitoring.recovery.values.length+' gap sensor diisi sebagai recovery estimated tanpa menimpa data mentah.');}$('resultInsights').innerHTML=items.map(function(item){return '<li>'+item+'</li>';}).join('');}
  function renderResultPage(bundle){var result=bundle.result,monitoring=bundle.monitoring,scope=bundle.scope,values=predictionValues(result),ext=extrema(result.predictions),operational=operationalValues(result,monitoring);state.result=result;state.monitoring=monitoring;state.resultScope=scope;$('resultEmpty').hidden=true;$('resultContent').hidden=false;$('resultDate').textContent=formatDate(result.date);$('resultScope').textContent=scope==='operational'?'Simulasi operasional 2026':'Demo resmi 2023';$('resultProvenanceLabel').textContent=scope==='operational'?'Data eksogen sintetis · bukan pengukuran lapangan':'Input resmi kompetisi · sensor humidity tetap simulasi';$('resultMean').textContent=fmtRh(mean(values));$('resultMin').textContent=fmtRh(ext.min);$('resultMax').textContent=fmtRh(ext.max);$('resultRange').textContent=(ext.max-ext.min).toFixed(1)+' poin';$('resultMinTime').textContent=ext.minTime;$('resultMaxTime').textContent=ext.maxTime;$('resultCompleteness').textContent=result.predictions.length+(scope==='operational'?' / 48':' observasi');$('resultSensorStatus').textContent=sensorStateLabel(monitoring&&monitoring.sensor?(monitoring.sensor.state||monitoring.sensor_state):null);$('resultOperational').textContent=fmtRh(mean(operational.values));$('resultOperationalNote').textContent=operational.source==='recovery'?'recovery estimated':'sensor humidity simulasi';$('resultRecovery').textContent=operational.source==='recovery'?'Aktif · estimated':'Tidak aktif';$('resultLegend').innerHTML=legendHtml(monitoring);renderChart($('resultChart'),result,monitoring,true);renderInterpretation(result,monitoring);renderResultTable(result,monitoring);rememberResult(scope,result.date);var next=new URL('predict.html',window.location.href);next.searchParams.set('api',baseUrl);$('resultNextAction').href=next.pathname.split('/').pop()+'?'+next.searchParams.toString();}
  function renderResultTable(result,monitoring){var sensor={},recovery={};if(monitoring&&monitoring.sensor)monitoring.sensor.values.forEach(function(row){sensor[row.timestamp]=row.physical_rh;});if(monitoring&&monitoring.recovery)(monitoring.recovery.values||[]).forEach(function(row){recovery[row.timestamp]=row.recovery_rh;});$('resultTableBody').innerHTML=result.predictions.map(function(row){var time=timestampOf(row),model=row.post_3!==undefined?row.post_3:row.air_humidity,physical=sensor[time],replacement=recovery[time],effective=finite(physical)?physical:replacement;return '<tr><td>'+time+'</td><td>'+Number(model).toFixed(4)+'%</td><td>'+(finite(physical)?Number(physical).toFixed(4)+'%':'gap')+'</td><td>'+(finite(effective)?Number(effective).toFixed(4)+'%':'—')+'</td><td>'+(finite(physical)?'sensor_simulated':finite(replacement)?'model_estimate':'—')+'</td></tr>';}).join('');}
  async function loadSelectedResult(){var value=$('resultDateSelect').value;if(!value)return;var split=value.split('|');setBusy(true,'Memuat hasil','Mengambil snapshot dan data humidity…');try{var bundle=await loadResult(split[0],split[1]);renderResultPage(bundle);}catch(error){setAlert('Hasil tidak dapat dimuat',errorMessage(error));}finally{setBusy(false);}}
  function exportCurrentResult(){if(!state.result)return;var rows=['timestamp,estimated_rh,physical_sensor_simulated_rh,recovery_estimated_rh,effective_operational_rh,source'];var sensor={},recovery={},monitoring=state.monitoring;if(monitoring&&monitoring.sensor)monitoring.sensor.values.forEach(function(row){sensor[row.timestamp]=row.physical_rh;});if(monitoring&&monitoring.recovery)(monitoring.recovery.values||[]).forEach(function(row){recovery[row.timestamp]=row.recovery_rh;});state.result.predictions.forEach(function(row){var time=timestampOf(row),model=row.post_3!==undefined?row.post_3:row.air_humidity,physical=sensor[time],replacement=recovery[time],effective=finite(physical)?physical:replacement,source=finite(physical)?'sensor_simulated':finite(replacement)?'model_estimate':'model_only';rows.push([time,model,finite(physical)?physical:'',finite(replacement)?replacement:'',finite(effective)?effective:'',source].join(','));});var blob=new Blob([rows.join('\n')+'\n'],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='rintik-hasil-'+state.result.date+'.csv';anchor.click();URL.revokeObjectURL(url);}
  async function initResult(){
    $('resultDateSelect').addEventListener('change',loadSelectedResult);$('exportResultButton').addEventListener('click',exportCurrentResult);window.addEventListener('resize',function(){if(state.result)renderChart($('resultChart'),state.result,state.monitoring,true);});
    try{var responses=await Promise.all([client.health(),client.listDays(),client.listOperationalDays()]);state.health=responses[0];state.officialDays=responses[1].days||[];state.operational=responses[2];setSystem(true,'Hasil siap','Pilih tanggal yang sudah diproses.');var dates=resultDates(state.officialDays,state.operational),select=$('resultDateSelect');select.innerHTML=dates.length?'':'<option value="">Belum ada hasil</option>';dates.forEach(function(item){var option=document.createElement('option');option.value=item.scope+'|'+item.date;option.textContent=item.label;select.appendChild(option);});if(!dates.length)return;var requested={scope:params.get('scope'),date:params.get('date')},pointer=latestPointer(),target=dates.find(function(item){return item.scope===requested.scope&&item.date===requested.date;})||dates.find(function(item){return pointer&&item.scope===pointer.scope&&item.date===pointer.date;})||dates[dates.length-1];select.value=target.scope+'|'+target.date;await loadSelectedResult();}catch(error){setSystem(false,'Hasil tidak tersedia','Backend tidak dapat dimuat.');$('resultEmpty').querySelector('p').textContent=errorMessage(error)+' Tidak ada hasil pengganti yang dibuat.';}
  }

  setupNavigation();
  if(pageKind==='predict')initPredict();
  if(pageKind==='result')initResult();
})();
