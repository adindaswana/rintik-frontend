// Endpoint internal/monitoring. Tanpa field teknis yang bocor ke publik.
'use strict';
module.exports = function handler(req, res) {
  res.status(200).json({ status: 'ok' });
};
