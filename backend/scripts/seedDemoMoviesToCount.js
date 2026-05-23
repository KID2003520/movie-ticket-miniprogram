/**
 * 将 movies 表补足到指定条数（默认 1000），使用 demo_ 前缀占位数据，便于毕设演示。
 * 与 TMDB 无关；真实 TMDB 导入请在可访问 api.themoviedb.org 的环境执行管理员「批量约1000部」或 importDiscoverPopularMovies。
 *
 *   cd backend && node scripts/seedDemoMoviesToCount.js
 *   node scripts/seedDemoMoviesToCount.js 1000
 */
require('dotenv').config();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { pool } = require(path.join(__dirname, '..', 'db'));

function nowDb() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const TARGET = Math.min(50000, Math.max(1, parseInt(process.argv[2] || '1000', 10) || 1000));

(async () => {
  try {
    const [[row]] = await pool.query('SELECT COUNT(*) AS c FROM movies');
    const cur = Number(row.c) || 0;
    const need = TARGET - cur;
    console.log(`[seed] 当前 ${cur} 部，目标 ${TARGET} 部，需插入 ${need} 条`);

    if (need <= 0) {
      console.log('[seed] 已达目标，退出');
      await pool.end();
      return;
    }

    const price = Number(process.env.DEFAULT_MOVIE_PRICE_CENTS || 3500);
    const batchSize = 80;
    let inserted = 0;

    for (let offset = 0; offset < need; offset += batchSize) {
      const n = Math.min(batchSize, need - offset);
      const rows = [];
      for (let i = 0; i < n; i++) {
        const id = `demo_${uuidv4().replace(/-/g, '')}`;
        const seq = cur + inserted + i + 1;
        rows.push([
          id,
          `片库演示 #${seq}`,
          `https://picsum.photos/seed/demo${seq}/300/420`,
          7 + (seq % 20) / 10,
          '剧情',
          90 + (seq % 60),
          '',
          '',
          '演示占位数据，可在有 TMDB 网络时用管理员批量导入替换。',
          '2024-06-15',
          price,
          'showing',
          Math.min(9999, 100 + seq),
          nowDb(),
          nowDb()
        ]);
      }

      await pool.query(
        `
        INSERT INTO movies (_id,title,poster,rating,genre,duration,director,actors,description,releaseDate,price,status,hot,createTime,updateTime)
        VALUES ?
      `,
        [rows]
      );
      inserted += n;
      console.log(`[seed] 已写入 ${inserted}/${need}`);
    }

    const [[fin]] = await pool.query('SELECT COUNT(*) AS c FROM movies');
    console.log('[seed] 完成，当前总数:', fin.c);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    try {
      await pool.end();
    } catch (_) {}
  }
})();
