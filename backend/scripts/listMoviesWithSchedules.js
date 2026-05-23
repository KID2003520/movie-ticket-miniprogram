require('dotenv').config();
const { pool } = require('../db');

const city = (() => {
  const arg = process.argv.find((a) => a.startsWith('--city='));
  return arg ? arg.split('=').slice(1).join('=') : '';
})();

(async () => {
  let sql = `
    SELECT m._id, m.title, m.status, m.hot,
           COUNT(DISTINCT s._id) AS scheduleCount,
           COUNT(DISTINCT s.cinemaId) AS cinemaCount,
           MIN(s.date) AS minDate,
           MAX(s.date) AS maxDate
    FROM schedules s
    JOIN movies m ON m._id = s.movieId
  `;
  const params = [];
  if (city) {
    sql += ` JOIN cinemas c ON c._id = s.cinemaId WHERE c.city = ? `;
    params.push(city);
  }
  sql += `
    GROUP BY m._id, m.title, m.status, m.hot
    ORDER BY scheduleCount DESC, m.hot DESC
  `;

  const [rows] = await pool.query(sql, params);
  const [[totSched]] = await pool.query(
    city
      ? `SELECT COUNT(*) AS c FROM schedules s JOIN cinemas c ON c._id=s.cinemaId WHERE c.city=?`
      : `SELECT COUNT(*) AS c FROM schedules`,
    city ? [city] : []
  );

  console.log(city ? `【${city}】` : '【全库】');
  console.log(`有排片的电影：${rows.length} 部，场次合计：${totSched.c} 条\n`);

  rows.forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(3, ' ')}. ${r.title || r._id}  (${r.status})  场次${r.scheduleCount}  影院${r.cinemaCount}  ${r.minDate}~${r.maxDate}`
    );
  });

  await pool.end();
})();
