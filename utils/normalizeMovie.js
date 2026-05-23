const appConfig = require('./config.js');

function getRuntimeBackendBaseUrl() {
  try {
    const backendApi = require('./backendApi.js');
    if (typeof backendApi.getBackendBaseUrl === 'function') {
      return backendApi.getBackendBaseUrl();
    }
  } catch (e) {}
  return appConfig.BACKEND_BASE_URL || '';
}

function getDefaultPosterUrl() {
  const base = String(getRuntimeBackendBaseUrl() || '').replace(/\/$/, '');
  return base ? `${base}/api/default-poster` : '';
}

/**
 * 将外网海报转为后端代理（TMDB 在国内直连常 ERR_CONNECTION_RESET）
 * 开发者工具勾选「不校验合法域名」时，http 后端代理也可用；真机预览建议 https 后端或局域网 https 端口
 */
function proxyPosterUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return url;
  if (appConfig.USE_POSTER_PROXY === false) return url;
  if (u.includes('/api/poster-proxy') || u.includes('/api/default-poster')) return u;
  const base = String(getRuntimeBackendBaseUrl() || '').replace(/\/$/, '');
  if (!base) return u;
  if (!/(image\.tmdb\.org|doubanio\.com|picsum\.photos)/i.test(u)) return u;
  return `${base}/api/poster-proxy?url=${encodeURIComponent(u)}`;
}

/** 将后端 movies 表 price（分）转为展示用「元」，并代理海报 URL */
function normalizeMovie(m) {
  if (!m) return null;
  const row = { ...m };
  const p = Number(row.price);
  if (Number.isFinite(p) && p > 200) {
    row.price = Math.round((p / 100) * 10) / 10;
  }
  const r = Number(row.rating);
  if (Number.isFinite(r)) {
    row.rating = Math.round(r * 10) / 10;
  }
  if (row.releaseDate && typeof row.releaseDate === 'string' && row.releaseDate.length > 10) {
    row.releaseDate = row.releaseDate.slice(0, 10);
  }
  if (row.poster) row.poster = proxyPosterUrl(row.poster);
  if (row.moviePoster) row.moviePoster = proxyPosterUrl(row.moviePoster);
  const fallback = getDefaultPosterUrl();
  if (!row.poster) row.poster = fallback || row.poster;
  if (!row.moviePoster && row.poster) row.moviePoster = row.poster;
  return row;
}

module.exports = {
  normalizeMovie,
  proxyPosterUrl,
  getDefaultPosterUrl,
  FALLBACK_POSTER_URL: '' // 兼容旧引用，请用 getDefaultPosterUrl()
};
