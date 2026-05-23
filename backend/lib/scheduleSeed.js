/**
 * 按城市 + 影片状态批量生成场次（遵守：同一影厅同一开始时间仅一场电影）
 */
const {
  DEFAULT_SEAT_ROWS,
  DEFAULT_SEAT_COLS,
  nowDb,
  fetchHallDefinitions,
  seedCinemaDaySchedules,
  dateRangeFromToday
} = require('./scheduleAllocator');

const LEGACY_HALL_BLUEPRINT = [
  { name: '1号厅', hallType: '3D' },
  { name: '2号厅', hallType: '普通厅' },
  { name: '3号厅', hallType: 'IMAX' },
  { name: '4号厅', hallType: '杜比全景声' }
];

async function seedDefaultCinemaHallsIfEmpty(q, cinemaId) {
  const cid = String(cinemaId);
  const [cntRows] = await q.query(`SELECT COUNT(*) AS n FROM cinema_halls WHERE cinemaId = ?`, [cid]);
  const n = cntRows && cntRows[0] ? Number(cntRows[0].n) : 0;
  if (n > 0) return;
  const now = nowDb();
  for (let i = 0; i < LEGACY_HALL_BLUEPRINT.length; i++) {
    const b = LEGACY_HALL_BLUEPRINT[i];
    const hid = `h_${cid}_${i + 1}`;
    await q.query(
      `INSERT INTO cinema_halls (_id,cinemaId,name,hallType,seatRows,seatCols,sortOrder,createTime,updateTime) VALUES (?,?,?,?,?,?,?,?,?)`,
      [hid, cid, b.name, b.hallType, DEFAULT_SEAT_ROWS, DEFAULT_SEAT_COLS, i, now, now]
    );
  }
}

/** 清除某城市影院在日期范围内的场次（用于纠正旧逻辑产生的冲突排片） */
async function clearCitySchedulesInRange(q, { city, dates }) {
  const [cinemas] = await q.query(`SELECT _id FROM cinemas WHERE city = ?`, [city]);
  const ids = (cinemas || []).map((c) => String(c._id));
  if (!ids.length || !dates.length) return { deletedSchedules: 0 };

  const ph = ids.map(() => '?').join(',');
  const datePh = dates.map(() => '?').join(',');

  await q.query(
    `
    DELETE s FROM seats s
    INNER JOIN schedules sch ON sch._id = s.scheduleId
    WHERE sch.cinemaId IN (${ph}) AND sch.date IN (${datePh})
    `,
    [...ids, ...dates]
  );
  const [r] = await q.query(
    `DELETE FROM schedules WHERE cinemaId IN (${ph}) AND date IN (${datePh})`,
    [...ids, ...dates]
  );
  return { deletedSchedules: r.affectedRows || 0 };
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} q
 * @param {{ city?: string, movieStatus?: string, days?: number, cinemaIds?: string[], maxMovies?: number, replaceExisting?: boolean }} opts
 */
async function seedSchedulesForCityMovies(q, opts = {}) {
  const city = opts.city ? String(opts.city).trim() : '';
  const movieStatus = opts.movieStatus ? String(opts.movieStatus).trim() : 'showing';
  const days = Math.max(1, Math.min(30, Number(opts.days) || 7));
  const maxMovies = Math.max(1, Math.min(200, Number(opts.maxMovies) || 48));
  const replaceExisting = !!opts.replaceExisting;

  let cinemas;
  if (opts.cinemaIds && opts.cinemaIds.length) {
    const ph = opts.cinemaIds.map(() => '?').join(',');
    const [rows] = await q.query(`SELECT _id, name, city FROM cinemas WHERE _id IN (${ph})`, opts.cinemaIds);
    cinemas = rows || [];
  } else if (city) {
    const [rows] = await q.query(`SELECT _id, name, city FROM cinemas WHERE city = ? ORDER BY _id`, [city]);
    cinemas = rows || [];
  } else {
    const [rows] = await q.query(`SELECT _id, name, city FROM cinemas ORDER BY _id`);
    cinemas = rows || [];
  }

  const [movies] = await q.query(
    `SELECT _id, title, price FROM movies WHERE status = ? ORDER BY hot DESC, updateTime DESC LIMIT ?`,
    [movieStatus, maxMovies]
  );

  if (!cinemas.length) {
    return { cinemas: 0, movies: movies.length, schedules: 0, seats: 0, message: '未找到影院' };
  }
  if (!movies.length) {
    return {
      cinemas: cinemas.length,
      movies: 0,
      schedules: 0,
      seats: 0,
      message: `未找到 status=${movieStatus} 的影片`
    };
  }

  const dates = dateRangeFromToday(days);
  if (replaceExisting && city) {
    await clearCitySchedulesInRange(q, { city, dates });
  }

  let scheduleCount = 0;
  let newSchedules = 0;
  let seatCount = 0;
  let skipped = 0;
  let slotsPerDay = 0;

  for (const c of cinemas) {
    const cinemaId = String(c._id);
    await seedDefaultCinemaHallsIfEmpty(q, cinemaId);
    const hallDefs = await fetchHallDefinitions(q, cinemaId);
    slotsPerDay = hallDefs.length * 4;

    for (const dateStr of dates) {
      const part = await seedCinemaDaySchedules(q, {
        cinemaId,
        dateStr,
        movies,
        forceReplaceSeats: replaceExisting,
        skipOccupied: !replaceExisting
      });
      scheduleCount += part.schedules;
      newSchedules += part.newSchedules;
      seatCount += part.seats;
      skipped += part.skipped;
    }
  }

  return {
    city: city || '(指定影院)',
    maxMovies,
    slotsPerCinemaPerDay: slotsPerDay,
    cinemas: cinemas.length,
    cinemaNames: cinemas.map((x) => x.name),
    movies: movies.length,
    movieTitles: movies.slice(0, 8).map((x) => x.title),
    days,
    schedules: scheduleCount,
    newSchedules,
    seats: seatCount,
    skipped,
    note: '每个影厅每个开始时间仅排一部电影，多部电影轮询占用不同时段/影厅'
  };
}

module.exports = {
  seedSchedulesForCityMovies,
  seedDefaultCinemaHallsIfEmpty,
  clearCitySchedulesInRange,
  fetchHallDefinitions
};
