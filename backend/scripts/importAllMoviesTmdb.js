/**
 * 多榜单聚合导入电影到数据库（需先配置 TMDB_API_KEY）
 * 用法:
 *   cd backend
 *   node scripts/importAllMoviesTmdb.js
 */
require('dotenv').config();
const path = require('path');
const { pool } = require(path.join(__dirname, '..', 'db'));
const tmdbSync = require(path.join(__dirname, '..', 'lib', 'tmdbSync'));

(async () => {
  try {
    if (!process.env.TMDB_API_KEY) {
      console.error('请先在 backend/.env 中设置 TMDB_API_KEY=你的密钥');
      process.exit(1);
    }

    const result = await tmdbSync.importMoviesFromTmdbMultiModes(pool, {
      modes: ['now_playing', 'popular', 'upcoming', 'top_rated'],
      countPerMode: 30,
      totalLimit: 120
    });

    console.log('多榜单导入完成');
    console.log('成功:', result.ok.length);
    console.log('失败:', result.fail.length);
    if (result.fail.length) {
      console.log(JSON.stringify(result.fail.slice(0, 30), null, 2));
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
