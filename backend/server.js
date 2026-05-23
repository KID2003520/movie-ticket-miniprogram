require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { v4: uuidv4 } = require('uuid');
const { pool, initDbCollation, alignOpenidTablesToUserIdCollation, sqlCollateEq } = require('./db');
const tmdbSync = require('./lib/tmdbSync');
const { registerExtraRoutes, ensureExtraTables } = require('./lib/extraApi');
const alipayPay = require('./lib/alipayPay');
const { mapMovieForApi } = require('./lib/movieApiFormat');
const {
  requestBaseUrl,
  mapMovieForApiWithPoster,
  getPosterFetchAgent
} = require('./lib/posterProxy');
const sampleCinemas = require('./data/sampleCinemas');
const { fulfillOrderAfterPayment } = require('./lib/orderLifecycle');
const { seedCinemaDaySchedules, dateRangeFromToday } = require('./lib/scheduleAllocator');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/**
 * Chrome DevTools 会请求该地址。若 404 为 HTML，会带 default-src 'none'，Issues 易误报。
 * 用 app.all 覆盖任意方法；响应不设 CSP，避免再套一层策略。
 */
app.all('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) => {
  res.status(200).type('application/json').send('{}');
});

/** 避免浏览器 / Cursor 预检 favicon 时落到 404，控制台误报 “Failed to load resource” */
app.get('/favicon.ico', (_req, res) => res.status(204).end());

/** 浏览器端管理后台（静态页）；小程序内 pages/admin* 仍保留 */
const adminWebRoot = path.join(__dirname, 'public', 'admin-web');
const adminWebIndex = path.join(adminWebRoot, 'index.html');
if (!fs.existsSync(adminWebIndex)) {
  console.warn('[admin-web] 未找到 index.html，/admin-web/ 将返回错误:', adminWebIndex);
}

/**
 * 管理页不设 Content-Security-Policy：内网后台 + 内联脚本场景下，
 * 一旦设置 connect-src，Chrome/Cursor 对 127.0.0.1 与 localhost、或内置浏览器与文档源的差异
 * 会误拦对 /.well-known/appspecific/com.chrome.devtools.json 的探测。
 */
function sendAdminWebIndex(req, res, next) {
  res.sendFile(adminWebIndex, (err) => {
    if (err) {
      console.error('[admin-web] sendFile:', err.message);
      next(err);
    }
  });
}

/**
 * 无尾斜杠与有尾斜杠均直接返回首页，避免 302 到 /admin-web/ 后客户端又去尾斜杠形成 ERR_TOO_MANY_REDIRECTS。
 */
app.get('/admin-web', sendAdminWebIndex);
app.get('/admin-web/', sendAdminWebIndex);
app.get('/admin-web/index.html', sendAdminWebIndex);
app.head('/admin-web', sendAdminWebIndex);
app.head('/admin-web/', sendAdminWebIndex);
app.head('/admin-web/index.html', sendAdminWebIndex);
app.get('/admin-web/favicon.ico', (_req, res) => res.status(204).end());
app.use('/admin-web', express.static(adminWebRoot));

const uploadsRoot = path.join(__dirname, 'public', 'uploads');
const uploadsAvatars = path.join(uploadsRoot, 'avatars');
if (!fs.existsSync(uploadsAvatars)) {
  fs.mkdirSync(uploadsAvatars, { recursive: true });
}
app.use('/uploads', express.static(uploadsRoot));

const rows = 8;
const cols = 12;

function nowIso() {
  return new Date().toISOString();
}

// MySQL 5.7 DATETIME 不接受 ISO 8601（带T/ Z），需要 'YYYY-MM-DD HH:mm:ss'
function nowDb() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function safeInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function getRequestBody(req) {
  let body = req.body;
  if (typeof body === 'string' && body.trim()) {
    try {
      body = JSON.parse(body);
    } catch (_) {
      body = {};
    }
  }
  return body && typeof body === 'object' ? body : {};
}

function getOpenid(req) {
  const body = getRequestBody(req);
  return req.headers['x-openid'] || req.query.openid || body.openid;
}

/** 已携带 x-openid 且账号为 disabled 时，拦截业务请求（登录/注册除外） */
app.use(async (req, res, next) => {
  try {
    const p = req.path || '';
    if (!p.startsWith('/api/')) return next();
    if (p.startsWith('/api/auth/register-phone-password') || p.startsWith('/api/auth/login-phone-password')) {
      return next();
    }
    const oid = getOpenid(req);
    if (!oid) return next();
    const [r] = await pool.query(`SELECT IFNULL(account_status,'active') AS st FROM users WHERE _id=? LIMIT 1`, [oid]);
    if (!r || !r.length) return next();
    if (String(r[0].st || 'active') === 'disabled') {
      return res.status(403).json({ code: -1, message: '账号已被禁用' });
    }
  } catch (_) {
    return next();
  }
  next();
});

function payBridgeSecret() {
  return String(process.env.PAY_BRIDGE_SECRET || 'movie-ticket-pay-bridge-dev').trim();
}

function makePayBridgeToken(orderId) {
  const exp = Date.now() + 10 * 60 * 1000;
  const id = String(orderId);
  const msg = `${id}|${exp}`;
  const sig = crypto.createHmac('sha256', payBridgeSecret()).update(msg).digest('hex');
  const payload = JSON.stringify({ orderId: id, exp, sig });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function readPayBridgeToken(token) {
  try {
    const raw = Buffer.from(String(token || ''), 'base64url').toString('utf8');
    const j = JSON.parse(raw);
    if (!j.orderId || !j.exp || !j.sig) return null;
    if (Date.now() > j.exp) return null;
    const msg = `${j.orderId}|${j.exp}`;
    const sig = crypto.createHmac('sha256', payBridgeSecret()).update(msg).digest('hex');
    if (sig !== j.sig) return null;
    return String(j.orderId);
  } catch (_) {
    return null;
  }
}

async function ensureUsersPasswordColumn() {
  // users 表最初建表脚本未包含 password 列。
  // 为支持“手机号+密码登录”，启动时自动补齐 password 列。
  const dbName = process.env.DB_NAME || 'movie_ticket_db';
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = 'users' AND column_name = 'password'
    `,
    [dbName]
  );

  const cnt = rows?.[0]?.cnt || 0;
  if (cnt > 0) return;

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN password VARCHAR(255) NOT NULL DEFAULT ''
  `);
}

async function ensureOrdersPurchaseTimeColumn() {
  const dbName = process.env.DB_NAME || 'movie_ticket_db';
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = 'orders' AND column_name = 'purchaseTime'
    `,
    [dbName]
  );
  const exists = rows?.[0]?.cnt > 0;
  if (!exists) {
    await pool.query(`ALTER TABLE orders ADD COLUMN purchaseTime DATETIME NULL`);
  }
  // 兼容历史数据：若 purchaseTime 为空，回填为 createTime
  await pool.query(`UPDATE orders SET purchaseTime = createTime WHERE purchaseTime IS NULL`);
}

async function getScheduleWithSeats(scheduleId) {
  const [scheduleRows] = await pool.query(
    `
      SELECT s._id,
             s.movieId,
             m.title AS movieTitle,
             m.poster AS moviePoster,
             s.cinemaId,
             c.name AS cinemaName,
             s.hallName,
             s.date,
             s.startTime,
             s.price AS priceCents,
             s.totalSeats,
             s.availableSeats,
             s.status
      FROM schedules s
      LEFT JOIN movies m ON m._id = s.movieId
      LEFT JOIN cinemas c ON c._id = s.cinemaId
      WHERE s._id = ?
      LIMIT 1
    `,
    [scheduleId]
  );

  const schedule = scheduleRows[0];
  if (!schedule) return null;

  const [seatRows] = await pool.query(
    `
      SELECT rowNum, colNum, status
      FROM seats
      WHERE scheduleId = ?
    `,
    [scheduleId]
  );

  return {
    schedule: {
      scheduleId: schedule._id,
      movieId: String(schedule.movieId),
      movieTitle: schedule.movieTitle || '',
      moviePoster: schedule.moviePoster || '',
      cinemaId: String(schedule.cinemaId),
      cinemaName: schedule.cinemaName || '',
      hallName: schedule.hallName || '',
      date: schedule.date,
      startTime: schedule.startTime,
      priceCents: safeInt(schedule.priceCents, 0),
      totalSeats: safeInt(schedule.totalSeats, 0),
      availableSeats: safeInt(schedule.availableSeats, 0),
      status: schedule.status || 'available'
    },
    seats: seatRows.map(r => ({
      row: r.rowNum,
      col: r.colNum,
      status: r.status
    }))
  };
}

function mapSeatsJson(seatsJson) {
  if (!seatsJson) return [];
  if (Array.isArray(seatsJson)) return seatsJson;
  if (typeof seatsJson === 'string') {
    try {
      return JSON.parse(seatsJson);
    } catch (e) {
      return [];
    }
  }
  return [];
}

app.get('/api/health', (req, res) => {
  res.json({ code: 0, message: 'ok' });
});

// 根路径用于快速探活，避免出现 "Cannot GET /" 的误解
app.get('/', (_req, res) => {
  res.json({
    code: 0,
    message: 'movie-ticket-backend is running',
    data: {
      health: '/api/health',
      adminWeb: '/admin-web'
    }
  });
});

/** 代理海报（小程序直连 TMDB 常被重置；仅允许白名单域名，防 SSRF） */
const POSTER_PROXY_HOSTS = new Set([
  'image.tmdb.org',
  'img1.doubanio.com',
  'img2.doubanio.com',
  'img3.doubanio.com',
  'img9.doubanio.com',
  'picsum.photos'
]);

app.get('/api/default-poster', (_req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#2d3748"/><stop offset="100%" stop-color="#1a202c"/>
      </linearGradient></defs>
      <rect width="300" height="420" fill="url(#g)"/>
      <text x="150" y="200" text-anchor="middle" fill="#94a3b8" font-size="18" font-family="sans-serif">暂无海报</text>
      <text x="150" y="228" text-anchor="middle" fill="#64748b" font-size="13" font-family="sans-serif">Movie</text>
    </svg>`
  );
});

app.get('/api/poster-proxy', (req, res) => {
  const raw = req.query.url;
  if (!raw || typeof raw !== 'string') {
    return res.status(400).send('missing url');
  }
  let target;
  try {
    target = new URL(decodeURIComponent(raw));
  } catch {
    return res.status(400).send('bad url');
  }
  if (!POSTER_PROXY_HOSTS.has(target.hostname)) {
    return res.status(403).send('host not allowed');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return res.status(400).send('bad protocol');
  }

  function pipeImage(urlObj, depth) {
    if (depth > 5) {
      return res.status(502).send('too many redirects');
    }
    const lib = urlObj.protocol === 'https:' ? https : http;
    const agent = getPosterFetchAgent(urlObj.hostname);
    const req2 = lib.request(
      urlObj,
      {
        method: 'GET',
        timeout: 20000,
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; movie-ticket-poster/1.0)',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
        }
      },
      (upstream) => {
        const code = upstream.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(code) && upstream.headers.location) {
          upstream.resume();
          let nextUrl;
          try {
            nextUrl = new URL(upstream.headers.location, urlObj);
          } catch {
            return res.status(502).send('bad redirect');
          }
          if (!POSTER_PROXY_HOSTS.has(nextUrl.hostname)) {
            return res.status(403).send('redirect host not allowed');
          }
          return pipeImage(nextUrl, depth + 1);
        }
        if (code < 200 || code >= 300) {
          upstream.resume();
          return res.status(502).send('upstream error');
        }
        const ct = upstream.headers['content-type'];
        if (ct) res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        upstream.on('error', (e) => {
          console.error('poster-proxy stream', e.message);
          if (!res.headersSent) res.status(502).send('upstream read error');
        });
        upstream.pipe(res);
      }
    );
    req2.on('error', (e) => {
      console.error('poster-proxy', e.message);
      if (!res.headersSent) res.status(502).send('bad gateway');
    });
    req2.on('timeout', () => {
      req2.destroy();
      if (!res.headersSent) res.status(504).send('timeout');
    });
    req2.end();
  }

  pipeImage(target, 0);
});

// 电影列表（来自 MySQL，供仅后端模式或管理端使用）
app.get('/api/movies', async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : '';
    let sql = `
      SELECT _id, title, poster, rating, genre, duration, director, actors, description, releaseDate, price, status, hot, createTime
      FROM movies
      WHERE 1=1
    `;
    const params = [];
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY hot DESC, updateTime DESC';
    const [rows] = await pool.query(sql, params);
    const base = requestBaseUrl(req);
    res.json({ code: 0, message: 'ok', data: { items: rows.map((r) => mapMovieForApiWithPoster(r, base)) } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: -1, message: e.message || '查询失败' });
  }
});

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

app.post('/api/movies/sync-from-tmdb', async (req, res) => {
  try {
    if (!requireTmdbSyncSecret(req, res)) return;
    if (!process.env.TMDB_API_KEY) {
      return res.status(400).json({
        code: -1,
        message: '服务端未配置 TMDB_API_KEY，请在 backend/.env 中设置（见 https://www.themoviedb.org/settings/api）'
      });
    }
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : undefined;
    const result = await tmdbSync.syncMovies(pool, { ids });
    res.json({ code: 0, message: 'ok', data: result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: -1, message: e.message || '同步失败' });
  }
});

async function generateSchedulesForMovies(conn, movieIds, opts = {}) {
  const scheduleDays = safeInt(opts.scheduleDays, 7);
  const forceSeats = !!opts.forceSeats;
  const ids = (movieIds || []).map(String).filter(Boolean);
  if (!ids.length) return { schedulesAttempted: 0 };

  const [cinRows] = await conn.query(`SELECT _id FROM cinemas ORDER BY _id`);
  const cinemaIds = (cinRows || []).map((r) => String(r._id));
  if (!cinemaIds.length) {
    throw new Error('cinemas 表为空：请先导入影院（调用 /api/importSampleData）');
  }

  const ph = ids.map(() => '?').join(',');
  const [movieRows] = await conn.query(
    `SELECT _id, price FROM movies WHERE _id IN (${ph})`,
    ids
  );
  if (!movieRows.length) return { schedulesAttempted: 0 };

  const dates = dateRangeFromToday(scheduleDays);
  let schedulesAttempted = 0;

  for (const cinemaId of cinemaIds) {
    for (const dateStr of dates) {
      const part = await seedCinemaDaySchedules(conn, {
        cinemaId,
        dateStr,
        movies: movieRows,
        forceReplaceSeats: forceSeats,
        skipOccupied: false
      });
      schedulesAttempted += part.schedules;
    }
  }

  return { schedulesAttempted };
}

app.post('/api/movies/import-from-tmdb', async (req, res) => {
  try {
    if (!requireTmdbSyncSecret(req, res)) return;
    if (!process.env.TMDB_API_KEY) {
      return res.status(400).json({
        code: -1,
        message:
          '服务端未配置 TMDB_API_KEY，请在 backend/.env 中设置（见 https://www.themoviedb.org/settings/api）'
      });
    }

    const mode = req.body?.mode ? String(req.body.mode) : 'popular';
    const count = safeInt(req.body?.count, 20);
    const priceCents = safeInt(
      req.body?.priceCents,
      safeInt(process.env.DEFAULT_MOVIE_PRICE_CENTS, 3500)
    );
    const idPrefix = req.body?.idPrefix ? String(req.body.idPrefix) : 'tmdb';

    const withSchedules = !!req.body?.withSchedules;
    const scheduleDays = safeInt(req.body?.scheduleDays, 7);
    const scheduleTemplatesCount = safeInt(req.body?.scheduleTemplatesCount, 6);
    const forceSeats = !!req.body?.forceSeats;

    const result = await tmdbSync.importMoviesFromTmdb(pool, {
      mode,
      count,
      priceCents,
      idPrefix
    });

    if (withSchedules && result.ok && result.ok.length) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await generateSchedulesForMovies(
          conn,
          result.ok.map((m) => m.id),
          { scheduleDays, scheduleTemplatesCount, forceSeats }
        );
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }

    res.json({
      code: 0,
      message: '导入完成',
      data: {
        imported: (result.ok || []).length,
        failed: (result.fail || []).length,
        withSchedules
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: -1, message: e.message || '导入失败' });
  }
});

app.post('/api/movies/import-all-from-tmdb', async (req, res) => {
  try {
    if (!requireTmdbSyncSecret(req, res)) return;
    if (!process.env.TMDB_API_KEY) {
      return res.status(400).json({
        code: -1,
        message:
          '服务端未配置 TMDB_API_KEY，请在 backend/.env 中设置（见 https://www.themoviedb.org/settings/api）'
      });
    }

    const countPerMode = safeInt(req.body?.countPerMode, 30);
    const totalLimit = safeInt(req.body?.totalLimit, 120);
    const priceCents = safeInt(
      req.body?.priceCents,
      safeInt(process.env.DEFAULT_MOVIE_PRICE_CENTS, 3500)
    );
    const idPrefix = req.body?.idPrefix ? String(req.body.idPrefix) : 'tmdb';
    const modes =
      Array.isArray(req.body?.modes) && req.body.modes.length
        ? req.body.modes.map((m) => String(m))
        : undefined;

    const withSchedules = !!req.body?.withSchedules;
    const scheduleDays = safeInt(req.body?.scheduleDays, 7);
    const scheduleTemplatesCount = safeInt(req.body?.scheduleTemplatesCount, 6);
    const forceSeats = !!req.body?.forceSeats;

    const result = await tmdbSync.importMoviesFromTmdbMultiModes(pool, {
      modes,
      countPerMode,
      totalLimit,
      priceCents,
      idPrefix
    });

    if (withSchedules && result.ok && result.ok.length) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await generateSchedulesForMovies(
          conn,
          result.ok.map((m) => m.id),
          { scheduleDays, scheduleTemplatesCount, forceSeats }
        );
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }

    res.json({
      code: 0,
      message: '全量导入完成',
      data: {
        imported: (result.ok || []).length,
        failed: (result.fail || []).length,
        withSchedules,
        failItems: (result.fail || []).slice(0, 15)
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      code: -1,
      message: tmdbSync.formatTmdbNetworkErrorMessage(e) || e.message || '全量导入失败'
    });
  }
});

/**
 * TMDB Discover：按热度批量写入 movies（默认 1000 条），完成后重算上映状态。
 * 与「脚本」无关，直接 POST 本接口即可；耗时数分钟，已关闭本请求 socket 超时。
 * Body: { count?: number, sleepMs?: number }
 */
app.post('/api/movies/import-discover-bulk', async (req, res) => {
  req.setTimeout(0);
  res.setTimeout(0);
  try {
    if (!requireTmdbSyncSecret(req, res)) return;
    if (!process.env.TMDB_API_KEY) {
      return res.status(400).json({
        code: -1,
        message:
          '服务端未配置 TMDB_API_KEY，请在 backend/.env 中设置（见 https://www.themoviedb.org/settings/api）'
      });
    }

    const count = Math.min(5000, Math.max(1, safeInt(req.body?.count, 1000)));
    const sleepMs = Math.min(500, Math.max(80, safeInt(req.body?.sleepMs, 200)));
    const maxPages = Math.ceil(count / 18) + 10;

    console.log(`[import-discover-bulk] 开始，目标约 ${count} 条，maxPages=${maxPages}`);

    const result = await tmdbSync.importDiscoverPopularMovies(pool, {
      count,
      page: 1,
      maxPages,
      sleepMs,
      hotFrom: 'popularity'
    });

    const rec = await tmdbSync.recomputeMovieStatuses(pool);

    res.json({
      code: 0,
      message: 'Discover 批量导入完成',
      data: {
        imported: (result.ok || []).length,
        failed: (result.fail || []).length,
        statusRowsUpdated: rec.affected,
        failSample: (result.fail || []).slice(0, 20)
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: -1, message: e.message || '批量导入失败' });
  }
});

// =========================
// 手机号+密码：注册/登录
// =========================
app.post('/api/auth/register-phone-password', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    if (!phone) return res.status(400).json({ code: -1, message: '缺少手机号' });
    if (!/^1[3-9]\d{9}$/.test(String(phone))) return res.status(400).json({ code: -1, message: '手机号格式不正确' });
    if (!password || String(password).length < 6) return res.status(400).json({ code: -1, message: '密码至少6位' });

    const openid = 'mock_openid_' + String(phone);

    const conn = await pool.getConnection();
    try {
      const [existById] = await conn.query(`SELECT _id FROM users WHERE _id = ? LIMIT 1`, [openid]);
      if (existById && existById.length > 0) {
        return res.json({ code: -1, message: '该手机号已注册' });
      }

      // 同时按 phone 判重（因为 phone 列未设唯一索引）
      const [existByPhone] = await conn.query(`SELECT _id FROM users WHERE phone = ? LIMIT 1`, [phone]);
      if (existByPhone && existByPhone.length > 0) {
        return res.json({ code: -1, message: '该手机号已注册' });
      }

      const now = nowDb();
      const nickName = '用户' + String(phone).slice(-4);
      const avatarUrl = 'https://picsum.photos/100/100?random=' + Math.floor(Math.random() * 1000);

      await conn.query(
        `
          INSERT INTO users (_id, nickName, avatarUrl, phone, gender, role, level, isAdmin, password, preference_tags, createTime, updateTime)
          VALUES (?, ?, ?, ?, 0, '', '', 0, ?, '[]', ?, ?)
        `,
        [openid, nickName, avatarUrl, phone, String(password), now, now]
      );

      return res.json({
        code: 0,
        message: '注册成功',
        data: {
          openid,
          userInfo: {
            _id: openid,
            nickName,
            avatarUrl,
            phone,
            gender: 0,
            role: '',
            level: '',
            isAdmin: 0,
            preferenceTags: []
          }
        }
      });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: -1, message: e.message || '注册失败' });
  }
});

app.post('/api/auth/login-phone-password', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    if (!phone) return res.status(400).json({ code: -1, message: '缺少手机号' });
    if (!/^1[3-9]\d{9}$/.test(String(phone))) return res.status(400).json({ code: -1, message: '手机号格式不正确' });
    if (!password) return res.status(400).json({ code: -1, message: '缺少密码' });

    const [rows] = await pool.query(
      `SELECT _id, nickName, avatarUrl, phone, gender, role, level, isAdmin, password, preference_tags, IFNULL(account_status,'active') AS account_status FROM users WHERE phone=? LIMIT 1`,
      [phone]
    );

    const u = rows && rows[0];
    if (!u) return res.json({ code: -1, message: '该手机号未注册' });
    if (String(u.password || '') !== String(password)) return res.json({ code: -1, message: '密码错误' });
    if (String(u.account_status || 'active') === 'disabled') {
      return res.json({ code: -1, message: '账号已被禁用，如有疑问请联系平台' });
    }

    let preferenceTags = [];
    try {
      const j = JSON.parse(String(u.preference_tags || '[]'));
      preferenceTags = Array.isArray(j) ? j.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8) : [];
    } catch (_) {
      preferenceTags = [];
    }

    return res.json({
      code: 0,
      message: '登录成功',
      data: {
        openid: u._id,
        userInfo: {
          _id: u._id,
          nickName: u.nickName || '',
          avatarUrl: u.avatarUrl || '',
          phone: u.phone,
          gender: u.gender || 0,
          role: u.role || '',
          level: u.level || '',
          isAdmin: u.isAdmin ? 1 : 0,
          preferenceTags
        }
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: -1, message: e.message || '登录失败' });
  }
});

// 初始化：把前端 mock 可用的 scheduleId 规则导入（未来 7 天）
app.post('/api/importSampleData', async (req, res) => {
  try {
    const force = req.query.force === 'true' || req.body?.force === true;

    const movies = [
      { _id: '1', title: '流浪地球2', poster: 'https://picsum.photos/300/420?random=1', price: 3500, status: 'showing', hot: 1000 },
      { _id: '2', title: '满江红', poster: 'https://picsum.photos/300/420?random=2', price: 3200, status: 'showing', hot: 980 },
      { _id: '3', title: '熊出没·伴我熊芯', poster: 'https://picsum.photos/300/420?random=3', price: 2800, status: 'showing', hot: 850 },
      { _id: '4', title: '无名', poster: 'https://picsum.photos/300/420?random=4', price: 3800, status: 'showing', hot: 720 },
      { _id: '5', title: '深海', poster: 'https://picsum.photos/300/420?random=5', price: 3000, status: 'showing', hot: 650 },
      { _id: '6', title: '交换人生', poster: 'https://picsum.photos/300/420?random=6', price: 3500, status: 'showing', hot: 580 },
      { _id: '7', title: '蚁人与黄蜂女：量子狂潮', poster: 'https://picsum.photos/300/420?random=7', price: 4500, status: 'coming', hot: 500 },
      { _id: '8', title: '黑豹2', poster: 'https://picsum.photos/300/420?random=8', price: 4500, status: 'coming', hot: 480 },
      { _id: '9', title: '消失的她', poster: 'https://picsum.photos/300/420?random=9', price: 3600, status: 'showing', hot: 920 },
      { _id: '10', title: '孤注一掷', poster: 'https://picsum.photos/300/420?random=10', price: 3400, status: 'showing', hot: 890 },
      { _id: '11', title: '封神第一部', poster: 'https://picsum.photos/300/420?random=11', price: 3800, status: 'showing', hot: 860 },
      { _id: '12', title: '热辣滚烫', poster: 'https://picsum.photos/300/420?random=12', price: 3300, status: 'showing', hot: 910 }
    ];

    const cinemas = sampleCinemas;

    const allSchedules = [
      { movieId: '1', hallName: 'IMAX 厅', hallType: 'IMAX', startTime: '14:30', endTime: '17:23', price: 68 },
      { movieId: '2', hallName: '杜比厅', hallType: '杜比全景声', startTime: '16:00', endTime: '18:39', price: 58 },
      { movieId: '3', hallName: '3 号厅', hallType: '3D', startTime: '10:30', endTime: '12:07', price: 38 },
      { movieId: '4', hallName: '4 号厅', hallType: '普通厅', startTime: '19:00', endTime: '21:11', price: 45 },
      { movieId: '5', hallName: '5 号厅', hallType: '3D', startTime: '13:20', endTime: '15:12', price: 42 },
      { movieId: '6', hallName: '6 号厅', hallType: '普通厅', startTime: '20:00', endTime: '22:53', price: 55 },
      { movieId: '9', hallName: '7 号厅', hallType: '杜比全景声', startTime: '11:00', endTime: '13:05', price: 48 },
      { movieId: '10', hallName: '8 号厅', hallType: '激光厅', startTime: '15:10', endTime: '17:18', price: 46 },
      { movieId: '11', hallName: '9 号厅', hallType: '巨幕厅', startTime: '18:20', endTime: '20:45', price: 52 },
      { movieId: '12', hallName: '10 号厅', hallType: '普通厅', startTime: '21:00', endTime: '23:10', price: 44 }
    ];

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const m of movies) {
        await conn.query(
          `
            INSERT INTO movies (_id,title,poster,rating,genre,duration,director,actors,description,releaseDate,price,status,hot,createTime,updateTime)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE title=VALUES(title), poster=VALUES(poster), price=VALUES(price), status=VALUES(status), hot=VALUES(hot), updateTime=VALUES(updateTime)
          `,
          [
            m._id,
            m.title,
            m.poster,
            0,
            '',
            0,
            '',
            '',
            '',
            '',
            m.price,
            m.status || 'showing',
            safeInt(m.hot, 0),
            nowDb(),
            nowDb()
          ]
        );
      }

      for (const c of cinemas) {
        await conn.query(
          `
            INSERT INTO cinemas (_id,name,address,phone,latitude,longitude,city,district,minPrice,tags,facilities,distance,createTime,updateTime)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE name=VALUES(name), address=VALUES(address), phone=VALUES(phone), latitude=VALUES(latitude), longitude=VALUES(longitude), city=VALUES(city), minPrice=VALUES(minPrice), tags=VALUES(tags), updateTime=VALUES(updateTime)
          `,
          [
            c._id,
            c.name,
            c.address,
            c.phone,
            c.latitude,
            c.longitude,
            c.city || '',
            '',
            safeInt(c.minPrice, 3500),
            c.tags || '',
            '',
            0,
            nowDb(),
            nowDb()
          ]
        );
      }

      // 7 天 × 多影院：场次 id = `${cinemaId}_${date}_${场次序号}`
      const today = new Date();
      for (const c of cinemas) {
        for (let day = 0; day < 7; day++) {
          const d = new Date(today.getTime() + day * 24 * 60 * 60 * 1000);
          const pad = (n) => String(n).padStart(2, '0');
          const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

          for (let i = 0; i < allSchedules.length; i++) {
            const schId = `${c._id}_${dateStr}_${i}`;
            const sch = allSchedules[i];

            if (force) {
              await conn.query(`DELETE FROM seats WHERE scheduleId = ?`, [schId]);
            }

            await conn.query(
              `
              INSERT INTO schedules (_id,movieId,cinemaId,hallName,hallType,date,startTime,endTime,price,totalSeats,availableSeats,status,createTime,updateTime)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON DUPLICATE KEY UPDATE movieId=VALUES(movieId), cinemaId=VALUES(cinemaId), hallName=VALUES(hallName), hallType=VALUES(hallType),
                                      startTime=VALUES(startTime), endTime=VALUES(endTime), price=VALUES(price),
                                      date=VALUES(date), totalSeats=VALUES(totalSeats), availableSeats=VALUES(availableSeats),
                                      status=VALUES(status), updateTime=VALUES(updateTime)
            `,
              [
                schId,
                sch.movieId,
                c._id,
                sch.hallName,
                sch.hallType,
                dateStr,
                sch.startTime,
                sch.endTime,
                safeInt(sch.price * 100, 0),
                rows * cols,
                rows * cols,
                'available',
                nowDb(),
                nowDb()
              ]
            );

            if (force) {
              const seatValues = [];
              for (let row = 1; row <= rows; row++) {
                for (let col = 1; col <= cols; col++) {
                  seatValues.push([`${schId}_${row}_${col}`, schId, row, col, 'available', null, nowDb(), nowDb()]);
                }
              }
              await conn.query(
                `
                INSERT INTO seats (_id,scheduleId,rowNum,colNum,status,orderId,createTime,updateTime)
                VALUES ?
              `,
                [seatValues]
              );
            } else {
              const [countRows] = await conn.query(`SELECT COUNT(*) as cnt FROM seats WHERE scheduleId = ?`, [schId]);
              const cnt = countRows[0]?.cnt || 0;
              if (cnt === 0) {
                const seatValues = [];
                for (let row = 1; row <= rows; row++) {
                  for (let col = 1; col <= cols; col++) {
                    seatValues.push([`${schId}_${row}_${col}`, schId, row, col, 'available', null, nowDb(), nowDb()]);
                  }
                }
                await conn.query(
                  `
                  INSERT INTO seats (_id,scheduleId,rowNum,colNum,status,orderId,createTime,updateTime)
                  VALUES ?
                `,
                  [seatValues]
                );
              }
            }
          }
        }
      }

      await conn.commit();
      res.json({ code: 0, message: '导入完成', data: { force } });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: -1, message: err.message || '导入失败' });
  }
});

app.get('/api/schedule-detail', async (req, res) => {
  try {
    const scheduleId = req.query.scheduleId;
    if (!scheduleId) return res.status(400).json({ code: -1, message: '缺少 scheduleId' });

    const data = await getScheduleWithSeats(scheduleId);
    if (!data) return res.status(404).json({ code: -1, message: '场次不存在' });

    res.json({ code: 0, message: 'ok', data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: -1, message: e.message || '查询失败' });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const openid = getOpenid(req);
    const status = req.query.status || '';
    const page = Math.max(1, safeInt(req.query.page, 1));
    const pageSize = Math.min(50, Math.max(1, safeInt(req.query.pageSize, 20)));

    if (!openid) return res.status(401).json({ code: -1, message: '未登录(openid缺失)' });

    const offset = (page - 1) * pageSize;

    const where = `WHERE _openid = ? ${status ? 'AND status = ?' : ''}`;
    const params = status ? [openid, status, pageSize, offset] : [openid, pageSize, offset];

    const [rowsData] = await pool.query(
      `
        SELECT _id, orderNo, status, totalPrice,
               moviePoster, movieTitle, cinemaName, hallName,
               date, startTime, seatsJson, createTime, purchaseTime
        FROM orders
        ${where}
        ORDER BY createTime DESC
        LIMIT ? OFFSET ?
      `,
      params
    );

    const items = rowsData.map(o => ({
      _id: o._id,
      orderNo: o.orderNo,
      status: o.status,
      totalPrice: safeInt(o.totalPrice, 0),
      moviePoster: o.moviePoster || '',
      movieTitle: o.movieTitle || '',
      cinemaName: o.cinemaName || '',
      hallName: o.hallName || '',
      date: o.date,
      startTime: o.startTime,
      seats: mapSeatsJson(o.seatsJson),
      createTime: o.createTime,
      purchaseTime: o.purchaseTime
    }));

    res.json({ code: 0, message: 'ok', data: { items } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: -1, message: e.message || '查询订单失败' });
  }
});

app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const openid = getOpenid(req);
    if (!openid) return res.status(401).json({ code: -1, message: '未登录(openid缺失)' });
    const orderId = req.params.orderId;

    const [rowsData] = await pool.query(
      `
        SELECT o._id, o.orderNo, o.status, o.totalPrice, o.couponId, o.seatCount, o.scheduleId,
               o.moviePoster, o.movieTitle, o.cinemaName, o.hallName,
               o.date, o.startTime, o.seatsJson, o.createTime, o.purchaseTime, o.payTime,
               uc.title AS couponTitle, uc.amount AS couponAmount,
               s.price AS scheduleUnitPrice
        FROM orders o
        LEFT JOIN user_coupons uc ON ${sqlCollateEq('uc._id', 'o.couponId')}
        LEFT JOIN schedules s ON s._id = o.scheduleId
        WHERE o._id = ? AND o._openid = ?
        LIMIT 1
      `,
      [orderId, openid]
    );

    const o = rowsData[0];
    if (!o) return res.status(404).json({ code: -1, message: '订单不存在或无权访问' });

    const baseTotalPrice = safeInt(o.scheduleUnitPrice, 0) * Math.max(1, safeInt(o.seatCount, 1));
    const totalPrice = safeInt(o.totalPrice, 0);
    const discountCents = Math.max(0, baseTotalPrice - totalPrice);

    res.json({
      code: 0,
      message: 'ok',
      data: {
        _id: o._id,
        orderNo: o.orderNo,
        status: o.status,
        totalPrice,
        baseTotalPrice,
        discountCents,
        couponId: o.couponId || '',
        couponTitle: o.couponTitle || '',
        couponAmount: safeInt(o.couponAmount, 0),
        moviePoster: o.moviePoster || '',
        movieTitle: o.movieTitle || '',
        cinemaName: o.cinemaName || '',
        hallName: o.hallName || '',
        date: o.date,
        startTime: o.startTime,
        seats: mapSeatsJson(o.seatsJson),
        createTime: o.createTime,
        purchaseTime: o.purchaseTime,
        payTime: o.payTime
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: -1, message: e.message || '查询订单详情失败' });
  }
});

app.get('/api/pay/capabilities', (_req, res) => {
  res.json({
    code: 0,
    message: 'ok',
    data: {
      alipay: alipayPay.isAlipayPayReady(),
      mockPay: true
    }
  });
});

app.post('/api/orders/:orderId/alipay/prepare', async (req, res) => {
  try {
    const openid = getOpenid(req);
    const orderId = String(req.params.orderId || '').trim();
    if (!openid) return res.status(401).json({ code: -1, message: '未登录(openid缺失)' });
    if (!orderId) return res.status(400).json({ code: -1, message: '缺少订单ID' });
    if (!alipayPay.isAlipayConfigured()) {
      return res.status(503).json({ code: -1, message: '服务端未配置支付宝（ALIPAY_APP_ID 等）' });
    }
    const publicBase = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    if (!publicBase) {
      return res.status(503).json({
        code: -1,
        message: '请配置 PUBLIC_BASE_URL 为公网可访问的 HTTPS 根地址（用于支付回调与跳转）'
      });
    }

    const [rows] = await pool.query(
      `SELECT _id, _openid, status, orderNo, totalPrice, movieTitle FROM orders WHERE _id=? LIMIT 1`,
      [orderId]
    );
    const row = rows && rows[0];
    if (!row || String(row._openid) !== String(openid)) {
      return res.status(404).json({ code: -1, message: '订单不存在或无权访问' });
    }
    if (row.status !== 'pending') {
      return res.status(400).json({ code: -1, message: '订单不可支付' });
    }

    const token = makePayBridgeToken(orderId);
    const bridgeUrl = `${publicBase}/api/pay/alipay-bridge?t=${encodeURIComponent(token)}`;
    res.json({
      code: 0,
      message: 'ok',
      data: {
        bridgeUrl,
        hint:
          '小程序内请使用 web-view 打开 bridgeUrl；需在微信公众平台配置该域名为业务域名。亦可复制链接到系统浏览器完成支付。'
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: -1, message: e.message || '准备支付失败' });
  }
});

app.get('/api/pay/alipay-bridge', async (req, res) => {
  try {
    const orderId = readPayBridgeToken(req.query.t);
    if (!orderId) {
      return res.status(400).type('html').send('<p>链接无效或已过期，请返回小程序重新发起支付。</p>');
    }
    if (!alipayPay.isAlipayPayReady()) {
      return res.status(503).type('html').send('<p>支付宝支付未配置完整。</p>');
    }
    const publicBase = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const [rows] = await pool.query(
      `SELECT orderNo, totalPrice, movieTitle, status FROM orders WHERE _id=? LIMIT 1`,
      [orderId]
    );
    const row = rows && rows[0];
    if (!row || row.status !== 'pending') {
      return res.status(400).type('html').send('<p>订单不可支付或已处理。</p>');
    }
    const notifyUrl = `${publicBase}/api/pay/alipay-notify`;
    const returnUrl = `${publicBase}/api/pay/alipay-return`;
    const html = alipayPay.buildWapPayHtml({
      outTradeNo: row.orderNo,
      totalCents: safeInt(row.totalPrice, 0),
      subject: `电影票-${row.movieTitle || '订单'}`,
      returnUrl,
      notifyUrl
    });
    res.status(200).type('text/html; charset=utf-8').send(html);
  } catch (e) {
    console.error(e);
    res.status(500).type('html').send(`<p>发起支付失败：${String(e.message || e)}</p>`);
  }
});

app.get('/api/pay/alipay-return', (_req, res) => {
  res
    .status(200)
    .type('text/html; charset=utf-8')
    .send(
      '<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="font-family:sans-serif;padding:24px;text-align:center"><p>支付流程已结束。</p><p>请返回微信小程序查看订单状态；若未更新可稍候下拉刷新。</p></body></html>'
    );
});

app.post('/api/pay/alipay-notify', express.urlencoded({ extended: false }), async (req, res) => {
  const fail = () => res.status(200).send('fail');
  const ok = () => res.status(200).send('success');
  try {
    const body = req.body || {};
    if (!alipayPay.verifyNotify(body)) {
      console.warn('[alipay-notify] 验签失败');
      return fail();
    }
    const tradeStatus = String(body.trade_status || '');
    if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
      return ok();
    }
    const outTradeNo = String(body.out_trade_no || '').trim();
    if (!outTradeNo) return fail();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rowsData] = await conn.query(
        `SELECT _id, _openid, status, seatCount, scheduleId, couponId FROM orders WHERE orderNo=? LIMIT 1`,
        [outTradeNo]
      );
      const order = rowsData[0];
      if (!order) {
        await conn.rollback();
        return fail();
      }
      if (order.status !== 'pending') {
        await conn.commit();
        return ok();
      }
      const done = await fulfillOrderAfterPayment(conn, order);
      if (!done) {
        await conn.rollback();
        return fail();
      }
      await conn.commit();
      return ok();
    } catch (e) {
      console.error(e);
      try {
        await conn.rollback();
      } catch (_) {}
      return fail();
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error(e);
    return fail();
  }
});

async function getOrderBaseTotalCents(conn, order) {
  const scheduleId = String(order.scheduleId || '').trim();
  if (scheduleId) {
    const [scheduleRows] = await conn.query(`SELECT price FROM schedules WHERE _id=? LIMIT 1`, [scheduleId]);
    const schedule = scheduleRows && scheduleRows[0];
    if (schedule && schedule.price != null) {
      return safeInt(schedule.price, 0) * Math.max(1, safeInt(order.seatCount, 1));
    }
  }
  const currentTotal = safeInt(order.totalPrice, 0);
  const boundCouponId = String(order.couponId || '').trim();
  if (!boundCouponId) return currentTotal;
  const [cRows] = await conn.query(`SELECT amount FROM user_coupons WHERE _id=? LIMIT 1`, [boundCouponId]);
  const discount = cRows && cRows[0] ? safeInt(cRows[0].amount, 0) : 0;
  return currentTotal + discount;
}

async function lockCouponForOrder(conn, { openid, couponId, orderId, baseTotalPriceCents }) {
  const id = String(couponId || '').trim();
  const oid = String(openid);
  const oidOrder = String(orderId);
  if (!id) return { couponId: '', discountCents: 0 };
  const [rowsData] = await conn.query(
    `
      SELECT _id, amount, minAmount, status, expireTime, lockOrderId
      FROM user_coupons
      WHERE _id=? AND _openid=?
      LIMIT 1
      FOR UPDATE
    `,
    [id, oid]
  );
  const c = rowsData && rowsData[0];
  if (!c) throw new Error('优惠券不存在');
  const status = String(c.status || '');
  if (status === 'locked') {
    if (String(c.lockOrderId || '') !== oidOrder) {
      throw new Error('优惠券已在其他订单中使用');
    }
  } else if (status !== 'available') {
    throw new Error('优惠券不可用');
  }
  if (c.expireTime) {
    const exp = new Date(c.expireTime).getTime();
    if (Number.isFinite(exp) && exp <= Date.now()) {
      throw new Error('优惠券已过期');
    }
  }
  const minAmountCents = safeInt(c.minAmount, 0);
  if (baseTotalPriceCents < minAmountCents) {
    throw new Error('未达到优惠券使用门槛');
  }
  const discountCents = Math.max(0, Math.min(baseTotalPriceCents, safeInt(c.amount, 0)));
  if (status === 'available') {
    const [r] = await conn.query(
      `UPDATE user_coupons SET status='locked', lockOrderId=?, updateTime=NOW() WHERE _id=? AND _openid=? AND status='available'`,
      [oidOrder, id, oid]
    );
    const affected = r?.affectedRows ?? 0;
    if (affected !== 1) throw new Error('优惠券已被占用，请刷新后重试');
  }
  return { couponId: id, discountCents };
}

async function releaseCouponForOrder(conn, { openid, couponId, orderId }) {
  const id = String(couponId || '').trim();
  if (!id) return;
  await conn.query(
    `
      UPDATE user_coupons
      SET status='available', lockOrderId=NULL, updateTime=NOW()
      WHERE _id=? AND _openid=? AND status='locked' AND lockOrderId=?
    `,
    [id, String(openid), orderId]
  );
}

app.post('/api/orders/:orderId/apply-coupon', async (req, res) => {
  const openid = getOpenid(req);
  const orderId = String(req.params.orderId || '').trim();
  const couponId = String(getRequestBody(req).couponId || '').trim();
  if (!openid) return res.status(401).json({ code: -1, message: '未登录(openid缺失)' });
  if (!orderId) return res.status(400).json({ code: -1, message: '缺少订单ID' });
  if (!couponId) return res.status(400).json({ code: -1, message: '请选择优惠券' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orderRows] = await conn.query(
      `
        SELECT _id, status, scheduleId, seatCount, couponId, totalPrice
        FROM orders
        WHERE _id=? AND _openid=?
        LIMIT 1
        FOR UPDATE
      `,
      [orderId, openid]
    );
    const order = orderRows[0];
    if (!order) throw new Error('订单不存在或无权访问');
    if (order.status !== 'pending') throw new Error('仅待支付订单可使用优惠券');

    const baseTotalPriceCents = await getOrderBaseTotalCents(conn, order);
    if (baseTotalPriceCents <= 0) throw new Error('无法计算订单金额');
    if (String(order.couponId || '') === couponId) {
      await conn.commit();
      return res.json({
        code: 0,
        message: '已使用该优惠券',
        data: {
          totalPrice: safeInt(order.totalPrice, 0),
          baseTotalPrice: baseTotalPriceCents,
          discountCents: baseTotalPriceCents - safeInt(order.totalPrice, 0),
          couponId
        }
      });
    }

    if (order.couponId) {
      await releaseCouponForOrder(conn, { openid, couponId: order.couponId, orderId });
    }

    const lockedCoupon = await lockCouponForOrder(conn, {
      openid,
      couponId,
      orderId,
      baseTotalPriceCents
    });
    const newTotalCents = Math.max(0, baseTotalPriceCents - lockedCoupon.discountCents);

    await conn.query(
      `UPDATE orders SET totalPrice=?, couponId=?, updateTime=NOW() WHERE _id=? AND _openid=?`,
      [newTotalCents, lockedCoupon.couponId, orderId, openid]
    );

    await conn.commit();
    res.json({
      code: 0,
      message: '优惠券已应用',
      data: {
        totalPrice: newTotalCents,
        baseTotalPrice: baseTotalPriceCents,
        discountCents: lockedCoupon.discountCents,
        couponId: lockedCoupon.couponId
      }
    });
  } catch (e) {
    console.error(e);
    try {
      await conn.rollback();
    } catch (_) {}
    res.status(400).json({ code: -1, message: e.message || '应用优惠券失败' });
  } finally {
    conn.release();
  }
});

app.post('/api/orders/:orderId/remove-coupon', async (req, res) => {
  const openid = getOpenid(req);
  const orderId = String(req.params.orderId || '').trim();
  if (!openid) return res.status(401).json({ code: -1, message: '未登录(openid缺失)' });
  if (!orderId) return res.status(400).json({ code: -1, message: '缺少订单ID' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orderRows] = await conn.query(
      `
        SELECT _id, status, scheduleId, seatCount, couponId
        FROM orders
        WHERE _id=? AND _openid=?
        LIMIT 1
        FOR UPDATE
      `,
      [orderId, openid]
    );
    const order = orderRows[0];
    if (!order) throw new Error('订单不存在或无权访问');
    if (order.status !== 'pending') throw new Error('仅待支付订单可取消优惠券');
    if (!order.couponId) {
      await conn.commit();
      return res.json({ code: 0, message: '未使用优惠券' });
    }

    const baseTotalPriceCents = await getOrderBaseTotalCents(conn, order);
    await releaseCouponForOrder(conn, { openid, couponId: order.couponId, orderId });
    await conn.query(
      `UPDATE orders SET totalPrice=?, couponId='', updateTime=NOW() WHERE _id=? AND _openid=?`,
      [baseTotalPriceCents, orderId, openid]
    );

    await conn.commit();
    res.json({
      code: 0,
      message: '已取消优惠券',
      data: { totalPrice: baseTotalPriceCents, baseTotalPrice: baseTotalPriceCents, discountCents: 0, couponId: '' }
    });
  } catch (e) {
    console.error(e);
    try {
      await conn.rollback();
    } catch (_) {}
    res.status(400).json({ code: -1, message: e.message || '取消优惠券失败' });
  } finally {
    conn.release();
  }
});

app.post('/api/orders/create', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const openid = getOpenid(req);
    const { scheduleId, seats, totalPriceCents, couponId } = req.body || {};

    if (!openid) return res.status(401).json({ code: -1, message: '未登录(openid缺失)' });
    if (!scheduleId) return res.status(400).json({ code: -1, message: '缺少 scheduleId' });
    if (!Array.isArray(seats) || seats.length === 0) return res.status(400).json({ code: -1, message: '缺少 seats' });

    const tPrice = safeInt(totalPriceCents, -1);
    if (tPrice < 0) return res.status(400).json({ code: -1, message: 'totalPriceCents 参数错误' });

    // 读取场次
    const [scheduleRows] = await conn.query(
      `
        SELECT s._id, s.movieId, s.cinemaId, s.hallName, s.date, s.startTime, s.price,
               m.title AS movieTitle, m.poster AS moviePoster,
               c.name AS cinemaName
        FROM schedules s
        LEFT JOIN movies m ON m._id = s.movieId
        LEFT JOIN cinemas c ON c._id = s.cinemaId
        WHERE s._id = ?
        LIMIT 1
      `,
      [scheduleId]
    );

    const schedule = scheduleRows[0];
    if (!schedule) return res.status(404).json({ code: -1, message: '场次不存在' });

    const orderId = 'order_' + uuidv4().replace(/-/g, '').slice(0, 20);
    const orderNo = 'ORD' + Date.now() + Math.random().toString(36).slice(2, 9).toUpperCase();

    await conn.beginTransaction();

    // 锁座：只允许 available -> locked
    const normalizedSeats = seats.map(s => ({
      row: safeInt(s.row, NaN),
      col: safeInt(s.col, NaN)
    }));
    if (normalizedSeats.some(s => !Number.isFinite(s.row) || !Number.isFinite(s.col))) {
      throw new Error('座位参数错误');
    }

    // 更新座位状态
    const baseTotalPriceCents = safeInt(schedule.price, 0) * normalizedSeats.length;
    const lockedCoupon = await lockCouponForOrder(conn, {
      openid,
      couponId,
      orderId,
      baseTotalPriceCents
    });
    const expectedTotalPriceCents = Math.max(0, baseTotalPriceCents - lockedCoupon.discountCents);
    if (tPrice !== expectedTotalPriceCents) throw new Error('订单金额异常，请重新选择优惠券后下单');

    for (const s of normalizedSeats) {
      const [r] = await conn.query(
        `
          UPDATE seats
          SET status='locked', orderId=?
          WHERE scheduleId=? AND rowNum=? AND colNum=? AND status='available'
        `,
        [orderId, scheduleId, s.row, s.col]
      );

      // mysql2 返回的 affectedRows 在 r.affectedRows
      const affected = r?.affectedRows ?? 0;
      if (affected !== 1) {
        throw new Error('座位已被占用');
      }
    }

    const seatsJson = JSON.stringify(normalizedSeats);

    const insertValues = [
      orderId,
      orderNo,
      openid,
      scheduleId,
      schedule.movieId,
      schedule.cinemaId,
      schedule.movieTitle ? schedule.movieTitle : '',
      schedule.moviePoster ? schedule.moviePoster : '',
      schedule.cinemaName ? schedule.cinemaName : '',
      schedule.hallName ? schedule.hallName : '',
      schedule.date,
      schedule.startTime,
      seatsJson,
      normalizedSeats.length,
      tPrice,
      lockedCoupon.couponId || '',
      'pending'
    ];
    const placeholders = insertValues.map(() => '?').join(',');
    await conn.query(
      `
        INSERT INTO orders (_id, orderNo, _openid,
                             scheduleId,movieId,cinemaId,
                             movieTitle,moviePoster,cinemaName,hallName,
                             date,startTime,seatsJson,seatCount,totalPrice,couponId,
                             status,purchaseTime,createTime,updateTime)
        VALUES (${placeholders}, NOW(), NOW(), NOW())
      `,
      insertValues
    );

    await conn.commit();

    res.json({ code: 0, message: '订单创建成功', data: { orderId, orderNo } });
  } catch (e) {
    console.error(e);
    try {
      await conn.rollback();
    } catch (_) {}
    res.status(400).json({ code: -1, message: e.message || '创建订单失败' });
  } finally {
    conn.release();
  }
});

app.post('/api/orders/:orderId/cancel', async (req, res) => {
  const openid = getOpenid(req);
  const orderId = req.params.orderId;
  if (!openid) return res.status(401).json({ code: -1, message: '未登录(openid缺失)' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rowsData] = await conn.query(
      `SELECT _id, status, seatCount, couponId FROM orders WHERE _id=? AND _openid=? LIMIT 1`,
      [orderId, openid]
    );
    const order = rowsData[0];
    if (!order) throw new Error('订单不存在或无权访问');
    if (order.status !== 'pending') {
      await conn.rollback();
      return res.json({ code: 0, message: '订单已处理，无需取消' });
    }

    await conn.query(
      `UPDATE orders SET status='cancelled', updateTime=NOW() WHERE _id=? AND _openid=? AND status='pending'`,
      [orderId, openid]
    );

    await conn.query(
      `UPDATE seats SET status='available', orderId=NULL, updateTime=NOW() WHERE orderId=?`,
      [orderId]
    );
    if (order.couponId) {
      await conn.query(
        `
          UPDATE user_coupons
          SET status='available', lockOrderId=NULL, updateTime=NOW()
          WHERE _id=? AND _openid=? AND status='locked' AND lockOrderId=?
        `,
        [String(order.couponId), openid, orderId]
      );
    }

    await conn.commit();
    res.json({ code: 0, message: '取消成功' });
  } catch (e) {
    console.error(e);
    try { await conn.rollback(); } catch (_) {}
    res.status(400).json({ code: -1, message: e.message || '取消失败' });
  } finally {
    conn.release();
  }
});

app.post('/api/orders/:orderId/mockPay', async (req, res) => {
  const openid = getOpenid(req);
  const orderId = req.params.orderId;
  if (!openid) return res.status(401).json({ code: -1, message: '未登录(openid缺失)' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rowsData] = await conn.query(
      `SELECT _id, _openid, status, seatCount, scheduleId, couponId FROM orders WHERE _id=? AND _openid=? LIMIT 1`,
      [orderId, openid]
    );
    const order = rowsData[0];
    if (!order) throw new Error('订单不存在或无权访问');
    if (order.status !== 'pending') {
      await conn.rollback();
      return res.json({ code: 0, message: '订单已处理' });
    }

    const paid = await fulfillOrderAfterPayment(conn, order);
    if (!paid) {
      await conn.rollback();
      throw new Error('支付状态更新失败');
    }

    await conn.commit();
    res.json({ code: 0, message: '支付成功' });
  } catch (e) {
    console.error(e);
    try { await conn.rollback(); } catch (_) {}
    res.status(400).json({ code: -1, message: e.message || '支付失败' });
  } finally {
    conn.release();
  }
});

app.post('/api/orders/:orderId/refund', async (req, res) => {
  const openid = getOpenid(req);
  const orderId = req.params.orderId;
  if (!openid) return res.status(401).json({ code: -1, message: '未登录(openid缺失)' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rowsData] = await conn.query(
      `SELECT _id, status, seatCount, scheduleId FROM orders WHERE _id=? AND _openid=? LIMIT 1`,
      [orderId, openid]
    );
    const order = rowsData[0];
    if (!order) throw new Error('订单不存在或无权访问');
    if (order.status !== 'paid') {
      await conn.rollback();
      return res.json({ code: 0, message: '订单不允许退款' });
    }

    await conn.query(
      `UPDATE orders SET status='refunded', refundTime=NOW(), updateTime=NOW() WHERE _id=? AND _openid=? AND status='paid'`,
      [orderId, openid]
    );

    await conn.query(
      `UPDATE seats SET status='available', orderId=NULL, updateTime=NOW() WHERE orderId=?`,
      [orderId]
    );

    const seatCount = safeInt(order.seatCount, 0);
    await conn.query(
      `UPDATE schedules SET availableSeats = availableSeats + ?, updateTime=NOW() WHERE _id=?`,
      [seatCount, order.scheduleId]
    );

    try {
      const ps = require('./lib/pointsService');
      await ps.reversePointsForOrderRefund(conn, orderId, openid);
    } catch (pe) {
      console.error('[points] order refund reversal:', pe.message || pe);
    }

    await conn.commit();
    res.json({ code: 0, message: '退款成功' });
  } catch (e) {
    console.error(e);
    try { await conn.rollback(); } catch (_) {}
    res.status(400).json({ code: -1, message: e.message || '退款失败' });
  } finally {
    conn.release();
  }
});

app.delete('/api/orders/:orderId', async (req, res) => {
  const openid = getOpenid(req);
  const orderId = req.params.orderId;
  if (!openid) return res.status(401).json({ code: -1, message: '未登录(openid缺失)' });

  try {
    const [rowsData] = await pool.query(
      `SELECT status FROM orders WHERE _id=? AND _openid=? LIMIT 1`,
      [orderId, openid]
    );
    const o = rowsData[0];
    if (!o) return res.status(404).json({ code: -1, message: '订单不存在' });
    if (!['cancelled', 'refunded'].includes(o.status)) {
      return res.status(400).json({ code: -1, message: '只有已取消/已退款订单可删除' });
    }

    await pool.query(`UPDATE seats SET status='available', orderId=NULL, updateTime=NOW() WHERE orderId=?`, [orderId]);
    await pool.query(`DELETE FROM orders WHERE _id=? AND _openid=?`, [orderId, openid]);

    res.json({ code: 0, message: '删除成功' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: -1, message: e.message || '删除失败' });
  }
});

registerExtraRoutes(app, pool, { getOpenid, safeInt, nowDb, rows, cols });
console.log(
  '[routes] 已注册扩展路由: /api/movies/search, /api/schedules, /api/admin/users, /api/admin/dashboard-stats 等'
);

/** 首次启动若「即将上映」为空，则从 TMDB upcoming 拉一批（需 TMDB_API_KEY） */
async function ensureUpcomingMoviesIfEmpty() {
  try {
    const [cntRows] = await pool.query(`SELECT COUNT(*) AS c FROM movies WHERE status='coming'`);
    const n = cntRows && cntRows[0] ? Number(cntRows[0].c) : 0;
    if (n > 0) {
      console.log(`[startup] 即将上映影片已有 ${n} 条`);
      return;
    }
    if (!process.env.TMDB_API_KEY) {
      console.log('[startup] 未配置 TMDB_API_KEY，跳过即将上映自动导入');
      return;
    }
    console.log('[startup] 即将上映为空，正在从 TMDB upcoming 拉取…');
    const result = await tmdbSync.importMoviesFromTmdb(pool, {
      mode: 'upcoming',
      count: 35,
      maxPages: 20,
      priceCents: safeInt(process.env.DEFAULT_MOVIE_PRICE_CENTS, 3500),
      idPrefix: 'tmdb'
    });
    await tmdbSync.recomputeMovieStatuses(pool);
    console.log('[startup] 即将上映导入完成，约', (result.ok || []).length, '部');
  } catch (e) {
    console.warn('[startup] 即将上映自动导入失败:', e.message || e);
  }
}

const port = Number(process.env.PORT || 3000);
const httpsPort = Number(process.env.HTTPS_PORT || 3443);
const httpsKeyPath = (process.env.HTTPS_KEY_PATH || '').trim();
const httpsCertPath = (process.env.HTTPS_CERT_PATH || '').trim();

Promise.all([
  (async () => {
    await initDbCollation();
    await ensureUsersPasswordColumn();
    await ensureOrdersPurchaseTimeColumn();
    await ensureExtraTables(pool);
    await alignOpenidTablesToUserIdCollation();
  })()
])
  .catch((err) => {
    console.error('ensureUsersPasswordColumn / ensureOrdersPurchaseTimeColumn / ensureExtraTables failed:', err);
  })
  .finally(() => {
    const host = '0.0.0.0';
    // 监听所有网卡，便于真机通过局域网 IP 访问（仅 127.0.0.1 时手机无法连到本机）
    const server = app.listen(port, host, () => {
      server.timeout = 0;
      server.keepAliveTimeout = 0;
      server.headersTimeout = 0;
      console.log(`backend HTTP  http://127.0.0.1:${port}  (局域网: 本机IPv4:${port})`);
      setTimeout(() => ensureUpcomingMoviesIfEmpty(), 2000);
    });

    if (httpsKeyPath && httpsCertPath) {
      try {
        const key = fs.readFileSync(httpsKeyPath);
        const cert = fs.readFileSync(httpsCertPath);
        https.createServer({ key, cert }, app).listen(httpsPort, host, () => {
          console.log(
            `backend HTTPS https://127.0.0.1:${httpsPort}  (小程序海报代理请把 BACKEND_BASE_URL 设为 https://局域网IP:${httpsPort})`
          );
        });
      } catch (e) {
        console.error('HTTPS 启动失败（检查 HTTPS_KEY_PATH / HTTPS_CERT_PATH）:', e.message || e);
      }
    }
  });

