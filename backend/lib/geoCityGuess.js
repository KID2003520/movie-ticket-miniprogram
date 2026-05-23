/**
 * 无腾讯逆地理 Key 时，由经纬度（GCJ-02）估算展示用城市短名
 */
function toRad(d) {
  return (d * Math.PI) / 180;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const a1 = Number(lat1);
  const o1 = Number(lon1);
  const a2 = Number(lat2);
  const o2 = Number(lon2);
  if (![a1, o1, a2, o2].every((n) => Number.isFinite(n))) return null;
  const R = 6371;
  const dLat = toRad(a2 - a1);
  const dLon = toRad(o2 - o1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
}

function tryMunicipality(lat, lng) {
  const dBj = distanceKm(lat, lng, 39.9042, 116.4074);
  if (dBj != null && dBj <= 44) return '北京';
  const dTj = distanceKm(lat, lng, 39.0842, 117.201);
  if (dTj != null && dTj <= 48) return '天津';
  const dSh = distanceKm(lat, lng, 31.2304, 121.4737);
  if (dSh != null && dSh <= 70) return '上海';
  return '';
}

const HEBEI_PREFECTURES = [
  { name: '石家庄', lat: 38.0428, lng: 114.5149 },
  { name: '唐山', lat: 39.6309, lng: 118.1802 },
  { name: '秦皇岛', lat: 39.9354, lng: 119.6005 },
  { name: '邯郸', lat: 36.6257, lng: 114.5391 },
  { name: '邢台', lat: 37.0682, lng: 114.5049 },
  { name: '保定', lat: 38.8671, lng: 115.4845 },
  { name: '张家口', lat: 40.8119, lng: 114.8863 },
  { name: '承德', lat: 40.9515, lng: 117.9633 },
  { name: '沧州', lat: 38.3045, lng: 116.8388 },
  { name: '廊坊', lat: 39.538, lng: 116.6838 },
  { name: '衡水', lat: 37.735, lng: 115.7019 }
];

const CENTROIDS = [
  { name: '广州', lat: 23.1291, lng: 113.2644 },
  { name: '深圳', lat: 22.5431, lng: 114.0579 },
  { name: '杭州', lat: 30.2741, lng: 120.1551 },
  { name: '南京', lat: 32.0603, lng: 118.7969 },
  { name: '成都', lat: 30.5728, lng: 104.0668 },
  { name: '武汉', lat: 30.5928, lng: 114.3055 },
  { name: '西安', lat: 34.3416, lng: 108.9398 },
  { name: '苏州', lat: 31.2989, lng: 120.5853 },
  { name: '郑州', lat: 34.7466, lng: 113.6254 },
  { name: '长沙', lat: 28.2282, lng: 112.9388 },
  { name: '青岛', lat: 36.0671, lng: 120.3826 },
  { name: '沈阳', lat: 41.8057, lng: 123.4328 },
  { name: '昆明', lat: 25.0406, lng: 102.7123 }
];

function pickNearest(candidates, lat, lng) {
  let best = null;
  let minD = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const d = distanceKm(lat, lng, c.lat, c.lng);
    if (d != null && d < minD) {
      minD = d;
      best = c;
    }
  }
  return best ? { name: best.name, d: minD } : null;
}

function inHebeiRegion(lat, lng) {
  if (tryMunicipality(lat, lng)) return false;
  return lat >= 35.95 && lat <= 42.9 && lng >= 113.32 && lng <= 119.9;
}

function normalizeCityLabel(raw) {
  if (raw == null || raw === '') return '';
  let s = String(raw).trim();
  if (/^([\u4e00-\u9fa5]{1,4})(区|县)$/.test(s)) return '';
  s = s.replace(/市辖区$/, '').replace(/地区$/, '').replace(/盟$/, '').replace(/自治州$/, '');
  s = s.replace(/市$/, '').replace(/特别行政区$/, '');
  return s.trim();
}

function guessNearestCity(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return '';

  const mun = tryMunicipality(la, ln);
  if (mun) return mun;

  if (inHebeiRegion(la, ln)) {
    const h = pickNearest(HEBEI_PREFECTURES, la, ln);
    if (h && h.d <= 230) return h.name;
  }

  const national = pickNearest(CENTROIDS, la, ln);
  if (national && national.d <= 175) return national.name;

  const wide = pickNearest(HEBEI_PREFECTURES.concat(CENTROIDS), la, ln);
  if (wide && wide.d <= 340) return wide.name;

  return '';
}

module.exports = { guessNearestCity, normalizeCityLabel };
