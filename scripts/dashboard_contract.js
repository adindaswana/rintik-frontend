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
  ['role="tablist"','role="tabpanel"','aria-live="polite"','Tampilkan tabel','Settings / Technical Details'].forEach(function(token){
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
  assert.strictEqual(js.indexOf('generateSampleSeries'),-1);
  assert(js.indexOf('validateDayBundle')>=0);
  assert(js.indexOf('real_original_pth')===-1 || html.indexOf('model original')>=0);

  console.log('RINTIK_DASHBOARD_CONTRACT_OK gaps=true unitSafe=true provenance=true a11yStatic=true references=true');
}

try { main(); }
catch(error){ console.error(error && error.stack ? error.stack : error); process.exit(1); }
