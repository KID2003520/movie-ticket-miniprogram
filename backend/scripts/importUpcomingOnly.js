/**
 * 仅从 TMDB「即将上映」导入一批电影，并重算上映状态
 * 用法: cd backend && node scripts/importUpcomingOnly.js
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

    console.log('1) TMDB /movie/upcoming …');
    const result = await tmdbSync.importMoviesFromTmdb(pool, {
      mode: 'upcoming',
      count: 25,
      maxPages: 15,
      priceCents: DEFAULT_PRICE,
      idPrefix: 'tmdb'
    });
    console.log('   upcoming 成功', (result.ok || []).length, '条, 失败', (result.fail || []).length);

    console.log('2) TMDB discover（明天及以后首映，上映日仅来自 API）…');
    const disc = await tmdbSync.importDiscoverFutureMovies(pool, {
      count: 40,
      maxPages: 12,
      page: 1,
      priceCents: DEFAULT_PRICE,
      idPrefix: 'tmdb'
    });
    console.log(
      '   discover 成功',
      (disc.ok || []).length,
      '条, 失败',
      (disc.fail || []).length
    );
    if (disc.fail && disc.fail.length) {
      console.log('   失败样例:', JSON.stringify(disc.fail.slice(0, 5), null, 2));
    }

    const status = await tmdbSync.recomputeMovieStatuses(pool);
    console.log('重算上映状态: 更新行数', status.affected);

    const comingTotal = (
      await pool.query(`SELECT COUNT(*) AS c FROM movies WHERE status='coming'`)
    )[0][0].c;
    console.log('最终「即将上映」影片总数（仅依据 API 上映日）:', comingTotal);
    if (Number(comingTotal) === 0) {
      console.log(
        '提示: 若 discover 超时或 upcoming 的 release_date 已早于今天，列表可能为空；请改善网络后重试或稍后再同步。'
      );
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    try {
      await pool.end();
    } catch (_) {}
  }
})();
