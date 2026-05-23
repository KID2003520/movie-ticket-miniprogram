/**
 * 删除 MySQL 中未被当前后端使用的遗留表。
 * 当前仅 coupons（旧版券表，已由 coupon_templates + user_coupons 替代）。
 *
 *   cd backend && node scripts/dropUnusedTables.js
 */
require('dotenv').config();
const { pool } = require('../db');

const UNUSED_TABLES = ['coupons'];

async function tableExists(conn, schema, name) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [schema, name]
  );
  return rows.length > 0;
}

async function main() {
  const schema = process.env.DB_NAME || 'movie_ticket_db';
  const conn = await pool.getConnection();
  try {
    console.log(`[dropUnusedTables] 数据库: ${schema}`);
    for (const t of UNUSED_TABLES) {
      const exists = await tableExists(conn, schema, t);
      if (!exists) {
        console.log(`  跳过 ${t}（不存在）`);
        continue;
      }
      await conn.query(`DROP TABLE \`${t}\``);
      console.log(`  已删除表: ${t}`);
    }
    console.log('[dropUnusedTables] 完成');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[dropUnusedTables] 失败:', e.message || e);
  process.exit(1);
});
