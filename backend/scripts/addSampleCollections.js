require('dotenv').config();
const { pool } = require('../db');

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

async function main() {
  const conn = await pool.getConnection();
  let inserted = 0;
  try {
    const [users] = await conn.query(`SELECT _id FROM users ORDER BY createTime DESC LIMIT 12`);
    const [movies] = await conn.query(`SELECT _id, title, poster FROM movies ORDER BY hot DESC, updateTime DESC LIMIT 20`);
    if (!users.length || !movies.length) {
      console.log('用户或电影数据不足，未写入 collections。');
      return;
    }

    await conn.beginTransaction();
    for (let i = 0; i < users.length; i++) {
      const openid = String(users[i]._id);
      const picks = 2 + (i % 3); // 每个用户 2~4 条收藏
      for (let j = 0; j < picks; j++) {
        const m = movies[(i * 3 + j) % movies.length];
        const movieId = String(m._id);
        const id = `col_seed_${openid}_${movieId}`;
        const [ret] = await conn.query(
          `
          INSERT INTO collections (_id, _openid, movieId, title, poster, createTime)
          VALUES (?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE
            title=VALUES(title),
            poster=VALUES(poster)
        `,
          [id, openid, movieId, m.title || '', m.poster || '', now()]
        );
        if (ret && ret.affectedRows === 1) inserted += 1;
      }
    }

    await conn.commit();
    console.log(`完成：collections 新增 ${inserted} 条。`);
  } catch (e) {
    await conn.rollback();
    console.error('写入失败：', e.message || e);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
