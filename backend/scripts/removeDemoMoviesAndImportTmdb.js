/**
 * 删除 movies._id 以 demo_ 开头的「片库演示」占位数据（含关联订单/场次/座位/评论/收藏），
 * 再从 TMDB 导入真实电影并重算状态、重建全影院排片。
 *
 * 用法:
 *   cd backend && node scripts/removeDemoMoviesAndImportTmdb.js
 *   node scripts/removeDemoMoviesAndImportTmdb.js --skip-import        # 只删占位，不拉 TMDB
 *   node scripts/removeDemoMoviesAndImportTmdb.js --refresh-release-dates
 *   node scripts/removeDemoMoviesAndImportTmdb.js --tmdb-only
 *
 * 需: .env 中 TMDB_API_KEY（--skip-import 时不必）；库中有 cinemas（无影院时仍可导入电影，排片为 0）。
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

/** demo_ 前缀占位片（见 seedDemoMoviesToCount.js）；用 REGEXP 避免 LIKE 对 _ 的转义问题 */
const DEMO_MOVIE_PATTERN = "movieId REGEXP '^demo_'";
const DEMO_ID_PATTERN = "_id REGEXP '^demo_'";

async function removeDemoMoviesCascade(conn) {
  const [[{ cnt: demoMovieCount }]] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM movies WHERE ${DEMO_ID_PATTERN}`
  );
  const nDemo = Number(demoMovieCount) || 0;
  if (nDemo === 0) {
    return { demoMovies: 0, deletedSchedules: 0, deletedOrders: 0 };
  }

  const [schedRows] = await conn.query(`SELECT _id FROM schedules WHERE ${DEMO_MOVIE_PATTERN}`);
  const scheduleIds = (schedRows || []).map((r) => r._id);
  let deletedOrders = 0;
  let deletedSeats = 0;

  if (scheduleIds.length) {
    const ph = scheduleIds.map(() => '?').join(',');
    const [o] = await conn.query(`DELETE FROM orders WHERE scheduleId IN (${ph})`, scheduleIds);
    deletedOrders += o.affectedRows || 0;
    const [s] = await conn.query(`DELETE FROM seats WHERE scheduleId IN (${ph})`, scheduleIds);
    deletedSeats += s.affectedRows || 0;
  }

  const [o2] = await conn.query(`DELETE FROM orders WHERE ${DEMO_MOVIE_PATTERN}`);
  deletedOrders += o2.affectedRows || 0;

  const [sch] = await conn.query(`DELETE FROM schedules WHERE ${DEMO_MOVIE_PATTERN}`);
  const deletedSchedules = sch.affectedRows || 0;

  await conn.query(`DELETE FROM movie_comments WHERE ${DEMO_MOVIE_PATTERN}`);
  await conn.query(`DELETE FROM collections WHERE ${DEMO_MOVIE_PATTERN}`);

  const [m] = await conn.query(`DELETE FROM movies WHERE ${DEMO_ID_PATTERN}`);
  const deletedMovies = m.affectedRows || 0;

  return {
    demoMovies: deletedMovies,
    deletedSchedules,
    deletedOrders,
    deletedSeats
  };
}

(async () => {
  const skipImport = process.argv.includes('--skip-import');
  const doRefreshDates = process.argv.includes('--refresh-release-dates');

  try {
    console.log('0) 确保扩展表存在…');
    await ensureExtraTables(pool);

    console.log('1) 级联删除 demo_ 占位电影及相关数据…');
    const conn = await pool.getConnection();
    let stats;
    try {
      await conn.beginTransaction();
      stats = await removeDemoMoviesCascade(conn);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    console.log(
      '   删除电影',
      stats.demoMovies,
      '部；场次',
      stats.deletedSchedules,
      '；订单',
      stats.deletedOrders,
      '；座位行',
      stats.deletedSeats
    );

    if (skipImport) {
      const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM movies');
      console.log('\n已跳过 TMDB 导入。当前 movies 行数:', n);
      return;
    }

    if (!process.env.TMDB_API_KEY) {
      console.error('未设置 TMDB_API_KEY，无法导入真实电影。可设置 .env 或改用 --skip-import 仅清理占位。');
      process.exit(1);
    }

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
    console.log('   discover(档期) 成功', (disc.ok || []).length, '条');

    console.log('3b) TMDB discover（热度）…');
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
    console.log('   discover(热度) 成功', (pop.ok || []).length, '条');

    const st = await tmdbSync.recomputeMovieStatuses(pool);
    console.log('4) 重算上映状态, 更新行数', st.affected);

    if (doRefreshDates) {
      console.log('5) 校正 TMDB 上映日…');
      const ref = await tmdbSync.refreshTmdbReleaseDatesFromApi(pool, { sleepMs: 240 });
      console.log('   校正成功', ref.ok.length, ', 失败', ref.fail.length);
      await tmdbSync.recomputeMovieStatuses(pool);
    } else {
      console.log('5) 跳过逐条校正上映日（可加 --refresh-release-dates）');
    }

    console.log('6) 重建全影院排片与座位…');
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
