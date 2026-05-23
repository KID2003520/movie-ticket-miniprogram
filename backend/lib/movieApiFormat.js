/**
 * 电影接口出参格式化：避免 MySQL DATE 经 JSON 序列化成 UTC ISO 导致小程序端日期错一天/显示异常
 */

function formatReleaseDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const y = v.getFullYear();
    const mo = String(v.getMonth() + 1).padStart(2, '0');
    const day = String(v.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  const s = String(v).trim();
  const head = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  return s;
}

/**
 * 与小程序 normalizeMovie 期望一致：price 分→元、rating 保留一位、releaseDate 纯日期
 */
function mapMovieForApi(m) {
  if (!m) return null;
  const row = { ...m };
  row.releaseDate = formatReleaseDate(row.releaseDate);
  const p = Number(row.price);
  if (Number.isFinite(p) && p > 200) {
    row.price = Math.round((p / 100) * 10) / 10;
  }
  const r = Number(row.rating);
  if (Number.isFinite(r)) {
    row.rating = Math.round(r * 10) / 10;
  }
  return row;
}

module.exports = { formatReleaseDate, mapMovieForApi };
