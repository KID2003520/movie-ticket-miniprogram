const mysql = require('mysql2/promise');

const dbName = process.env.DB_NAME || 'movie_ticket_db';

const poolConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: dbName,
  connectionLimit: 10,
  timezone: 'local',
  // true：DATE/DATETIME 以字符串返回，避免 mysql2 转成 Date 再 JSON 序列化成 UTC 导致上映日错一天
  dateStrings: true
};

/** 与 users._id 一致，避免 utf8mb4_general_ci / utf8mb4_unicode_ci 混用导致 “Illegal mix of collations” */
let connectionCollation = 'utf8mb4_general_ci';

/**
 * 在创建连接池之前读取 users._id 的排序规则（不占用池内连接，避免首连 SET NAMES 尚未就绪）。
 */
async function initDbCollation() {
  const conn = await mysql.createConnection(poolConfig);
  try {
    const [rows] = await conn.query(
      `
      SELECT COLLATION_NAME AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = '_id'
      LIMIT 1
      `,
      [dbName]
    );
    const c = rows && rows[0] && rows[0].c;
    if (c && /^(utf8mb4_general_ci|utf8mb4_unicode_ci|utf8mb4_0900_ai_ci)$/.test(String(c))) {
      connectionCollation = String(c);
    }
    console.log('[db] SET NAMES utf8mb4 COLLATE', connectionCollation, '(aligned with users._id)');
  } catch (e) {
    console.warn('[db] initDbCollation:', e.message || e);
  } finally {
    await conn.end();
  }
}

const pool = mysql.createPool(poolConfig);

pool.on('connection', (connection) => {
  connection.query(`SET NAMES utf8mb4 COLLATE ${connectionCollation}`, (err) => {
    if (err) console.error('[db] SET NAMES on connection:', err.message || err);
  });
});

/** 将含 openid 的表整表转换为与 users._id 相同的 collation，消除跨表比较报错 */
async function alignOpenidTablesToUserIdCollation() {
  const coll = connectionCollation;
  const tables = [
    'admin_security_audit',
    'user_points_balance',
    'user_points_log',
    'user_profile_audit',
    'collections',
    'movie_comments',
    'orders',
    'user_coupons',
    'coupon_purchase_orders',
    'coupon_templates'
  ];
  for (const t of tables) {
    try {
      await pool.query(`ALTER TABLE \`${t}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE ${coll}`);
    } catch (e) {
      console.warn(`[db] align collation skip ${t}:`, e.message || e);
    }
  }
}

function getConnectionCollation() {
  return connectionCollation;
}

/** JOIN/WHERE 中两侧字符串强制同一 collation，避免 Illegal mix of collations */
function sqlCollateEq(leftExpr, rightExpr, coll = connectionCollation) {
  const c = coll || connectionCollation;
  return `${leftExpr} COLLATE ${c} = ${rightExpr} COLLATE ${c}`;
}

module.exports = { pool, initDbCollation, alignOpenidTablesToUserIdCollation, getConnectionCollation, sqlCollateEq };
