const app = getApp();
const backendApi = require('../../utils/backendApi.js');
const locationUtil = require('../../utils/location.js');
const reverseCity = require('../../utils/reverseCity.js');
const { updateTabBar } = require('../../utils/updateTabBar.js');

function normalizeCityName(city) {
  return String(city || '')
    .trim()
    .replace(/市$/, '');
}

Page({
  data: {
    rawCinemas: [],
    cinemas: [],
    cityChips: [],
    filterCity: '',
    searchKeyword: '',
    loading: true,
    movieId: '',
    movieTitle: '',
    locationHint: '点击获取定位'
  },

  onLoad: function (options) {
    if (options.movieId) {
      this.setData({ movieId: options.movieId });
    }
    this.syncLocationHint();
    this.loadCinemas();
  },

  onShow: function () {
    updateTabBar(this, 2);
    if (app.globalData.selectedMovieId) {
      this.setData({ movieId: app.globalData.selectedMovieId });
      app.globalData.selectedMovieId = null;
    }
    this.syncLocationHint();
    this.loadCinemas();
  },

  syncLocationHint: function () {
    const u = locationUtil.getCachedUserLocation();
    const city = wx.getStorageSync('userCity');
    if (u && u.latitude != null) {
      const hint = city ? `${city} · 点我更新` : '已定位 · 点我更新';
      this.setData({ locationHint: hint });
    } else {
      this.setData({ locationHint: city ? `${city}（未开定位）` : '点击获取定位' });
    }
  },

  /** 关键字 + 城市筛选后再算距离 */
  applyCinemaList: function () {
    const raw = this.data.rawCinemas || [];
    const fc = normalizeCityName(this.data.filterCity || '');
    const kw = (this.data.searchKeyword || '').trim();
    let list = raw.slice();
    if (fc) {
      list = list.filter(
        (c) =>
          normalizeCityName(c.city) === fc ||
          (c.address && c.address.indexOf(fc) >= 0) ||
          (c.address && c.address.indexOf(fc + '市') >= 0)
      );
    }
    if (kw) {
      list = list.filter(
        (c) =>
          (c.name && c.name.indexOf(kw) >= 0) || (c.address && c.address.indexOf(kw) >= 0)
      );
    }
    this.setData({ cinemas: this.applyDistancesToCinemas(list) });
  },

  onCityFilter: function (e) {
    const city = e.currentTarget.dataset.city != null ? normalizeCityName(String(e.currentTarget.dataset.city)) : '';
    this.setData({ filterCity: city });
    this.applyCinemaList();
  },

  onSearchInput: function (e) {
    const v = e.detail.value || '';
    this.setData({ searchKeyword: v });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.applyCinemaList();
    }, 280);
  },

  /** 按与当前位置距离（km）升序；无定位时 distance 为 null */
  applyDistancesToCinemas: function (items) {
    const u = locationUtil.getCachedUserLocation();
    const list = (items || []).map((c) => ({ ...c }));
    if (!u || u.latitude == null || u.longitude == null) {
      return list.map((c) => ({ ...c, distance: null }));
    }
    const withD = list.map((c) => {
      const la = Number(c.latitude);
      const lo = Number(c.longitude);
      const d = locationUtil.distanceKm(u.latitude, u.longitude, la, lo);
      return { ...c, distance: d };
    });
    return withD.sort((a, b) => {
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });
  },

  onRefreshLocation: function () {
    wx.showLoading({ title: '定位中...' });
    locationUtil
      .requestUserLocationWithUI({ isHighAccuracy: true })
      .then((pos) => {
        wx.hideLoading();
        const p = pos || locationUtil.getCachedUserLocation();
        if (!p || p.latitude == null) {
          wx.showToast({ title: '定位失败', icon: 'none' });
          return;
        }
        wx.showLoading({ title: '解析城市...' });
        reverseCity.resolveCityDisplayName(p.latitude, p.longitude).then((name) => {
          wx.hideLoading();
          if (name) wx.setStorageSync('userCity', name);
          wx.showToast({ title: '定位成功', icon: 'success' });
          this.syncLocationHint();
          this.loadCinemas();
        });
      })
      .catch((e) => {
        wx.hideLoading();
        if (e && e.code === 'CANCEL') return;
        wx.showToast({ title: '定位失败', icon: 'none' });
      });
  },

  loadCinemas: function () {
    const city = normalizeCityName(wx.getStorageSync('userCity'));
    this.setData({ loading: true });
    backendApi
      .getCinemas({ city })
      .then((res) => {
        const items = (res && res.data && res.data.items) || [];
        const cities = [...new Set(items.map((c) => c.city).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b, 'zh-Hans-CN')
        );
        this.setData({
          rawCinemas: items,
          cityChips: cities,
          filterCity: city || this.data.filterCity || '',
          loading: false
        });
        this.applyCinemaList();
      })
      .catch(() => {
        this.setData({
          rawCinemas: [],
          cinemas: [],
          cityChips: [],
          loading: false
        });
      });
  },

  onPullDownRefresh: function () {
    this.loadCinemas();
    setTimeout(() => wx.stopPullDownRefresh(), 400);
  },

  onCinemaTap: function (e) {
    const { id } = e.currentTarget.dataset;
    const url = this.data.movieId
      ? `/pages/cinema-detail/cinema-detail?id=${id}&movieId=${this.data.movieId}`
      : `/pages/cinema-detail/cinema-detail?id=${id}`;
    wx.navigateTo({ url: url });
  },

  onLocationTap: function (e) {
    const { latitude, longitude, name, address } = e.currentTarget.dataset;
    wx.openLocation({
      latitude: Number(latitude),
      longitude: Number(longitude),
      name: name,
      address: address,
      scale: 15
    });
  }
});
