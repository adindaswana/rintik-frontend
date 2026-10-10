/* Real HTTP integration replay against a clean local RINTIK backend. */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var apiLib = require('../lib/rintik-api');

async function main(){
  var baseUrl = process.env.RINTIK_API_URL || 'http://127.0.0.1:8000';
  var client = apiLib.createClient({baseUrl: baseUrl});
  var prototypeDir = path.resolve(__dirname, '..', '..');
  var fixtureDir = path.join(prototypeDir, 'demo', 'fixtures', 'inputs_original_test_by_day');
  var manifest = JSON.parse(
    fs.readFileSync(path.join(prototypeDir, 'demo', 'fixtures', 'day_manifest.json'), 'utf8')
  );

  var health = await client.health();
  assert.strictEqual(health.ready, true);
  assert.strictEqual(health.source, 'real_original_pth');
  assert.strictEqual(health.monitoring_ready, true);
  var featureCatalog = await client.listFeatures();
  assert.strictEqual(
    featureCatalog.groups.reduce(function(total, group){ return total + group.features.length; }, 0),
    23
  );

  var monitored = {};
  for(var i = 0; i < manifest.calendar_dates.length; i++){
    var item = manifest.calendar_dates[i];
    var csv = fs.readFileSync(path.join(fixtureDir, item.file), 'utf8');
    var ingest = await client.ingestDay(item.date, {csv: csv}, 'frontend-integration-' + item.date);
    assert.strictEqual(ingest.row_count, item.rows);
    var run = await client.runDay(item.date);
    assert.strictEqual(run.source, 'real_original_pth');
    assert.strictEqual(run.simulation, false);
    assert.strictEqual(run.predictions.length, item.rows);
    monitored[item.date] = await client.monitorDay(item.date);
    assert.strictEqual(monitored[item.date].mode, 'synthetic_demo');
    assert.strictEqual(monitored[item.date].simulation, true);
    assert.strictEqual(monitored[item.date].provenance.model_input, false);
    assert.strictEqual(monitored[item.date].provenance.accuracy_ground_truth, false);
    var sensorSeries = await client.getDaySeries(item.date);
    assert.strictEqual(sensorSeries.row_count, item.rows);
    assert.strictEqual(sensorSeries.source, 'official_test_input');
    assert.strictEqual(sensorSeries.simulation, false);
  }

  assert.strictEqual(monitored['2023-09-04'].assessment.verdict, 'suspected_sensor_malfunction');
  assert.strictEqual(monitored['2023-09-05'].assessment.verdict, 'suspected_sensor_malfunction');
  assert.strictEqual(monitored['2023-09-06'].assessment.verdict, 'suspected_sensor_outage');
  assert.strictEqual(monitored['2023-09-07'].sensor.state, 'simulated_repaired');

  await client.createDemoAudit('pass', 'frontend-integration-audit-pass');
  var incidentId = monitored['2023-09-06'].incident.incident_id;
  var recovered = await client.confirmIncident(
    incidentId,
    {demo_override: true, note: 'Explicit integration-test simulation action.'},
    'frontend-integration-confirm-outage'
  );
  assert.strictEqual(recovered.incident.status, 'confirmed_simulation');
  assert.strictEqual(recovered.incident.actions.slice(-1)[0].actor_label, 'simulated_technician_action');
  assert.strictEqual(recovered.recovery.status, 'active_estimated');
  assert.strictEqual(recovered.recovery.source, 'model_estimate');
  assert.strictEqual(recovered.recovery.values.length, 48);
  assert(recovered.recovery.values.every(function(row){ return row.raw_physical_rh === null; }));
  assert.strictEqual(JSON.stringify(recovered).toLowerCase().indexOf('rmse'), -1);

  var exported = await fetch(client.exportDayUrl('2023-09-06'));
  assert.strictEqual(exported.status, 200);
  assert.strictEqual(exported.headers.get('x-content-type-options'), 'nosniff');
  var csv = await exported.text();
  var exportLines = csv.trimEnd().split(/\r?\n/);
  assert.strictEqual(exportLines.length, 49);
  assert(exportLines[0].indexOf('prediction_source') >= 0);
  assert(exportLines[0].indexOf('recovery_source') >= 0);
  assert(exportLines.slice(1).every(function(line){ return line.indexOf('real_original_pth') >= 0; }));

  console.log(JSON.stringify({
    status: 'PASS',
    baseUrl: baseUrl,
    days: manifest.calendar_dates.length,
    rows: manifest.total_rows,
    stuck: [monitored['2023-09-04'].assessment.verdict, monitored['2023-09-05'].assessment.verdict],
    outage: monitored['2023-09-06'].assessment.verdict,
    repaired: monitored['2023-09-07'].sensor.state,
    recoveryRows: recovered.recovery.values.length,
    recoverySource: recovered.recovery.source,
    featureCount: 23,
    exportRows: exportLines.length - 1
  }, null, 2));
}

main().catch(function(error){
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
