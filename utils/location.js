/**
 * 微信定位封装：权限引导、高精度坐标、缓存与距离计算（GCJ-02 与国测局一致，可与后端影院坐标直接算距）
 */

/** 石家庄市中心（GCJ-02），用于手动选城 / 开发者工具模拟定位 */
const SHIJIAZHUANG = { latitude: 38.0428, longitude: 114.5149 };

/** 开发者工具默认模拟坐标（广州），与真机石家庄坐标易混淆 */
const DEVTOOLS_DEFAULT_GUANGZHOU = { latitude: 23.129163, longitude: 113.264435 };

function isDevtoolsGuangzhouMock(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  return (
    Math.abs(la - DEVTOOLS_DEFAULT_GUANGZHOU.latitude) < 0.02 &&
    Math.abs(ln - DEVTOOLS_DEFAULT_GUANGZHOU.longitude) < 0.02
  );
}

function getMiniProgramPlatform() {
  try {
    if (wx.getDeviceInfo && typeof wx.getDeviceInfo === 'function') {
      const d = wx.getDeviceInfo();
      if (d && d.platform) return d.platform;
    }
  } catch (e) {}
  try {
    if (wx.getAppBaseInfo && typeof wx.getAppBaseInfo === 'function') {
      const b = wx.getAppBaseInfo();
      if (b && b.platform) return b.platform;
    }
  } catch (e) {}
  return '';
}

function isDevtoolsEnv() {
  const p = getMiniProgramPlatform();
  return p === 'devtools' || p === 'windows' || p === 'mac';
}

/** 手动切换城市时写入坐标，便于影院按距离筛选 */
function setManualCityLocation(cityName) {
  const map = {
    石家庄: SHIJIAZHUANG,
    北京: { latitude: 39.9042, longitude: 116.4074 },
    上海: { latitude: 31.2304, longitude: 121.4737 },
    广州: { latitude: 23.1291, longitude: 113.2644 },
    深圳: { latitude: 22.5431, longitude: 114.0579 },
    杭州: { latitude: 30.2741, longitude: 120.1551 },
    成都: { latitude: 30.5728, longitude: 104.0668 },
    武汉: { latitude: 30.5928, longitude: 114.3055 },
    西安: { latitude: 34.3416, longitude: 108.9398 },
    天津: { latitude: 39.0842, longitude: 117.201 },
    唐山: { latitude: 39.6309, longitude: 118.1802 },
    保定: { latitude: 38.8671, longitude: 115.4845 }
  };
  const c = map[cityName];
  if (!c) return null;
  const payload = {
    latitude: c.latitude,
    longitude: c.longitude,
    accuracy: 0,
    updateTime: Date.now(),
    manualCity: cityName
  };
  persistUserLocation(payload);
  return payload;
}

function toRad(d) {
  return (d * Math.PI) / 180;
}

/** 两点球面距离（千米），坐标系需一致（如均为 GCJ-02） */
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
  const km = R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(km * 10) / 10;
}

function persistUserLocation(payload) {
  try {
    wx.setStorageSync('userLocation', payload);
  } catch (e) {}
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.userLocation = payload;
  } catch (e) {}
}

/** 需已授权 scope.userLocation */
function getCurrentPosition(options = {}) {
  const { type = 'gcj02', isHighAccuracy = true } = options;
  return new Promise((resolve, reject) => {
    const opts = {
      type,
      success: resolve,
      fail: reject
    };
    if (isHighAccuracy) opts.isHighAccuracy = true;
    wx.getLocation(opts);
  });
}

/**
 * 拉取当前位置并写入 storage / globalData
 * @returns {Promise<{latitude, longitude, accuracy, horizontalAccuracy, speed, altitude, updateTime}>}
 */
function requestUserLocation(options = {}) {
  return getCurrentPosition(options).then((res) => {
    const payload = {
      latitude: res.latitude,
      longitude: res.longitude,
      accuracy: res.accuracy,
      horizontalAccuracy: res.horizontalAccuracy,
      speed: res.speed,
      altitude: res.altitude,
      updateTime: Date.now()
    };
    persistUserLocation(payload);
    return payload;
  });
}

function getCachedUserLocation() {
  try {
    const app = getApp();
    const g = app && app.globalData && app.globalData.userLocation;
    if (g && g.latitude != null) return g;
  } catch (e) {}
  try {
    const s = wx.getStorageSync('userLocation');
    if (s && s.latitude != null) return s;
  } catch (e) {}
  return null;
}

/**
 * 完整权限流程后获取定位（首次授权 / 曾拒绝则引导去设置）
 */
function requestUserLocationWithUI(options = {}) {
  return new Promise((resolve, reject) => {
    wx.getSetting({
      success(settingRes) {
        const s = settingRes.authSetting['scope.userLocation'];
        const run = () => {
          requestUserLocation(options).then(resolve).catch(reject);
        };

        if (s === true) {
          run();
          return;
        }

        if (s === false) {
          wx.showModal({
            title: '需要位置权限',
            content: '用于获取您当前位置、推荐附近影院并计算距离。请在设置中开启「位置信息」。',
            confirmText: '去设置',
            cancelText: '暂不',
            success(modalRes) {
              if (!modalRes.confirm) {
                const err = new Error('CANCEL');
                err.code = 'CANCEL';
                reject(err);
                return;
              }
              wx.openSetting({
                success(openRes) {
                  if (openRes.authSetting['scope.userLocation']) run();
                  else {
                    const err = new Error('DENIED');
                    err.code = 'DENIED';
                    reject(err);
                  }
                },
                fail: () => reject(new Error('OPEN_SETTING_FAIL'))
              });
            }
          });
          return;
        }

        wx.authorize({
          scope: 'scope.userLocation',
          success: run,
          fail: () => {
            wx.showModal({
              title: '需要位置权限',
              content: '用于获取您当前位置、推荐附近影院并计算距离。请在设置中开启「位置信息」。',
              confirmText: '去设置',
              cancelText: '暂不',
              success(modalRes) {
                if (!modalRes.confirm) {
                  const err = new Error('CANCEL');
                  err.code = 'CANCEL';
                  reject(err);
                  return;
                }
                wx.openSetting({
                  success(openRes) {
                    if (openRes.authSetting['scope.userLocation']) run();
                    else {
                      const err = new Error('DENIED');
                      err.code = 'DENIED';
                      reject(err);
                    }
                  },
                  fail: () => reject(new Error('OPEN_SETTING_FAIL'))
                });
              }
            });
          }
        });
      },
      fail: () => reject(new Error('GET_SETTING_FAIL'))
    });
  });
}

/** 已授权则静默刷新；未授权不弹窗 */
function refreshLocationIfPermitted(options = {}) {
  return new Promise((resolve) => {
    wx.getSetting({
      success(res) {
        if (res.authSetting['scope.userLocation'] !== true) {
          resolve(null);
          return;
        }
        requestUserLocation(options)
          .then((p) => resolve(p))
          .catch(() => resolve(null));
      },
      fail: () => resolve(null)
    });
  });
}

module.exports = {
  SHIJIAZHUANG,
  DEVTOOLS_DEFAULT_GUANGZHOU,
  isDevtoolsGuangzhouMock,
  isDevtoolsEnv,
  setManualCityLocation,
  distanceKm,
  getCachedUserLocation,
  getCurrentPosition,
  requestUserLocation,
  requestUserLocationWithUI,
  refreshLocationIfPermitted
};
