/**
 * 无逆地理 API 时的回退：直辖市圈 → 河北 11 市 → 鲁苏浙粤豫川地级市 → 全国主要城市
 */
const { distanceKm } = require('./location.js');
const { tryMunicipality, tryRegionalPrefecture } = require('./chinaRegionalPrefectures.js');

/** 河北省 11 个地级市中心（GCJ-02 近似） */
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

function inHebeiRegion(lat, lng) {
  if (tryMunicipality(lat, lng)) return false;
  return lat >= 35.95 && lat <= 42.9 && lng >= 113.32 && lng <= 119.9;
}

const CENTROIDS = [
  { name: '重庆', lat: 29.563, lng: 106.5504 },
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
  { name: '东莞', lat: 23.0207, lng: 113.7518 },
  { name: '青岛', lat: 36.0671, lng: 120.3826 },
  { name: '沈阳', lat: 41.8057, lng: 123.4328 },
  { name: '宁波', lat: 29.8683, lng: 121.544 },
  { name: '昆明', lat: 25.0406, lng: 102.7123 },
  { name: '佛山', lat: 23.0218, lng: 113.1219 },
  { name: '合肥', lat: 31.8206, lng: 117.2272 },
  { name: '福州', lat: 26.0745, lng: 119.2965 },
  { name: '厦门', lat: 24.4798, lng: 118.0819 },
  { name: '哈尔滨', lat: 45.8038, lng: 126.535 },
  { name: '济南', lat: 36.6512, lng: 117.12 },
  { name: '温州', lat: 28.0006, lng: 120.6994 },
  { name: '长春', lat: 43.8171, lng: 125.3235 },
  { name: '南宁', lat: 22.817, lng: 108.3669 },
  { name: '南昌', lat: 28.682, lng: 115.8579 },
  { name: '贵阳', lat: 26.647, lng: 106.6302 },
  { name: '太原', lat: 37.8706, lng: 112.5489 },
  { name: '乌鲁木齐', lat: 43.8256, lng: 87.6168 },
  { name: '兰州', lat: 36.0611, lng: 103.8343 },
  { name: '海口', lat: 20.044, lng: 110.1999 },
  { name: '银川', lat: 38.4872, lng: 106.2309 },
  { name: '西宁', lat: 36.6171, lng: 101.7782 },
  { name: '拉萨', lat: 29.65, lng: 91.1 },
  { name: '呼和浩特', lat: 40.8424, lng: 111.7492 },
  { name: '大连', lat: 38.914, lng: 121.6147 },
  { name: '珠海', lat: 22.2707, lng: 113.5767 },
  { name: '三亚', lat: 18.2528, lng: 109.7348 },
  { name: '泉州', lat: 24.8741, lng: 118.6757 },
  { name: '烟台', lat: 37.4638, lng: 121.4479 }
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

  const reg = tryRegionalPrefecture(la, ln, 245);
  if (reg) return reg;

  const national = pickNearest(CENTROIDS, la, ln);
  if (national && national.d <= 175) return national.name;

  const all = HEBEI_PREFECTURES.concat(CENTROIDS);
  const wide = pickNearest(all, la, ln);
  if (wide && wide.d <= 340) return wide.name;

  return '';
}

module.exports = { guessNearestCity, CENTROIDS, HEBEI_PREFECTURES, inHebeiRegion };
