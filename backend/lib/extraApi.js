/**
 * 补充 REST：影院、场次、电影详情、搜索、收藏、评论、用户统计、管理端用户列表
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const { v4: uuidv4 } = require('uuid');
const tmdbSync = require('./tmdbSync');
const { mapMovieForApi: mapMovieRow } = require('./movieApiFormat');
const { requestBaseUrl, mapMovieForApiWithPoster, toProxiedPoster } = require('./posterProxy');

function mapMovieRowForReq(req, m) {
  return mapMovieForApiWithPoster(m, requestBaseUrl(req));
}
const pointsService = require('./pointsService');
const orderLifecycle = require('./orderLifecycle');
const alipayPay = require('./alipayPay');
const { getConnectionCollation, sqlCollateEq } = require('../db');
const {
  fetchHallDefinitions,
  buildShowSlotsFromHallDefs,
  findScheduleAtSlot,
  insertScheduleWithSeats,
  seedCinemaDaySchedules,
  dateRangeFromToday,
  makeScheduleId
} = require('./scheduleAllocator');

/** 无影厅配置时，排期使用的默认厅名与类型（与历史重建逻辑一致） */
const LEGACY_HALL_BLUEPRINT = [
  { name: '1号厅', hallType: '3D' },
  { name: '2号厅', hallType: '普通厅' },
  { name: '3号厅', hallType: 'IMAX' },
  { name: '4号厅', hallType: '杜比全景声' }
];

/** 与厅顺序循环匹配的开场时段与加价（分） */
const DEFAULT_HALL_TIME_SLOTS = [
  { startTime: '10:30', endTime: '12:40', plus: 300 },
  { startTime: '13:30', endTime: '15:40', plus: 0 },
  { startTime: '16:30', endTime: '18:40', plus: 1200 },
  { startTime: '19:30', endTime: '21:40', plus: 800 }
];

const DEFAULT_COUPON_TEMPLATES = [
  { title: '新客立减券', amount: 1200, minAmount: 3000, sellPrice: 199, validDays: 30, stock: 99999 },
  { title: '周末观影券', amount: 2000, minAmount: 5000, sellPrice: 399, validDays: 20, stock: 99999 },
  { title: '无门槛小额券', amount: 600, minAmount: 0, sellPrice: 99, validDays: 15, stock: 99999 }
];

function parsePreferenceTags(raw) {
  if (raw == null || raw === '') return [];
  try {
    const j = JSON.parse(String(raw));
    if (!Array.isArray(j)) return [];
    return j.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8);
  } catch (_) {
    return [];
  }
}

function normalizePreferenceTagsInput(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : String(input).split(/[,，]/);
  const out = [];
  const re = /^[\u4e00-\u9fa5a-zA-Z0-9·\s]{1,16}$/;
  for (const x of arr) {
    const t = String(x || '').trim().slice(0, 16);
    if (!t || !re.test(t)) continue;
    if (out.length >= 8) break;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

function maskPhoneDisplay(p) {
  const s = String(p || '').trim();
  if (!/^1[3-9]\d{9}$/.test(s)) return '';
  return `${s.slice(0, 3)}****${s.slice(7)}`;
}

/** ensureExtraTables 等模块级函数使用（与 server.js helpers.safeInt 语义一致） */
function safeInt(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

async function appendProfileAudit(pool, { openid, fieldKey, oldSummary, newSummary, req }) {
  const aid = 'upa_' + uuidv4().replace(/-/g, '').slice(0, 22);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim()
    .slice(0, 64);
  const ua = String(req.headers['user-agent'] || '').slice(0, 200);
  await pool.query(
    `INSERT INTO user_profile_audit (_id,_openid,field_key,old_summary,new_summary,ip,user_agent,createTime)
     VALUES (?,?,?,?,?,?,?,NOW())`,
    [aid, openid, fieldKey, String(oldSummary || '').slice(0, 255), String(newSummary || '').slice(0, 255), ip, ua]
  );
}

function summarizeForAudit(label, val, max = 48) {
  const t = String(val || '').trim();
  if (!t) return `${label}:(空)`;
  return `${label}:${t.length > max ? `${t.slice(0, max)}…` : t}`;
}

async function appendAdminSecurityAudit(pool, req, { operatorOpenid, category, action, summary }) {
  const id = 'asa_' + uuidv4().replace(/-/g, '').slice(0, 22);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim()
    .slice(0, 64);
  const ua = String(req.headers['user-agent'] || '').slice(0, 255);
  await pool.query(
    `
    INSERT INTO admin_security_audit (_id,operator_openid,category,action,summary,ip,user_agent,createTime)
    VALUES (?,?,?,?,?,?,?,NOW())
    `,
    [
      id,
      String(operatorOpenid || '').slice(0, 128),
      String(category || '').slice(0, 32),
      String(action || '').slice(0, 64),
      String(summary || '').slice(0, 512),
      ip,
      ua
    ]
  );
}

function needEnrichMovie(m) {
  if (!m) return false;
  const missingPoster = !String(m.poster || '').trim();
  const missingDesc = !String(m.description || '').trim();
  const missingDirector = !String(m.director || '').trim();
  const missingActors = !String(m.actors || '').trim();
  const missingGenre = !String(m.genre || '').trim();
  const missingReleaseDate = !String(m.releaseDate || '').trim();
  const duration = Number(m.duration || 0);
  const rating = Number(m.rating || 0);
  const missingDuration = !Number.isFinite(duration) || duration <= 0;
  const missingRating = !Number.isFinite(rating) || rating <= 0;
  return (
    missingPoster ||
    missingDesc ||
    missingDirector ||
    missingActors ||
    missingGenre ||
    missingReleaseDate ||
    missingDuration ||
    missingRating
  );
}

function requireTmdbSyncSecret(req, res) {
  const secret = process.env.TMDB_SYNC_SECRET;
  if (!secret) return true;
  const h = req.headers['x-sync-secret'] || req.query.secret;
  if (h !== secret) {
    res.status(403).json({ code: -1, message: 'forbidden' });
    return false;
  }
  return true;
}

function registerExtraRoutes(app, pool, helpers) {
  const { getOpenid, safeInt, nowDb, rows, cols } = helpers;
  const seatRows = safeInt(rows, 8) || 8;
  const seatCols = safeInt(cols, 12) || 12;

  async function requireAdminOpenid(req, res) {
    const oid = getOpenid(req);
    if (!oid) {
      res.status(401).json({ code: -1, message: '未登录' });
      return null;
    }
    const [me] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [oid]);
    if (!me[0] || !me[0].isAdmin) {
      res.status(403).json({ code: -1, message: '无权限' });
      return null;
    }
    return oid;
  }

  function mapSeatsJsonForAdmin(seatsJson) {
    try {
      const arr = JSON.parse(String(seatsJson || '[]'));
      if (!Array.isArray(arr)) return [];
      return arr.map((s) => ({ row: safeInt(s.row, 0), col: safeInt(s.col, 0) }));
    } catch (_) {
      return [];
    }
  }

  /** 管理端用户列表「活跃度」展示用（与筛选条件 activity 配合） */
  function activityTierFromUserRow(u) {
    const oc = safeInt(u.orderCount, 0);
    const cc = safeInt(u.commentCount, 0);
    const toMs = (x) => {
      if (!x) return 0;
      const t = new Date(String(x).replace(' ', 'T')).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const last = Math.max(toMs(u.lastOrderTime), toMs(u.lastCommentTime));
    const created = toMs(u.createTime);
    const now = Date.now();
    const day = 86400000;
    if (last && now - last < 30 * day) {
      return { tier: 'active', label: '近30天活跃' };
    }
    if (last && now - last < 90 * day) {
      return { tier: 'warm', label: '30–90天有互动' };
    }
    if (oc === 0 && cc === 0 && created && now - created < 14 * day) {
      return { tier: 'new', label: '新注册未互动' };
    }
    if (last && now - last >= 90 * day) {
      return { tier: 'cold', label: '≥90天未活跃' };
    }
    if (!last && oc === 0 && cc === 0) {
      return { tier: 'silent', label: '无订单/评论' };
    }
    return { tier: 'low', label: '低活跃' };
  }

  /** 与 server.js 中 TMDB 导入逻辑一致，放在此处避免未注册到旧版进程导致 404 */
  app.post('/api/movies/import-upcoming-from-tmdb', async (req, res) => {
    try {
      if (!requireTmdbSyncSecret(req, res)) return;
      if (!process.env.TMDB_API_KEY) {
        return res.status(400).json({
          code: -1,
          message: '服务端未配置 TMDB_API_KEY，请在 backend/.env 中设置'
        });
      }
      const count = Math.max(1, Math.min(500, safeInt(req.body?.count, 50)));
      const priceCents = safeInt(
        req.body?.priceCents,
        safeInt(process.env.DEFAULT_MOVIE_PRICE_CENTS, 3500)
      );
      const idPrefix = req.body?.idPrefix ? String(req.body.idPrefix) : 'tmdb';
      const result = await tmdbSync.importMoviesFromTmdb(pool, {
        mode: 'upcoming',
        count,
        maxPages: 25,
        priceCents,
        idPrefix
      });
      const statusResult = await tmdbSync.recomputeMovieStatuses(pool);
      res.json({
        code: 0,
        message: 'ok',
        data: {
          imported: (result.ok || []).length,
          failed: (result.fail || []).length,
          statusRowsUpdated: statusResult.affected
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '导入即将上映失败' });
    }
  });

  app.post('/api/movies/recompute-movie-statuses', async (req, res) => {
    try {
      if (!requireTmdbSyncSecret(req, res)) return;
      const result = await tmdbSync.recomputeMovieStatuses(pool);
      res.json({ code: 0, message: 'ok', data: result });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '重算上映状态失败' });
    }
  });

  /** 按 TMDB 校正 _id 为 tmdb_* 的影片上映日（含各国 release_dates，优先 CN）；需配置 TMDB_API_KEY */
  app.post('/api/movies/refresh-release-dates-from-tmdb', async (req, res) => {
    try {
      if (!requireTmdbSyncSecret(req, res)) return;
      if (!process.env.TMDB_API_KEY) {
        return res.status(400).json({ code: -1, message: '服务端未配置 TMDB_API_KEY' });
      }
      const onlyComing = !!(req.body && req.body.onlyComing);
      const result = await tmdbSync.refreshTmdbReleaseDatesFromApi(pool, { onlyComing });
      const statusResult = await tmdbSync.recomputeMovieStatuses(pool);
      res.json({
        code: 0,
        message: 'ok',
        data: {
          ...result,
          statusRowsUpdated: statusResult.affected
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '校正上映日失败' });
    }
  });

  async function fetchHallTemplatesForCinema(q, cinemaId) {
    const [halls] = await q.query(
      `SELECT name, hallType, seatRows, seatCols FROM cinema_halls WHERE cinemaId = ? ORDER BY sortOrder ASC, createTime ASC, _id ASC`,
      [String(cinemaId)]
    );
    const mapDbRow = (h, idx) => {
      const slot = DEFAULT_HALL_TIME_SLOTS[idx % DEFAULT_HALL_TIME_SLOTS.length];
      const sr = Math.max(4, Math.min(30, safeInt(h.seatRows, seatRows)));
      const sc = Math.max(6, Math.min(30, safeInt(h.seatCols, seatCols)));
      return {
        hallName: String(h.name || '').trim() || `厅${idx + 1}`,
        hallType: String(h.hallType || '').trim() || '普通厅',
        seatRows: sr,
        seatCols: sc,
        startTime: slot.startTime,
        endTime: slot.endTime,
        plus: slot.plus
      };
    };
    if (halls && halls.length) return halls.map(mapDbRow);
    return LEGACY_HALL_BLUEPRINT.map((b, idx) => {
      const slot = DEFAULT_HALL_TIME_SLOTS[idx % DEFAULT_HALL_TIME_SLOTS.length];
      return {
        hallName: b.name,
        hallType: b.hallType,
        seatRows,
        seatCols,
        startTime: slot.startTime,
        endTime: slot.endTime,
        plus: slot.plus
      };
    });
  }

  async function seedDefaultCinemaHallsIfEmpty(q, cinemaId) {
    const cid = String(cinemaId);
    const [cntRows] = await q.query(`SELECT COUNT(*) AS n FROM cinema_halls WHERE cinemaId = ?`, [cid]);
    const n = cntRows && cntRows[0] ? safeInt(cntRows[0].n, 0) : 0;
    if (n > 0) return;
    const now = nowDb();
    for (let i = 0; i < LEGACY_HALL_BLUEPRINT.length; i++) {
      const b = LEGACY_HALL_BLUEPRINT[i];
      const hid = `h_${cid}_${i + 1}`;
      await q.query(
        `INSERT INTO cinema_halls (_id,cinemaId,name,hallType,seatRows,seatCols,sortOrder,createTime,updateTime) VALUES (?,?,?,?,?,?,?,?,?)`,
        [hid, cid, b.name, b.hallType, seatRows, seatCols, i, now, now]
      );
    }
  }

  async function bootstrapSchedulesIfNeeded(cinemaId, date, movieId) {
    const cid = String(cinemaId);
    const dateStr = String(date);

    if (movieId) {
      const [exists] = await pool.query(
        `SELECT _id FROM schedules WHERE cinemaId=? AND date=? AND movieId=? LIMIT 1`,
        [cid, dateStr, String(movieId)]
      );
      if (exists && exists.length) return;

      const [m] = await pool.query(`SELECT _id, price FROM movies WHERE _id=? LIMIT 1`, [movieId]);
      if (!m || !m.length) return;

      const hallDefs = await fetchHallDefinitions(pool, cid);
      const slots = buildShowSlotsFromHallDefs(hallDefs);
      const seenHall = new Set();

      for (const slot of slots) {
        if (seenHall.has(slot.hallName)) continue;
        const occupied = await findScheduleAtSlot(pool, cid, dateStr, slot.hallName, slot.startTime);
        if (occupied) continue;
        seenHall.add(slot.hallName);

        const scheduleId = makeScheduleId(cid, dateStr, slot.hallName, slot.startTime);
        const priceCents = Math.max(2500, safeInt(m[0].price, 3500) + safeInt(slot.plus, 0));
        await insertScheduleWithSeats(pool, {
          scheduleId,
          movieId: String(movieId),
          cinemaId: cid,
          slot,
          dateStr,
          priceCents
        });
      }
      return;
    }

    const [exists] = await pool.query(
      `SELECT _id FROM schedules WHERE cinemaId=? AND date=? LIMIT 1`,
      [cid, dateStr]
    );
    if (exists && exists.length) return;

    const [movieRows] = await pool.query(
      `SELECT _id, price FROM movies WHERE status IN ('showing','coming') ORDER BY hot DESC, updateTime DESC LIMIT 48`
    );
    if (!movieRows || !movieRows.length) return;

    await seedCinemaDaySchedules(pool, {
      cinemaId: cid,
      dateStr,
      movies: movieRows,
      skipOccupied: true
    });
  }

  async function normalizeMovieTitles() {
    const [rowsData] = await pool.query(
      `SELECT _id FROM movies WHERE title IS NULL OR TRIM(title) = ''`
    );
    let fixed = 0;
    for (const r of rowsData || []) {
      const id = String(r._id || '');
      const fallbackTitle = `影片${id.slice(-6) || Math.random().toString(36).slice(2, 8)}`;
      await pool.query(`UPDATE movies SET title = ?, updateTime = NOW() WHERE _id = ?`, [fallbackTitle, id]);
      fixed += 1;
    }
    return fixed;
  }

  async function rebuildSchedulesForAllCinemas(opts = {}) {
    const days = Math.max(1, Math.min(30, safeInt(opts.days, 7)));
    const maxMovies = Math.max(1, Math.min(200, safeInt(opts.maxMovies, 48)));
    const [cinemas] = await pool.query(`SELECT _id FROM cinemas ORDER BY _id`);
    const [movies] = await pool.query(
      `SELECT _id, price FROM movies WHERE status IN ('showing','coming') ORDER BY hot DESC, updateTime DESC LIMIT ?`,
      [maxMovies]
    );
    if (!cinemas.length || !movies.length) {
      return { cinemas: cinemas.length, movies: movies.length, schedules: 0, seats: 0 };
    }

    const conn = await pool.getConnection();
    const dates = dateRangeFromToday(days);
    let scheduleCount = 0;
    let seatCount = 0;

    try {
      await conn.beginTransaction();
      await conn.query(`DELETE FROM seats`);
      await conn.query(`DELETE FROM schedules`);

      for (const c of cinemas) {
        const cinemaId = String(c._id);
        for (const dateStr of dates) {
          const part = await seedCinemaDaySchedules(conn, {
            cinemaId,
            dateStr,
            movies,
            forceReplaceSeats: true
          });
          scheduleCount += part.schedules;
          seatCount += part.seats;
        }
      }

      await conn.commit();
      return {
        cinemas: cinemas.length,
        movies: movies.length,
        schedules: scheduleCount,
        seats: seatCount,
        slotsPerCinemaPerDay: (await fetchHallDefinitions(conn, String(cinemas[0]._id))).length * 4
      };
    } catch (e) {
      try {
        await conn.rollback();
      } catch (_) {}
      throw e;
    } finally {
      conn.release();
    }
  }

  app.get('/api/movies/search', async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      if (!q) return res.json({ code: 0, message: 'ok', data: { items: [] } });
      const like = `%${q}%`;
      const [rowsData] = await pool.query(
        `
        SELECT _id, title, poster, rating, genre, duration, director, actors, description, releaseDate, price, status, hot
        FROM movies
        WHERE title LIKE ? OR director LIKE ? OR actors LIKE ? OR genre LIKE ?
        ORDER BY hot DESC
        LIMIT 50
      `,
        [like, like, like, like]
      );
      res.json({ code: 0, message: 'ok', data: { items: rowsData.map((r) => mapMovieRowForReq(req, r)) } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '搜索失败' });
    }
  });

  app.get('/api/movies/:movieId', async (req, res) => {
    try {
      const movieId = req.params.movieId;
      const [rowsData] = await pool.query(`SELECT * FROM movies WHERE _id = ? LIMIT 1`, [movieId]);
      const m = rowsData[0];
      if (!m) return res.status(404).json({ code: -1, message: '电影不存在' });
      res.json({ code: 0, message: 'ok', data: mapMovieRowForReq(req, m) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.post('/api/movies/:movieId/enrich-from-tmdb', async (req, res) => {
    try {
      const movieId = req.params.movieId;
      const [rowsData] = await pool.query(`SELECT * FROM movies WHERE _id = ? LIMIT 1`, [movieId]);
      const m = rowsData[0];
      if (!m) return res.status(404).json({ code: -1, message: '电影不存在' });

      if (!process.env.TMDB_API_KEY) {
        return res.status(400).json({ code: -1, message: '服务端未配置 TMDB_API_KEY' });
      }

      if (!needEnrichMovie(m)) {
        return res.json({ code: 0, message: 'ok', data: { updated: false, movie: mapMovieRowForReq(req, m) } });
      }

      const result = await tmdbSync.syncMovies(pool, { ids: [String(movieId)] });
      const [rowsAfter] = await pool.query(`SELECT * FROM movies WHERE _id = ? LIMIT 1`, [movieId]);
      const nextMovie = rowsAfter[0] || m;
      const updated = !!(result.ok && result.ok.length);
      const reason = !updated && result.fail && result.fail.length ? result.fail[0].reason || '' : '';

      res.json({
        code: 0,
        message: updated ? 'ok' : '未更新',
        data: {
          updated,
          reason,
          movie: mapMovieRowForReq(req, nextMovie)
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '补全失败' });
    }
  });

  app.post('/api/movies/enrich-missing-from-tmdb', async (req, res) => {
    try {
      if (!process.env.TMDB_API_KEY) {
        return res.status(400).json({ code: -1, message: '服务端未配置 TMDB_API_KEY' });
      }

      const secret = process.env.TMDB_SYNC_SECRET;
      if (secret) {
        const h = req.headers['x-sync-secret'] || req.query.secret;
        if (h !== secret) {
          return res.status(403).json({ code: -1, message: 'forbidden' });
        }
      }

      const limit = Math.max(1, Math.min(500, safeInt(req.body?.limit, 100)));
      const rounds = Math.max(1, Math.min(5, safeInt(req.body?.rounds, 2)));
      const status = req.body?.status ? String(req.body.status) : '';
      const where = status ? 'WHERE status = ?' : '';
      const baseParams = status ? [status] : [];

      let scannedTotal = 0;
      let candidatesTotal = 0;
      let allOk = [];
      let allFail = [];
      for (let round = 0; round < rounds; round++) {
        const [rowsData] = await pool.query(
          `
            SELECT _id, title, poster, rating, genre, duration, director, actors, description, releaseDate, status
            FROM movies
            ${where}
            ORDER BY updateTime ASC
            LIMIT ?
          `,
          [...baseParams, limit]
        );
        scannedTotal = rowsData.length;
        const needIds = (rowsData || [])
          .filter((m) => needEnrichMovie(m))
          .map((m) => String(m._id));
        candidatesTotal = needIds.length;
        if (!needIds.length) break;
        const result = await tmdbSync.syncMovies(pool, { ids: needIds });
        allOk = allOk.concat(result.ok || []);
        allFail = result.fail || [];
      }

      res.json({
        code: 0,
        message: 'ok',
        data: {
          scanned: scannedTotal,
          candidates: candidatesTotal,
          updated: allOk.length,
          failed: allFail.length,
          failItems: allFail.slice(0, 20),
          rounds
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '批量补全失败' });
    }
  });

  app.get('/api/movies/:movieId/comments', async (req, res) => {
    try {
      const movieId = req.params.movieId;
      const [rowsData] = await pool.query(
        `
        SELECT _id, movieId, nickName, avatarUrl, rating, content, likes, createTime
        FROM movie_comments
        WHERE movieId = ?
        ORDER BY createTime DESC
        LIMIT 100
      `,
        [movieId]
      );
      res.json({ code: 0, message: 'ok', data: { items: rowsData } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.post('/api/movies/:movieId/comments', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const movieId = req.params.movieId;
      const { rating = 5, content = '' } = req.body || {};
      const text = String(content).trim();
      if (!text) return res.status(400).json({ code: -1, message: '评论内容不能为空' });

      const [uRows] = await pool.query(`SELECT nickName, avatarUrl FROM users WHERE _id = ? LIMIT 1`, [openid]);
      const u = uRows[0] || {};
      const id = 'c_' + uuidv4().replace(/-/g, '').slice(0, 24);
      await pool.query(
        `
        INSERT INTO movie_comments (_id, movieId, _openid, nickName, avatarUrl, rating, content, likes, createTime)
        VALUES (?,?,?,?,?,?,?,?, NOW())
      `,
        [id, movieId, openid, u.nickName || '用户', u.avatarUrl || '', safeInt(rating, 5), text, 0]
      );
      res.json({ code: 0, message: 'ok', data: { _id: id } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '发表失败' });
    }
  });

  app.get('/api/cinemas', async (req, res) => {
    try {
      const cityQ = req.query.city != null ? String(req.query.city).trim() : '';
      const nameQ = req.query.q != null ? String(req.query.q).trim() : '';

      let sql = `SELECT _id, name, address, phone, latitude, longitude, city, minPrice, tags FROM cinemas WHERE 1=1`;
      const params = [];
      if (cityQ) {
        sql += ` AND (city = ? OR address LIKE ?)`;
        params.push(cityQ, `%${cityQ}%`);
      }
      if (nameQ) {
        sql += ` AND (name LIKE ? OR address LIKE ?)`;
        params.push(`%${nameQ}%`, `%${nameQ}%`);
      }
      sql += ` ORDER BY _id`;

      const [rowsData] = await pool.query(sql, params);
      const items = rowsData.map((c) => ({
        ...c,
        city: c.city || '',
        tags: c.tags ? String(c.tags).split(/[,，]/).filter(Boolean) : [],
        minPrice: c.minPrice != null ? safeInt(c.minPrice, 0) / 100 : 0
      }));
      res.json({ code: 0, message: 'ok', data: { items } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.get('/api/cinemas/:cinemaId', async (req, res) => {
    try {
      const id = req.params.cinemaId;
      const [rowsData] = await pool.query(`SELECT * FROM cinemas WHERE _id = ? LIMIT 1`, [id]);
      const c = rowsData[0];
      if (!c) return res.status(404).json({ code: -1, message: '影院不存在' });
      res.json({
        code: 0,
        message: 'ok',
        data: {
          ...c,
          tags: c.tags ? String(c.tags).split(/[,，]/).filter(Boolean) : [],
          minPrice: c.minPrice != null ? safeInt(c.minPrice, 0) / 100 : 0
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.get('/api/schedules', async (req, res) => {
    try {
      const cinemaId = req.query.cinemaId;
      const date = req.query.date;
      const movieId = req.query.movieId ? String(req.query.movieId) : '';
      if (!cinemaId || !date) {
        return res.status(400).json({ code: -1, message: '缺少 cinemaId 或 date' });
      }

      let sql = `
        SELECT s._id, s.movieId, s.cinemaId, s.hallName, s.hallType, s.date, s.startTime, s.endTime, s.price,
               m.title AS movieTitle, m.poster AS moviePoster
        FROM schedules s
        LEFT JOIN movies m ON m._id = s.movieId
        WHERE s.cinemaId = ? AND s.date = ?
      `;
      const params = [cinemaId, date];
      if (movieId) {
        sql += ' AND s.movieId = ?';
        params.push(movieId);
      }
      sql += ' ORDER BY s.startTime ASC';

      let [rowsData] = await pool.query(sql, params);
      if (!rowsData || rowsData.length === 0) {
        await bootstrapSchedulesIfNeeded(String(cinemaId), String(date), movieId);
        const [rowsData2] = await pool.query(sql, params);
        rowsData = rowsData2 || [];
      }

      const items = rowsData.map((s) => ({
        _id: s._id,
        movieId: String(s.movieId),
        movieTitle: s.movieTitle || `影片${String(s.movieId || '').slice(-6)}`,
        moviePoster: s.moviePoster || '',
        hallName: s.hallName,
        hallType: s.hallType,
        startTime: s.startTime,
        endTime: s.endTime,
        date: s.date,
        price: Math.round(safeInt(s.price, 0) / 100)
      }));

      res.json({ code: 0, message: 'ok', data: { items } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.get('/api/user/stats', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });

      const [pending] = await pool.query(
        `SELECT COUNT(*) AS c FROM orders WHERE _openid=? AND status='pending'`,
        [openid]
      );
      const [paid] = await pool.query(
        `SELECT COUNT(*) AS c FROM orders WHERE _openid=? AND status='paid'`,
        [openid]
      );
      const [cancelled] = await pool.query(
        `SELECT COUNT(*) AS c FROM orders WHERE _openid=? AND status='cancelled'`,
        [openid]
      );
      const [refunded] = await pool.query(
        `SELECT COUNT(*) AS c FROM orders WHERE _openid=? AND status='refunded'`,
        [openid]
      );
      const [coll] = await pool.query(`SELECT COUNT(*) AS c FROM collections WHERE _openid=?`, [openid]);

      res.json({
        code: 0,
        message: 'ok',
        data: {
          orderStats: {
            pending: pending[0]?.c || 0,
            paid: paid[0]?.c || 0,
            cancelled: cancelled[0]?.c || 0,
            refunded: refunded[0]?.c || 0
          },
          collectionCount: coll[0]?.c || 0
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.get('/api/user/profile', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [rows] = await pool.query(
        `
        SELECT nickName, avatarUrl, phone, preference_tags AS preferenceTagsCol,
          (CASE WHEN password IS NOT NULL AND CHAR_LENGTH(TRIM(IFNULL(password,''))) > 0 THEN 1 ELSE 0 END) AS hasPassword
        FROM users WHERE _id = ? LIMIT 1
        `,
        [openid]
      );
      const u = rows && rows[0];
      if (!u) {
        return res.json({ code: 0, message: 'ok', data: { existsInDb: false } });
      }
      const tags = parsePreferenceTags(u.preferenceTagsCol);
      res.json({
        code: 0,
        message: 'ok',
        data: {
          existsInDb: true,
          nickName: String(u.nickName || '').trim(),
          avatarUrl: String(u.avatarUrl || '').trim(),
          phoneMasked: maskPhoneDisplay(u.phone),
          hasBoundPhone: /^1[3-9]\d{9}$/.test(String(u.phone || '').trim()),
          hasPassword: Number(u.hasPassword) === 1,
          preferenceTags: tags,
          updatedAt: Date.now()
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '读取资料失败' });
    }
  });

  app.post('/api/user/profile/update', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [rows] = await pool.query(
        `SELECT nickName, avatarUrl, phone, preference_tags FROM users WHERE _id = ? LIMIT 1`,
        [openid]
      );
      const cur = rows && rows[0];
      if (!cur) {
        return res.status(400).json({ code: -1, message: '请先使用手机号注册后再维护资料' });
      }
      const body = req.body || {};
      const nextNick =
        body.nickName !== undefined ? String(body.nickName || '').trim() : undefined;
      const nextAvatar =
        body.avatarUrl !== undefined ? String(body.avatarUrl || '').trim() : undefined;
      const nextTags =
        body.preferenceTags !== undefined ? normalizePreferenceTagsInput(body.preferenceTags) : undefined;

      if (nextNick === undefined && nextAvatar === undefined && nextTags === undefined) {
        return res.status(400).json({ code: -1, message: '没有可更新的字段' });
      }

      if (nextNick !== undefined) {
        if (!nextNick || nextNick.length > 32) {
          return res.status(400).json({ code: -1, message: '昵称长度应为 1～32 个字符' });
        }
      }
      if (nextAvatar !== undefined && nextAvatar.length > 512) {
        return res.status(400).json({ code: -1, message: '头像地址过长' });
      }

      const fields = [];
      const params = [];
      if (nextNick !== undefined) {
        fields.push('nickName=?');
        params.push(nextNick);
      }
      if (nextAvatar !== undefined) {
        fields.push('avatarUrl=?');
        params.push(nextAvatar);
      }
      if (nextTags !== undefined) {
        fields.push('preference_tags=?');
        params.push(JSON.stringify(nextTags));
      }
      fields.push('updateTime=NOW()');
      params.push(openid);

      await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE _id=?`, params);

      if (nextNick !== undefined && String(cur.nickName || '') !== nextNick) {
        await appendProfileAudit(pool, {
          openid,
          fieldKey: 'nickName',
          oldSummary: summarizeForAudit('nickName', cur.nickName),
          newSummary: summarizeForAudit('nickName', nextNick),
          req
        });
      }
      if (nextAvatar !== undefined && String(cur.avatarUrl || '') !== nextAvatar) {
        await appendProfileAudit(pool, {
          openid,
          fieldKey: 'avatarUrl',
          oldSummary: summarizeForAudit('avatarUrl', cur.avatarUrl, 80),
          newSummary: summarizeForAudit('avatarUrl', nextAvatar, 80),
          req
        });
      }
      if (nextTags !== undefined) {
        const oldT = JSON.stringify(parsePreferenceTags(cur.preference_tags));
        const newT = JSON.stringify(nextTags);
        if (oldT !== newT) {
          await appendProfileAudit(pool, {
            openid,
            fieldKey: 'preferenceTags',
            oldSummary: summarizeForAudit('tags', oldT, 120),
            newSummary: summarizeForAudit('tags', newT, 120),
            req
          });
        }
      }

      const [outRows] = await pool.query(
        `
        SELECT nickName, avatarUrl, phone, preference_tags AS preferenceTagsCol,
          (CASE WHEN password IS NOT NULL AND CHAR_LENGTH(TRIM(IFNULL(password,''))) > 0 THEN 1 ELSE 0 END) AS hasPassword
        FROM users WHERE _id = ? LIMIT 1
        `,
        [openid]
      );
      const u = outRows && outRows[0];
      res.json({
        code: 0,
        message: 'ok',
        data: {
          existsInDb: true,
          nickName: String(u.nickName || '').trim(),
          avatarUrl: String(u.avatarUrl || '').trim(),
          phoneMasked: maskPhoneDisplay(u.phone),
          hasBoundPhone: /^1[3-9]\d{9}$/.test(String(u.phone || '').trim()),
          hasPassword: Number(u.hasPassword) === 1,
          preferenceTags: parsePreferenceTags(u.preferenceTagsCol),
          updatedAt: Date.now()
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '更新资料失败' });
    }
  });

  app.post('/api/user/profile/change-phone', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const { newPhone, password } = req.body || {};
      const np = String(newPhone || '').trim();
      const pwd = String(password || '');
      if (!/^1[3-9]\d{9}$/.test(np)) {
        return res.status(400).json({ code: -1, message: '新手机号格式不正确' });
      }
      if (!pwd) {
        return res.status(400).json({ code: -1, message: '修改手机号需二次校验：请输入登录密码' });
      }
      const [rows] = await pool.query(
        `SELECT phone, password FROM users WHERE _id = ? LIMIT 1`,
        [openid]
      );
      const u = rows && rows[0];
      if (!u) {
        return res.status(400).json({ code: -1, message: '用户不存在' });
      }
      if (String(u.password || '') !== pwd) {
        return res.status(403).json({ code: -1, message: '密码错误，无法修改手机号' });
      }
      const [dup] = await pool.query(`SELECT _id FROM users WHERE phone = ? AND _id <> ? LIMIT 1`, [
        np,
        openid
      ]);
      if (dup && dup.length) {
        return res.status(400).json({ code: -1, message: '该手机号已被其他账号使用' });
      }
      const oldMasked = maskPhoneDisplay(u.phone);
      await pool.query(`UPDATE users SET phone=?, updateTime=NOW() WHERE _id=?`, [np, openid]);
      await appendProfileAudit(pool, {
        openid,
        fieldKey: 'phone',
        oldSummary: `phone:${oldMasked || '(无)'}`,
        newSummary: `phone:${maskPhoneDisplay(np)}`,
        req
      });
      const [outRows] = await pool.query(
        `
        SELECT nickName, avatarUrl, phone, preference_tags AS preferenceTagsCol,
          (CASE WHEN password IS NOT NULL AND CHAR_LENGTH(TRIM(IFNULL(password,''))) > 0 THEN 1 ELSE 0 END) AS hasPassword
        FROM users WHERE _id = ? LIMIT 1
        `,
        [openid]
      );
      const ou = outRows && outRows[0];
      res.json({
        code: 0,
        message: 'ok',
        data: {
          existsInDb: true,
          nickName: String(ou.nickName || '').trim(),
          avatarUrl: String(ou.avatarUrl || '').trim(),
          phoneMasked: maskPhoneDisplay(ou.phone),
          hasBoundPhone: true,
          hasPassword: Number(ou.hasPassword) === 1,
          preferenceTags: parsePreferenceTags(ou.preferenceTagsCol),
          updatedAt: Date.now()
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '修改手机号失败' });
    }
  });

  app.post('/api/user/profile/avatar-base64', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      let b64 = String(req.body?.imageBase64 || req.body?.dataUrl || '').trim();
      const dm = b64.match(/^data:image\/[\w.+-]+;base64,(.+)$/i);
      if (dm) b64 = dm[1];
      if (!b64) return res.status(400).json({ code: -1, message: '缺少图片数据' });
      let buf;
      try {
        buf = Buffer.from(b64, 'base64');
      } catch (_) {
        return res.status(400).json({ code: -1, message: '图片数据无效' });
      }
      if (buf.length < 32 || buf.length > 480 * 1024) {
        return res.status(400).json({ code: -1, message: '图片过大或过小' });
      }
      const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
      const isWebp =
        buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
      let ext = null;
      if (isJpg) ext = 'jpg';
      else if (isPng) ext = 'png';
      else if (isWebp) ext = 'webp';
      if (!ext) {
        return res.status(400).json({ code: -1, message: '仅支持 JPEG / PNG / WebP' });
      }
      const safeId = String(openid).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'user';
      const fn = `av_${safeId}_${Date.now()}.${ext}`;
      const dir = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
      fs.mkdirSync(dir, { recursive: true });
      const fpath = path.join(dir, fn);
      fs.writeFileSync(fpath, buf);

      const [rows] = await pool.query(`SELECT avatarUrl FROM users WHERE _id = ? LIMIT 1`, [openid]);
      const cur = rows && rows[0];
      if (!cur) {
        return res.status(400).json({ code: -1, message: '请先使用手机号注册后再上传头像' });
      }
      const urlPath = `/uploads/avatars/${fn}`;
      await pool.query(`UPDATE users SET avatarUrl=?, updateTime=NOW() WHERE _id=?`, [urlPath, openid]);
      await appendProfileAudit(pool, {
        openid,
        fieldKey: 'avatarUrl',
        oldSummary: summarizeForAudit('avatarUrl', cur.avatarUrl, 80),
        newSummary: summarizeForAudit('avatarUrl', urlPath, 80),
        req
      });
      res.json({ code: 0, message: 'ok', data: { avatarUrl: urlPath } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '上传头像失败' });
    }
  });

  app.get('/api/points/balance', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [[b]] = await pool.query(`SELECT balance, updateTime FROM user_points_balance WHERE _openid=? LIMIT 1`, [
        openid
      ]);
      res.json({
        code: 0,
        message: 'ok',
        data: { balance: b ? safeInt(b.balance, 0) : 0, updateTime: b && b.updateTime ? String(b.updateTime) : null }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.get('/api/points/log', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const page = Math.max(1, safeInt(req.query.page, 1));
      const pageSize = Math.min(50, Math.max(1, safeInt(req.query.pageSize, 20)));
      const offset = (page - 1) * pageSize;
      const [rows] = await pool.query(
        `
        SELECT _id, delta, balance_after, source_type, source_id, remark,
          (CASE WHEN operator_openid IS NULL OR operator_openid='' THEN 0 ELSE 1 END) AS has_operator,
          createTime
        FROM user_points_log
        WHERE _openid=?
        ORDER BY createTime DESC
        LIMIT ? OFFSET ?
        `,
        [openid, pageSize, offset]
      );
      const [[cntRow]] = await pool.query(`SELECT COUNT(*) AS c FROM user_points_log WHERE _openid=?`, [openid]);
      const total = safeInt(cntRow && cntRow.c, 0);
      res.json({
        code: 0,
        message: 'ok',
        data: {
          page,
          pageSize,
          total,
          items: (rows || []).map((r) => ({
            id: r._id,
            delta: safeInt(r.delta, 0),
            balanceAfter: safeInt(r.balance_after, 0),
            sourceType: r.source_type,
            sourceId: r.source_id,
            remark: r.remark,
            hasOperator: Number(r.has_operator) === 1,
            createTime: r.createTime ? String(r.createTime) : ''
          }))
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.get('/api/points/rules', async (_req, res) => {
    try {
      const per = await pointsService.getPointsPer100CentsFromDb(pool);
      const cin = await pointsService.getCheckInPointsFromDb(pool);
      res.json({
        code: 0,
        message: 'ok',
        data: {
          rules: pointsService.getPointsRulesText(per, cin),
          env: {
            pointsPer100Cents: per,
            checkInDaily: cin
          }
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '读取失败' });
    }
  });

  app.post('/api/points/check-in', async (req, res) => {
    const openid = getOpenid(req);
    if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const r = await pointsService.grantPointsDailyCheckIn(conn, openid);
      await conn.commit();
      res.json({
        code: 0,
        message: r.skipped ? '今日已签到' : '签到成功',
        data: { balance: r.balance, skipped: !!r.skipped }
      });
    } catch (e) {
      console.error(e);
      try {
        await conn.rollback();
      } catch (_) {}
      res.status(400).json({ code: -1, message: e.message || '签到失败' });
    } finally {
      conn.release();
    }
  });

  const POINTS_ACTIVITY_MAP = {
    welcome_task: { points: 50, remark: '新手任务奖励' },
    festival_bonus: { points: 30, remark: '节日活动奖励' }
  };

  app.post('/api/points/activity/claim', async (req, res) => {
    const openid = getOpenid(req);
    if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
    const key = String((req.body && req.body.activityKey) || '').trim();
    const cfg = POINTS_ACTIVITY_MAP[key];
    if (!cfg) return res.status(400).json({ code: -1, message: '未知活动或未开放' });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const r = await pointsService.grantPointsActivity(conn, openid, key, cfg.points, cfg.remark);
      await conn.commit();
      res.json({
        code: 0,
        message: r.skipped ? '已领取过该活动' : '领取成功',
        data: { balance: r.balance, skipped: !!r.skipped, activityKey: key }
      });
    } catch (e) {
      console.error(e);
      try {
        await conn.rollback();
      } catch (_) {}
      res.status(400).json({ code: -1, message: e.message || '领取失败' });
    } finally {
      conn.release();
    }
  });

  app.post('/api/admin/points/adjust', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;
      const { targetOpenid, delta, reason, riskAck } = req.body || {};
      const d = safeInt(delta, 0);
      if (d < -500 && !riskAck) {
        return res.status(403).json({
          code: -1,
          message: '单笔扣减超过 500 分须二次确认：请求体附带 riskAck=true（前端高风险确认后提交）'
        });
      }
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const r = await pointsService.adjustPointsManual(conn, {
          targetOpenid,
          delta,
          reason,
          operatorOpenid: adminOp
        });
        await conn.commit();
        try {
          await appendAdminSecurityAudit(pool, req, {
            operatorOpenid: adminOp,
            category: 'points',
            action: 'admin_points_adjust',
            summary: `目标=${String(targetOpenid || '').slice(0, 64)} delta=${delta} 原因=${String(reason || '').slice(0, 200)}`
          });
        } catch (ae) {
          console.warn('[admin_audit] points adjust log failed', ae.message || ae);
        }
        res.json({ code: 0, message: 'ok', data: { balance: r.balance } });
      } catch (e) {
        console.error(e);
        try {
          await conn.rollback();
        } catch (_) {}
        res.status(400).json({ code: -1, message: e.message || '调整失败' });
      } finally {
        conn.release();
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '调整失败' });
    }
  });

  /** 管理端：读取可编辑的积分数值规则（与购票/签到发放一致） */
  app.get('/api/admin/points/rules-config', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;
      const per = await pointsService.getPointsPer100CentsFromDb(pool);
      const cin = await pointsService.getCheckInPointsFromDb(pool);
      res.json({
        code: 0,
        message: 'ok',
        data: {
          pointsPer100Cents: per,
          checkInDaily: cin,
          rules: pointsService.getPointsRulesText(per, cin)
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '读取失败' });
    }
  });

  app.put('/api/admin/points/rules-config', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;
      const per = Math.max(0, Math.min(100, safeInt(req.body?.pointsPer100Cents, NaN)));
      const cin = Math.max(0, Math.min(500, safeInt(req.body?.checkInDaily, NaN)));
      if (!Number.isFinite(per) || !Number.isFinite(cin)) {
        return res.status(400).json({ code: -1, message: 'pointsPer100Cents、checkInDaily 须为有效整数' });
      }
      await pool.query(
        `UPDATE points_rule_config SET rule_value=?, updateTime=NOW(), updated_by=? WHERE rule_key='points_per_100_cents'`,
        [per, adminOp]
      );
      await pool.query(
        `UPDATE points_rule_config SET rule_value=?, updateTime=NOW(), updated_by=? WHERE rule_key='checkin_daily'`,
        [cin, adminOp]
      );
      try {
        await appendAdminSecurityAudit(pool, req, {
          operatorOpenid: adminOp,
          category: 'points',
          action: 'admin_points_rules_update',
          summary: `per100=${per} checkin=${cin}`
        });
      } catch (ae) {
        console.warn('[admin_audit] points rules', ae.message || ae);
      }
      res.json({ code: 0, message: 'ok', data: { pointsPer100Cents: per, checkInDaily: cin } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '保存失败' });
    }
  });

  /** 管理端：批量人工调整（每条独立流水与 source_id） */
  app.post('/api/admin/points/bulk-grant', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;
      const batchReason = String((req.body && req.body.batchReason) || '').trim();
      const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
      if (!batchReason) return res.status(400).json({ code: -1, message: '请填写 batchReason（批次说明，写入审计）' });
      if (!items.length || items.length > 150) {
        return res.status(400).json({ code: -1, message: 'items 数量须在 1～150 之间' });
      }
      const conn = await pool.getConnection();
      const results = [];
      try {
        await conn.beginTransaction();
        for (let i = 0; i < items.length; i++) {
          const it = items[i] || {};
          const tgt = String(it.targetOpenid || '').trim();
          const d = safeInt(it.delta, 0);
          const rowReason = String(it.reason || `第${i + 1}条`).trim().slice(0, 200);
          const merged = `${batchReason.slice(0, 200)}｜${rowReason}`.slice(0, 512);
          if (!tgt) throw new Error(`第 ${i + 1} 条缺少 targetOpenid`);
          if (!d) throw new Error(`第 ${i + 1} 条 delta 无效`);
          if (d < -500 && !req.body.riskAck) {
            throw new Error('批量中包含单笔扣减超过 500 分，请附带 riskAck=true');
          }
          const r = await pointsService.adjustPointsManual(conn, {
            targetOpenid: tgt,
            delta: d,
            reason: merged,
            operatorOpenid: adminOp
          });
          results.push({ targetOpenid: tgt, balance: r.balance });
        }
        await conn.commit();
      } catch (e) {
        try {
          await conn.rollback();
        } catch (_) {}
        return res.status(400).json({ code: -1, message: e.message || '批量失败' });
      } finally {
        conn.release();
      }
      try {
        await appendAdminSecurityAudit(pool, req, {
          operatorOpenid: adminOp,
          category: 'points',
          action: 'admin_points_bulk_grant',
          summary: `条数=${items.length} 说明=${batchReason.slice(0, 240)}`
        });
      } catch (ae) {
        console.warn('[admin_audit] bulk grant', ae.message || ae);
      }
      res.json({ code: 0, message: 'ok', data: { count: results.length, results } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '批量失败' });
    }
  });

  /** 管理端：全站积分流水核查（可按用户、来源类型过滤） */
  app.get('/api/admin/points/logs', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;
      const target = String(req.query.targetOpenid || '').trim();
      const sourceType = String(req.query.sourceType || '').trim();
      const page = Math.max(1, safeInt(req.query.page, 1));
      const pageSize = Math.min(100, Math.max(1, safeInt(req.query.pageSize, 30)));
      const offset = (page - 1) * pageSize;
      let where = 'WHERE 1=1';
      const params = [];
      if (target) {
        where += ' AND l._openid = ?';
        params.push(target);
      }
      if (sourceType) {
        where += ' AND l.source_type = ?';
        params.push(sourceType.slice(0, 32));
      }
      const [[cntRow]] = await pool.query(
        `SELECT COUNT(*) AS c FROM user_points_log l ${where}`,
        params
      );
      const total = safeInt(cntRow && cntRow.c, 0);
      params.push(pageSize, offset);
      const [rows] = await pool.query(
        `
        SELECT l._id, l._openid, l.delta, l.balance_after, l.source_type, l.source_id, l.remark,
               l.operator_openid, l.createTime,
               u.nickName AS userNick, u.phone AS userPhone
        FROM user_points_log l
        LEFT JOIN users u ON u._id = l._openid
        ${where}
        ORDER BY l.createTime DESC
        LIMIT ? OFFSET ?
      `,
        params
      );
      res.json({
        code: 0,
        message: 'ok',
        data: {
          page,
          pageSize,
          total,
          items: (rows || []).map((r) => ({
            id: r._id,
            openid: r._openid,
            userNick: r.userNick || '',
            userPhone: r.userPhone || '',
            delta: safeInt(r.delta, 0),
            balanceAfter: safeInt(r.balance_after, 0),
            sourceType: r.source_type,
            sourceId: r.source_id,
            remark: r.remark,
            operatorOpenid: r.operator_openid || '',
            createTime: r.createTime ? String(r.createTime) : ''
          }))
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.get('/api/admin/me/profile', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [rows] = await pool.query(
        `SELECT nickName, avatarUrl, phone FROM users WHERE _id=? AND CAST(IFNULL(isAdmin,0) AS UNSIGNED) >= 1 LIMIT 1`,
        [openid]
      );
      const u = rows && rows[0];
      if (!u) return res.status(403).json({ code: -1, message: '需要管理员账号' });
      res.json({
        code: 0,
        message: 'ok',
        data: {
          nickName: String(u.nickName || '').trim(),
          avatarUrl: String(u.avatarUrl || '').trim(),
          phoneMasked: maskPhoneDisplay(u.phone)
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '读取失败' });
    }
  });

  app.get('/api/admin/me/security-log', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [chk] = await pool.query(
        `SELECT _id FROM users WHERE _id=? AND CAST(IFNULL(isAdmin,0) AS UNSIGNED) >= 1 LIMIT 1`,
        [openid]
      );
      if (!chk || !chk.length) return res.status(403).json({ code: -1, message: '需要管理员账号' });
      const page = Math.max(1, safeInt(req.query.page, 1));
      const pageSize = Math.min(100, Math.max(1, safeInt(req.query.pageSize, 20)));
      const offset = (page - 1) * pageSize;
      const [logs] = await pool.query(
        `
        SELECT _id, category, action, summary, ip, createTime
        FROM admin_security_audit
        WHERE operator_openid=?
        ORDER BY createTime DESC
        LIMIT ? OFFSET ?
        `,
        [openid, pageSize, offset]
      );
      const [[cnt]] = await pool.query(`SELECT COUNT(*) AS c FROM admin_security_audit WHERE operator_openid=?`, [
        openid
      ]);
      res.json({
        code: 0,
        message: 'ok',
        data: {
          page,
          pageSize,
          total: safeInt(cnt && cnt.c, 0),
          items: (logs || []).map((r) => ({
            id: r._id,
            category: r.category,
            action: r.action,
            summary: r.summary,
            ip: r.ip,
            createTime: r.createTime ? String(r.createTime) : ''
          }))
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.post('/api/admin/me/profile', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const { currentPassword, nickName, avatarUrl } = req.body || {};
      const pwd = String(currentPassword || '');
      if (!pwd) return res.status(400).json({ code: -1, message: '请填写当前密码以二次确认' });
      const [rows] = await pool.query(
        `SELECT _id, password, nickName, avatarUrl FROM users WHERE _id=? AND CAST(IFNULL(isAdmin,0) AS UNSIGNED) >= 1 LIMIT 1`,
        [openid]
      );
      const u = rows && rows[0];
      if (!u) return res.status(403).json({ code: -1, message: '需要管理员账号' });
      if (String(u.password || '') !== pwd) {
        return res.status(403).json({ code: -1, message: '当前密码错误' });
      }
      const nextNick = nickName !== undefined ? String(nickName || '').trim() : undefined;
      const nextAvatar = avatarUrl !== undefined ? String(avatarUrl || '').trim() : undefined;
      if (nextNick === undefined && nextAvatar === undefined) {
        return res.status(400).json({ code: -1, message: '没有可更新的字段' });
      }
      if (nextNick !== undefined && (!nextNick || nextNick.length > 32)) {
        return res.status(400).json({ code: -1, message: '昵称长度应为 1～32 个字符' });
      }
      if (nextAvatar !== undefined && nextAvatar.length > 512) {
        return res.status(400).json({ code: -1, message: '头像地址过长' });
      }
      const fields = [];
      const params = [];
      if (nextNick !== undefined) {
        fields.push('nickName=?');
        params.push(nextNick);
      }
      if (nextAvatar !== undefined) {
        fields.push('avatarUrl=?');
        params.push(nextAvatar);
      }
      fields.push('updateTime=NOW()');
      params.push(openid);
      await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE _id=?`, params);
      const sum = [];
      if (nextNick !== undefined) sum.push(`昵称:${summarizeForAudit('from', u.nickName, 24)}→${summarizeForAudit('to', nextNick, 24)}`);
      if (nextAvatar !== undefined) sum.push('头像已更新');
      await appendAdminSecurityAudit(pool, req, {
        operatorOpenid: openid,
        category: 'profile',
        action: 'admin_profile_update',
        summary: sum.join('；').slice(0, 500)
      });
      const [out] = await pool.query(
        `SELECT nickName, avatarUrl, phone FROM users WHERE _id=? LIMIT 1`,
        [openid]
      );
      const ou = out && out[0];
      res.json({
        code: 0,
        message: 'ok',
        data: {
          nickName: String(ou.nickName || '').trim(),
          avatarUrl: String(ou.avatarUrl || '').trim(),
          phoneMasked: maskPhoneDisplay(ou.phone)
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '更新失败' });
    }
  });

  app.post('/api/admin/me/change-password', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const { currentPassword, newPassword, confirmNewPassword } = req.body || {};
      const cur = String(currentPassword || '');
      const np = String(newPassword || '');
      const cf = String(confirmNewPassword || '');
      if (!cur) return res.status(400).json({ code: -1, message: '请填写当前密码' });
      if (!np || np.length < 6) return res.status(400).json({ code: -1, message: '新密码至少 6 位' });
      if (np !== cf) return res.status(400).json({ code: -1, message: '两次输入的新密码不一致（二次确认失败）' });
      const [rows] = await pool.query(
        `SELECT _id, password FROM users WHERE _id=? AND CAST(IFNULL(isAdmin,0) AS UNSIGNED) >= 1 LIMIT 1`,
        [openid]
      );
      const u = rows && rows[0];
      if (!u) return res.status(403).json({ code: -1, message: '需要管理员账号' });
      if (String(u.password || '') !== cur) {
        return res.status(403).json({ code: -1, message: '当前密码错误' });
      }
      if (np === cur) return res.status(400).json({ code: -1, message: '新密码不能与当前密码相同' });
      await pool.query(`UPDATE users SET password=?, updateTime=NOW() WHERE _id=?`, [np, openid]);
      await appendAdminSecurityAudit(pool, req, {
        operatorOpenid: openid,
        category: 'password',
        action: 'admin_password_change',
        summary: '管理员登录密码已修改'
      });
      res.json({ code: 0, message: '密码已更新，请使用新密码重新登录' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '修改失败' });
    }
  });

  app.get('/api/collections', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [rowsData] = await pool.query(
        `SELECT _id, movieId, title, poster, createTime FROM collections WHERE _openid = ? ORDER BY createTime DESC`,
        [openid]
      );
      const base = requestBaseUrl(req);
      const items = (rowsData || []).map((row) => ({
        ...row,
        poster: toProxiedPoster(base, row.poster)
      }));
      res.json({ code: 0, message: 'ok', data: { items } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.post('/api/collections', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const { movieId, title = '', poster = '' } = req.body || {};
      if (!movieId) return res.status(400).json({ code: -1, message: '缺少 movieId' });

      const id = 'col_' + uuidv4().replace(/-/g, '').slice(0, 20);
      await pool.query(
        `
        INSERT INTO collections (_id, _openid, movieId, title, poster, createTime)
        VALUES (?,?,?,?,?, NOW())
        ON DUPLICATE KEY UPDATE title=VALUES(title), poster=VALUES(poster)
      `,
        [id, openid, String(movieId), title, poster]
      );
      res.json({ code: 0, message: 'ok' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '收藏失败' });
    }
  });

  app.delete('/api/collections/:movieId', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const movieId = req.params.movieId;
      await pool.query(`DELETE FROM collections WHERE _openid=? AND movieId=?`, [openid, movieId]);
      res.json({ code: 0, message: 'ok' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '取消失败' });
    }
  });

  app.get('/api/collections/check', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const movieId = req.query.movieId;
      if (!movieId) return res.status(400).json({ code: -1, message: '缺少 movieId' });
      const [rowsData] = await pool.query(
        `SELECT _id FROM collections WHERE _openid=? AND movieId=? LIMIT 1`,
        [openid, movieId]
      );
      res.json({ code: 0, message: 'ok', data: { collected: rowsData.length > 0 } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.get('/api/coupon-shop', async (_req, res) => {
    try {
      const [rowsData] = await pool.query(
        `
          SELECT _id, title, amount, minAmount, sellPrice, validDays, stock, soldCount, status, description
          FROM coupon_templates
          WHERE status='active'
          ORDER BY sortOrder ASC, createTime ASC
        `
      );
      const items = (rowsData || []).map((r) => ({
        _id: String(r._id),
        title: r.title || '',
        amount: Math.round(safeInt(r.amount, 0) / 100),
        minAmount: Math.round(safeInt(r.minAmount, 0) / 100),
        sellPrice: Math.round(safeInt(r.sellPrice, 0) / 100),
        validDays: safeInt(r.validDays, 7),
        stock: safeInt(r.stock, 0),
        soldCount: safeInt(r.soldCount, 0),
        description: r.description || ''
      }));
      res.json({ code: 0, message: 'ok', data: { items } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询优惠券商城失败' });
    }
  });

  app.get('/api/coupons/my', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const coll = getConnectionCollation();
      const [rowsData] = await pool.query(
        `
          SELECT uc._id, uc.templateId, uc.title, uc.amount, uc.minAmount, uc.status,
                 uc.expireTime, uc.usedTime, uc.createTime,
                 IFNULL(ct.validDays, 0) AS validDays
          FROM user_coupons uc
          LEFT JOIN coupon_templates ct ON ${sqlCollateEq('ct._id', 'uc.templateId', coll)}
          WHERE uc._openid COLLATE ${coll} = ?
          ORDER BY uc.createTime DESC
        `,
        [openid]
      );
      const now = Date.now();
      const items = (rowsData || []).map((r) => {
        const exp = new Date(r.expireTime).getTime();
        const rawStatus = String(r.status || 'available');
        const expired = Number.isFinite(exp) && exp <= now && rawStatus !== 'used';
        return {
          _id: String(r._id),
          templateId: String(r.templateId || ''),
          title: r.title || '',
          amount: Math.round(safeInt(r.amount, 0) / 100),
          minAmount: Math.round(safeInt(r.minAmount, 0) / 100),
          status: expired ? 'expired' : rawStatus,
          validDays: safeInt(r.validDays, 0),
          expireTime: r.expireTime,
          usedTime: r.usedTime,
          createTime: r.createTime
        };
      });
      res.json({ code: 0, message: 'ok', data: { items } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询我的优惠券失败' });
    }
  });

  app.get('/api/coupons/available', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const amountCents = Math.max(0, safeInt(req.query.amountCents, 0));
      const [rowsData] = await pool.query(
        `
          SELECT _id, title, amount, minAmount, expireTime
          FROM user_coupons
          WHERE _openid=? AND status='available' AND (expireTime IS NULL OR expireTime > NOW())
          ORDER BY amount DESC, createTime DESC
        `,
        [openid]
      );
      const items = (rowsData || [])
        .map((r) => ({
          _id: String(r._id),
          title: r.title || '',
          amount: Math.round(safeInt(r.amount, 0) / 100),
          minAmount: Math.round(safeInt(r.minAmount, 0) / 100),
          expireTime: r.expireTime,
          description: safeInt(r.minAmount, 0) > 0 ? `满${Math.round(safeInt(r.minAmount, 0) / 100)}元可用` : '无门槛可用',
          eligible: amountCents >= safeInt(r.minAmount, 0)
        }))
        .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.amount - a.amount);
      res.json({ code: 0, message: 'ok', data: { items } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询可用优惠券失败' });
    }
  });

  app.post('/api/coupon-purchase/create', async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const templateId = String(req.body?.templateId || '').trim();
      const qty = Math.max(1, Math.min(10, safeInt(req.body?.qty, 1)));
      if (!templateId) return res.status(400).json({ code: -1, message: '缺少模板ID' });
      await conn.beginTransaction();
      const [tplRows] = await conn.query(
        `
          SELECT _id, title, amount, minAmount, sellPrice, validDays, stock, soldCount, status
          FROM coupon_templates
          WHERE _id=? LIMIT 1 FOR UPDATE
        `,
        [templateId]
      );
      const tpl = tplRows && tplRows[0];
      if (!tpl || String(tpl.status) !== 'active') {
        throw new Error('优惠券模板不存在或不可购买');
      }
      const remain = safeInt(tpl.stock, 0) - safeInt(tpl.soldCount, 0);
      if (remain < qty) throw new Error('库存不足');
      const purchaseId = 'cp_' + uuidv4().replace(/-/g, '').slice(0, 20);
      const unitPrice = safeInt(tpl.sellPrice, 0);
      const totalPrice = unitPrice * qty;
      await conn.query(
        `
          INSERT INTO coupon_purchase_orders
          (_id,_openid,templateId,templateTitle,unitPrice,qty,totalPrice,status,createTime,updateTime)
          VALUES (?,?,?,?,?,?,?,'pending',NOW(),NOW())
        `,
        [purchaseId, openid, templateId, tpl.title || '', unitPrice, qty, totalPrice]
      );
      await conn.commit();
      res.json({
        code: 0,
        message: 'ok',
        data: {
          purchaseId,
          totalPrice: Math.round(totalPrice / 100),
          title: tpl.title || ''
        }
      });
    } catch (e) {
      try {
        await conn.rollback();
      } catch (_) {}
      console.error(e);
      res.status(400).json({ code: -1, message: e.message || '创建购买单失败' });
    } finally {
      conn.release();
    }
  });

  app.post('/api/coupon-purchase/:purchaseId/mockPay', async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const purchaseId = String(req.params.purchaseId || '').trim();
      if (!purchaseId) return res.status(400).json({ code: -1, message: '缺少购买单ID' });
      await conn.beginTransaction();
      const [rowsData] = await conn.query(
        `
          SELECT _id, _openid, templateId, qty, status
          FROM coupon_purchase_orders
          WHERE _id=? AND _openid=? LIMIT 1 FOR UPDATE
        `,
        [purchaseId, openid]
      );
      const p = rowsData && rowsData[0];
      if (!p) throw new Error('购买单不存在');
      if (String(p.status) !== 'pending') {
        await conn.rollback();
        return res.json({ code: 0, message: '已支付，无需重复操作' });
      }
      const [tplRows] = await conn.query(
        `
          SELECT _id, title, amount, minAmount, validDays, stock, soldCount, status
          FROM coupon_templates
          WHERE _id=? LIMIT 1 FOR UPDATE
        `,
        [p.templateId]
      );
      const tpl = tplRows && tplRows[0];
      if (!tpl || String(tpl.status) !== 'active') throw new Error('优惠券模板不可用');
      const qty = Math.max(1, safeInt(p.qty, 1));
      const remain = safeInt(tpl.stock, 0) - safeInt(tpl.soldCount, 0);
      if (remain < qty) throw new Error('库存不足');

      await conn.query(
        `UPDATE coupon_purchase_orders SET status='paid', payTime=NOW(), updateTime=NOW() WHERE _id=? AND status='pending'`,
        [purchaseId]
      );
      await conn.query(`UPDATE coupon_templates SET soldCount = soldCount + ?, updateTime=NOW() WHERE _id=?`, [qty, p.templateId]);

      const validDays = Math.max(1, safeInt(tpl.validDays, 7));
      for (let i = 0; i < qty; i++) {
        const cid = 'uc_' + uuidv4().replace(/-/g, '').slice(0, 22);
        await conn.query(
          `
            INSERT INTO user_coupons
            (_id,_openid,templateId,title,amount,minAmount,status,expireTime,createTime,updateTime)
            VALUES (?,?,?,?,?,?,'available',DATE_ADD(NOW(), INTERVAL ? DAY),NOW(),NOW())
          `,
          [cid, openid, p.templateId, tpl.title || '', safeInt(tpl.amount, 0), safeInt(tpl.minAmount, 0), validDays]
        );
      }

      await conn.commit();
      res.json({ code: 0, message: '购买成功' });
    } catch (e) {
      try {
        await conn.rollback();
      } catch (_) {}
      console.error(e);
      res.status(400).json({ code: -1, message: e.message || '支付失败' });
    } finally {
      conn.release();
    }
  });

  app.get('/api/admin/users', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [me] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!me[0] || !me[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }

      const q = String(req.query.q || '').trim();
      const phone = String(req.query.phone || '').trim();
      const dateFrom = String(req.query.dateFrom || '').trim();
      const dateTo = String(req.query.dateTo || '').trim();
      const accountStatus = String(req.query.accountStatus || '').trim();
      const accountFlag = String(req.query.accountFlag || '').trim();
      const activity = String(req.query.activity || '').trim();
      const sort = String(req.query.sort || 'createTime_desc').trim();
      const page = Math.max(1, safeInt(req.query.page, 1));
      const pageSize = Math.min(100, Math.max(1, safeInt(req.query.pageSize, 20)));
      const offset = (page - 1) * pageSize;

      const whereParts = ['1=1'];
      const params = [];

      if (q) {
        whereParts.push('(u.nickName LIKE ? OR u.phone LIKE ? OR u._id LIKE ?)');
        const qq = `%${q}%`;
        params.push(qq, qq, qq);
      }
      if (phone) {
        whereParts.push('u.phone LIKE ?');
        params.push(`%${phone}%`);
      }
      if (dateFrom) {
        whereParts.push('DATE(u.createTime) >= ?');
        params.push(dateFrom);
      }
      if (dateTo) {
        whereParts.push('DATE(u.createTime) <= ?');
        params.push(dateTo);
      }
      if (accountStatus === 'active' || accountStatus === 'disabled') {
        whereParts.push('IFNULL(u.account_status, ?) = ?');
        params.push('active', accountStatus);
      }
      if (accountFlag === 'flagged') {
        whereParts.push("TRIM(IFNULL(u.account_flag,'')) <> ''");
      } else if (accountFlag && accountFlag !== 'all') {
        whereParts.push('u.account_flag = ?');
        params.push(accountFlag);
      }

      if (activity === 'active_30d') {
        whereParts.push(`(
          EXISTS (SELECT 1 FROM orders o WHERE o._openid=u._id AND o.createTime >= DATE_SUB(NOW(), INTERVAL 30 DAY))
          OR EXISTS (SELECT 1 FROM movie_comments mc WHERE mc._openid=u._id AND mc.createTime >= DATE_SUB(NOW(), INTERVAL 30 DAY))
        )`);
      } else if (activity === 'dormant_90d') {
        whereParts.push('u.createTime < DATE_SUB(NOW(), INTERVAL 90 DAY)');
        whereParts.push(`NOT EXISTS (SELECT 1 FROM orders o WHERE o._openid=u._id AND o.createTime >= DATE_SUB(NOW(), INTERVAL 90 DAY))`);
        whereParts.push(
          `NOT EXISTS (SELECT 1 FROM movie_comments mc WHERE mc._openid=u._id AND mc.createTime >= DATE_SUB(NOW(), INTERVAL 90 DAY))`
        );
      } else if (activity === 'zero_orders') {
        whereParts.push('NOT EXISTS (SELECT 1 FROM orders o WHERE o._openid=u._id)');
      } else if (activity === 'high_value') {
        whereParts.push(
          `u._id IN (SELECT o._openid FROM orders o WHERE o.status='paid' GROUP BY o._openid HAVING SUM(o.totalPrice) >= 50000)`
        );
      }

      const whereSql = `WHERE ${whereParts.join(' AND ')}`;

      let orderSql = 'u.createTime DESC';
      if (sort === 'orderCount_desc') {
        orderSql = '(SELECT COUNT(*) FROM orders o WHERE o._openid=u._id) DESC, u.createTime DESC';
      } else if (sort === 'spent_desc') {
        orderSql =
          "(SELECT COALESCE(SUM(totalPrice),0) FROM orders o WHERE o._openid=u._id AND o.status='paid') DESC, u.createTime DESC";
      } else if (sort === 'lastActive_desc') {
        orderSql = `GREATEST(
          COALESCE((SELECT MAX(o.createTime) FROM orders o WHERE o._openid=u._id), '1970-01-01'),
          COALESCE((SELECT MAX(mc.createTime) FROM movie_comments mc WHERE mc._openid=u._id), '1970-01-01'),
          u.createTime
        ) DESC`;
      }

      const baseFrom = `
        FROM users u
        ${whereSql}
      `;

      const [[cntRow]] = await pool.query(`SELECT COUNT(*) AS c ${baseFrom}`, params);
      const total = safeInt(cntRow && cntRow.c, 0);

      const listParams = params.slice();
      listParams.push(pageSize, offset);
      const [rowsData] = await pool.query(
        `
        SELECT u._id, u.nickName, u.phone, u.avatarUrl, u.role, u.level, u.isAdmin, u.createTime, u.updateTime,
               IFNULL(u.account_status,'active') AS account_status,
               IFNULL(u.account_flag,'') AS account_flag,
               IFNULL(u.admin_remark,'') AS admin_remark,
               (SELECT COUNT(*) FROM orders o WHERE o._openid = u._id) AS orderCount,
               (SELECT COALESCE(SUM(totalPrice),0) FROM orders o WHERE o._openid = u._id AND o.status='paid') AS totalSpentCents,
               (SELECT COUNT(*) FROM movie_comments mc WHERE mc._openid = u._id) AS commentCount,
               (SELECT MAX(o.createTime) FROM orders o WHERE o._openid = u._id) AS lastOrderTime,
               (SELECT MAX(mc.createTime) FROM movie_comments mc WHERE mc._openid = u._id) AS lastCommentTime,
               (SELECT COUNT(*) FROM collections c WHERE c._openid = u._id) AS collectionCount
        ${baseFrom}
        ORDER BY ${orderSql}
        LIMIT ? OFFSET ?
      `,
        listParams
      );

      const items = (rowsData || []).map((u) => {
        const tier = activityTierFromUserRow(u);
        return {
          _id: u._id,
          nickName: u.nickName,
          phone: u.phone || '',
          avatarUrl: u.avatarUrl,
          level: u.isAdmin ? 'admin' : u.level || 'normal',
          accountStatus: String(u.account_status || 'active'),
          accountFlag: String(u.account_flag || ''),
          adminRemark: String(u.admin_remark || ''),
          orderCount: safeInt(u.orderCount, 0),
          commentCount: safeInt(u.commentCount, 0),
          collectionCount: safeInt(u.collectionCount, 0),
          totalSpent: Math.round(safeInt(u.totalSpentCents, 0) / 100),
          createTime: u.createTime,
          updateTime: u.updateTime,
          lastOrderTime: u.lastOrderTime || '',
          lastCommentTime: u.lastCommentTime || '',
          activityTier: tier.tier,
          activityLabel: tier.label
        };
      });

      res.json({
        code: 0,
        message: 'ok',
        data: { items, page, pageSize, total }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.get('/api/admin/cinemas', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [me] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!me[0] || !me[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }

      const keyword = String(req.query.keyword || '').trim();
      let sql = `
        SELECT _id, name, address, phone, latitude, longitude, city, minPrice, tags, createTime
        FROM cinemas
        WHERE 1=1
      `;
      const params = [];
      if (keyword) {
        sql += ` AND (name LIKE ? OR address LIKE ? OR city LIKE ?)`;
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      sql += ` ORDER BY createTime DESC LIMIT 500`;
      const [rowsData] = await pool.query(sql, params);
      const items = (rowsData || []).map((c) => ({
        _id: String(c._id),
        name: c.name || '',
        address: c.address || '',
        phone: c.phone || '',
        latitude: Number(c.latitude || 0),
        longitude: Number(c.longitude || 0),
        city: c.city || '',
        minPrice: Math.round(safeInt(c.minPrice, 0) / 100),
        tags: c.tags ? String(c.tags).split(/[,，]/).filter(Boolean) : [],
        createTime: c.createTime
      }));
      res.json({ code: 0, message: 'ok', data: { items } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.post('/api/admin/cinemas', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [me] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!me[0] || !me[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }

      const body = req.body || {};
      const name = String(body.name || '').trim();
      const address = String(body.address || '').trim();
      const city = String(body.city || '').trim();
      const phone = String(body.phone || '').trim();
      const latitude = Number(body.latitude || 0);
      const longitude = Number(body.longitude || 0);
      const minPriceYuan = Number(body.minPrice || 0);
      const tags = Array.isArray(body.tags)
        ? body.tags.map((t) => String(t || '').trim()).filter(Boolean).join(',')
        : String(body.tags || '').trim();

      if (!name || !address) {
        return res.status(400).json({ code: -1, message: '影院名称和地址不能为空' });
      }

      const [idRows] = await pool.query(`SELECT LPAD(IFNULL(MAX(CAST(_id AS UNSIGNED)), 0) + 1, 1, '0') AS nextId FROM cinemas`);
      const nextId = String((idRows && idRows[0] && idRows[0].nextId) || Date.now());

      await pool.query(
        `
        INSERT INTO cinemas (_id,name,address,phone,latitude,longitude,city,district,minPrice,tags,facilities,distance,createTime,updateTime)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?, NOW(), NOW())
      `,
        [
          nextId,
          name,
          address,
          phone,
          Number.isFinite(latitude) ? latitude : 0,
          Number.isFinite(longitude) ? longitude : 0,
          city,
          '',
          Math.max(0, Math.round((Number.isFinite(minPriceYuan) ? minPriceYuan : 0) * 100)),
          tags,
          '',
          0
        ]
      );
      await seedDefaultCinemaHallsIfEmpty(pool, nextId);
      res.json({ code: 0, message: 'ok', data: { _id: nextId } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '新增失败' });
    }
  });

  app.get('/api/admin/cinemas/:cinemaId/halls', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [me] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!me[0] || !me[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }
      const cinemaId = String(req.params.cinemaId || '').trim();
      if (!cinemaId) return res.status(400).json({ code: -1, message: '缺少影院ID' });
      const [rowsData] = await pool.query(
        `SELECT _id, cinemaId, name, hallType, seatRows, seatCols, sortOrder, createTime, updateTime
         FROM cinema_halls WHERE cinemaId = ? ORDER BY sortOrder ASC, createTime ASC, _id ASC`,
        [cinemaId]
      );
      res.json({ code: 0, message: 'ok', data: { items: rowsData || [] } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.post('/api/admin/cinemas/:cinemaId/halls', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [me] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!me[0] || !me[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }
      const cinemaId = String(req.params.cinemaId || '').trim();
      if (!cinemaId) return res.status(400).json({ code: -1, message: '缺少影院ID' });
      const body = req.body || {};
      const name = String(body.name || '').trim();
      const hallType = String(body.hallType || '普通厅').trim() || '普通厅';
      const sr = Math.max(4, Math.min(30, safeInt(body.seatRows, seatRows)));
      const sc = Math.max(6, Math.min(30, safeInt(body.seatCols, seatCols)));
      const sortOrder = safeInt(body.sortOrder, 0);
      if (!name) return res.status(400).json({ code: -1, message: '影厅名称不能为空' });
      const [cRows] = await pool.query(`SELECT _id FROM cinemas WHERE _id=? LIMIT 1`, [cinemaId]);
      if (!cRows || !cRows.length) {
        return res.status(404).json({ code: -1, message: '影院不存在' });
      }
      const hallId = `h_${cinemaId}_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
      const now = nowDb();
      await pool.query(
        `INSERT INTO cinema_halls (_id,cinemaId,name,hallType,seatRows,seatCols,sortOrder,createTime,updateTime) VALUES (?,?,?,?,?,?,?,?,?)`,
        [hallId, cinemaId, name, hallType, sr, sc, sortOrder, now, now]
      );
      res.json({ code: 0, message: 'ok', data: { _id: hallId } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '新增失败' });
    }
  });

  app.put('/api/admin/cinemas/:cinemaId/halls/:hallId', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [me] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!me[0] || !me[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }
      const cinemaId = String(req.params.cinemaId || '').trim();
      const hallId = String(req.params.hallId || '').trim();
      if (!cinemaId || !hallId) {
        return res.status(400).json({ code: -1, message: '缺少影院ID或影厅ID' });
      }
      const body = req.body || {};
      const sets = [];
      const vals = [];
      if (Object.prototype.hasOwnProperty.call(body, 'name')) {
        const name = String(body.name || '').trim();
        if (!name) return res.status(400).json({ code: -1, message: '影厅名称不能为空' });
        sets.push('name=?');
        vals.push(name);
      }
      if (Object.prototype.hasOwnProperty.call(body, 'hallType')) {
        sets.push('hallType=?');
        vals.push(String(body.hallType || '').trim() || '普通厅');
      }
      if (Object.prototype.hasOwnProperty.call(body, 'seatRows')) {
        sets.push('seatRows=?');
        vals.push(Math.max(4, Math.min(30, safeInt(body.seatRows, seatRows))));
      }
      if (Object.prototype.hasOwnProperty.call(body, 'seatCols')) {
        sets.push('seatCols=?');
        vals.push(Math.max(6, Math.min(30, safeInt(body.seatCols, seatCols))));
      }
      if (Object.prototype.hasOwnProperty.call(body, 'sortOrder')) {
        sets.push('sortOrder=?');
        vals.push(safeInt(body.sortOrder, 0));
      }
      if (!sets.length) {
        return res.status(400).json({ code: -1, message: '没有要更新的字段' });
      }
      sets.push('updateTime=NOW()');
      vals.push(hallId, cinemaId);
      const [result] = await pool.query(
        `UPDATE cinema_halls SET ${sets.join(', ')} WHERE _id=? AND cinemaId=?`,
        vals
      );
      if (!result || !result.affectedRows) {
        return res.status(404).json({ code: -1, message: '影厅不存在' });
      }
      res.json({ code: 0, message: 'ok' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '更新失败' });
    }
  });

  app.delete('/api/admin/cinemas/:cinemaId/halls/:hallId', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [me] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!me[0] || !me[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }
      const cinemaId = String(req.params.cinemaId || '').trim();
      const hallId = String(req.params.hallId || '').trim();
      if (!cinemaId || !hallId) {
        return res.status(400).json({ code: -1, message: '缺少影院ID或影厅ID' });
      }
      const [result] = await pool.query(`DELETE FROM cinema_halls WHERE _id=? AND cinemaId=?`, [hallId, cinemaId]);
      if (!result || !result.affectedRows) {
        return res.status(404).json({ code: -1, message: '影厅不存在' });
      }
      res.json({ code: 0, message: 'ok' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '删除失败' });
    }
  });

  app.put('/api/admin/cinemas/:cinemaId', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [me] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!me[0] || !me[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }

      const cinemaId = String(req.params.cinemaId || '').trim();
      const body = req.body || {};
      const name = String(body.name || '').trim();
      const address = String(body.address || '').trim();
      const city = String(body.city || '').trim();
      const phone = String(body.phone || '').trim();
      const latitude = Number(body.latitude || 0);
      const longitude = Number(body.longitude || 0);
      const minPriceYuan = Number(body.minPrice || 0);
      const tags = Array.isArray(body.tags)
        ? body.tags.map((t) => String(t || '').trim()).filter(Boolean).join(',')
        : String(body.tags || '').trim();

      if (!cinemaId) return res.status(400).json({ code: -1, message: '缺少影院ID' });
      if (!name || !address) {
        return res.status(400).json({ code: -1, message: '影院名称和地址不能为空' });
      }

      const [result] = await pool.query(
        `
        UPDATE cinemas
        SET name=?, address=?, phone=?, latitude=?, longitude=?, city=?, minPrice=?, tags=?, updateTime=NOW()
        WHERE _id=?
      `,
        [
          name,
          address,
          phone,
          Number.isFinite(latitude) ? latitude : 0,
          Number.isFinite(longitude) ? longitude : 0,
          city,
          Math.max(0, Math.round((Number.isFinite(minPriceYuan) ? minPriceYuan : 0) * 100)),
          tags,
          cinemaId
        ]
      );
      if (!result || !result.affectedRows) {
        return res.status(404).json({ code: -1, message: '影院不存在' });
      }
      res.json({ code: 0, message: 'ok' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '更新失败' });
    }
  });

  app.delete('/api/admin/cinemas/:cinemaId', async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [me] = await conn.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!me[0] || !me[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }

      const cinemaId = String(req.params.cinemaId || '').trim();
      if (!cinemaId) return res.status(400).json({ code: -1, message: '缺少影院ID' });

      await conn.beginTransaction();
      await conn.query(`DELETE FROM seats WHERE scheduleId IN (SELECT _id FROM schedules WHERE cinemaId = ?)`, [cinemaId]);
      await conn.query(`DELETE FROM schedules WHERE cinemaId = ?`, [cinemaId]);
      await conn.query(`DELETE FROM cinema_halls WHERE cinemaId = ?`, [cinemaId]);
      const [result] = await conn.query(`DELETE FROM cinemas WHERE _id = ?`, [cinemaId]);
      if (!result || !result.affectedRows) {
        await conn.rollback();
        return res.status(404).json({ code: -1, message: '影院不存在' });
      }
      await conn.commit();
      res.json({ code: 0, message: 'ok' });
    } catch (e) {
      try {
        await conn.rollback();
      } catch (_) {}
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '删除失败' });
    } finally {
      conn.release();
    }
  });

  app.delete('/api/admin/users/:userId', async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });

      const userId = String(req.params.userId || '').trim();
      if (!userId) return res.status(400).json({ code: -1, message: '缺少 userId' });
      if (userId === openid) {
        return res.status(400).json({ code: -1, message: '不允许删除当前管理员账号' });
      }

      const [meRows] = await conn.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!meRows[0] || !meRows[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }

      const [targetRows] = await conn.query(`SELECT _id, isAdmin FROM users WHERE _id=? LIMIT 1`, [userId]);
      if (!targetRows[0]) {
        return res.status(404).json({ code: -1, message: '用户不存在' });
      }
      if (targetRows[0].isAdmin) {
        return res.status(400).json({ code: -1, message: '不允许删除管理员账号' });
      }

      await conn.beginTransaction();

      const [orderRows] = await conn.query(`SELECT _id FROM orders WHERE _openid = ?`, [userId]);
      const orderIds = (orderRows || []).map((r) => String(r._id)).filter(Boolean);
      if (orderIds.length) {
        await conn.query(`UPDATE seats SET status='available', orderId=NULL, updateTime=NOW() WHERE orderId IN (?)`, [
          orderIds
        ]);
      }

      await conn.query(`DELETE FROM orders WHERE _openid = ?`, [userId]);
      await conn.query(`DELETE FROM collections WHERE _openid = ?`, [userId]);
      await conn.query(`DELETE FROM movie_comments WHERE _openid = ?`, [userId]);
      try {
        await conn.query(`DELETE FROM user_points_log WHERE _openid = ?`, [userId]);
      } catch (_) {}
      try {
        await conn.query(`DELETE FROM user_points_balance WHERE _openid = ?`, [userId]);
      } catch (_) {}
      await conn.query(`DELETE FROM users WHERE _id = ?`, [userId]);

      await conn.commit();
      res.json({ code: 0, message: 'ok' });
    } catch (e) {
      try {
        await conn.rollback();
      } catch (_) {}
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '删除失败' });
    } finally {
      conn.release();
    }
  });

  app.patch('/api/admin/users/:userId', async (req, res) => {
    try {
      const operatorOpenid = getOpenid(req);
      if (!operatorOpenid) return res.status(401).json({ code: -1, message: '未登录' });
      const [meRows] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [operatorOpenid]);
      if (!meRows[0] || !meRows[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }

      const userId = String(req.params.userId || '').trim();
      if (!userId) return res.status(400).json({ code: -1, message: '缺少 userId' });

      const body = req.body || {};
      const nextStatus = body.accountStatus !== undefined ? String(body.accountStatus || '').trim() : undefined;
      const nextFlag = body.accountFlag !== undefined ? String(body.accountFlag || '').trim() : undefined;
      const nextRemark = body.adminRemark !== undefined ? String(body.adminRemark || '').trim() : undefined;

      if (nextStatus === undefined && nextFlag === undefined && nextRemark === undefined) {
        return res.status(400).json({ code: -1, message: '没有可更新的字段' });
      }

      const allowedFlags = new Set(['', 'watch', 'abnormal', 'spam']);
      if (nextFlag !== undefined && !allowedFlags.has(nextFlag)) {
        return res.status(400).json({ code: -1, message: 'accountFlag 取值无效' });
      }
      if (nextStatus !== undefined && nextStatus !== 'active' && nextStatus !== 'disabled') {
        return res.status(400).json({ code: -1, message: 'accountStatus 仅支持 active / disabled' });
      }
      if (nextRemark !== undefined && nextRemark.length > 255) {
        return res.status(400).json({ code: -1, message: '备注过长' });
      }

      const [targetRows] = await pool.query(
        `SELECT _id, isAdmin, IFNULL(account_status,'active') AS account_status, IFNULL(account_flag,'') AS account_flag, IFNULL(admin_remark,'') AS admin_remark FROM users WHERE _id=? LIMIT 1`,
        [userId]
      );
      const tu = targetRows && targetRows[0];
      if (!tu) return res.status(404).json({ code: -1, message: '用户不存在' });
      if (tu.isAdmin) {
        return res.status(400).json({ code: -1, message: '不可修改管理员账号状态/标记（请使用数据库）' });
      }
      if (nextStatus === 'disabled' && userId === operatorOpenid) {
        return res.status(400).json({ code: -1, message: '不可禁用当前登录账号' });
      }

      const sets = [];
      const vals = [];
      if (nextStatus !== undefined) {
        sets.push('account_status=?');
        vals.push(nextStatus);
      }
      if (nextFlag !== undefined) {
        sets.push('account_flag=?');
        vals.push(nextFlag);
      }
      if (nextRemark !== undefined) {
        sets.push('admin_remark=?');
        vals.push(nextRemark);
      }
      sets.push('updateTime=NOW()');
      vals.push(userId);
      await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE _id=?`, vals);

      const parts = [];
      if (nextStatus !== undefined) parts.push(`状态:${tu.account_status}→${nextStatus}`);
      if (nextFlag !== undefined) parts.push(`标记:${tu.account_flag || '(空)'}→${nextFlag || '(空)'}`);
      if (nextRemark !== undefined) parts.push('备注已更新');
      await appendAdminSecurityAudit(pool, req, {
        operatorOpenid,
        category: 'users',
        action: 'admin_user_account_update',
        summary: `目标:${summarizeForAudit('id', userId, 40)} ${parts.join('；')}`.slice(0, 500)
      });

      const [out] = await pool.query(
        `SELECT _id, nickName, phone, IFNULL(account_status,'active') AS account_status, IFNULL(account_flag,'') AS account_flag, IFNULL(admin_remark,'') AS admin_remark FROM users WHERE _id=? LIMIT 1`,
        [userId]
      );
      const ou = out && out[0];
      res.json({
        code: 0,
        message: 'ok',
        data: {
          _id: ou._id,
          nickName: ou.nickName,
          phone: ou.phone || '',
          accountStatus: String(ou.account_status || 'active'),
          accountFlag: String(ou.account_flag || ''),
          adminRemark: String(ou.admin_remark || '')
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '更新失败' });
    }
  });

  app.get('/api/admin/users/:userId/detail', async (req, res) => {
    try {
      const operatorOpenid = getOpenid(req);
      if (!operatorOpenid) return res.status(401).json({ code: -1, message: '未登录' });
      const [meRows] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [operatorOpenid]);
      if (!meRows[0] || !meRows[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }

      const userId = String(req.params.userId || '').trim();
      if (!userId) return res.status(400).json({ code: -1, message: '缺少 userId' });

      const [uRows] = await pool.query(
        `
        SELECT u._id, u.nickName, u.phone, u.avatarUrl, u.role, u.level, u.isAdmin, u.gender, u.createTime, u.updateTime,
               IFNULL(u.account_status,'active') AS account_status,
               IFNULL(u.account_flag,'') AS account_flag,
               IFNULL(u.admin_remark,'') AS admin_remark,
               (SELECT COUNT(*) FROM orders o WHERE o._openid=u._id) AS orderCount,
               (SELECT COUNT(*) FROM orders o WHERE o._openid=u._id AND o.status='paid') AS paidOrderCount,
               (SELECT COUNT(*) FROM orders o WHERE o._openid=u._id AND o.status='pending') AS pendingOrderCount,
               (SELECT COUNT(*) FROM orders o WHERE o._openid=u._id AND o.status IN ('cancelled','refunded')) AS closedOrderCount,
               (SELECT COALESCE(SUM(totalPrice),0) FROM orders o WHERE o._openid=u._id AND o.status='paid') AS totalSpentCents,
               (SELECT MAX(o.createTime) FROM orders o WHERE o._openid=u._id) AS lastOrderTime,
               (SELECT COUNT(*) FROM movie_comments mc WHERE mc._openid=u._id) AS commentCount,
               (SELECT MAX(mc.createTime) FROM movie_comments mc WHERE mc._openid=u._id) AS lastCommentTime,
               (SELECT COUNT(*) FROM collections c WHERE c._openid=u._id) AS collectionCount
        FROM users u
        WHERE u._id=?
        LIMIT 1
      `,
        [userId]
      );
      const u = uRows && uRows[0];
      if (!u) return res.status(404).json({ code: -1, message: '用户不存在' });

      let pointsBalance = 0;
      try {
        const [pb] = await pool.query(`SELECT balance FROM user_points_balance WHERE _openid=? LIMIT 1`, [userId]);
        pointsBalance = safeInt(pb && pb[0] && pb[0].balance, 0);
      } catch (_) {}

      const tier = activityTierFromUserRow({
        orderCount: u.orderCount,
        commentCount: u.commentCount,
        lastOrderTime: u.lastOrderTime,
        lastCommentTime: u.lastCommentTime,
        createTime: u.createTime
      });

      res.json({
        code: 0,
        message: 'ok',
        data: {
          profile: {
            _id: u._id,
            nickName: u.nickName,
            phone: u.phone || '',
            avatarUrl: u.avatarUrl || '',
            gender: safeInt(u.gender, 0),
            role: u.role || '',
            level: u.isAdmin ? 'admin' : u.level || 'normal',
            isAdmin: u.isAdmin ? 1 : 0,
            createTime: u.createTime,
            updateTime: u.updateTime,
            accountStatus: String(u.account_status || 'active'),
            accountFlag: String(u.account_flag || ''),
            adminRemark: String(u.admin_remark || '')
          },
          behavior: {
            orderCount: safeInt(u.orderCount, 0),
            paidOrderCount: safeInt(u.paidOrderCount, 0),
            pendingOrderCount: safeInt(u.pendingOrderCount, 0),
            closedOrderCount: safeInt(u.closedOrderCount, 0),
            totalSpentYuan: Math.round(safeInt(u.totalSpentCents, 0) / 100),
            lastOrderTime: u.lastOrderTime || '',
            commentCount: safeInt(u.commentCount, 0),
            lastCommentTime: u.lastCommentTime || '',
            collectionCount: safeInt(u.collectionCount, 0),
            pointsBalance,
            activityTier: tier.tier,
            activityLabel: tier.label
          }
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.get('/api/admin/users/:userId/orders', async (req, res) => {
    try {
      const operatorOpenid = getOpenid(req);
      if (!operatorOpenid) return res.status(401).json({ code: -1, message: '未登录' });
      const [meRows] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [operatorOpenid]);
      if (!meRows[0] || !meRows[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }
      const userId = String(req.params.userId || '').trim();
      if (!userId) return res.status(400).json({ code: -1, message: '缺少 userId' });
      const page = Math.max(1, safeInt(req.query.page, 1));
      const pageSize = Math.min(100, Math.max(1, safeInt(req.query.pageSize, 20)));
      const offset = (page - 1) * pageSize;

      const [rowsData] = await pool.query(
        `
        SELECT o._id, o.orderNo, o.status, o.totalPrice, o.movieTitle, o.cinemaName,
               o.hallName, o.date, o.startTime, o.createTime, o.purchaseTime
        FROM orders o
        WHERE o._openid = ?
        ORDER BY o.createTime DESC
        LIMIT ? OFFSET ?
      `,
        [userId, pageSize, offset]
      );
      const [[cntRow]] = await pool.query(`SELECT COUNT(*) AS c FROM orders WHERE _openid=?`, [userId]);
      const total = safeInt(cntRow && cntRow.c, 0);
      const items = (rowsData || []).map((o) => ({
        _id: o._id,
        orderNo: o.orderNo,
        status: o.status,
        totalPrice: safeInt(o.totalPrice, 0),
        movieTitle: o.movieTitle || '',
        cinemaName: o.cinemaName || '',
        hallName: o.hallName || '',
        date: o.date,
        startTime: o.startTime,
        createTime: o.createTime,
        purchaseTime: o.purchaseTime
      }));
      res.json({ code: 0, message: 'ok', data: { items, page, pageSize, total } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.get('/api/admin/users/:userId/comments', async (req, res) => {
    try {
      const operatorOpenid = getOpenid(req);
      if (!operatorOpenid) return res.status(401).json({ code: -1, message: '未登录' });
      const [meRows] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [operatorOpenid]);
      if (!meRows[0] || !meRows[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }
      const userId = String(req.params.userId || '').trim();
      if (!userId) return res.status(400).json({ code: -1, message: '缺少 userId' });
      const page = Math.max(1, safeInt(req.query.page, 1));
      const pageSize = Math.min(100, Math.max(1, safeInt(req.query.pageSize, 20)));
      const offset = (page - 1) * pageSize;

      const [rowsData] = await pool.query(
        `
        SELECT _id, movieId, nickName, rating, content, likes, createTime
        FROM movie_comments
        WHERE _openid = ?
        ORDER BY createTime DESC
        LIMIT ? OFFSET ?
      `,
        [userId, pageSize, offset]
      );
      const [[cntRow]] = await pool.query(`SELECT COUNT(*) AS c FROM movie_comments WHERE _openid=?`, [userId]);
      const total = safeInt(cntRow && cntRow.c, 0);
      const items = (rowsData || []).map((r) => ({
        _id: r._id,
        movieId: r.movieId,
        nickName: r.nickName || '',
        rating: safeInt(r.rating, 0),
        content: r.content || '',
        likes: safeInt(r.likes, 0),
        createTime: r.createTime
      }));
      res.json({ code: 0, message: 'ok', data: { items, page, pageSize, total } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  app.get('/api/admin/tmdb-config', async (req, res) => {
    try {
      res.json({
        code: 0,
        message: 'ok',
        data: {
          hasTmdbApiKey: !!process.env.TMDB_API_KEY,
          hasTmdbSyncSecret: !!process.env.TMDB_SYNC_SECRET
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  /** 全站订单列表（管理端）：订单号 / 用户关键词 / 场次 / 状态 / 异常视图 */
  app.get('/api/admin/orders', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;

      const status = String(req.query.status || '').trim();
      const filter = String(req.query.filter || '').trim();
      const page = Math.max(1, safeInt(req.query.page, 1));
      const pageSize = Math.min(100, Math.max(1, safeInt(req.query.pageSize, 20)));
      const offset = (page - 1) * pageSize;

      let where = 'WHERE 1=1';
      const params = [];

      if (filter === 'abnormal') {
        where +=
          " AND ((o.status='pending' AND o.createTime < DATE_SUB(NOW(), INTERVAL 30 MINUTE)) OR IFNULL(o.refund_request_status,'')='pending')";
      } else if (filter === 'refund_queue') {
        where += " AND IFNULL(o.refund_request_status,'')='pending' AND o.status='paid'";
      } else if (status) {
        where += ' AND o.status = ?';
        params.push(status);
      }

      const orderNo = String(req.query.orderNo || '').trim();
      if (orderNo) {
        where += ' AND o.orderNo LIKE ?';
        params.push(`%${orderNo}%`);
      }
      const scheduleId = String(req.query.scheduleId || '').trim();
      if (scheduleId) {
        where += ' AND o.scheduleId = ?';
        params.push(scheduleId);
      }
      const userKeyword = String(req.query.userKeyword || '').trim();
      if (userKeyword) {
        where += ' AND (u.nickName LIKE ? OR u.phone LIKE ? OR o._openid LIKE ?)';
        const like = `%${userKeyword}%`;
        params.push(like, like, like);
      }
      const userOpenid = String(req.query.userOpenid || '').trim();
      if (userOpenid) {
        where += ' AND o._openid = ?';
        params.push(userOpenid);
      }

      const countParams = [...params];
      const [[cntRow]] = await pool.query(
        `
        SELECT COUNT(*) AS c
        FROM orders o
        LEFT JOIN users u ON u._id = o._openid
        ${where}
      `,
        countParams
      );
      const total = safeInt(cntRow && cntRow.c, 0);

      const listParams = [...params, pageSize, offset];
      const [rowsData] = await pool.query(
        `
        SELECT o._id, o.orderNo, o.status, o.totalPrice, o.movieTitle, o.cinemaName,
               o.hallName, o.date, o.startTime, o.createTime, o.purchaseTime, o.payTime,
               o.scheduleId, o._openid, u.nickName AS userNick, u.phone AS userPhone,
               IFNULL(o.refund_request_status,'') AS refundRequestStatus,
               o.refund_request_time AS refundRequestTime
        FROM orders o
        LEFT JOIN users u ON u._id = o._openid
        ${where}
        ORDER BY o.createTime DESC
        LIMIT ? OFFSET ?
      `,
        listParams
      );

      const items = (rowsData || []).map((o) => ({
        _id: o._id,
        orderNo: o.orderNo,
        status: o.status,
        totalPrice: safeInt(o.totalPrice, 0),
        movieTitle: o.movieTitle || '',
        cinemaName: o.cinemaName || '',
        hallName: o.hallName || '',
        date: o.date,
        startTime: o.startTime,
        createTime: o.createTime,
        purchaseTime: o.purchaseTime,
        payTime: o.payTime,
        scheduleId: o.scheduleId || '',
        _openid: o._openid || '',
        userNick: o.userNick || '',
        userPhone: o.userPhone || '',
        refundRequestStatus: String(o.refundRequestStatus || ''),
        refundRequestTime: o.refundRequestTime
      }));

      res.json({ code: 0, message: 'ok', data: { items, page, pageSize, total } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  /** 订单详情（管理端） */
  app.get('/api/admin/orders/:orderId', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;
      const orderId = String(req.params.orderId || '').trim();
      if (!orderId) return res.status(400).json({ code: -1, message: '缺少订单ID' });

      const [rowsData] = await pool.query(
        `
        SELECT o.*, u.nickName AS userNick, u.phone AS userPhone
        FROM orders o
        LEFT JOIN users u ON u._id = o._openid
        WHERE o._id = ?
        LIMIT 1
      `,
        [orderId]
      );
      const row = rowsData && rowsData[0];
      if (!row) return res.status(404).json({ code: -1, message: '订单不存在' });

      res.json({
        code: 0,
        message: 'ok',
        data: {
          _id: row._id,
          orderNo: row.orderNo,
          status: row.status,
          totalPrice: safeInt(row.totalPrice, 0),
          movieTitle: row.movieTitle || '',
          moviePoster: row.moviePoster || '',
          cinemaName: row.cinemaName || '',
          hallName: row.hallName || '',
          date: row.date,
          startTime: row.startTime,
          seats: mapSeatsJsonForAdmin(row.seatsJson),
          createTime: row.createTime,
          purchaseTime: row.purchaseTime,
          payTime: row.payTime,
          refundTime: row.refundTime,
          scheduleId: row.scheduleId || '',
          seatCount: safeInt(row.seatCount, 0),
          _openid: row._openid || '',
          userNick: row.userNick || '',
          userPhone: row.userPhone || '',
          refundRequestStatus: String(row.refund_request_status || ''),
          refundRequestNote: String(row.refund_request_note || ''),
          refundReviewNote: String(row.refund_review_note || ''),
          refundRequestTime: row.refund_request_time
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '查询失败' });
    }
  });

  /** 与支付宝核对支付状态；若本地仍为待支付且支付宝已成功，则补记账为已支付 */
  app.post('/api/admin/orders/:orderId/sync-alipay', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;
      const orderId = String(req.params.orderId || '').trim();
      if (!orderId) return res.status(400).json({ code: -1, message: '缺少订单ID' });

      const [rowsData] = await pool.query(
        `SELECT _id, _openid, status, orderNo, seatCount, scheduleId, couponId FROM orders WHERE _id=? LIMIT 1`,
        [orderId]
      );
      const order = rowsData && rowsData[0];
      if (!order) return res.status(404).json({ code: -1, message: '订单不存在' });

      const q = await alipayPay.queryTradeByOutTradeNo(order.orderNo);
      let synced = false;
      if (
        order.status === 'pending' &&
        q.configured &&
        q.ok &&
        (q.tradeStatus === 'TRADE_SUCCESS' || q.tradeStatus === 'TRADE_FINISHED')
      ) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          const [rows2] = await conn.query(
            `SELECT _id, _openid, status, seatCount, scheduleId, couponId FROM orders WHERE _id=? FOR UPDATE`,
            [orderId]
          );
          const o2 = rows2 && rows2[0];
          if (o2 && o2.status === 'pending') {
            const ok = await orderLifecycle.fulfillOrderAfterPayment(conn, o2);
            if (ok) {
              await conn.commit();
              synced = true;
              try {
                await appendAdminSecurityAudit(pool, req, {
                  operatorOpenid: adminOp,
                  category: 'order',
                  action: 'admin_order_sync_alipay',
                  summary: summarizeForAudit('orderId', orderId) + ' ' + summarizeForAudit('orderNo', order.orderNo)
                });
              } catch (ae) {
                console.warn('[admin_audit] sync alipay', ae.message || ae);
              }
            } else await conn.rollback();
          } else await conn.rollback();
        } catch (e) {
          try {
            await conn.rollback();
          } catch (_) {}
          return res.status(400).json({ code: -1, message: e.message || '同步失败' });
        } finally {
          conn.release();
        }
      }

      const [again] = await pool.query(
        `SELECT _id, orderNo, status, payTime FROM orders WHERE _id=? LIMIT 1`,
        [orderId]
      );
      const cur = again && again[0];
      res.json({
        code: 0,
        message: 'ok',
        data: {
          synced,
          alipay: q,
          order: cur
            ? {
                _id: cur._id,
                orderNo: cur.orderNo,
                status: cur.status,
                payTime: cur.payTime
              }
            : null
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '核对失败' });
    }
  });

  /** 取消待支付订单（释放座位与券） */
  app.post('/api/admin/orders/:orderId/cancel-pending', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;
      const orderId = String(req.params.orderId || '').trim();
      if (!orderId) return res.status(400).json({ code: -1, message: '缺少订单ID' });

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await orderLifecycle.cancelPendingOrder(conn, orderId);
        await conn.commit();
      } catch (e) {
        try {
          await conn.rollback();
        } catch (_) {}
        return res.status(400).json({ code: -1, message: e.message || '取消失败' });
      } finally {
        conn.release();
      }
      try {
        await appendAdminSecurityAudit(pool, req, {
          operatorOpenid: adminOp,
          category: 'order',
          action: 'admin_order_cancel_pending',
          summary: summarizeForAudit('orderId', orderId)
        });
      } catch (ae) {
        console.warn('[admin_audit] cancel pending', ae.message || ae);
      }
      res.json({ code: 0, message: 'ok', data: {} });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '取消失败' });
    }
  });

  /** 标记退款待审批（已支付订单） */
  app.post('/api/admin/orders/:orderId/refund-request', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;
      const orderId = String(req.params.orderId || '').trim();
      const note = String((req.body && req.body.note) || '').trim().slice(0, 255);
      if (!orderId) return res.status(400).json({ code: -1, message: '缺少订单ID' });

      const [r] = await pool.query(
        `
        UPDATE orders
        SET refund_request_status='pending',
            refund_request_note=?,
            refund_review_note='',
            refund_request_time=NOW(),
            updateTime=NOW()
        WHERE _id=? AND status='paid'
          AND IFNULL(refund_request_status,'') NOT IN ('pending')
      `,
        [note, orderId]
      );
      if (!r || !r.affectedRows) {
        return res.status(400).json({ code: -1, message: '仅可对「已支付」且未在退款审批中的订单发起' });
      }
      try {
        await appendAdminSecurityAudit(pool, req, {
          operatorOpenid: adminOp,
          category: 'order',
          action: 'admin_order_refund_request',
          summary: summarizeForAudit('orderId', orderId) + ' ' + summarizeForAudit('note', note)
        });
      } catch (ae) {
        console.warn('[admin_audit] refund request', ae.message || ae);
      }
      res.json({ code: 0, message: 'ok', data: {} });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '操作失败' });
    }
  });

  /** 批准退款（须处于退款审批中） */
  app.post('/api/admin/orders/:orderId/refund-approve', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;
      const orderId = String(req.params.orderId || '').trim();
      const note = String((req.body && req.body.note) || '').trim().slice(0, 255);
      if (!orderId) return res.status(400).json({ code: -1, message: '缺少订单ID' });

      const [chk] = await pool.query(
        `SELECT status, IFNULL(refund_request_status,'') AS rs FROM orders WHERE _id=? LIMIT 1`,
        [orderId]
      );
      const c = chk && chk[0];
      if (!c || c.status !== 'paid' || String(c.rs) !== 'pending') {
        return res.status(400).json({ code: -1, message: '仅可批准「已支付且退款审批中」的订单' });
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await orderLifecycle.refundPaidOrder(conn, orderId);
        await conn.query(
          `UPDATE orders SET refund_request_status='', refund_request_note='', refund_request_time=NULL, refund_review_note=?, updateTime=NOW() WHERE _id=?`,
          [note, orderId]
        );
        await conn.commit();
      } catch (e) {
        try {
          await conn.rollback();
        } catch (_) {}
        return res.status(400).json({ code: -1, message: e.message || '退款失败' });
      } finally {
        conn.release();
      }
      try {
        await appendAdminSecurityAudit(pool, req, {
          operatorOpenid: adminOp,
          category: 'order',
          action: 'admin_order_refund_approve',
          summary: summarizeForAudit('orderId', orderId) + ' ' + summarizeForAudit('note', note)
        });
      } catch (ae) {
        console.warn('[admin_audit] refund approve', ae.message || ae);
      }
      res.json({ code: 0, message: 'ok', data: {} });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '退款失败' });
    }
  });

  /** 驳回退款申请 */
  app.post('/api/admin/orders/:orderId/refund-reject', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;
      const orderId = String(req.params.orderId || '').trim();
      const note = String((req.body && req.body.note) || '').trim().slice(0, 255);
      if (!orderId) return res.status(400).json({ code: -1, message: '缺少订单ID' });

      const [r] = await pool.query(
        `
        UPDATE orders
        SET refund_request_status='',
            refund_review_note=?,
            updateTime=NOW()
        WHERE _id=? AND status='paid' AND IFNULL(refund_request_status,'')='pending'
      `,
        [note, orderId]
      );
      if (!r || !r.affectedRows) {
        return res.status(400).json({ code: -1, message: '无待审批的退款申请' });
      }
      try {
        await appendAdminSecurityAudit(pool, req, {
          operatorOpenid: adminOp,
          category: 'order',
          action: 'admin_order_refund_reject',
          summary: summarizeForAudit('orderId', orderId) + ' ' + summarizeForAudit('note', note)
        });
      } catch (ae) {
        console.warn('[admin_audit] refund reject', ae.message || ae);
      }
      res.json({ code: 0, message: 'ok', data: {} });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '操作失败' });
    }
  });

  /** 异常场景：不经「待审批」直接退款（已支付） */
  app.post('/api/admin/orders/:orderId/refund-direct', async (req, res) => {
    try {
      const adminOp = await requireAdminOpenid(req, res);
      if (!adminOp) return;
      const orderId = String(req.params.orderId || '').trim();
      const note = String((req.body && req.body.note) || '').trim().slice(0, 255);
      if (!orderId) return res.status(400).json({ code: -1, message: '缺少订单ID' });

      const [chk] = await pool.query(
        `SELECT status FROM orders WHERE _id=? LIMIT 1`,
        [orderId]
      );
      const c = chk && chk[0];
      if (!c || c.status !== 'paid') {
        return res.status(400).json({ code: -1, message: '仅可对已支付订单执行强制退款' });
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await orderLifecycle.refundPaidOrder(conn, orderId);
        await conn.query(
          `UPDATE orders SET refund_request_status='', refund_request_note='', refund_request_time=NULL, refund_review_note=?, updateTime=NOW() WHERE _id=?`,
          [note, orderId]
        );
        await conn.commit();
      } catch (e) {
        try {
          await conn.rollback();
        } catch (_) {}
        return res.status(400).json({ code: -1, message: e.message || '退款失败' });
      } finally {
        conn.release();
      }
      try {
        await appendAdminSecurityAudit(pool, req, {
          operatorOpenid: adminOp,
          category: 'order',
          action: 'admin_order_refund_direct',
          summary: summarizeForAudit('orderId', orderId) + ' ' + summarizeForAudit('note', note)
        });
      } catch (ae) {
        console.warn('[admin_audit] refund direct', ae.message || ae);
      }
      res.json({ code: 0, message: 'ok', data: {} });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '退款失败' });
    }
  });

  /** 管理首页「今日数据」：订单、收入、新增用户、在映影片数（均来自 MySQL） */
  app.get('/api/admin/dashboard-stats', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [me] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!me[0] || !me[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }

      const [[orderRow]] = await pool.query(
        `SELECT COUNT(*) AS c FROM orders WHERE DATE(createTime) = CURDATE()`
      );
      const [[revRow]] = await pool.query(
        `
        SELECT COALESCE(SUM(totalPrice), 0) AS cents
        FROM orders
        WHERE status = 'paid'
          AND DATE(COALESCE(payTime, purchaseTime, createTime)) = CURDATE()
      `
      );
      const [[userRow]] = await pool.query(
        `SELECT COUNT(*) AS c FROM users WHERE DATE(createTime) = CURDATE()`
      );
      const [[movieRow]] = await pool.query(
        `SELECT COUNT(*) AS c FROM movies WHERE status IN ('showing','coming')`
      );

      const cents = Number(revRow && revRow.cents != null ? revRow.cents : 0);
      const todayRevenueYuan = Math.round((cents / 100) * 10) / 10;

      res.json({
        code: 0,
        message: 'ok',
        data: {
          todayOrders: Number(orderRow && orderRow.c != null ? orderRow.c : 0),
          todayRevenue: todayRevenueYuan,
          newUsers: Number(userRow && userRow.c != null ? userRow.c : 0),
          activeMovies: Number(movieRow && movieRow.c != null ? movieRow.c : 0)
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '统计失败' });
    }
  });

  app.get('/api/admin/reports/overview', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [me] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!me[0] || !me[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }

      const days = Math.max(1, Math.min(30, safeInt(req.query.days, 7)));
      const [trendRows] = await pool.query(
        `
        SELECT
          DATE(createTime) AS d,
          COUNT(*) AS orderCount,
          COALESCE(SUM(CASE WHEN status='paid' THEN totalPrice ELSE 0 END), 0) AS revenueCents,
          COUNT(DISTINCT _openid) AS activeUsers
        FROM orders
        WHERE createTime >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(createTime)
        ORDER BY d ASC
      `,
        [days - 1]
      );

      const trendMap = {};
      (trendRows || []).forEach((r) => {
        const key = String(r.d).slice(0, 10);
        trendMap[key] = {
          date: key,
          orderCount: safeInt(r.orderCount, 0),
          revenue: Math.round(safeInt(r.revenueCents, 0) / 100),
          activeUsers: safeInt(r.activeUsers, 0)
        };
      });

      const trend = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${day}`;
        trend.push(
          trendMap[key] || {
            date: key,
            orderCount: 0,
            revenue: 0,
            activeUsers: 0
          }
        );
      }

      const [[summaryRow]] = await pool.query(
        `
        SELECT
          COUNT(*) AS totalOrders,
          COALESCE(SUM(CASE WHEN status='paid' THEN totalPrice ELSE 0 END),0) AS totalRevenueCents,
          COUNT(DISTINCT _openid) AS totalUsers
        FROM orders
        WHERE createTime >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      `,
        [days - 1]
      );

      const [statusRows] = await pool.query(
        `
        SELECT status, COUNT(*) AS count
        FROM orders
        WHERE createTime >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY status
      `,
        [days - 1]
      );

      const [movieRows] = await pool.query(
        `
        SELECT
          o.movieId,
          COALESCE(MAX(o.movieTitle), m.title, CONCAT('影片', RIGHT(o.movieId, 6))) AS title,
          COUNT(*) AS orderCount,
          COALESCE(SUM(CASE WHEN o.status='paid' THEN o.totalPrice ELSE 0 END),0) AS revenueCents
        FROM orders o
        LEFT JOIN movies m ON m._id = o.movieId
        WHERE o.createTime >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY o.movieId
        ORDER BY revenueCents DESC, orderCount DESC
        LIMIT 5
      `,
        [days - 1]
      );

      const [cinemaRows] = await pool.query(
        `
        SELECT
          o.cinemaId,
          COALESCE(MAX(o.cinemaName), c.name, CONCAT('影院', RIGHT(o.cinemaId, 6))) AS name,
          COUNT(*) AS orderCount,
          COALESCE(SUM(CASE WHEN o.status='paid' THEN o.totalPrice ELSE 0 END),0) AS revenueCents
        FROM orders o
        LEFT JOIN cinemas c ON c._id = o.cinemaId
        WHERE o.createTime >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY o.cinemaId
        ORDER BY revenueCents DESC, orderCount DESC
        LIMIT 5
      `,
        [days - 1]
      );

      res.json({
        code: 0,
        message: 'ok',
        data: {
          rangeDays: days,
          summary: {
            totalOrders: safeInt(summaryRow && summaryRow.totalOrders, 0),
            totalRevenue: Math.round(safeInt(summaryRow && summaryRow.totalRevenueCents, 0) / 100),
            totalUsers: safeInt(summaryRow && summaryRow.totalUsers, 0)
          },
          trend,
          statusBreakdown: (statusRows || []).map((s) => ({
            status: s.status || 'unknown',
            count: safeInt(s.count, 0)
          })),
          topMovies: (movieRows || []).map((m) => ({
            movieId: String(m.movieId || ''),
            title: m.title || '',
            orderCount: safeInt(m.orderCount, 0),
            revenue: Math.round(safeInt(m.revenueCents, 0) / 100)
          })),
          topCinemas: (cinemaRows || []).map((c) => ({
            cinemaId: String(c.cinemaId || ''),
            name: c.name || '',
            orderCount: safeInt(c.orderCount, 0),
            revenue: Math.round(safeInt(c.revenueCents, 0) / 100)
          }))
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '报表查询失败' });
    }
  });

  app.patch('/api/admin/movies/:movieId/status', async (req, res) => {
    try {
      const movieId = req.params.movieId;
      const status = String(req.body?.status || '');
      if (!['showing', 'coming', 'off'].includes(status)) {
        return res.status(400).json({ code: -1, message: 'status 参数非法' });
      }
      await pool.query(`UPDATE movies SET status = ?, updateTime = NOW() WHERE _id = ?`, [status, movieId]);
      res.json({ code: 0, message: 'ok' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '更新失败' });
    }
  });

  app.delete('/api/admin/movies/:movieId', async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const movieId = req.params.movieId;
      await conn.beginTransaction();
      await conn.query(`DELETE FROM seats WHERE scheduleId IN (SELECT _id FROM schedules WHERE movieId = ?)`, [movieId]);
      await conn.query(`DELETE FROM schedules WHERE movieId = ?`, [movieId]);
      await conn.query(`DELETE FROM movie_comments WHERE movieId = ?`, [movieId]);
      await conn.query(`DELETE FROM collections WHERE movieId = ?`, [movieId]);
      await conn.query(`DELETE FROM movies WHERE _id = ?`, [movieId]);
      await conn.commit();
      res.json({ code: 0, message: 'ok' });
    } catch (e) {
      try {
        await conn.rollback();
      } catch (_) {}
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '删除失败' });
    } finally {
      conn.release();
    }
  });

  app.post('/api/admin/rebuild-cinema-schedules', async (req, res) => {
    try {
      const openid = getOpenid(req);
      if (!openid) return res.status(401).json({ code: -1, message: '未登录' });
      const [me] = await pool.query(`SELECT isAdmin FROM users WHERE _id=? LIMIT 1`, [openid]);
      if (!me[0] || !me[0].isAdmin) {
        return res.status(403).json({ code: -1, message: '无权限' });
      }

      const fixedTitles = await normalizeMovieTitles();
      const data = await rebuildSchedulesForAllCinemas({ days: req.body?.days });
      res.json({
        code: 0,
        message: 'ok',
        data: {
          fixedTitles,
          ...data
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '重建排片失败' });
    }
  });

  /**
   * 逆地理编码（GCJ-02 经纬度 → 城市等），密钥放服务端。
   * 配置：backend/.env 中 TENCENT_LBS_KEY（腾讯位置服务 WebService Key）
   * 文档：https://lbs.qq.com/service/webService/webServiceGuide/webServiceGcoder
   */
  app.get('/api/location/reverse', async (req, res) => {
    const geoCityGuess = require('./geoCityGuess');
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ code: -1, message: 'lat、lng 无效' });
      }
      const guessed = geoCityGuess.guessNearestCity(lat, lng);
      const key = process.env.TENCENT_LBS_KEY || process.env.TENCENT_MAP_KEY;
      if (!key) {
        return res.json({
          code: 0,
          message: 'ok',
          data: {
            city: guessed || null,
            district: null,
            province: null,
            address: null,
            configured: false,
            source: guessed ? 'guess' : 'none'
          }
        });
      }

      const urlStr = `https://apis.map.qq.com/ws/geocoder/v1/?location=${encodeURIComponent(
        `${lat},${lng}`
      )}&key=${encodeURIComponent(key)}&get_poi=0`;

      const json = await new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const opts = { hostname: u.hostname, path: u.pathname + u.search, method: 'GET' };
        const r = https.request(opts, (resp) => {
          let body = '';
          resp.on('data', (c) => {
            body += c;
          });
          resp.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(err);
            }
          });
        });
        r.on('error', reject);
        r.end();
      });

      if (json.status !== 0) {
        console.warn('[reverse-geocode] tencent status', json.status, json.message);
        return res.json({
          code: 0,
          message: 'ok',
          data: {
            city: guessed || null,
            district: null,
            province: null,
            address: null,
            configured: true,
            providerMessage: json.message || '',
            source: guessed ? 'guess' : 'none'
          }
        });
      }

      const result = json.result || {};
      const ad = result.ad_info || {};
      const comp = result.address_component || {};
      let city = ad.city || comp.city || null;
      if (!city && comp.province) {
        const p = String(comp.province);
        if (/^(北京|上海|天津|重庆)/.test(p)) city = p;
      }
      let cityLabel = geoCityGuess.normalizeCityLabel(city);
      if (!cityLabel) cityLabel = guessed || '';
      const addr = result.address ? String(result.address) : '';
      res.json({
        code: 0,
        message: 'ok',
        data: {
          city: cityLabel || null,
          district: ad.district || comp.district || null,
          province: ad.province || comp.province || null,
          address: addr || null,
          configured: true,
          source: cityLabel ? (city ? 'tencent' : 'guess') : 'none'
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ code: -1, message: e.message || '逆地理失败' });
    }
  });
}

async function ensureExtraTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collections (
      _id VARCHAR(64) PRIMARY KEY,
      _openid VARCHAR(128) NOT NULL,
      movieId VARCHAR(64) NOT NULL,
      title VARCHAR(255) DEFAULT '',
      poster VARCHAR(512) DEFAULT '',
      createTime DATETIME,
      UNIQUE KEY uk_openid_movie (_openid, movieId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS movie_comments (
      _id VARCHAR(64) PRIMARY KEY,
      movieId VARCHAR(64) NOT NULL,
      _openid VARCHAR(128) NOT NULL,
      nickName VARCHAR(64) DEFAULT '',
      avatarUrl VARCHAR(512) DEFAULT '',
      rating INT DEFAULT 5,
      content TEXT,
      likes INT DEFAULT 0,
      createTime DATETIME,
      KEY idx_movie (movieId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 兼容旧表结构：早期 collections 表可能没有 title/poster 列
  const dbName = process.env.DB_NAME || 'movie_ticket_db';
  async function ensureColumn(tableName, columnName, alterSql) {
    const [rows] = await pool.query(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND column_name = ?
      `,
      [dbName, tableName, columnName]
    );
    const exists = rows && rows[0] && Number(rows[0].cnt) > 0;
    if (!exists) {
      await pool.query(alterSql);
    }
  }

  await ensureColumn(
    'collections',
    'title',
    `ALTER TABLE collections ADD COLUMN title VARCHAR(255) DEFAULT ''`
  );
  await ensureColumn(
    'collections',
    'poster',
    `ALTER TABLE collections ADD COLUMN poster VARCHAR(512) DEFAULT ''`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cinema_halls (
      _id VARCHAR(64) PRIMARY KEY,
      cinemaId VARCHAR(64) NOT NULL,
      name VARCHAR(64) NOT NULL DEFAULT '',
      hallType VARCHAR(64) NOT NULL DEFAULT '',
      seatRows INT NOT NULL DEFAULT 8,
      seatCols INT NOT NULL DEFAULT 12,
      sortOrder INT NOT NULL DEFAULT 0,
      createTime DATETIME DEFAULT NULL,
      updateTime DATETIME DEFAULT NULL,
      KEY idx_cinema (cinemaId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const defaultSeatRows = 8;
  const defaultSeatCols = 12;
  const [cinemaRowsForHalls] = await pool.query(`SELECT _id FROM cinemas`);
  for (const c of cinemaRowsForHalls || []) {
    const cid = String(c._id || '');
    if (!cid) continue;
    const [hallCntRows] = await pool.query(`SELECT COUNT(*) AS n FROM cinema_halls WHERE cinemaId = ?`, [cid]);
    const hallN = hallCntRows && hallCntRows[0] ? Number(hallCntRows[0].n) || 0 : 0;
    if (hallN > 0) continue;
    for (let i = 0; i < LEGACY_HALL_BLUEPRINT.length; i++) {
      const b = LEGACY_HALL_BLUEPRINT[i];
      const hid = `h_${cid}_${i + 1}`;
      await pool.query(
        `INSERT IGNORE INTO cinema_halls (_id,cinemaId,name,hallType,seatRows,seatCols,sortOrder,createTime,updateTime) VALUES (?,?,?,?,?,?,?,NOW(),NOW())`,
        [hid, cid, b.name, b.hallType, defaultSeatRows, defaultSeatCols, i]
      );
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coupon_templates (
      _id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(128) NOT NULL DEFAULT '',
      amount INT NOT NULL DEFAULT 0,
      minAmount INT NOT NULL DEFAULT 0,
      sellPrice INT NOT NULL DEFAULT 0,
      validDays INT NOT NULL DEFAULT 7,
      stock INT NOT NULL DEFAULT 0,
      soldCount INT NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      description VARCHAR(255) DEFAULT '',
      sortOrder INT NOT NULL DEFAULT 0,
      createTime DATETIME DEFAULT NULL,
      updateTime DATETIME DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coupon_purchase_orders (
      _id VARCHAR(64) PRIMARY KEY,
      _openid VARCHAR(128) NOT NULL,
      templateId VARCHAR(64) NOT NULL,
      templateTitle VARCHAR(128) NOT NULL DEFAULT '',
      unitPrice INT NOT NULL DEFAULT 0,
      qty INT NOT NULL DEFAULT 1,
      totalPrice INT NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      payTime DATETIME DEFAULT NULL,
      createTime DATETIME DEFAULT NULL,
      updateTime DATETIME DEFAULT NULL,
      KEY idx_openid_create (_openid, createTime),
      KEY idx_template (templateId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_coupons (
      _id VARCHAR(64) PRIMARY KEY,
      _openid VARCHAR(128) NOT NULL,
      templateId VARCHAR(64) NOT NULL,
      title VARCHAR(128) NOT NULL DEFAULT '',
      amount INT NOT NULL DEFAULT 0,
      minAmount INT NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'available',
      lockOrderId VARCHAR(64) DEFAULT NULL,
      usedOrderId VARCHAR(64) DEFAULT NULL,
      expireTime DATETIME DEFAULT NULL,
      usedTime DATETIME DEFAULT NULL,
      createTime DATETIME DEFAULT NULL,
      updateTime DATETIME DEFAULT NULL,
      KEY idx_openid_status (_openid, status),
      KEY idx_openid_expire (_openid, expireTime)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureColumn('orders', 'couponId', `ALTER TABLE orders ADD COLUMN couponId VARCHAR(64) DEFAULT ''`);
  await ensureColumn(
    'orders',
    'refund_request_status',
    `ALTER TABLE orders ADD COLUMN refund_request_status VARCHAR(16) NOT NULL DEFAULT ''`
  );
  await ensureColumn(
    'orders',
    'refund_request_note',
    `ALTER TABLE orders ADD COLUMN refund_request_note VARCHAR(255) NOT NULL DEFAULT ''`
  );
  await ensureColumn(
    'orders',
    'refund_review_note',
    `ALTER TABLE orders ADD COLUMN refund_review_note VARCHAR(255) NOT NULL DEFAULT ''`
  );
  await ensureColumn(
    'orders',
    'refund_request_time',
    `ALTER TABLE orders ADD COLUMN refund_request_time DATETIME NULL`
  );

  await ensureColumn(
    'users',
    'preference_tags',
    `ALTER TABLE users ADD COLUMN preference_tags VARCHAR(512) DEFAULT '[]'`
  );
  await ensureColumn(
    'users',
    'account_status',
    `ALTER TABLE users ADD COLUMN account_status VARCHAR(16) NOT NULL DEFAULT 'active'`
  );
  await ensureColumn(
    'users',
    'account_flag',
    `ALTER TABLE users ADD COLUMN account_flag VARCHAR(32) NOT NULL DEFAULT ''`
  );
  await ensureColumn(
    'users',
    'admin_remark',
    `ALTER TABLE users ADD COLUMN admin_remark VARCHAR(255) NOT NULL DEFAULT ''`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profile_audit (
      _id VARCHAR(64) PRIMARY KEY,
      _openid VARCHAR(128) NOT NULL,
      field_key VARCHAR(64) NOT NULL,
      old_summary VARCHAR(255) NOT NULL DEFAULT '',
      new_summary VARCHAR(255) NOT NULL DEFAULT '',
      ip VARCHAR(64) NOT NULL DEFAULT '',
      user_agent VARCHAR(255) NOT NULL DEFAULT '',
      createTime DATETIME DEFAULT NULL,
      KEY idx_upa_openid_ct (_openid, createTime)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_points_balance (
      _openid VARCHAR(128) PRIMARY KEY,
      balance INT NOT NULL DEFAULT 0,
      updateTime DATETIME DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_points_log (
      _id VARCHAR(64) PRIMARY KEY,
      _openid VARCHAR(128) NOT NULL,
      delta INT NOT NULL,
      balance_after INT NOT NULL,
      source_type VARCHAR(32) NOT NULL,
      source_id VARCHAR(96) NOT NULL,
      remark VARCHAR(512) NOT NULL DEFAULT '',
      operator_openid VARCHAR(128) DEFAULT NULL,
      createTime DATETIME DEFAULT NULL,
      UNIQUE KEY uk_pts_source (_openid, source_type, source_id),
      KEY idx_pts_openid_ct (_openid, createTime)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS points_rule_config (
      rule_key VARCHAR(64) PRIMARY KEY,
      rule_value INT NOT NULL,
      updateTime DATETIME NULL,
      updated_by VARCHAR(128) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  const seedPer = Math.max(0, safeInt(process.env.POINTS_PER_100_CENTS, 1));
  const seedCin = Math.max(0, safeInt(process.env.POINTS_CHECKIN_DAILY, 10));
  await pool.query(
    `INSERT IGNORE INTO points_rule_config (rule_key, rule_value, updateTime) VALUES ('points_per_100_cents', ?, NOW()), ('checkin_daily', ?, NOW())`,
    [seedPer, seedCin]
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_security_audit (
      _id VARCHAR(64) PRIMARY KEY,
      operator_openid VARCHAR(128) NOT NULL,
      category VARCHAR(32) NOT NULL,
      action VARCHAR(64) NOT NULL,
      summary VARCHAR(512) NOT NULL DEFAULT '',
      ip VARCHAR(64) NOT NULL DEFAULT '',
      user_agent VARCHAR(255) NOT NULL DEFAULT '',
      createTime DATETIME DEFAULT NULL,
      KEY idx_asa_op_ct (operator_openid, createTime)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_refund_requests (
      _id VARCHAR(64) PRIMARY KEY,
      orderId VARCHAR(64) NOT NULL,
      requesterOpenid VARCHAR(128) NOT NULL,
      reason VARCHAR(512) NOT NULL DEFAULT '',
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      reviewerOpenid VARCHAR(128) DEFAULT NULL,
      reviewNote VARCHAR(255) NOT NULL DEFAULT '',
      reviewTime DATETIME DEFAULT NULL,
      createTime DATETIME DEFAULT NULL,
      updateTime DATETIME DEFAULT NULL,
      KEY idx_orr_order (orderId),
      KEY idx_orr_status_ct (status, createTime)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [tplCountRows] = await pool.query(`SELECT COUNT(*) AS n FROM coupon_templates`);
  const tplCount = tplCountRows && tplCountRows[0] ? Number(tplCountRows[0].n) || 0 : 0;
  if (tplCount <= 0) {
    for (let i = 0; i < DEFAULT_COUPON_TEMPLATES.length; i++) {
      const t = DEFAULT_COUPON_TEMPLATES[i];
      await pool.query(
        `
          INSERT INTO coupon_templates
          (_id,title,amount,minAmount,sellPrice,validDays,stock,soldCount,status,description,sortOrder,createTime,updateTime)
          VALUES (?,?,?,?,?,?,?,?,?,'',?,NOW(),NOW())
        `,
        [`ct_${i + 1}`, t.title, t.amount, t.minAmount, t.sellPrice, t.validDays, t.stock, 0, 'active', i]
      );
    }
  }
}

module.exports = { registerExtraRoutes, ensureExtraTables };
