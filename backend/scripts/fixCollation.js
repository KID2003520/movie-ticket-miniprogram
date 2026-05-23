require('dotenv').config();
const { pool, initDbCollation, alignOpenidTablesToUserIdCollation, getConnectionCollation, sqlCollateEq } = require('../db');

(async () => {
  await initDbCollation();
  await alignOpenidTablesToUserIdCollation();
  const coll = getConnectionCollation();
  const [rows] = await pool.query(
    `
      SELECT uc._id
      FROM user_coupons uc
      LEFT JOIN coupon_templates ct ON ${sqlCollateEq('ct._id', 'uc.templateId', coll)}
      WHERE uc._openid COLLATE ${coll} = ?
      LIMIT 1
    `,
    ['mock_openid_test']
  );
  console.log('[fixCollation] OK, collation=', coll, 'sample rows=', rows.length);
  process.exit(0);
})().catch((e) => {
  console.error('[fixCollation] FAIL:', e.message || e);
  process.exit(1);
});
