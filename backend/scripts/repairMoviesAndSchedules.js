require('dotenv').config();
const { pool } = require('../db');
const tmdbSync = require('../lib/tmdbSync');
const { seedCinemaDaySchedules, dateRangeFromToday } = require('../lib/scheduleAllocator');

function nowDb() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ymd(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function repairMovieTitles() {
  // 先跑一轮导入更新，让重复 key 的电影尽量补齐真实标题
  await tmdbSync.importMoviesFromTmdbMultiModes(pool, {
    countPerMode: 40,
    totalLimit: 160
  });

  // 对仍为空标题的电影做兜底命名，避免前端出现“未命名电影”
  const [rows] = await pool.query(
    `
    SELECT _id
    FROM movies
    WHERE title IS NULL OR TRIM(title) = ''
  `
  );
  for (const r of rows || []) {
    const id = String(r._id);
    const fallbackTitle = `影片${id.slice(-6)}`;
    await pool.query(
      `
      UPDATE movies
      SET title = ?, updateTime = NOW()
      WHERE _id = ?
    `,
      [fallbackTitle, id]
    );
  }
  return (rows || []).length;
}

async function ensureSchedulesForAllCinemas() {
  const [cinemas] = await pool.query(`SELECT _id FROM cinemas ORDER BY _id`);
  const [movies] = await pool.query(
    `SELECT _id, price FROM movies WHERE status IN ('showing','coming') ORDER BY hot DESC, updateTime DESC LIMIT 48`
  );
  if (!cinemas.length || !movies.length) {
    return { createdSchedules: 0, createdSeats: 0, cinemas: cinemas.length, movies: movies.length };
  }

  const dates = dateRangeFromToday(7);
  let createdSchedules = 0;
  let createdSeats = 0;

  for (const c of cinemas) {
    const cinemaId = String(c._id);
    for (const dateStr of dates) {
      const part = await seedCinemaDaySchedules(pool, {
        cinemaId,
        dateStr,
        movies,
        skipOccupied: true
      });
      createdSchedules += part.newSchedules;
      createdSeats += part.seats;
    }
  }

  return {
    createdSchedules,
    createdSeats,
    cinemas: cinemas.length,
    movies: movies.length
  };
}

const schedulesOnly = process.argv.includes('--schedules-only');

(async () => {
  try {
    let fixedUnnamedCount = 0;
    if (!schedulesOnly) {
      fixedUnnamedCount = await repairMovieTitles();
    }
    const scheduleStats = await ensureSchedulesForAllCinemas();
    console.log(
      JSON.stringify(
        {
          ok: true,
          fixedUnnamedCount,
          ...scheduleStats
        },
        null,
        2
      )
    );
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch (_) {}
  }
})();

