export function validateQuery(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid history query.');
  const options = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value)]));
  if (Object.values(options).some(v => v.length > 2048)) throw new Error('History filter is too long.');
  for (const key of ['min', 'max']) if (options[key] && (!Number.isFinite(Number(options[key])) || Number(options[key]) < 0)) throw new Error('Byte thresholds must be positive numbers.');
  for (const key of ['from', 'to']) if (options[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(options[key]) || !Number.isFinite(Date.parse(options[key])) || new Date(options[key]).toISOString().slice(0, 10) !== options[key])) throw new Error('Use valid YYYY-MM-DD dates.');
  if (options.from && options.to && options.from > options.to) throw new Error('Start date must be on or before end date.');
  if (options.min && options.max && Number(options.min) >= Number(options.max)) throw new Error('Minimum usage must be lower than maximum usage.');
  for (const [key, values] of Object.entries({ range: ['day','week','month','year','all'], bucket: ['day','hour'], direction: ['total','received','sent'], unit: ['B','KB','MB','GB','TB'], sort: ['total','recent'], protocol: ['TCP','UDP'], scope: ['Internet','Local','Loopback'] })) if (options[key] && !values.includes(options[key])) throw new Error('Invalid ' + key + ' filter.');
  for (const [key, min, max] of [['weekday',0,6],['month',1,12],['hour',0,23],['year',2000,2100]]) if (options[key] !== undefined && options[key] !== '' && (!Number.isInteger(Number(options[key])) || Number(options[key]) < min || Number(options[key]) > max)) throw new Error('Invalid ' + key + ' filter.');
  if (options.offset && (!Number.isInteger(Number(options.offset)) || Number(options.offset) < 0)) throw new Error('Invalid results page.');
  return options;
}
export function queryHistory(store, input) {
  const options = validateQuery(input), result = store.query(options);
  if (options.export === 'csv') {
    const cell = value => '"' + String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""') + '"';
    const rows = [['Period','Application','Received bytes','Sent bytes','Total bytes','Services','Timezone'], ...result.matches.map(r => [r.period,r.app,r.received,r.sent,r.received+r.sent,r.services.join('; '),result.filters.timezone])];
    return { csv: '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') };
  }
  const offset = Number(options.offset) || 0;
  return { ...result, matchCount: result.matches.length, matches: result.matches.slice(offset, offset + 50), offset };
}
