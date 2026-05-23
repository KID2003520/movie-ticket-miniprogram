/**
 * 从 TMDB 更新「正在热映」与「即将上映」片单，并按库内上映日重算 status（不改 off）。
 * 用法: cd backend && node scripts/refreshShowingAndUpcoming.js
 */
require('dotenv').config();
const path = require('path');
const { pool } = require(path.join(__dirname, '..', 'db'));
const tmdbSync = require(path.join(__dirname, '..', 'lib', 'tmdbSync'));

const DEFAULT_PRICE = Number(process.env.DEFAULT_MOVIE_PRICE_CENTS || 3500);

(async () => {
  try {
    if (!process.env.TMDB_API_KEY) {
      console.error('请先在 backend/.env 中设置 TMDB_API_KEY');
      process.exit(1);
    }

    console.log('1) TMDB now_playing（正在热映）…');
    const np = await tmdbSync.importMoviesFromTmdb(pool, {
      mode: 'now_playing',
      count: 40,
      maxPages: 20,
      priceCents: DEFAULT_PRICE,
      idPrefix: 'tmdb'
    });
    console.log('   成功', (np.ok || []).length, ', 失败', (np.fail || []).length);

    console.log('2) TMDB upcoming（即将上映）…');
    const up = await tmdbSync.importMoviesFromTmdb(pool, {
      mode: 'upcoming',
      count: 40,
      maxPages: 20,
      priceCents: DEFAULT_PRICE,
      idPrefix: 'tmdb'
    });
    console.log('   成功', (up.ok || []).length, ', 失败', (up.fail || []).length);

    console.log('3) TMDB discover（未来档期，补全即将上映）…');
    let disc = { ok: [], fail: [] };
    try {
      disc = await tmdbSync.importDiscoverFutureMovies(pool, {
        count: 40,
        maxPages: 15,
        page: 1,
        priceCents: DEFAULT_PRICE,
        idPrefix: 'tmdb'
      });
    } catch (e) {
      console.warn('   discover 跳过:', e.message || e);
    }
    console.log('   成功', (disc.ok || []).length, ', 失败', (disc.fail || []).length);

    const st = await tmdbSync.recomputeMovieStatuses(pool);
    console.log('4) 按上映日重算 showing/coming，更新行数:', st.affected);

    const [[showRows], [comeRows]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS c FROM movies WHERE status='showing'`),
      pool.query(`SELECT COUNT(*) AS c FROM movies WHERE status='coming'`)
    ]);
    console.log('当前统计 — 正在热映:', showRows[0].c, '；即将上映:', comeRows[0].c);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    try {
      await pool.end();
    } catch (_) {}
  }
})();
