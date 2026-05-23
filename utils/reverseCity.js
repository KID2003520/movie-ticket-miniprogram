/**
 * 统一解析「展示用城市名」：优先后端逆地理 → 可选小程序内腾讯 Key → 最近大城市估算
 */
const appConfig = require('./config.js');
const backendApi = require('./backendApi.js');
const { guessNearestCity } = require('./cityGuess.js');

function normalizeCityLabel(raw) {
  if (raw == null || raw === '') return '';
  let s = String(raw).trim();
  // 腾讯偶发把「区/县」填进 city，不宜当作城市名展示
  if (/^([\u4e00-\u9fa5]{1,4})(区|县)$/.test(s)) return '';
  // 常见后缀
  s = s.replace(/市辖区$/, '').replace(/地区$/, '').replace(/盟$/, '').replace(/自治州$/, '');
  s = s.replace(/市$/, '').replace(/特别行政区$/, '');
  s = s.trim();
  return s;
}

/** 小程序端直连腾讯（需在公众平台配置 request 合法域名：https://apis.map.qq.com） */
function tencentClientReverse(lat, lng) {
  const key = (appConfig.TENCENT_LBS_KEY && String(appConfig.TENCENT_LBS_KEY).trim()) || '';
  if (!key) return Promise.resolve('');

  return new Promise((resolve) => {
    wx.request({
      url: 'https://apis.map.qq.com/ws/geocoder/v1/',
      data: {
        location: `${lat},${lng}`,
        key,
        get_poi: 0
      },
      success(res) {
        const body = res.data;
        if (!body || body.status !== 0) {
          resolve('');
          return;
        }
        const r = body.result || {};
        const ad = r.ad_info || {};
        const comp = r.address_component || {};
        const label = normalizeCityLabel(ad.city || comp.city || '');
        resolve(label);
      },
      fail() {
        resolve('');
      }
    });
  });
}

/**
 * @returns {Promise<string>} 城市短名（无「市」），失败返回空串
 */
function resolveCityDisplayName(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return Promise.resolve('');

  return Promise.resolve()
    .then(async () => {
      let label = '';
      try {
        const res = await backendApi.reverseGeocode({ lat: la, lng: ln });
        const d = (res && res.data) || {};
        label = normalizeCityLabel(d.city);
      } catch (e) {
        label = '';
      }

      if (!label) label = await tencentClientReverse(la, ln);
      if (!label) label = guessNearestCity(la, ln);

      return label || '';
    })
    .catch(() => guessNearestCity(la, ln) || '');
}

module.exports = {
  resolveCityDisplayName,
  normalizeCityLabel
};
