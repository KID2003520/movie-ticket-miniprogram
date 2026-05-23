/**
 * 使用 TMDB 官方 API 拉取电影海报与资料并写回 MySQL（需 TMDB_API_KEY）。
 * 见 https://www.themoviedb.org/settings/api
 */
const https = require('https');

let _tmdbHttpsAgentCached = null;
let _tmdbProxyLogged = false;
let _tmdbProxyDisabledByFallback = false;

function resetTmdbHttpsAgent() {
  _tmdbHttpsAgentCached = null;
  _tmdbProxyLogged = false;
}

function getConfiguredProxyUrl() {
  if (
    process.env.TMDB_DISABLE_PROXY === '1' ||
    /^true$/i.test(String(process.env.TMDB_DISABLE_PROXY || ''))
  ) {
    return '';
  }
  return (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || '').trim();
}

/** 支持 HTTPS_PROXY / HTTP_PROXY / ALL_PROXY（需稳定访问 TMDB 时配置系统代理或 Clash 本地端口） */
function getTmdbHttpsAgent(opts = {}) {
  if (opts.forceDirect) {
    return new https.Agent({ keepAlive: true, family: 4 });
  }
  if (_tmdbHttpsAgentCached) return _tmdbHttpsAgentCached;
  const proxyUrl = getConfiguredProxyUrl();
  if (proxyUrl) {
    try {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      _tmdbHttpsAgentCached = new HttpsProxyAgent(proxyUrl);
      if (!_tmdbProxyLogged) {
        _tmdbProxyLogged = true;
        const masked = proxyUrl.replace(/(:\/\/[^:@]+:)[^@]+(@)/, '$1****$2');
        console.log('[tmdb] 使用 HTTP(S) 代理:', masked);
      }
    } catch (e) {
      console.warn('[tmdb] 代理初始化失败，改为直连:', e.message || e);
      _tmdbHttpsAgentCached = new https.Agent({ keepAlive: true, family: 4 });
    }
  } else {
    _tmdbHttpsAgentCached = new https.Agent({ keepAlive: true, family: 4 });
  }
  return _tmdbHttpsAgentCached;
}

function getTmdbTimeoutMs() {
  const n = Number(process.env.TMDB_REQUEST_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 8000 ? Math.trunc(n) : 25000;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nowDb() {
  // MySQL 5.7 DATETIME 不接受 ISO 8601（带T/ Z），需要 'YYYY-MM-DD HH:mm:ss'
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isRetryableNetworkError(err) {
  if (!err) return false;
  if (err.name === 'AggregateError') return true;
  const msg = String(err.message || '');
  if (msg.includes('TMDB 请求超时')) return true;
  const code = String(err.code || '');
  return ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'ENOTFOUND'].includes(code);
}

async function httpsRequestWithRedirect(url, options = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      options,
      (res) => {
        const statusCode = Number(res.statusCode || 0);
        const location = res.headers && res.headers.location ? String(res.headers.location) : '';
        if ([301, 302, 303, 307, 308].includes(statusCode) && location && maxRedirects > 0) {
          const nextUrl = new URL(location, url).toString();
          res.resume();
          return resolve(httpsRequestWithRedirect(nextUrl, options, maxRedirects - 1));
        }
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          resolve({ statusCode, data });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('TMDB 请求超时'));
    });
    req.on('error', reject);
  });
}

function httpsGetJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    httpsRequestWithRedirect(
      url,
      {
        agent: getTmdbHttpsAgent(opts),
        timeout: getTmdbTimeoutMs(),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'movie-ticket-miniprogram/1.0'
        }
      },
      5
    )
      .then(({ statusCode, data }) => {
        if (statusCode < 200 || statusCode >= 300) {
          return reject(new Error(`HTTP ${statusCode}: ${data.slice(0, 300)}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      })
      .catch(reject);
  });
}

async function httpsGetJsonWithRetry(url, opts = {}) {
  const maxAttempts = safeInt(opts.maxAttempts, safeInt(process.env.TMDB_REQUEST_MAX_ATTEMPTS, 6));
  const retryDelayMs = safeInt(opts.retryDelayMs, safeInt(process.env.TMDB_REQUEST_RETRY_DELAY_MS, 800));
  let lastError;
  let triedDirectFallback = false;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await httpsGetJson(url);
    } catch (e) {
      lastError = e;
      const proxyUrl = getConfiguredProxyUrl();
      if (
        proxyUrl &&
        !triedDirectFallback &&
        isRetryableNetworkError(e) &&
        !_tmdbProxyDisabledByFallback
      ) {
        triedDirectFallback = true;
        _tmdbProxyDisabledByFallback = true;
        resetTmdbHttpsAgent();
        console.warn(
          '[tmdb] 代理请求失败，自动改直连重试:',
          e.code || '',
          e.message || e
        );
        try {
          return await httpsGetJson(url, { forceDirect: true });
        } catch (directErr) {
          lastError = directErr;
        }
      }
      const canRetry = i < maxAttempts && isRetryableNetworkError(lastError);
      if (!canRetry) break;
      await sleep(retryDelayMs * i);
    }
  }
  throw lastError;
}

/** 供接口返回：TMDB 网络/代理类错误的可读说明 */
function formatTmdbNetworkErrorMessage(err) {
  const raw = err && err.message ? String(err.message) : String(err || '未知错误');
  const proxyUrl = getConfiguredProxyUrl();
  const hints = [];
  if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|超时/i.test(raw)) {
    if (proxyUrl) {
      hints.push(
        `当前 HTTPS_PROXY=${proxyUrl} 可能未启动或端口不对（Clash 是否已开？可运行 node scripts/detectTmdbProxy.js 检测）`
      );
      hints.push('或在 backend/.env 注释掉 HTTPS_PROXY，或设置 TMDB_DISABLE_PROXY=1 后重启后端');
    } else {
      hints.push('本机访问 api.themoviedb.org 失败，可配置 HTTPS_PROXY 或开 VPN 后运行 node scripts/detectTmdbProxy.js');
    }
  }
  hints.push('确认 TMDB_API_KEY 有效且后端已重启');
  return hints.length ? `${raw}。${hints.join('；')}` : raw;
}

function stripTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractAll(text, reg) {
  const arr = [];
  let m;
  while ((m = reg.exec(text)) !== null) {
    arr.push(m[1]);
  }
  return arr;
}

async function doubanSuggest(title) {
  const url = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(title)}`;
  const list = await httpsGetJsonWithRetry(url);
  return Array.isArray(list) ? list : [];
}

async function httpsGetTextWithRetry(url, opts = {}) {
  const maxAttempts = safeInt(opts.maxAttempts, 4);
  const retryDelayMs = safeInt(opts.retryDelayMs, 500);
  let lastError;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const text = await new Promise((resolve, reject) => {
        httpsRequestWithRedirect(
          url,
          {
            agent: tmdbHttpsAgent,
            timeout: 12000,
            headers: {
              Accept: 'text/html,application/json',
              'User-Agent': 'Mozilla/5.0'
            }
          },
          5
        )
          .then(({ statusCode, data }) => {
            if (statusCode < 200 || statusCode >= 300) {
              return reject(new Error(`HTTP ${statusCode}: ${data.slice(0, 200)}`));
            }
            resolve(data);
          })
          .catch(reject);
      });
      return text;
    } catch (e) {
      lastError = e;
      const canRetry = i < maxAttempts && isRetryableNetworkError(e);
      if (!canRetry) break;
      await sleep(retryDelayMs * i);
    }
  }
  throw lastError;
}

async function getDoubanMovieDetailByTitle(title) {
  const suggestions = await doubanSuggest(title);
  if (!suggestions.length) return null;
  const first = suggestions.find((s) => String(s.type || '').toLowerCase() === 'movie') || suggestions[0];
  const id = first && first.id ? String(first.id) : '';
  if (!id) return null;
  const html = await httpsGetTextWithRetry(`https://movie.douban.com/subject/${id}/`);

  const titleMatch = html.match(/property="v:itemreviewed"[^>]*>([^<]+)</);
  const ratingMatch = html.match(/property="v:average"[^>]*>([^<]+)</);
  const summaryMatch = html.match(/property="v:summary"[^>]*>([\s\S]*?)<\/span>/);
  const releaseDateMatch = html.match(/property="v:initialReleaseDate"[^>]*content="(\d{4}-\d{2}-\d{2})/);
  const durationMatch = html.match(/property="v:runtime"[^>]*content="(\d+)/);
  const directorList = extractAll(html, /rel="v:directedBy"[^>]*>([^<]+)</g);
  const actorList = extractAll(html, /rel="v:starring"[^>]*>([^<]+)</g);
  const genreList = extractAll(html, /property="v:genre"[^>]*>([^<]+)</g);
  const posterMatch = html.match(/<img[^>]+src="([^"]+)"[^>]*rel="v:image"/) || html.match(/<img[^>]+src="([^"]+)"[^>]*>/);

  const rating = ratingMatch ? Number(ratingMatch[1]) : 0;
  const duration = durationMatch ? safeInt(durationMatch[1], 0) : 0;

  return {
    title: stripTags((titleMatch && titleMatch[1]) || first.title || title),
    poster: (posterMatch && posterMatch[1]) || (first.img || ''),
    rating: Number.isFinite(rating) ? Math.round(rating * 10) / 10 : 0,
    genre: genreList.join('/'),
    duration,
    director: directorList.slice(0, 3).join(','),
    actors: actorList.slice(0, 10).join(','),
    description: stripTags((summaryMatch && summaryMatch[1]) || ''),
    releaseDate: (releaseDateMatch && releaseDateMatch[1]) || ''
  };
}

async function fetchMaoyanMoviesList(page) {
  const url = 'https://m.maoyan.com/ajax/movieOnInfoList';
  const json = await httpsGetJsonWithRetry(url);
  const list = (json && json.movieList) || [];
  if (!Array.isArray(list) || !list.length) return [];
  const pageSize = 20;
  const p = Math.max(1, safeInt(page, 1));
  const start = (p - 1) * pageSize;
  return list.slice(start, start + pageSize);
}

async function getMaoyanMovieDetail(maoyanId) {
  const url = `https://m.maoyan.com/ajax/detailmovie?movieId=${encodeURIComponent(String(maoyanId))}`;
  const json = await httpsGetJsonWithRetry(url);
  return (json && json.detailMovie) || null;
}

function mapMaoyanDetailToRow(detail) {
  if (!detail) return null;
  const poster = detail.img ? String(detail.img).replace('/w.h/', '/') : '';
  const title = detail.nm || '';
  const rating = Number(detail.sc || 0);
  const genre = detail.cat ? String(detail.cat).replace(/,/g, '/') : '';
  const duration = safeInt(detail.dur, 0);
  const director = detail.dir || '';
  const actors = detail.star || '';
  const description = detail.dra || '';
  const releaseDate =
    detail.pubDesc && String(detail.pubDesc).match(/\d{4}-\d{2}-\d{2}/)
      ? String(detail.pubDesc).match(/\d{4}-\d{2}-\d{2}/)[0]
      : '';
  return {
    title,
    poster,
    rating: Number.isFinite(rating) ? Math.round(rating * 10) / 10 : 0,
    genre,
    duration,
    director,
    actors,
    description,
    releaseDate
  };
}

function mapMaoyanListItemToRow(item) {
  if (!item) return null;
  const poster = item.img ? String(item.img).replace('/w.h/', '/') : '';
  const rating = Number(item.sc || 0);
  const releaseDate =
    item.rt && String(item.rt).match(/\d{4}-\d{2}-\d{2}/)
      ? String(item.rt).match(/\d{4}-\d{2}-\d{2}/)[0]
      : '';
  return {
    title: item.nm || item.title || '',
    poster,
    rating: Number.isFinite(rating) ? Math.round(rating * 10) / 10 : 0,
    genre: '',
    duration: 0,
    director: '',
    actors: '',
    description: '',
    releaseDate
  };
}

function tmdbBaseParams(apiKey) {
  return {
    api_key: apiKey,
    language: 'zh-CN'
  };
}

async function searchMovie(apiKey, title) {
  const params = new URLSearchParams({
    ...tmdbBaseParams(apiKey),
    query: title,
    include_adult: 'false'
  });
  const url = `https://api.themoviedb.org/3/search/movie?${params.toString()}`;
  return httpsGetJsonWithRetry(url);
}

async function getMovieDetail(apiKey, tmdbId) {
  const params = new URLSearchParams({
    ...tmdbBaseParams(apiKey),
    // release_dates：各国/地区分级上映信息，用于优先取中国大陆等客观公映日（优于 detail.release_date 单一字段）
    append_to_response: 'credits,release_dates'
  });
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}?${params.toString()}`;
  const detail = await httpsGetJsonWithRetry(url);

  const rd = detail.release_dates;
  const appendBad =
    !rd ||
    rd.status_code ||
    !Array.isArray(rd.results) ||
    rd.results.length === 0;
  if (appendBad) {
    try {
      await sleep(120);
      const p2 = new URLSearchParams(tmdbBaseParams(apiKey));
      const url2 = `https://api.themoviedb.org/3/movie/${tmdbId}/release_dates?${p2.toString()}`;
      const standalone = await httpsGetJsonWithRetry(url2, { maxAttempts: 4, retryDelayMs: 600 });
      if (standalone && Array.isArray(standalone.results) && standalone.results.length) {
        detail.release_dates = standalone;
      }
    } catch (_) {
      /* 保持 detail 原样，仅用 release_date */
    }
  }
  return detail;
}

/** @param {string} s */
function isYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** TMDB 返回的 release_date 多为 ISO 串，取 UTC 日期前 10 位 */
function isoToYmd(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const head = iso.trim().slice(0, 10);
  return isYmd(head) ? head : '';
}

/**
 * 从 append_to_response 的 release_dates 中选客观公映日：优先 CN → HK/MO/TW → US → GB，再退回 TMDB 主字段 release_date。
 * 单区内优先 type：3 Theatrical、2 Limited、1 Premiere 的最早一条。
 */
function pickRegionalReleaseDateYMD(detail) {
  const fallback = isoToYmd(detail.release_date || '');
  const payload = detail.release_dates;
  if (!payload || !Array.isArray(payload.results)) {
    return fallback || '';
  }

  function earliestPreferredYmd(block) {
    if (!block || !Array.isArray(block.release_dates)) return '';
    const items = block.release_dates;
    const preferredTypes = [3, 2, 1];
    for (const t of preferredTypes) {
      const ymds = items
        .filter((x) => Number(x.type) === t)
        .map((x) => isoToYmd(x.release_date))
        .filter(isYmd)
        .sort();
      if (!ymds.length) continue;
      // Theatrical(3) 多条时取最晚一天，更接近「全国公映」；点映/首映仍取最早一条
      if (t === 3) return ymds[ymds.length - 1];
      return ymds[0];
    }
    // 不使用流媒体/电视首播等类型，避免与院线公映混淆
    return '';
  }

  const regionOrder = ['CN', 'HK', 'MO', 'TW', 'US', 'GB'];
  for (const code of regionOrder) {
    const block = payload.results.find((r) => String(r.iso_3166_1 || '').toUpperCase() === code);
    if (!block) continue;
    const y = earliestPreferredYmd(block);
    if (y) return y;
  }

  // 无上述地区数据时，用 TMDB 主 release_date（比随意挑其他国家更早的点映更稳妥）
  return fallback || '';
}

function mapDetailToRow(detail) {
  let poster = '';
  if (detail.poster_path) {
    poster = `https://image.tmdb.org/t/p/w500${detail.poster_path}`;
  } else if (detail.backdrop_path) {
    // 部分影片无海报图，用横版剧照兜底（仍来自 TMDB CDN）
    poster = `https://image.tmdb.org/t/p/w780${detail.backdrop_path}`;
  }
  const genres = (detail.genres || []).map((g) => g.name).join('/');
  const crew = detail.credits && detail.credits.crew ? detail.credits.crew : [];
  const cast = detail.credits && detail.credits.cast ? detail.credits.cast : [];
  const director = crew
    .filter((c) => c.job === 'Director')
    .map((c) => c.name)
    .join(',');
  const actors = cast
    .slice(0, 10)
    .map((c) => c.name)
    .join(',');
  const rating =
    detail.vote_average != null ? Math.round(detail.vote_average * 10) / 10 : 0;
  return {
    title: detail.title || detail.original_title || '',
    poster,
    rating,
    genre: genres,
    duration: safeInt(detail.runtime, 0),
    director,
    actors,
    description: detail.overview || '',
    releaseDate: pickRegionalReleaseDateYMD(detail)
  };
}

function safeInt(v, fb) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function pickBetterString(nextVal, currentVal) {
  const n = String(nextVal || '').trim();
  if (n) return n;
  return String(currentVal || '').trim();
}

function pickBetterNumber(nextVal, currentVal, min = 0) {
  const n = Number(nextVal);
  if (Number.isFinite(n) && n > min) return n;
  const c = Number(currentVal);
  if (Number.isFinite(c) && c > min) return c;
  return 0;
}

function parseReleaseDateYMD(releaseDateStr) {
  if (!releaseDateStr || typeof releaseDateStr !== 'string') return null;
  const head = releaseDateStr.trim().slice(0, 10);
  const m = head.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function calcStatusByReleaseDate(releaseDateStr, now = new Date()) {
  const dt = parseReleaseDateYMD(releaseDateStr);
  if (!dt) return 'showing';
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return dt.getTime() > today.getTime() ? 'coming' : 'showing';
}

async function fetchMoviesList(apiKey, mode, page) {
  // mode: popular | top_rated | upcoming | now_playing
  const endpointMap = {
    popular: 'movie/popular',
    top_rated: 'movie/top_rated',
    upcoming: 'movie/upcoming',
    now_playing: 'movie/now_playing'
  };
  const endpoint = endpointMap[mode] || endpointMap.popular;
  const params = new URLSearchParams({
    ...tmdbBaseParams(apiKey),
    page: String(page || 1)
  });
  const url = `https://api.themoviedb.org/3/${endpoint}?${params.toString()}`;
  return httpsGetJsonWithRetry(url);
}

/** 按上映日期区间发现影片（用于「明天及以后」档期，避免 /movie/upcoming 前几页全是已映片） */
async function fetchDiscoverMovieByReleaseRange(apiKey, page, gteYMD, lteYMD = '2030-12-31') {
  const params = new URLSearchParams({
    ...tmdbBaseParams(apiKey),
    page: String(page || 1),
    sort_by: 'release_date.asc',
    include_adult: 'false',
    'primary_release_date.gte': gteYMD,
    'primary_release_date.lte': lteYMD
  });
  const url = `https://api.themoviedb.org/3/discover/movie?${params.toString()}`;
  return httpsGetJsonWithRetry(url, { maxAttempts: 6, retryDelayMs: 900 });
}

function tomorrowYMD() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * discover 分页拉片并写入 movies（fetchListFn(apiKey, page) 返回 TMDB list JSON）
 */
async function importDiscoverMoviesFromPages(pool, opts, fetchListFn) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error('请配置环境变量 TMDB_API_KEY');

  const count = safeInt(opts.count, 35);
  const startPage = safeInt(opts.page, 1);
  const maxPages = safeInt(opts.maxPages, 20);
  const idPrefix = opts.idPrefix ? String(opts.idPrefix) : 'tmdb';
  const priceCents = safeInt(
    opts.priceCents,
    safeInt(process.env.DEFAULT_MOVIE_PRICE_CENTS, 3500)
  );
  const hotFrom = opts.hotFrom ? String(opts.hotFrom) : 'popularity';
  const sleepMs = safeInt(opts.sleepMs, 260);

  const ok = [];
  const fail = [];
  const usedTmdbIds = new Set();
  let imported = 0;
  let page = startPage;

  while (imported < count && page <= startPage + maxPages - 1) {
    let list;
    try {
      list = await fetchListFn(apiKey, page);
    } catch (e) {
      fail.push({ page, reason: e.message || String(e) });
      break;
    }

    const results = list?.results || [];
    if (!results.length) break;

    for (let i = 0; i < results.length && imported < count; i++) {
      const r = results[i];
      const externalId = r && r.id != null ? String(r.id) : '';
      if (!externalId || usedTmdbIds.has(externalId)) continue;

      if (i > 0 || imported > 0) await sleep(sleepMs);
      usedTmdbIds.add(externalId);

      try {
        const detail = await getMovieDetail(apiKey, externalId);
        const mapped = mapDetailToRow(detail);
        if (!mapped) throw new Error('详情为空');

        const status = calcStatusByReleaseDate(mapped.releaseDate);
        const hot =
          hotFrom === 'rating'
            ? safeInt(Math.round(Number(mapped.rating) * 100), 0)
            : safeInt(Math.round(Number(detail.popularity || 0)), 0);

        const id = `${idPrefix}_${externalId}`;
        const now = nowDb();

        await pool.query(
          `
          INSERT INTO movies (_id,title,poster,rating,genre,duration,director,actors,description,releaseDate,price,status,hot,createTime,updateTime)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE
            title=VALUES(title),
            poster=VALUES(poster),
            rating=VALUES(rating),
            genre=VALUES(genre),
            duration=VALUES(duration),
            director=VALUES(director),
            actors=VALUES(actors),
            description=VALUES(description),
            releaseDate=VALUES(releaseDate),
            price=VALUES(price),
            status=VALUES(status),
            hot=VALUES(hot),
            updateTime=VALUES(updateTime)
        `,
          [
            id,
            mapped.title || mapped.original_title || '',
            mapped.poster,
            mapped.rating,
            mapped.genre,
            mapped.duration,
            mapped.director,
            mapped.actors,
            mapped.description,
            mapped.releaseDate,
            priceCents,
            status,
            hot,
            now,
            now
          ]
        );

        ok.push({ id, tmdbId: externalId, title: mapped.title, poster: mapped.poster, status, hot });
        imported += 1;
      } catch (e) {
        fail.push({ tmdbId: externalId, title: r?.title, reason: e.message || String(e) });
      }
    }

    page += 1;
  }

  return { ok, fail };
}

/** discover：按热度补充片库（与「未来档期」去重，靠 tmdbId upsert） */
async function fetchDiscoverPopularPage(apiKey, page) {
  const params = new URLSearchParams({
    ...tmdbBaseParams(apiKey),
    page: String(page || 1),
    sort_by: 'popularity.desc',
    include_adult: 'false',
    'vote_count.gte': '50',
    'vote_average.gte': '5.5'
  });
  const url = `https://api.themoviedb.org/3/discover/movie?${params.toString()}`;
  return httpsGetJsonWithRetry(url, { maxAttempts: 8, retryDelayMs: 900 });
}

/**
 * 从 TMDB discover 导入「指定日期及之后」首映的影片（写入 movies，status 多为 coming）
 */
async function importDiscoverFutureMovies(pool, opts = {}) {
  const gteYMD = opts.gteYMD ? String(opts.gteYMD) : tomorrowYMD();
  const lteYMD = opts.lteYMD ? String(opts.lteYMD) : '2030-12-31';
  return importDiscoverMoviesFromPages(pool, opts, (apiKey, page) =>
    fetchDiscoverMovieByReleaseRange(apiKey, page, gteYMD, lteYMD)
  );
}

/**
 * discover：按全库热度排序拉片，用于凑够 200+ 部（与多榜单/upcoming 大量去重后仍可增加条目）
 */
async function importDiscoverPopularMovies(pool, opts = {}) {
  return importDiscoverMoviesFromPages(pool, opts, fetchDiscoverPopularPage);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ ids?: string[] }} [opts]
 */
async function syncMovies(pool, opts = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('请配置环境变量 TMDB_API_KEY');
  }

  let rows;
  if (opts.ids && opts.ids.length) {
    const placeholders = opts.ids.map(() => '?').join(',');
    const [r] = await pool.query(
      `SELECT _id, title, poster, rating, genre, duration, director, actors, description, releaseDate, status FROM movies WHERE _id IN (${placeholders})`,
      opts.ids
    );
    rows = r;
  } else {
    const [r] = await pool.query(
      'SELECT _id, title, poster, rating, genre, duration, director, actors, description, releaseDate, status FROM movies ORDER BY _id'
    );
    rows = r;
  }

  const ok = [];
  const fail = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i > 0) await sleep(260);

    try {
      const title = String(row.title || '').trim();
      if (!title) {
        fail.push({ id: row._id, reason: '标题为空' });
        continue;
      }

      let mapped = null;
      let tmdbId = '';
      let source = 'tmdb';
      const idMatch = String(row._id || '').match(/^tmdb_(\d+)$/);

      async function attachDoubanPosterIfNeeded() {
        if (mapped && !String(mapped.poster || '').trim()) {
          await sleep(200);
          const doubanOnly = await getDoubanMovieDetailByTitle(title);
          if (doubanOnly && String(doubanOnly.poster || '').trim()) {
            mapped.poster = doubanOnly.poster;
            source = 'tmdb+douban_poster';
          }
        }
      }

      if (idMatch) {
        // 已绑定 TMDB ID 的影片：直接拉详情，避免按中文标题搜索误匹配导致上映日错片
        tmdbId = idMatch[1];
        try {
          await sleep(200);
          const detail = await getMovieDetail(apiKey, tmdbId);
          mapped = mapDetailToRow(detail);
          await attachDoubanPosterIfNeeded();
        } catch (e) {
          fail.push({ id: row._id, title, reason: e.message || String(e) });
          continue;
        }
      } else {
        try {
          let search = await searchMovie(apiKey, title);
          let results = search.results || [];

          if (!results.length && title.includes('·')) {
            await sleep(200);
            search = await searchMovie(apiKey, title.replace(/·/g, ''));
            results = search.results || [];
          }
          if (!results.length) throw new Error('TMDB 无匹配结果');

          tmdbId = String(results[0].id || '');
          await sleep(200);
          const detail = await getMovieDetail(apiKey, tmdbId);
          mapped = mapDetailToRow(detail);
          await attachDoubanPosterIfNeeded();
        } catch (tmdbErr) {
          source = 'douban';
          mapped = await getDoubanMovieDetailByTitle(title);
          if (!mapped) {
            throw new Error(`TMDB失败且豆瓣无匹配: ${tmdbErr.message || String(tmdbErr)}`);
          }
        }
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const nowDb = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const merged = {
        title: pickBetterString(mapped.title || title, row.title),
        poster: pickBetterString(mapped.poster, row.poster),
        rating: pickBetterNumber(mapped.rating, row.rating, 0),
        genre: pickBetterString(mapped.genre, row.genre),
        duration: safeInt(pickBetterNumber(mapped.duration, row.duration, 0), 0),
        director: pickBetterString(mapped.director, row.director),
        actors: pickBetterString(mapped.actors, row.actors),
        description: pickBetterString(mapped.description, row.description),
        releaseDate: pickBetterString(mapped.releaseDate, row.releaseDate)
      };
      const rowStatus = String(row.status || 'showing');
      const nextStatus =
        rowStatus === 'off' ? 'off' : calcStatusByReleaseDate(merged.releaseDate, now);

      await pool.query(
        `
        UPDATE movies SET
          title = ?,
          poster = ?,
          rating = ?,
          genre = ?,
          duration = ?,
          director = ?,
          actors = ?,
          description = ?,
          releaseDate = ?,
          status = ?,
          updateTime = ?
        WHERE _id = ?
      `,
        [
          merged.title,
          merged.poster,
          merged.rating,
          merged.genre,
          merged.duration,
          merged.director,
          merged.actors,
          merged.description,
          merged.releaseDate,
          nextStatus,
          nowDb,
          row._id
        ]
      );

      ok.push({
        id: row._id,
        tmdbId: tmdbId || null,
        title: mapped.title || title,
        poster: mapped.poster,
        source
      });
    } catch (e) {
      fail.push({ id: row._id, title: row.title, reason: e.message || String(e) });
    }
  }

  return { ok, fail };
}

/**
 * 从 TMDB 导入“新电影”，并自动根据上映日期打 showing/coming、根据流行度计算 hot。
 *
 * 会用固定 _id: `${idPrefix}_${tmdbId}` 做幂等 upsert。
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{
 *   mode?: 'popular'|'top_rated'|'upcoming'|'now_playing',
 *   count?: number,
 *   page?: number,
 *   maxPages?: number,
 *   priceCents?: number,
 *   idPrefix?: string,
 *   hotFrom?: 'popularity'|'rating',
 *   sleepMs?: number
 * }} [opts]
 */
async function importMoviesFromTmdb(pool, opts = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error('请配置环境变量 TMDB_API_KEY');

  const mode = opts.mode ? String(opts.mode) : 'popular';
  const count = safeInt(opts.count, 20);
  const startPage = safeInt(opts.page, 1);
  const maxPages = safeInt(opts.maxPages, 10);
  const idPrefix = opts.idPrefix ? String(opts.idPrefix) : 'tmdb';
  const priceCents = safeInt(
    opts.priceCents,
    safeInt(process.env.DEFAULT_MOVIE_PRICE_CENTS, 3500)
  );
  const hotFrom = opts.hotFrom ? String(opts.hotFrom) : 'popularity';
  const sleepMs = safeInt(opts.sleepMs, 260);

  const ok = [];
  const fail = [];
  const usedTmdbIds = new Set();

  let imported = 0;
  let page = startPage;
  while (imported < count && page <= startPage + maxPages - 1) {
    let list;
    let listSource = 'tmdb';
    try {
      list = await fetchMoviesList(apiKey, mode, page);
    } catch (e) {
      /** 默认只走 TMDB；仅在显式 TMDB_MAOYAN_FALLBACK=1 且未设 TMDB_NO_MAOYAN_FALLBACK=1 时才降级猫眼（避免 _id 变成 tmdb_maoyan_*） */
      const forceNoMaoyan =
        process.env.TMDB_NO_MAOYAN_FALLBACK === '1' ||
        /^true$/i.test(String(process.env.TMDB_NO_MAOYAN_FALLBACK || ''));
      const allowMaoyanFallback =
        !forceNoMaoyan &&
        (process.env.TMDB_MAOYAN_FALLBACK === '1' ||
          /^true$/i.test(String(process.env.TMDB_MAOYAN_FALLBACK || '')));
      if (!allowMaoyanFallback) {
        throw e;
      }
      listSource = 'maoyan';
      const maoyanItems = await fetchMaoyanMoviesList(page);
      list = {
        results: maoyanItems.map((m) => ({
          id: `maoyan_${m.id}`,
          title: m.nm || '',
          popularity: safeInt(m.wish || m.score || 0, 0),
          _maoyanId: m.id,
          _maoyanRaw: m
        }))
      };
    }

    const results = list?.results || [];
    if (!results.length) break;

    for (let i = 0; i < results.length && imported < count; i++) {
      const r = results[i];
      const externalId = r && r.id != null ? String(r.id) : '';
      if (!externalId || usedTmdbIds.has(externalId)) continue;

      if (i > 0 || imported > 0) await sleep(sleepMs);

      usedTmdbIds.add(externalId);
      try {
        let detail = null;
        let mapped = null;
        if (listSource === 'tmdb') {
          detail = await getMovieDetail(apiKey, externalId);
          mapped = mapDetailToRow(detail);
        } else {
          mapped = mapMaoyanListItemToRow(r._maoyanRaw);
          try {
            detail = await getMaoyanMovieDetail(r._maoyanId);
            const detailMapped = mapMaoyanDetailToRow(detail);
            if (detailMapped) {
              mapped = {
                ...mapped,
                ...detailMapped
              };
            }
          } catch (e) {
            // 猫眼详情偶发失败时，保底使用列表字段导入
          }
        }
        if (!mapped) throw new Error('详情为空');

        const status = calcStatusByReleaseDate(mapped.releaseDate);
        const hot =
          hotFrom === 'rating'
            ? safeInt(Math.round(Number(mapped.rating) * 100), 0)
            : safeInt(Math.round(Number((detail && detail.popularity) || r.popularity || 0)), 0);

        const id = `${idPrefix}_${externalId}`;
        const now = nowDb();

        await pool.query(
          `
          INSERT INTO movies (_id,title,poster,rating,genre,duration,director,actors,description,releaseDate,price,status,hot,createTime,updateTime)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE
            title=VALUES(title),
            poster=VALUES(poster),
            rating=VALUES(rating),
            genre=VALUES(genre),
            duration=VALUES(duration),
            director=VALUES(director),
            actors=VALUES(actors),
            description=VALUES(description),
            releaseDate=VALUES(releaseDate),
            price=VALUES(price),
            status=VALUES(status),
            hot=VALUES(hot),
            updateTime=VALUES(updateTime)
        `,
          [
            id,
            mapped.title || mapped.original_title || '',
            mapped.poster,
            mapped.rating,
            mapped.genre,
            mapped.duration,
            mapped.director,
            mapped.actors,
            mapped.description,
            mapped.releaseDate,
            priceCents,
            status,
            hot,
            now,
            now
          ]
        );

        ok.push({
          id,
          tmdbId: listSource === 'tmdb' ? externalId : null,
          title: mapped.title,
          poster: mapped.poster,
          status,
          hot,
          source: listSource
        });
        imported += 1;
      } catch (e) {
        fail.push({ tmdbId: externalId, title: r?.title, reason: e.message || String(e) });
      }
    }

    page += 1;
  }

  return { ok, fail };
}

/**
 * 多榜单聚合导入（自动去重），用于尽可能覆盖更多电影。
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{
 *   modes?: Array<'popular'|'top_rated'|'upcoming'|'now_playing'>,
 *   countPerMode?: number,
 *   totalLimit?: number,
 *   maxPages?: number,
 *   priceCents?: number,
 *   idPrefix?: string,
 *   hotFrom?: 'popularity'|'rating',
 *   sleepMs?: number
 * }} [opts]
 */
async function importMoviesFromTmdbMultiModes(pool, opts = {}) {
  const modes = Array.isArray(opts.modes) && opts.modes.length
    ? opts.modes.map((m) => String(m))
    : ['now_playing', 'popular', 'upcoming', 'top_rated'];
  const countPerMode = safeInt(opts.countPerMode, 30);
  const totalLimit = safeInt(opts.totalLimit, 120);
  const maxPages = safeInt(opts.maxPages, 10);

  const okMap = new Map();
  const fail = [];

  const modeErrors = [];

  for (const mode of modes) {
    if (okMap.size >= totalLimit) break;
    const remain = totalLimit - okMap.size;
    const thisCount = Math.min(countPerMode, remain);
    if (thisCount <= 0) break;

    try {
      const part = await importMoviesFromTmdb(pool, {
        mode,
        count: thisCount,
        maxPages,
        priceCents: opts.priceCents,
        idPrefix: opts.idPrefix,
        hotFrom: opts.hotFrom,
        sleepMs: opts.sleepMs
      });

      (part.ok || []).forEach((item) => {
        okMap.set(String(item.id), { ...item, sourceMode: mode });
      });
      (part.fail || []).forEach((item) => {
        fail.push({ ...item, sourceMode: mode });
      });
    } catch (e) {
      const reason = e && e.message ? e.message : String(e);
      modeErrors.push({ mode, reason });
      fail.push({ sourceMode: mode, reason });
      console.warn(`[tmdb] 榜单 ${mode} 导入失败:`, reason);
    }
  }

  if (okMap.size === 0 && modeErrors.length) {
    const err = new Error(modeErrors.map((x) => `${x.mode}: ${x.reason}`).join('；'));
    err.name = 'TmdbImportError';
    throw err;
  }

  return {
    ok: Array.from(okMap.values()),
    fail,
    modeErrors
  };
}

/**
 * 根据 releaseDate 重算「上映中 / 即将上映」（不改动已下架 off）
 */
/**
 * 按 TMDB ID（_id 形如 tmdb_123）重新拉详情，用各国 release_dates 校正上映日并重算 showing/coming（不改 off）
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ onlyComing?: boolean, sleepMs?: number }} [opts]
 */
async function refreshTmdbReleaseDatesFromApi(pool, opts = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error('请配置环境变量 TMDB_API_KEY');

  const onlyComing = opts.onlyComing === true;
  const sleepMs = safeInt(opts.sleepMs, 280);

  let sql = `SELECT _id, status FROM movies WHERE _id REGEXP '^tmdb_[0-9]+$'`;
  if (onlyComing) {
    sql += ` AND status = 'coming'`;
  }
  const [rows] = await pool.query(sql);

  const ok = [];
  const fail = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i > 0) await sleep(sleepMs);

    const m = String(row._id || '').match(/^tmdb_(\d+)$/);
    if (!m) continue;
    const tmdbId = m[1];

    try {
      const detail = await getMovieDetail(apiKey, tmdbId);
      const mapped = mapDetailToRow(detail);
      const releaseDate = String(mapped.releaseDate || '').trim();
      if (!releaseDate) {
        fail.push({ _id: row._id, title: mapped.title, reason: 'TMDB 无可用上映日' });
        continue;
      }

      const rowStatus = String(row.status || 'showing');
      const nextStatus =
        rowStatus === 'off' ? 'off' : calcStatusByReleaseDate(releaseDate);

      await pool.query(
        `UPDATE movies SET releaseDate = ?, status = ?, updateTime = NOW() WHERE _id = ?`,
        [releaseDate, nextStatus, row._id]
      );
      ok.push({
        _id: row._id,
        title: mapped.title,
        releaseDate,
        status: nextStatus
      });
    } catch (e) {
      fail.push({ _id: row._id, reason: e.message || String(e) });
    }
  }

  return { ok, fail };
}

async function recomputeMovieStatuses(pool) {
  // 兼容 releaseDate 为 'YYYY-MM-DD' 或 'YYYY-MM-DD HH:mm:ss'（仅比较日期部分）
  const [r] = await pool.query(
    `
    UPDATE movies
    SET
      status = CASE
        WHEN status = 'off' THEN 'off'
        WHEN releaseDate IS NOT NULL
          AND TRIM(releaseDate) <> ''
          AND LEFT(TRIM(releaseDate), 10) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND LEFT(TRIM(releaseDate), 10) > CURDATE() THEN 'coming'
        ELSE 'showing'
      END,
      updateTime = NOW()
    WHERE status IN ('showing','coming')
  `
  );
  const affected = r && r.affectedRows != null ? Number(r.affectedRows) : 0;
  return { affected };
}

module.exports = {
  getTmdbHttpsAgent,
  getConfiguredProxyUrl,
  syncMovies,
  importMoviesFromTmdb,
  importMoviesFromTmdbMultiModes,
  formatTmdbNetworkErrorMessage,
  importDiscoverFutureMovies,
  importDiscoverPopularMovies,
  refreshTmdbReleaseDatesFromApi,
  recomputeMovieStatuses,
  searchMovie,
  getMovieDetail
};
