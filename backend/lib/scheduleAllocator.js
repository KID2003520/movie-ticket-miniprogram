/**
 * 排片分配：同一影院、同一影厅、同一开始时间仅允许一场电影（一个 schedule）
 */
const LEGACY_HALL_BLUEPRINT = [
  { name: '1号厅', hallType: '3D' },
  { name: '2号厅', hallType: '普通厅' },
  { name: '3号厅', hallType: 'IMAX' },
  { name: '4号厅', hallType: '杜比全景声' }
];

/** 每个影厅一天内的放映时段（互不重叠） */
const DEFAULT_HALL_TIME_SLOTS = [
  { startTime: '10:30', endTime: '12:40', plus: 300 },
  { startTime: '13:30', endTime: '15:40', plus: 0 },
  { startTime: '16:30', endTime: '18:40', plus: 1200 },
  { startTime: '19:30', endTime: '21:40', plus: 800 }
];

const DEFAULT_SEAT_ROWS = 8;
const DEFAULT_SEAT_COLS = 12;

function safeInt(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

function nowDb() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function hallSlug(hallName) {
  return String(hallName || 'hall')
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .slice(0, 32);
}

/** 场次主键：由影院+日期+影厅+开始时间唯一确定（与影片无关，影片写在 movieId 字段） */
function makeScheduleId(cinemaId, dateStr, hallName, startTime) {
  const t = String(startTime || '').replace(':', '');
  return `${String(cinemaId)}_${dateStr}_${hallSlug(hallName)}_${t}`;
}

/**
 * 从影厅配置展开为「影厅 × 时段」列表；每个元素对应现实中可排的一场放映。
 */
function buildShowSlotsFromHallDefs(hallDefs) {
  const slots = [];
  for (let hi = 0; hi < hallDefs.length; hi++) {
    const h = hallDefs[hi];
    for (let si = 0; si < DEFAULT_HALL_TIME_SLOTS.length; si++) {
      const time = DEFAULT_HALL_TIME_SLOTS[si];
      slots.push({
        hallName: h.hallName,
        hallType: h.hallType,
        seatRows: h.seatRows,
        seatCols: h.seatCols,
        startTime: time.startTime,
        endTime: time.endTime,
        plus: time.plus,
        hallIndex: hi,
        slotIndex: si
      });
    }
  }
  return slots;
}

async function fetchHallDefinitions(q, cinemaId) {
  const [halls] = await q.query(
    `SELECT name, hallType, seatRows, seatCols FROM cinema_halls WHERE cinemaId = ? ORDER BY sortOrder ASC, createTime ASC, _id ASC`,
    [String(cinemaId)]
  );
  const mapRow = (h, idx) => ({
    hallName: String(h.name || '').trim() || `厅${idx + 1}`,
    hallType: String(h.hallType || '').trim() || '普通厅',
    seatRows: Math.max(4, Math.min(30, safeInt(h.seatRows, DEFAULT_SEAT_ROWS))),
    seatCols: Math.max(6, Math.min(30, safeInt(h.seatCols, DEFAULT_SEAT_COLS)))
  });
  if (halls && halls.length) return halls.map(mapRow);
  return LEGACY_HALL_BLUEPRINT.map((b, idx) => ({
    hallName: b.name,
    hallType: b.hallType,
    seatRows: DEFAULT_SEAT_ROWS,
    seatCols: DEFAULT_SEAT_COLS
  }));
}

/** 将电影列表轮询分配到各个「影厅+时段」，保证每个时段最多一部电影 */
function assignMoviesToShowSlots(slots, movies) {
  if (!slots.length || !movies.length) return [];
  return slots.map((slot, idx) => ({
    slot,
    movie: movies[idx % movies.length]
  }));
}

async function findScheduleAtSlot(q, cinemaId, dateStr, hallName, startTime) {
  const [rows] = await q.query(
    `
    SELECT _id, movieId FROM schedules
    WHERE cinemaId = ? AND date = ? AND hallName = ? AND startTime = ?
    LIMIT 1
    `,
    [String(cinemaId), dateStr, hallName, startTime]
  );
  return rows && rows[0] ? rows[0] : null;
}

async function insertScheduleWithSeats(q, payload) {
  const {
    scheduleId,
    movieId,
    cinemaId,
    slot,
    dateStr,
    priceCents,
    now = nowDb(),
    forceReplaceSeats = false
  } = payload;

  const totalSeats = slot.seatRows * slot.seatCols;

  const [existRows] = await q.query(`SELECT _id FROM schedules WHERE _id = ? LIMIT 1`, [scheduleId]);
  const existed = existRows && existRows.length > 0;

  await q.query(
    `
    INSERT INTO schedules (_id,movieId,cinemaId,hallName,hallType,date,startTime,endTime,price,totalSeats,availableSeats,status,createTime,updateTime)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      movieId=VALUES(movieId),
      cinemaId=VALUES(cinemaId),
      hallName=VALUES(hallName),
      hallType=VALUES(hallType),
      date=VALUES(date),
      startTime=VALUES(startTime),
      endTime=VALUES(endTime),
      price=VALUES(price),
      totalSeats=VALUES(totalSeats),
      availableSeats=VALUES(availableSeats),
      status=VALUES(status),
      updateTime=VALUES(updateTime)
    `,
    [
      scheduleId,
      movieId,
      cinemaId,
      slot.hallName,
      slot.hallType,
      dateStr,
      slot.startTime,
      slot.endTime,
      priceCents,
      totalSeats,
      totalSeats,
      'available',
      now,
      now
    ]
  );

  if (forceReplaceSeats) {
    await q.query(`DELETE FROM seats WHERE scheduleId = ?`, [scheduleId]);
  }

  const [countRows] = await q.query(`SELECT COUNT(*) AS c FROM seats WHERE scheduleId = ?`, [scheduleId]);
  const seatCnt = countRows && countRows[0] ? safeInt(countRows[0].c, 0) : 0;
  let seatsAdded = 0;

  if (seatCnt === 0) {
    const seatValues = [];
    for (let r = 1; r <= slot.seatRows; r++) {
      for (let c = 1; c <= slot.seatCols; c++) {
        seatValues.push([
          `${scheduleId}_${r}_${c}`,
          scheduleId,
          r,
          c,
          'available',
          null,
          now,
          now
        ]);
      }
    }
    if (seatValues.length) {
      await q.query(
        `INSERT INTO seats (_id,scheduleId,rowNum,colNum,status,orderId,createTime,updateTime) VALUES ?`,
        [seatValues]
      );
      seatsAdded = seatValues.length;
    }
  }

  return { scheduleId, existed: !!existed, seatsAdded };
}

/**
 * 按「影厅+时段」排片，同一影厅同一开始时间只会写入一条场次。
 */
async function seedCinemaDaySchedules(q, opts) {
  const {
    cinemaId,
    dateStr,
    movies,
    forceReplaceSeats = false,
    skipOccupied = false
  } = opts;

  const hallDefs = await fetchHallDefinitions(q, cinemaId);
  const slots = buildShowSlotsFromHallDefs(hallDefs);
  const assignments = assignMoviesToShowSlots(slots, movies);
  const now = nowDb();
  let schedules = 0;
  let newSchedules = 0;
  let seats = 0;
  let skipped = 0;

  for (const { slot, movie } of assignments) {
    const existing = await findScheduleAtSlot(q, cinemaId, dateStr, slot.hallName, slot.startTime);
    if (existing && skipOccupied) {
      skipped += 1;
      continue;
    }
    if (existing && String(existing.movieId) === String(movie._id)) {
      skipped += 1;
      continue;
    }

    const scheduleId = makeScheduleId(cinemaId, dateStr, slot.hallName, slot.startTime);
    const basePrice = safeInt(movie.price, 3500);
    const priceCents = Math.max(2500, basePrice + safeInt(slot.plus, 0));

    const r = await insertScheduleWithSeats(q, {
      scheduleId,
      movieId: String(movie._id),
      cinemaId: String(cinemaId),
      slot,
      dateStr,
      priceCents,
      now,
      forceReplaceSeats: forceReplaceSeats || !!existing
    });
    schedules += 1;
    if (!r.existed) newSchedules += 1;
    seats += r.seatsAdded;
  }

  return {
    slots: slots.length,
    schedules,
    newSchedules,
    seats,
    skipped
  };
}

function dateRangeFromToday(days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  const dates = [];
  for (let d = 0; d < days; d++) {
    const x = new Date(today.getTime() + d * 86400000);
    dates.push(`${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`);
  }
  return dates;
}

module.exports = {
  LEGACY_HALL_BLUEPRINT,
  DEFAULT_HALL_TIME_SLOTS,
  DEFAULT_SEAT_ROWS,
  DEFAULT_SEAT_COLS,
  nowDb,
  makeScheduleId,
  buildShowSlotsFromHallDefs,
  fetchHallDefinitions,
  assignMoviesToShowSlots,
  findScheduleAtSlot,
  insertScheduleWithSeats,
  seedCinemaDaySchedules,
  dateRangeFromToday
};
