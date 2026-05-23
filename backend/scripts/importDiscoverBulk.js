/**
 * TMDB Discover（热度排序）批量写入 movies 表，默认约 1000 部；已存在同一 tmdb id 则 ON DUPLICATE KEY UPDATE。
 *
 *   cd backend && node scripts/importDiscoverBulk.js
 *   node scripts/importDiscoverBulk.js 1200
 *   node scripts/importDiscoverBulk.js 1000 --rebuild-schedules   # 结束后重建全影院排片（电影很多时很慢）
 *
 * 需: .env 中 TMDB_API_KEY；网络不佳时可设 HTTPS_PROXY。
 * 等价于 POST /api/movies/import-discover-bulk（本脚本免 HTTP 与 x-sync-secret）。
 */
require('dotenv').config();
const path = require('path');
const { execFileSync } = require('child_process');
const { pool } = require(path.join(__dirname, '..', 'db'));
const tmdbSync = require(path.join(__dirname, '..', 'lib', 'tmdbSync'));

const DEFAULT_PRICE = Number(process.env.DEFAULT_MOVIE_PRICE_CENTS || 3500);
const rawArg = process.argv[2];
const count = Math.min(
  5000,
  Math.max(1, parseInt(rawArg && /^\d+$/.test(rawArg) ? rawArg : '1000', 10) || 1000)
);
const rebuildSchedules = process.argv.includes('--rebuild-schedules');

(async () => {
  try {
    if (!process.env.TMDB_API_KEY) {
      console.error('请在 backend/.env 中配置 TMDB_API_KEY');
      process.exit(1);
    }

    const maxPages = Math.ceil(count / 18) + 10;
    const sleepMs = Math.min(500, Math.max(80, Number(process.env.TMDB_DISCOVER_SLEEP_MS || 200)));

    console.log(
      `[importDiscoverBulk] 目标约 ${count} 部，maxPages=${maxPages}，sleepMs=${sleepMs}，默认票价(分)=${DEFAULT_PRICE}`
    );

    const result = await tmdbSync.importDiscoverPopularMovies(pool, {
      count,
      page: 1,
      maxPages,
      sleepMs,
      priceCents: DEFAULT_PRICE,
      idPrefix: 'tmdb',
      hotFrom: 'popularity'
    });

    const rec = await tmdbSync.recomputeMovieStatuses(pool);

    console.log(
      JSON.stringify(
        {
          ok: true,
          imported: (result.ok || []).length,
          failed: (result.fail || []).length,
          statusRowsUpdated: rec.affected,
          failSample: (result.fail || []).slice(0, 15)
        },
        null,
        2
      )
    );

    if (rebuildSchedules) {
      console.log('[importDiscoverBulk] 重建排片…');
      execFileSync(process.execPath, [path.join(__dirname, 'repairMoviesAndSchedules.js'), '--schedules-only'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
      });
    } else {
      console.log(
        '[importDiscoverBulk] 已跳过排片重建。需要时请执行: node scripts/repairMoviesAndSchedules.js --schedules-only'
      );
    }

    const [[{n}]] = await pool.query('SELECT COUNT(*) AS n FROM movies');
    console.log('[importDiscoverBulk] 当前 movies 总行数:', n);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    try {
      await pool.end();
    } catch (_) {}
  }
})();
