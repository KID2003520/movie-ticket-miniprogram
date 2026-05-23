require('dotenv').config();
const { pool } = require('../db');

(async () => {
  const [r] = await pool.query(
    `SELECT _id, title, LEFT(releaseDate, 10) AS d, status FROM movies ORDER BY updateTime DESC LIMIT 20`
  );
  console.table(r);
  const [c] = await pool.query(
    `SELECT COUNT(*) AS n FROM movies WHERE LEFT(TRIM(releaseDate), 10) > CURDATE()`
  );
  const [today] = await pool.query(`SELECT CURDATE() AS t`);
  console.log('CURDATE', today[0]);
  console.log('future_release_count', c[0]);
  await pool.end();
})();
