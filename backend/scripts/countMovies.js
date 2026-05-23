require('dotenv').config();
const { pool } = require('../db');
(async () => {
  const [[x]] = await pool.query('SELECT COUNT(*) AS c FROM movies');
  const [[d]] = await pool.query("SELECT COUNT(*) AS c FROM movies WHERE _id LIKE 'demo_%'");
  const [[t]] = await pool.query("SELECT COUNT(*) AS c FROM movies WHERE _id REGEXP '^tmdb_[0-9]+$'");
  console.log(JSON.stringify({ total: x.c, demo: d.c, tmdb: t.c }, null, 2));
  await pool.end();
})();
