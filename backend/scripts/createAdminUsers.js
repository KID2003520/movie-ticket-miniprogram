require('dotenv').config();
const { pool } = require('../db');

async function main() {
  const admins = [
    { phone: '13800000001', password: 'Admin@123' },
    { phone: '13800000002', password: 'Admin@123' },
    { phone: '13800000003', password: 'Admin@123' }
  ];

  const sql =
    "INSERT INTO users (_id,nickName,avatarUrl,phone,gender,role,level,isAdmin,password,createTime,updateTime) " +
    "VALUES (?,?,?,?,0,'admin','admin',1,?,NOW(),NOW()) " +
    "ON DUPLICATE KEY UPDATE " +
    "nickName=VALUES(nickName), phone=VALUES(phone), role='admin', level='admin', isAdmin=1, password=VALUES(password), updateTime=NOW()";

  for (const a of admins) {
    const openid = `mock_openid_${a.phone}`;
    const nickName = `管理员${a.phone.slice(-4)}`;
    await pool.query(sql, [openid, nickName, 'https://picsum.photos/100/100?random=900', a.phone, a.password]);
  }

  const [rows] = await pool.query(
    "SELECT _id, phone, role, level, isAdmin FROM users WHERE phone IN ('13800000001','13800000002','13800000003') ORDER BY phone"
  );
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
