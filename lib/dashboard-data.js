/* Pure data helpers for the RINTIK operator dashboard. */
(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.RintikDashboardData = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  function assertObject(value, label){
    if(!value || typeof value !== 'object' || Array.isArray(value)){
      throw new Error(label + ' response is invalid.');
    }
    return value;
  }

  function validateDayBundle(result, monitoring, series){
    assertObject(result, 'Result');
    assertObject(monitoring, 'Monitoring');
    assertObject(series, 'Series');
    if(result.source !== 'real_original_pth' || result.simulation !== false){
      throw new Error('Result is not a verified frozen-model response.');
    }
    if(monitoring.mode !== 'synthetic_demo' || monitoring.simulation !== true ||
       !monitoring.provenance || monitoring.provenance.model_input !== false ||
       monitoring.provenance.accuracy_ground_truth !== false){
      throw new Error('Monitoring provenance is not explicitly synthetic.');
    }
    if(series.source !== 'official_test_input' || series.simulation !== false){
      throw new Error('Sensor series provenance is invalid.');
    }
    if(result.date !== monitoring.date || result.date !== series.date){
      throw new Error('Dashboard sources refer to different dates.');
    }
    var count = result.predictions && result.predictions.length;
    if(!count || count !== monitoring.rintik.values.length || count !== series.points.length){
      throw new Error('Dashboard sources are not timestamp-aligned.');
    }
    for(var i = 0; i < count; i++){
      var timestamp = result.predictions[i].timestamp;
      if(timestamp !== monitoring.rintik.values[i].timestamp ||
         timestamp !== monitoring.sensor.values[i].timestamp ||
         timestamp !== series.points[i].timestamp){
        throw new Error('Dashboard timestamps are not aligned.');
      }
    }
    return true;
  }

  function splitCsvLine(line){
    var cells = [], current = '', quoted = false;
    for(var i = 0; i < line.length; i++){
      var char = line[i];
      if(char === '"'){
        if(quoted && line[i + 1] === '"'){ current += '"'; i++; }
        else quoted = !quoted;
      } else if(char === ',' && !quoted){
        cells.push(current); current = '';
      } else current += char;
    }
    cells.push(current);
    return cells;
  }

  function dateFromCsv(text){
    var lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(function(line){
      return line.trim() !== '';
    });
    if(lines.length < 2) throw new Error('CSV must contain a header and at least one row.');
    var headers = splitCsvLine(lines[0]).map(function(value){ return value.trim(); });
    var index = headers.indexOf('datetime');
    if(index < 0) throw new Error('CSV does not contain a datetime column.');
    var cells = splitCsvLine(lines[1]);
    var match = String(cells[index] || '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T]/);
    if(!match) throw new Error('The first datetime is not in YYYY-MM-DD format.');
    return match[1];
  }

  function segments(values){
    var result = [], current = [];
    values.forEach(function(point){
      var value = point.value;
      if(value === null || value === undefined || !Number.isFinite(Number(value))){
        if(current.length) result.push(current);
        current = [];
      } else {
        current.push({timestamp: point.timestamp, value: Number(value)});
      }
    });
    if(current.length) result.push(current);
    return result;
  }

  function groupSelectedByUnit(catalog, selected){
    var selectedSet = new Set(selected || []), byUnit = {};
    (catalog.groups || []).forEach(function(group){
      (group.features || []).forEach(function(feature){
        if(!selectedSet.has(feature.key)) return;
        if(!byUnit[feature.unit]) byUnit[feature.unit] = [];
        byUnit[feature.unit].push(feature);
      });
    });
    return byUnit;
  }

  var REASON_LABELS = {
    physical_rh_all_missing: 'Seluruh nilai RH sensor simulasi hilang',
    physical_series_nearly_flat: 'Seri sensor simulasi nyaris tidak berubah',
    model_series_dynamic: 'Estimasi RINTIK tetap menunjukkan dinamika',
    large_mean_disagreement: 'Perbedaan rerata melewati ambang ilustratif',
    fixture_marks_simulated_repair: 'Fixture menandai pemulihan simulasi',
    critical_input_unhealthy: 'Input kritis tidak sehat',
    pipeline_unhealthy: 'Pipeline tidak sehat',
    operational_health_not_good: 'Health operasional belum memenuhi syarat',
    accuracy_audit_failed: 'Audit simulasi berstatus gagal',
    accuracy_audit_expired: 'Audit simulasi kedaluwarsa',
    accuracy_not_yet_verified: 'Audit simulasi belum diverifikasi',
    independent_audit_or_explicit_demo_override_required: 'Konfirmasi eksplisit diperlukan untuk Recovery Mode demo',
    suspected: 'Menunggu konfirmasi',
    confirmed: 'Terkonfirmasi · simulasi',
    resolved: 'Selesai'
  };

  function readableReason(reason){
    return REASON_LABELS[reason] || String(reason || '').replace(/_/g, ' ').replace(/^./, function(letter){
      return letter.toUpperCase();
    });
  }

  function sensorStateLabel(state){
    var labels = {
      available_simulated: 'tersedia · simulasi',
      stuck_simulated: 'nilai nyaris tetap · simulasi',
      missing_simulated: 'data hilang · simulasi',
      simulated_repaired: 'pulih · simulasi'
    };
    return labels[state] || readableReason(state);
  }

  function recoveryPresentation(monitoring){
    assertObject(monitoring, 'Monitoring');
    var recovery = monitoring.recovery || {status: 'inactive', values: []};
    var gate = monitoring.recovery_gate || {allowed: false, reasons: []};
    var incident = monitoring.incident;
    if(recovery.status === 'active_estimated'){
      return {
        status: 'Aktif · estimated',
        note: 'model_estimate · bukan pembacaan sensor fisik',
        gate: 'Aktif setelah konfirmasi demo',
        gateReason: 'Estimasi disimpan terpisah; nilai sensor mentah tidak ditimpa.',
        showSeries: Array.isArray(recovery.values) && recovery.values.length > 0
      };
    }
    if(recovery.status === 'historical_estimate_restricted'){
      return {
        status: 'Dibatasi',
        note: 'estimasi historis tetap berlabel terpisah',
        gate: 'Dibatasi',
        gateReason: (gate.reasons || []).map(readableReason).join(' · ') || 'Gate recovery tidak memenuhi syarat.',
        showSeries: Array.isArray(recovery.values) && recovery.values.length > 0
      };
    }
    if(!incident){
      return {
        status: 'Tidak aktif',
        note: 'tidak ada incident yang memerlukan recovery',
        gate: 'Tidak diperlukan',
        gateReason: 'Tidak ada incident sensor pada tanggal ini.',
        showSeries: false
      };
    }
    return {
      status: 'Tidak aktif',
      note: 'belum ada estimasi pengganti',
      gate: gate.allowed ? 'Siap dikonfirmasi' : 'Dibatasi',
      gateReason: gate.allowed ?
        'Gate demo memenuhi syarat; recovery tetap memerlukan aksi teknisi simulasi.' :
        ((gate.reasons || []).map(readableReason).join(' · ') || 'Gate recovery tidak memenuhi syarat.'),
      showSeries: false
    };
  }

  function csvCell(value){
    if(value === null || value === undefined) return '';
    var text = String(value);
    if(/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function auditJson(bundle){
    return JSON.stringify({
      exported_at: new Date().toISOString(),
      warning: 'Synthetic demo sensor is not ground truth or field accuracy evidence.',
      result: bundle.result,
      monitoring: bundle.monitoring,
      series_provenance: {
        schema_version: bundle.series.schema_version,
        date: bundle.series.date,
        row_count: bundle.series.row_count,
        source: bundle.series.source,
        simulation: bundle.series.simulation,
        run_id: bundle.series.run_id
      }
    }, null, 2) + '\n';
  }

  return {
    validateDayBundle: validateDayBundle,
    splitCsvLine: splitCsvLine,
    dateFromCsv: dateFromCsv,
    segments: segments,
    groupSelectedByUnit: groupSelectedByUnit,
    readableReason: readableReason,
    sensorStateLabel: sensorStateLabel,
    recoveryPresentation: recoveryPresentation,
    csvCell: csvCell,
    auditJson: auditJson
  };
});
