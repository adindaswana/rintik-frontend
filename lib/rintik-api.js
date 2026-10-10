/* Fail-closed client for the RINTIK v1 backend contract. */
(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.RintikApi = factory();
  }
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  function RintikApiError(code, message, status){
    this.name = 'RintikApiError';
    this.code = code;
    this.message = message;
    this.status = status || 0;
    if(Error.captureStackTrace) Error.captureStackTrace(this, RintikApiError);
  }
  RintikApiError.prototype = Object.create(Error.prototype);
  RintikApiError.prototype.constructor = RintikApiError;

  function createClient(options){
    options = options || {};
    var baseUrl = String(options.baseUrl || '').replace(/\/$/, '');
    var fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if(!baseUrl) throw new Error('baseUrl is required.');
    if(!fetchImpl) throw new Error('A fetch implementation is required.');

    async function request(path, init){
      var response;
      try {
        response = await fetchImpl(baseUrl + path, init || {});
      } catch(error){
        throw new RintikApiError(
          'NETWORK_ERROR',
          'RINTIK backend could not be reached; no fallback result was generated.',
          0
        );
      }
      var body;
      try {
        body = await response.json();
      } catch(error){
        throw new RintikApiError(
          'INVALID_BACKEND_RESPONSE',
          'RINTIK backend returned a non-JSON response.',
          response.status
        );
      }
      if(!response.ok){
        var envelope = body && body.error;
        throw new RintikApiError(
          envelope && envelope.code ? envelope.code : 'BACKEND_ERROR',
          envelope && envelope.message ? envelope.message : 'RINTIK backend request failed.',
          response.status
        );
      }
      return body;
    }

    function jsonRequest(method, body, idempotencyKey){
      var headers = {'Content-Type': 'application/json'};
      if(idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      return {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      };
    }

    return {
      health: function(){ return request('/health'); },
      listDays: function(){ return request('/v1/days'); },
      listFeatures: function(){ return request('/v1/features'); },
      ingestDay: function(date, payload, key){
        return request('/v1/days/' + encodeURIComponent(date) + '/ingest', jsonRequest('POST', payload, key));
      },
      runDay: function(date){
        return request('/v1/days/' + encodeURIComponent(date) + '/run', {method: 'POST'});
      },
      getDayResult: function(date){
        return request('/v1/days/' + encodeURIComponent(date) + '/result');
      },
      getDaySeries: function(date){
        return request('/v1/days/' + encodeURIComponent(date) + '/series');
      },
      exportDayUrl: function(date){
        return baseUrl + '/v1/days/' + encodeURIComponent(date) + '/export.csv';
      },
      monitorDay: function(date){
        return request('/v1/demo/days/' + encodeURIComponent(date) + '/monitor', {method: 'POST'});
      },
      getMonitoring: function(date){
        return request('/v1/demo/days/' + encodeURIComponent(date) + '/monitoring');
      },
      listIncidents: function(){ return request('/v1/demo/incidents'); },
      createDemoAudit: function(scenario, key){
        return request('/v1/demo/audits', jsonRequest('POST', {scenario: scenario}, key));
      },
      getCurrentAudit: function(){ return request('/v1/demo/audits/current'); },
      confirmIncident: function(incidentId, confirmation, key){
        return request(
          '/v1/demo/incidents/' + encodeURIComponent(incidentId) + '/confirm',
          jsonRequest('POST', confirmation, key)
        );
      }
    };
  }

  return {createClient: createClient, RintikApiError: RintikApiError};
});
