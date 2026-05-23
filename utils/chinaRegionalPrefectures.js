/**
 * 直辖市边界框 + 多省地级市中心（GCJ-02），用于无逆地理 API 时的区域优先匹配
 */
const { distanceKm } = require('./location.js');

/**
 * 直辖市：按与市中心直线距离（km），避免大矩形把廊坊等误判为北京
 */
function tryMunicipality(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return '';
  const dBj = distanceKm(la, ln, 39.9042, 116.4074);
  // 约 44km：覆盖城区与大兴机场一带，避免把廊坊主城区判成北京
  if (dBj != null && dBj <= 44) return '北京';
  const dTj = distanceKm(la, ln, 39.0842, 117.201);
  if (dTj != null && dTj <= 48) return '天津';
  const dSh = distanceKm(la, ln, 31.2304, 121.4737);
  if (dSh != null && dSh <= 70) return '上海';
  return '';
}

/** { minLat, maxLat, minLng, maxLng, cities: [{name,lat,lng}] } */
const REGIONS = [
  {
    key: '山东',
    bbox: { minLat: 34.25, maxLat: 38.45, minLng: 114.75, maxLng: 122.75 },
    cities: [
      { name: '济南', lat: 36.6512, lng: 117.12 },
      { name: '青岛', lat: 36.0671, lng: 120.3826 },
      { name: '淄博', lat: 36.8131, lng: 118.0548 },
      { name: '枣庄', lat: 34.8107, lng: 117.3238 },
      { name: '东营', lat: 37.4348, lng: 118.6748 },
      { name: '烟台', lat: 37.4638, lng: 121.4479 },
      { name: '潍坊', lat: 36.7069, lng: 119.1078 },
      { name: '济宁', lat: 35.4149, lng: 116.5871 },
      { name: '泰安', lat: 36.2001, lng: 117.1205 },
      { name: '威海', lat: 37.5133, lng: 122.1214 },
      { name: '日照', lat: 35.4167, lng: 119.5269 },
      { name: '临沂', lat: 35.1047, lng: 118.3564 },
      { name: '德州', lat: 37.4513, lng: 116.3594 },
      { name: '聊城', lat: 36.456, lng: 115.9854 },
      { name: '滨州', lat: 37.3835, lng: 117.9726 },
      { name: '菏泽', lat: 35.2336, lng: 115.4801 }
    ]
  },
  {
    key: '江苏',
    bbox: { minLat: 30.75, maxLat: 35.15, minLng: 116.25, maxLng: 121.95 },
    cities: [
      { name: '南京', lat: 32.0603, lng: 118.7969 },
      { name: '无锡', lat: 31.4912, lng: 120.3124 },
      { name: '徐州', lat: 34.2044, lng: 117.2858 },
      { name: '常州', lat: 31.8107, lng: 119.9739 },
      { name: '苏州', lat: 31.2989, lng: 120.5853 },
      { name: '南通', lat: 32.0147, lng: 120.8378 },
      { name: '连云港', lat: 34.5967, lng: 119.2216 },
      { name: '淮安', lat: 33.6104, lng: 119.0153 },
      { name: '盐城', lat: 33.3474, lng: 120.1636 },
      { name: '扬州', lat: 32.3932, lng: 119.4127 },
      { name: '镇江', lat: 32.1896, lng: 119.4528 },
      { name: '泰州', lat: 32.4558, lng: 119.925 },
      { name: '宿迁', lat: 33.963, lng: 118.2752 }
    ]
  },
  {
    key: '浙江',
    bbox: { minLat: 27.05, maxLat: 31.5, minLng: 118.0, maxLng: 123.05 },
    cities: [
      { name: '杭州', lat: 30.2741, lng: 120.1551 },
      { name: '宁波', lat: 29.8683, lng: 121.544 },
      { name: '温州', lat: 28.0006, lng: 120.6994 },
      { name: '嘉兴', lat: 30.7461, lng: 120.7555 },
      { name: '湖州', lat: 30.8943, lng: 120.0868 },
      { name: '绍兴', lat: 30.0023, lng: 120.581 },
      { name: '金华', lat: 29.079, lng: 119.6474 },
      { name: '衢州', lat: 28.9417, lng: 118.8742 },
      { name: '舟山', lat: 29.9853, lng: 122.2072 },
      { name: '台州', lat: 28.6564, lng: 121.4208 },
      { name: '丽水', lat: 28.4676, lng: 119.9228 }
    ]
  },
  {
    key: '广东',
    bbox: { minLat: 20.15, maxLat: 25.55, minLng: 109.65, maxLng: 117.35 },
    cities: [
      { name: '广州', lat: 23.1291, lng: 113.2644 },
      { name: '韶关', lat: 24.8104, lng: 113.5972 },
      { name: '深圳', lat: 22.5431, lng: 114.0579 },
      { name: '珠海', lat: 22.2707, lng: 113.5767 },
      { name: '汕头', lat: 23.3541, lng: 116.6819 },
      { name: '佛山', lat: 23.0218, lng: 113.1219 },
      { name: '江门', lat: 22.5789, lng: 113.0817 },
      { name: '湛江', lat: 21.2707, lng: 110.3594 },
      { name: '茂名', lat: 21.6629, lng: 110.9254 },
      { name: '肇庆', lat: 23.0472, lng: 112.4655 },
      { name: '惠州', lat: 23.1107, lng: 114.4162 },
      { name: '梅州', lat: 24.2886, lng: 116.1222 },
      { name: '汕尾', lat: 22.7864, lng: 115.3751 },
      { name: '河源', lat: 23.7437, lng: 114.7006 },
      { name: '阳江', lat: 21.8579, lng: 111.9822 },
      { name: '清远', lat: 23.6818, lng: 113.0563 },
      { name: '东莞', lat: 23.0207, lng: 113.7518 },
      { name: '中山', lat: 22.5176, lng: 113.3927 },
      { name: '潮州', lat: 23.6567, lng: 116.6226 },
      { name: '揭阳', lat: 23.5497, lng: 116.3728 },
      { name: '云浮', lat: 22.9152, lng: 112.0445 }
    ]
  },
  {
    key: '河南',
    bbox: { minLat: 31.23, maxLat: 36.45, minLng: 110.35, maxLng: 116.65 },
    cities: [
      { name: '郑州', lat: 34.7466, lng: 113.6254 },
      { name: '开封', lat: 34.7971, lng: 114.3074 },
      { name: '洛阳', lat: 34.6197, lng: 112.454 },
      { name: '平顶山', lat: 33.7662, lng: 113.1927 },
      { name: '安阳', lat: 36.0977, lng: 114.3931 },
      { name: '鹤壁', lat: 35.747, lng: 114.2973 },
      { name: '新乡', lat: 35.303, lng: 113.9268 },
      { name: '焦作', lat: 35.2159, lng: 113.2418 },
      { name: '濮阳', lat: 35.7618, lng: 115.0293 },
      { name: '许昌', lat: 34.0357, lng: 113.8526 },
      { name: '漯河', lat: 33.5815, lng: 114.0168 },
      { name: '三门峡', lat: 34.7726, lng: 111.2001 },
      { name: '南阳', lat: 32.9908, lng: 112.5285 },
      { name: '商丘', lat: 34.4143, lng: 115.6564 },
      { name: '信阳', lat: 32.147, lng: 114.0928 },
      { name: '周口', lat: 33.6261, lng: 114.6969 },
      { name: '驻马店', lat: 32.9773, lng: 114.025 },
      { name: '济源', lat: 35.0672, lng: 112.6019 }
    ]
  },
  {
    key: '四川',
    bbox: { minLat: 26.0, maxLat: 34.35, minLng: 97.35, maxLng: 108.55 },
    cities: [
      { name: '重庆', lat: 29.563, lng: 106.5504 },
      { name: '成都', lat: 30.5728, lng: 104.0668 },
      { name: '自贡', lat: 29.3392, lng: 104.7784 },
      { name: '攀枝花', lat: 26.5823, lng: 101.7186 },
      { name: '泸州', lat: 28.8717, lng: 105.4433 },
      { name: '德阳', lat: 31.1269, lng: 104.398 },
      { name: '绵阳', lat: 31.4677, lng: 104.679 },
      { name: '广元', lat: 32.4337, lng: 105.8297 },
      { name: '遂宁', lat: 30.5328, lng: 105.5929 },
      { name: '内江', lat: 29.5802, lng: 105.0584 },
      { name: '乐山', lat: 29.5522, lng: 103.7657 },
      { name: '南充', lat: 30.8373, lng: 106.1106 },
      { name: '眉山', lat: 30.0754, lng: 103.8485 },
      { name: '宜宾', lat: 28.7518, lng: 104.6432 },
      { name: '广安', lat: 30.4564, lng: 106.6333 },
      { name: '达州', lat: 31.2096, lng: 107.5023 },
      { name: '雅安', lat: 29.9803, lng: 103.0133 },
      { name: '巴中', lat: 31.8679, lng: 106.7536 },
      { name: '资阳', lat: 30.1286, lng: 104.6279 },
      { name: '凉山', lat: 27.8816, lng: 102.2587 },
      { name: '甘孜', lat: 30.0503, lng: 101.9623 },
      { name: '阿坝', lat: 31.8994, lng: 102.2248 }
    ]
  }
];

function pickNearestInCities(cities, lat, lng) {
  let best = null;
  let minD = Infinity;
  for (let i = 0; i < cities.length; i++) {
    const c = cities[i];
    const d = distanceKm(lat, lng, c.lat, c.lng);
    if (d != null && d < minD) {
      minD = d;
      best = c;
    }
  }
  return best ? { name: best.name, d: minD } : null;
}

/** 在已知省内匹配最近地级市，maxKm 约 240 */
function tryRegionalPrefecture(lat, lng, maxKm = 240) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return '';

  for (let r = 0; r < REGIONS.length; r++) {
    const reg = REGIONS[r];
    const b = reg.bbox;
    if (la < b.minLat || la > b.maxLat || ln < b.minLng || ln > b.maxLng) continue;
    const hit = pickNearestInCities(reg.cities, la, ln);
    if (hit && hit.d <= maxKm) return hit.name;
  }
  return '';
}

module.exports = {
  tryMunicipality,
  tryRegionalPrefecture,
  REGIONS
};
