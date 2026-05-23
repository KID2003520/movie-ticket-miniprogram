/** 仅按库内 releaseDate 重算 showing/coming（不调 TMDB）。用法: node scripts/recomputeStatusesOnly.js */
require('dotenv').config();
const path = require('path');
const { pool } = require(path.join(__dirname, '..', 'db'));
const tmdbSync = require(path.join(__dirname, '..', 'lib', 'tmdbSync'));

(async () => {
  try {
    const r = await tmdbSync.recomputeMovieStatuses(pool);
    console.log('recomputeMovieStatuses:', r);
    const [[showRows], [comeRows]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS c FROM movies WHERE status='showing'`),
      pool.query(`SELECT COUNT(*) AS c FROM movies WHERE status='coming'`)
    ]);
    console.log('正在热映:', showRows[0].c, '；即将上映:', comeRows[0].c);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    try {
      await pool.end();
    } catch (_) {}
  }
})();
