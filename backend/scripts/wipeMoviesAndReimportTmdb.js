/**
 * 清空所有电影及关联订单/场次/座位/评论/收藏，再从 TMDB 多榜单 + discover 导入更多影片，并重算状态、重建排片。
 *
 * 用法:
 *   cd backend && node scripts/wipeMoviesAndReimportTmdb.js
 *   node scripts/wipeMoviesAndReimportTmdb.js --refresh-release-dates   # 导入后再逐条校正上映日（较慢）
 *   node scripts/wipeMoviesAndReimportTmdb.js --tmdb-only   # 列表失败时不降级猫眼（需 TMDB 网络可用）
 *
 * 接近 200+ 部：请在 backend/.env 配置稳定访问 TMDB（见 .env.example 中 HTTPS_PROXY 等），再执行本脚本。
 * 需: .env 中 TMDB_API_KEY；数据库已存在 cinemas（无影院时仅导入电影，排片会为 0）
 */
require('dotenv').config();
if (process.argv.includes('--tmdb-only')) {
  process.env.TMDB_NO_MAOYAN_FALLBACK = '1';
  delete process.env.TMDB_MAOYAN_FALLBACK;
}
const path = require('path');
const { execFileSync } = require('child_process');
const { pool } = require(path.join(__dirname, '..', 'db'));
const { ensureExtraTables } = require(path.join(__dirname, '..', 'lib', 'extraApi'));
const tmdbSync = require(path.join(__dirname, '..', 'lib', 'tmdbSync'));

const DEFAULT_PRICE = Number(process.env.DEFAULT_MOVIE_PRICE_CENTS || 3500);

async function wipeMovieEcosystem(conn) {
  const steps = [
    'DELETE FROM seats',
    'DELETE FROM orders',
    'DELETE FROM schedules',
    'DELETE FROM movie_comments',
    'DELETE FROM collections',
    'DELETE FROM movies'
  ];
  await conn.beginTransaction();
  try {
    for (const sql of steps) {
      try {
        await conn.query(sql);
      } catch (e) {
        const msg = String(e && e.message);
        if (/Unknown table|doesn't exist/i.test(msg)) continue;
        throw e;
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  }
}

(async () => {
  const doRefreshDates = process.argv.includes('--refresh-release-dates');

  try {
    if (!process.env.TMDB_API_KEY) {
      console.error('请先在 backend/.env 中设置 TMDB_API_KEY');
      process.exit(1);
    }

    console.log('0) 确保扩展表存在…');
    await ensureExtraTables(pool);

    console.log('1) 清空 seats / orders / schedules / movie_comments / collections / movies …');
    const conn = await pool.getConnection();
    try {
      await wipeMovieEcosystem(conn);
    } finally {
      conn.release();
    }
    console.log('   已清空。');

    console.log('2) TMDB 多榜单导入（now_playing / popular / upcoming / top_rated）…');
    const multi = await tmdbSync.importMoviesFromTmdbMultiModes(pool, {
      modes: ['now_playing', 'popular', 'upcoming', 'top_rated'],
      countPerMode: 80,
      totalLimit: 220,
      maxPages: 30,
      priceCents: DEFAULT_PRICE,
      idPrefix: 'tmdb',
      sleepMs: 180
    });
    console.log('   多榜单成功', multi.ok.length, '部, 失败', multi.fail.length, '条');
    if (multi.ok.length < 30 && process.env.TMDB_MAOYAN_FALLBACK === '1') {
      console.warn(
        '   提示: 导入偏少且已开 TMDB_MAOYAN_FALLBACK 时会混用猫眼；要纯 TMDB 请去掉 TMDB_MAOYAN_FALLBACK 并配置 HTTPS_PROXY。'
      );
    }

    console.log('3) TMDB discover（未来档期）…');
    let disc = { ok: [], fail: [] };
    try {
      disc = await tmdbSync.importDiscoverFutureMovies(pool, {
        count: 80,
        maxPages: 20,
        page: 1,
        priceCents: DEFAULT_PRICE,
        idPrefix: 'tmdb',
        sleepMs: 200
      });
    } catch (e) {
      console.warn('   discover(档期) 跳过:', e.message || e);
    }
    console.log('   discover(档期) 成功', (disc.ok || []).length, '条, 失败', (disc.fail || []).length, '条');

    console.log('3b) TMDB discover（全库热度，凑够片量）…');
    let pop = { ok: [], fail: [] };
    try {
      pop = await tmdbSync.importDiscoverPopularMovies(pool, {
        count: 120,
        maxPages: 25,
        page: 1,
        priceCents: DEFAULT_PRICE,
        idPrefix: 'tmdb',
        sleepMs: 200
      });
    } catch (e) {
      console.warn('   discover(热度) 跳过:', e.message || e);
    }
    console.log('   discover(热度) 成功', (pop.ok || []).length, '条, 失败', (pop.fail || []).length, '条');

    const st = await tmdbSync.recomputeMovieStatuses(pool);
    console.log('4) 重算上映状态, 更新行数', st.affected);

    if (doRefreshDates) {
      console.log('5) 校正 TMDB 上映日（较慢）…');
      const ref = await tmdbSync.refreshTmdbReleaseDatesFromApi(pool, { sleepMs: 240 });
      console.log('   校正成功', ref.ok.length, ', 失败', ref.fail.length);
      await tmdbSync.recomputeMovieStatuses(pool);
    } else {
      console.log('5) 跳过逐条校正上映日（需要时加参数 --refresh-release-dates 或单独跑 refreshTmdbReleaseDates.js）');
    }

    console.log('6) 重建全影院排片与座位（--schedules-only）…');
    execFileSync(process.execPath, [path.join(__dirname, 'repairMoviesAndSchedules.js'), '--schedules-only'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });

    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM movies');
    console.log('\n完成。当前 movies 行数:', n);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    try {
      await pool.end();
    } catch (_) {}
  }
})();
