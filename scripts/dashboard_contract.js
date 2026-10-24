/* Pure contract, provenance, and accessibility-static checks for M4 dashboard. */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var data = require('../lib/dashboard-data');

function main(){
  assert.strictEqual(
    data.dateFromCsv('\uFEFFdatetime,co2\r\n"2023-08-29 15:00:00",500\r\n'),
    '2023-08-29'
  );
  assert.throws(function(){ data.dateFromCsv('co2\n500\n'); }, /datetime/);

  var segmented = data.segments([
    {timestamp:'a',value:1}, {timestamp:'b',value:null},
    {timestamp:'c',value:3}, {timestamp:'d',value:4}
  ]);
  assert.deepStrictEqual(segmented.map(function(item){ return item.length; }), [1,2]);

  var catalog = {groups:[{features:[
    {key:'temp',unit:'°C'}, {key:'pressure',unit:'hPa'}, {key:'soil_temp',unit:'°C'}
  ]}]};
  var grouped = data.groupSelectedByUnit(catalog,['temp','soil_temp','pressure']);
  assert.strictEqual(grouped['°C'].length,2);
  assert.strictEqual(grouped.hPa.length,1);
  assert.strictEqual(data.csvCell('=cmd'), "'=cmd");
  assert.strictEqual(data.csvCell('a,b'), '"a,b"');
  assert.strictEqual(data.readableReason('physical_rh_all_missing'),'Seluruh nilai RH sensor simulasi hilang');
  assert.strictEqual(data.readableReason('suspected'),'Menunggu konfirmasi');
  assert.strictEqual(data.sensorStateLabel('available_simulated'),'tersedia · simulasi');
  assert.deepStrictEqual(data.recoveryPresentation({
    recovery:{status:'inactive',values:[]}, recovery_gate:{allowed:false,reasons:['independent_audit_or_explicit_demo_override_required']}, incident:null
  }),{
    status:'Tidak aktif', note:'tidak ada incident yang memerlukan recovery', gate:'Tidak diperlukan',
    gateReason:'Tidak ada incident sensor pada tanggal ini.', showSeries:false
  });
  assert.strictEqual(data.recoveryPresentation({
    recovery:{status:'active_estimated',values:[{recovery_rh:70}]}, recovery_gate:{allowed:true,reasons:[]}, incident:{status:'confirmed'}
  }).showSeries,true);

  var result = {
    date:'2023-08-29', source:'real_original_pth', simulation:false,
    predictions:[{timestamp:'2023-08-29 15:00:00'}]
  };
  var monitoring = {
    date:'2023-08-29', mode:'synthetic_demo', simulation:true,
    provenance:{model_input:false,accuracy_ground_truth:false},
    rintik:{values:[{timestamp:'2023-08-29 15:00:00'}]},
    sensor:{values:[{timestamp:'2023-08-29 15:00:00'}]}
  };
  var series = {
    date:'2023-08-29', source:'official_test_input', simulation:false,
    points:[{timestamp:'2023-08-29 15:00:00'}]
  };
  assert.strictEqual(data.validateDayBundle(result,monitoring,series),true);
  assert.throws(function(){
    data.validateDayBundle(Object.assign({},result,{source:'stub'}),monitoring,series);
  }, /verified frozen-model/);
  assert.throws(function(){
    data.validateDayBundle(result,Object.assign({},monitoring,{simulation:false}),series);
  }, /synthetic/);

  var audit = data.auditJson({result:result,monitoring:monitoring,series:series});
  assert(/not ground truth/.test(audit));
  assert(!/accuracy_score/.test(audit));

  var root = path.resolve(__dirname,'..');
  var html = fs.readFileSync(path.join(root,'dashboard.html'),'utf8');
  var css = fs.readFileSync(path.join(root,'assets','css','dashboard.css'),'utf8');
  var js = fs.readFileSync(path.join(root,'assets','js','dashboard.js'),'utf8');
  ['role="tablist"','role="tabpanel"','aria-live="polite"','id="dashboardTabs"','aria-controls="panelSensors"','Tampilkan tabel','Sensor Explorer','Temporal Insights','settings.html'].forEach(function(token){
    assert(html.indexOf(token)>=0,'missing dashboard accessibility token '+token);
  });
  var ids = Array.from(html.matchAll(/\bid="([^"]+)"/g),function(match){ return match[1]; });
  assert.strictEqual(new Set(ids).size,ids.length,'dashboard IDs must be unique');
  var idSet = new Set(ids);
  Array.from(html.matchAll(/\b(?:aria-controls|for)="([^"]+)"/g),function(match){ return match[1]; })
    .forEach(function(reference){
      reference.split(/\s+/).forEach(function(id){
        assert(idSet.has(id),'accessibility reference must target an existing ID: '+id);
      });
    });
  Array.from(html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),function(match){ return match; })
    .forEach(function(button){
      var attrs = button[1];
      var textContent = button[2].replace(/<[^>]+>/g,'').trim();
      assert(textContent || /\baria-label="[^"]+"/.test(attrs),'button must have an accessible name');
    });
  assert(css.indexOf('@media (prefers-reduced-motion: reduce)')>=0);
  assert.strictEqual(css.indexOf('@keyframes panel-in'),-1);
  assert.strictEqual(js.indexOf('generateSampleSeries'),-1);
  assert(js.indexOf('setupTabs')>=0);
  assert(js.indexOf("event.key==='ArrowRight'")>=0);
  assert(js.indexOf("event.key==='Home'")>=0);
  assert(js.indexOf("event.key==='End'")>=0);
  assert(js.indexOf('tab.tabIndex=active?0:-1')>=0);
  assert.strictEqual(js.indexOf('setDrawer'),-1,'the hidden drawer must stay removed');
  assert.strictEqual(html.indexOf('dashboardMenuButton'),-1,'the drawer menu button must stay removed');
  // charts are drawn 1:1 with readable labels, a tooltip slider, and the full range by default
  assert(js.indexOf("width:width,height:height")>=0 && js.indexOf("'font-size':'11'")>=0);
  assert(js.indexOf("role:'slider'")>=0 && js.indexOf('aria-valuetext')>=0);
  assert(js.indexOf('start.value=state.available[0]')>=0);
  assert(js.indexOf('RINTIK_resolveApiBase')>=0);
  assert(js.indexOf('byUnit')>=0);
  assert(js.indexOf('pearson')>=0 && js.indexOf('pairs.length<24')>=0);
  assert(js.indexOf('sebab-akibat')>=0);
  assert(js.indexOf('selectedStart')>=0 && js.indexOf('selectedEnd')>=0);
  // QA revisi 2: banner spacing, ordered range with a note, range kept in the URL, Indonesian labels
  assert(/<\/strong> <span id="provenanceText">/.test(html),'provenance title and text need a space');
  assert(html.indexOf('id="rangeNote"')>=0 && js.indexOf('keepRangeOrdered')>=0,'inverted range must be prevented with a note');
  assert(js.indexOf('persistRange')>=0 && js.indexOf("params.get('from')")>=0 && js.indexOf('history.replaceState')>=0,'range must survive a reload');
  assert.strictEqual(js.indexOf('<th>Timestamp</th>'),-1);
  assert.strictEqual(html.indexOf('Timeline tersinkron'),-1);
  assert(/\.button:disabled[^{]*\{[^}]*cursor: not-allowed/.test(css) && css.indexOf('transform: scale(.98)')>=0,'disabled and pressed button states');
  assert(css.indexOf('font-variant-numeric: tabular-nums')>=0);
  var settingsHtml = fs.readFileSync(path.join(root,'settings.html'),'utf8');
  var settingsJs = fs.readFileSync(path.join(root,'assets','js','settings.js'),'utf8');
  ['Threshold demonstrasi','Simpan preview','Detail engineering','Pass simulasi','Fail simulasi','sensor stuck'].forEach(function(token){ assert.strictEqual(settingsHtml.indexOf(token),-1,'settings.html still shows '+token); });
  assert(/<h2>Verifikasi akurasi independen<\/h2>/.test(settingsHtml));
  ["'Historical pred_internal diff'","m.audit.status+' / '","'Dugaan sensor stuck'","'Threshold preview tersimpan'","' · stuck '"].forEach(function(token){ assert.strictEqual(settingsJs.indexOf(token),-1,'settings.js still shows '+token); });
  assert(settingsJs.indexOf("simulated_demo:'Simulasi demo'")>=0 && settingsJs.indexOf("'Belum ada tanggal'")>=0);
  assert(settingsJs.indexOf("event.key==='ArrowRight'")>=0 && settingsJs.indexOf('item.tabIndex=active?0:-1')>=0,'Pengaturan tabs need arrow keys');

  console.log('RINTIK_DASHBOARD_CONTRACT_OK gaps=true unitSafe=true provenance=true a11yStatic=true references=true tabs=true qaRevisi2=true');
}

try { main(); }
catch(error){ console.error(error && error.stack ? error.stack : error); process.exit(1); }
