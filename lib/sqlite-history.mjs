import { DatabaseSync } from 'node:sqlite';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AnalyticsStore } from './analytics.mjs';

const DAY = 86400000;
// One writer (the companion), transactional checkpoints, no database extensions.
// Reuse the calendar/DST-aware analytics engine across desktop and legacy views.
export class SQLiteHistory extends AnalyticsStore {
  constructor(directory, { legacyDirectory = null } = {}) {
    super(directory);
    this.legacyDirectory = legacyDirectory;
    this.db = null;
    this.prunedAt = 0;
    this.pendingCoverage = new Map();
  }
  async load(now = Date.now()) {
    await mkdir(this.directory, { recursive: true });
    this.db = new DatabaseSync(join(this.directory, 'history.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS hourly_usage(key TEXT PRIMARY KEY, at INTEGER NOT NULL, app TEXT NOT NULL, service TEXT NOT NULL, record TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS usage_time ON hourly_usage(at);
      CREATE INDEX IF NOT EXISTS usage_app_time ON hourly_usage(app, at);
      CREATE INDEX IF NOT EXISTS usage_service_time ON hourly_usage(service, at);
      CREATE TABLE IF NOT EXISTS coverage(at INTEGER PRIMARY KEY, seconds REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS observation_minutes(at INTEGER PRIMARY KEY, snapshot_seconds REAL DEFAULT 0, capture_seconds REAL DEFAULT 0, lost_events INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS adapter_minutes(at INTEGER, id TEXT, received REAL, sent REAL, errors REAL, PRIMARY KEY(at,id));
      CREATE TABLE IF NOT EXISTS connection_sightings(key TEXT PRIMARY KEY, day INTEGER, app TEXT, first_seen INTEGER, last_seen INTEGER, record TEXT);
      CREATE INDEX IF NOT EXISTS sightings_time ON connection_sightings(day);
      CREATE TABLE IF NOT EXISTS legacy_imports(file TEXT PRIMARY KEY);
      INSERT OR IGNORE INTO migrations VALUES(1);`);
    if (this.legacyDirectory) await this.importLegacy();
    for (const { record } of this.db.prepare('SELECT record FROM hourly_usage WHERE at >= ?').all(now - 400 * DAY)) {
      const r = JSON.parse(record), day = new Date(r.at).toISOString().slice(0, 10);
      if (!this.days.has(day)) this.days.set(day, new Map());
      this.days.get(day).set(r.key, r);
    }
    for (const row of this.db.prepare('SELECT * FROM coverage WHERE at >= ?').all(now - 400 * DAY)) this.observedHours.set(row.at, row.seconds);
  }
  async importLegacy() {
    let files;
    try { files = await readdir(this.legacyDirectory); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    for (const file of files.filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
      if (this.db.prepare('SELECT 1 FROM legacy_imports WHERE file=?').get(file)) continue;
      try {
        const data = JSON.parse(await readFile(join(this.legacyDirectory, file), 'utf8'));
        if (!Array.isArray(data.records)) throw new Error('Missing records');
        this.transaction(() => {
          for (const r of data.records) this.saveRecord(r, true);
          for (const h of data.coverage || []) this.db.prepare('INSERT OR IGNORE INTO coverage VALUES(?,?)').run(h.at, h.seconds);
          this.db.prepare('INSERT INTO legacy_imports VALUES(?)').run(file);
        });
      } catch (error) { this.error = `Legacy history could not be imported (${file}): ${error.message}`; }
    }
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { fn(); this.db.exec('COMMIT'); } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  saveRecord(r, ignore = false) {
    this.db.prepare(`INSERT ${ignore ? 'OR IGNORE' : ''} INTO hourly_usage VALUES(?,?,?,?,?) ${ignore ? '' : 'ON CONFLICT(key) DO UPDATE SET record=excluded.record'}`)
      .run(r.key, r.at, r.app, r.service.key, JSON.stringify(r));
  }
  ingest(batch, now = Date.now(), snapshot = null) {
    super.ingest(batch, now, snapshot);
    if (batch.type !== 'traffic' || !Number.isFinite(batch.elapsed) || batch.elapsed <= 0) return;
    const at = Math.floor(now / 60000) * 60000;
    const coverage=this.pendingCoverage.get(at)||{seconds:0,lost:0};
    coverage.seconds=Math.min(60,coverage.seconds+batch.elapsed);coverage.lost+=Math.max(0,Number(batch.eventsLost)||0);
    this.pendingCoverage.set(at,coverage);
  }
  observe(snapshot, elapsed = 8, now = Date.now()) {
    const at = Math.floor(now / 60000) * 60000, day = Math.floor(now / DAY) * DAY;
    try {
      this.transaction(() => {
        this.db.prepare(`INSERT INTO observation_minutes(at,snapshot_seconds) VALUES(?,?)
          ON CONFLICT(at) DO UPDATE SET snapshot_seconds=MIN(60,snapshot_seconds+excluded.snapshot_seconds)`).run(at, Math.min(8, Math.max(0, elapsed)));
        for (const a of snapshot.adapters || []) {
          // Rates derive from Windows counters; never attribute these bytes to apps.
          this.db.prepare(`INSERT INTO adapter_minutes VALUES(?,?,?,?,?) ON CONFLICT(at,id) DO UPDATE SET received=received+excluded.received,sent=sent+excluded.sent,errors=excluded.errors`)
            .run(at, String(a.id), (a.receiveRate || 0) * elapsed, (a.sendRate || 0) * elapsed, (a.receivedErrors || 0) + (a.sentErrors || 0));
        }
        for (const c of snapshot.connections || []) {
          const key = JSON.stringify([day, c.app, c.pid, c.protocol, c.localAddress, c.localPort, c.remoteAddress, c.remotePort]);
          this.db.prepare(`INSERT INTO connection_sightings VALUES(?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET last_seen=excluded.last_seen,record=excluded.record`)
            .run(key, day, c.app, now, now, JSON.stringify(c));
        }
        if (day !== this.prunedAt) {
          for (const [table, column] of [['hourly_usage', 'at'], ['coverage', 'at'], ['observation_minutes', 'at'], ['adapter_minutes', 'at'], ['connection_sightings', 'day']])
            this.db.prepare(`DELETE FROM ${table} WHERE ${column} < ?`).run(now - 400 * DAY);
          this.prunedAt = day;
        }
      });
    } catch (error) { this.error = 'Observation history could not be saved: ' + error.message; }
  }
  async flush() {
    if (!this.dirty.size) return;
    const days = [...this.dirty];
    try {
      this.transaction(() => {
        for (const day of days) {
          for (const r of this.days.get(day)?.values() || []) this.saveRecord(r);
          for (const [at, seconds] of this.observedHours) if (new Date(at).toISOString().startsWith(day))
            this.db.prepare('INSERT INTO coverage VALUES(?,?) ON CONFLICT(at) DO UPDATE SET seconds=excluded.seconds').run(at, seconds);
        }
        for(const [at,coverage] of this.pendingCoverage) this.db.prepare(`INSERT INTO observation_minutes(at,capture_seconds,lost_events) VALUES(?,?,?)
          ON CONFLICT(at) DO UPDATE SET capture_seconds=MIN(60,capture_seconds+excluded.capture_seconds),lost_events=lost_events+excluded.lost_events`).run(at,coverage.seconds,coverage.lost);
      });
      for (const day of days) this.dirty.delete(day);
      this.pendingCoverage.clear();
    } catch (error) { this.error = 'History could not be saved: ' + error.message; }
  }
  timeline(from = Date.now() - 7 * DAY) {
    return this.db.prepare(`SELECT at, snapshot_seconds AS snapshotSeconds,capture_seconds AS captureSeconds,lost_events AS lostEvents FROM observation_minutes WHERE at>=? ORDER BY at`).all(from);
  }
  observationSummary(from = Date.now() - 7 * DAY) {
    const adapters=this.db.prepare('SELECT COALESCE(SUM(received),0) AS received,COALESCE(SUM(sent),0) AS sent FROM adapter_minutes WHERE at>=?').get(from);
    const firstDay=Math.floor(from/DAY)*DAY;
    const apps=this.db.prepare(`SELECT app,COUNT(*) AS sightings,COUNT(DISTINCT json_extract(record,'$.remoteAddress')) AS destinations,MIN(first_seen) AS firstSeen,MAX(last_seen) AS lastSeen
      FROM connection_sightings WHERE day>=? AND json_extract(record,'$.scope')='Internet' GROUP BY app ORDER BY destinations DESC,app LIMIT 8`).all(firstDay);
    const counts=this.db.prepare(`SELECT COUNT(DISTINCT app) AS apps,COUNT(DISTINCT json_extract(record,'$.remoteAddress')) AS destinations FROM connection_sightings WHERE day>=? AND json_extract(record,'$.scope')='Internet'`).get(firstDay);
    return {...adapters,...counts,recentApps:apps};
  }
  query(options = {}, now = Date.now()) {
    return { ...super.query(options, now), collectionTimeline: this.timeline(now - 7 * DAY), observationSummary:this.observationSummary(now - 7 * DAY), storage: 'SQLite · this computer' };
  }
  async close() { await this.flush(); this.db?.close(); this.db = null; }
}
