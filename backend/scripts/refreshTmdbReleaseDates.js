/**
 * 从 TMDB 重新拉取各片 release_dates，优先中国大陆公映日，写回 MySQL（覆盖错误/演示日期）
 *
 * 用法:
 *   cd backend && node scripts/refreshTmdbReleaseDates.js
 *   node scripts/refreshTmdbReleaseDates.js --only-coming
 * 或在管理端「电影管理」点「校正TMDB上映日(全库)」（与接口 POST /api/movies/refresh-release-dates-from-tmdb 等价）
 */
require('dotenv').config();
const path = require('path');
const { pool } = require(path.join(__dirname, '..', 'db'));
const tmdbSync = require(path.join(__dirname, '..', 'lib', 'tmdbSync'));

const onlyComing = process.argv.includes('--only-coming');

(async () => {
  try {
    if (!process.env.TMDB_API_KEY) {
      console.error('请先在 backend/.env 中设置 TMDB_API_KEY');
      process.exit(1);
    }
    console.log(onlyComing ? '仅刷新 status=coming 的 tmdb_* 影片…' : '刷新全部 tmdb_* 影片上映日…');
    const { ok, fail } = await tmdbSync.refreshTmdbReleaseDatesFromApi(pool, { onlyComing });
    console.log('成功', ok.length, '条');
    if (ok.length && ok.length <= 30) {
      ok.forEach((r) => console.log(' ', r._id, r.title, r.releaseDate, r.status));
    }
    console.log('失败', fail.length, '条');
    if (fail.length) {
      console.log(JSON.stringify(fail.slice(0, 20), null, 2));
    }
    await tmdbSync.recomputeMovieStatuses(pool);
    console.log('已再次重算全库 showing/coming');
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    try {
      await pool.end();
    } catch (_) {}
  }
})();
