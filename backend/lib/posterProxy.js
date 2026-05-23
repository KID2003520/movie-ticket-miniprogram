/**
 * 海报 URL：小程序直连 TMDB CDN 常 ERR_CONNECTION_RESET，统一走后端 /api/poster-proxy
 */
const { mapMovieForApi } = require('./movieApiFormat');
const { getTmdbHttpsAgent } = require('./tmdbSync');

const PROXY_HOST_RE = /(image\.tmdb\.org|doubanio\.com|picsum\.photos)/i;

function needsPosterProxy(url) {
  const u = String(url || '').trim();
  if (!u || u.includes('/api/poster-proxy') || u.includes('/api/default-poster')) return false;
  return PROXY_HOST_RE.test(u);
}

function requestBaseUrl(req) {
  if (!req || !req.get) return '';
  const proto = req.protocol || 'http';
  const host = req.get('host') || '127.0.0.1:3000';
  return `${proto}://${host}`.replace(/\/$/, '');
}

function toProxiedPoster(baseUrl, poster) {
  const u = String(poster || '').trim();
  if (!u) return '';
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!base || !needsPosterProxy(u)) return u;
  return `${base}/api/poster-proxy?url=${encodeURIComponent(u)}`;
}

function defaultPosterUrl(baseUrl) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  return base ? `${base}/api/default-poster` : '/api/default-poster';
}

function mapMovieForApiWithPoster(m, baseUrl) {
  const row = mapMovieForApi(m);
  if (!row) return null;
  if (row.poster) row.poster = toProxiedPoster(baseUrl, row.poster);
  if (!row.poster) row.poster = defaultPosterUrl(baseUrl);
  return row;
}

function getPosterFetchAgent(hostname) {
  if (hostname === 'image.tmdb.org') return getTmdbHttpsAgent();
  return undefined;
}

module.exports = {
  needsPosterProxy,
  requestBaseUrl,
  toProxiedPoster,
  defaultPosterUrl,
  mapMovieForApiWithPoster,
  getPosterFetchAgent,
  PROXY_HOST_RE
};
