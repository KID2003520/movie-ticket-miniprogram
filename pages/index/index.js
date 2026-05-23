const backendApi = require('../../utils/backendApi.js');
const locationUtil = require('../../utils/location.js');
const reverseCity = require('../../utils/reverseCity.js');
const { updateTabBar } = require('../../utils/updateTabBar.js');
const { normalizeMovie, getDefaultPosterUrl } = require('../../utils/normalizeMovie.js');

Page({
  data: {
    bannerList: [],
    hotMovies: [],
    showingMovies: [],
    comingMovies: [],
    loading: true,
    searchValue: '',
    showSearch: false,
    location: '定位中...',
    city: '',
    latitude: null,
    longitude: null
  },

  onLoad: function () {
    this.getUserLocation();
    this.loadData();
  },

  getUserLocation: function () {
    const fallbackCity = wx.getStorageSync('userCity') || '石家庄';
    this.setData({ location: '定位中...' });
    locationUtil
      .requestUserLocationWithUI({ isHighAccuracy: true })
      .then((pos) => {
        let lat = pos.latitude;
        let lng = pos.longitude;
        // 开发者工具默认给广州坐标，在石家庄开发时会一直显示「广州」
        if (
          locationUtil.isDevtoolsEnv() &&
          locationUtil.isDevtoolsGuangzhouMock(lat, lng)
        ) {
          const saved = wx.getStorageSync('userCity');
          if (saved === '石家庄' || !saved) {
            lat = locationUtil.SHIJIAZHUANG.latitude;
            lng = locationUtil.SHIJIAZHUANG.longitude;
            locationUtil.setManualCityLocation('石家庄');
          }
        }
        this.setData({ latitude: lat, longitude: lng });
        this.resolveCityName(lat, lng);
      })
      .catch((err) => {
        console.warn('定位取消或失败:', err && err.message);
        const cached = locationUtil.getCachedUserLocation();
        if (cached && cached.latitude != null) {
          this.setData({ latitude: cached.latitude, longitude: cached.longitude });
          this.resolveCityName(cached.latitude, cached.longitude);
          return;
        }
        if (err && err.code === 'CANCEL') {
          this.setData({ location: wx.getStorageSync('userCity') || fallbackCity });
          return;
        }
        this.setData({ location: fallbackCity, city: fallbackCity });
      });
  },

  /** 后端逆地理 → 可选小程序腾讯 Key → 最近大城市估算，尽量显示城市名 */
  resolveCityName: function (lat, lng) {
    reverseCity.resolveCityDisplayName(lat, lng).then((name) => {
      if (name) {
        this.setData({ location: name, city: name });
        wx.setStorageSync('userCity', name);
      } else {
        this.setData({ location: '已定位', city: '' });
      }
    });
  },

  onLocationTap: function () {
    const that = this;

    const cities = [
      '石家庄',
      '唐山',
      '保定',
      '北京',
      '天津',
      '上海',
      '广州',
      '深圳',
      '杭州',
      '成都',
      '武汉',
      '西安'
    ];
    const sheetItems = ['重新定位', '手动选城市（模拟器可用）'];
    if (locationUtil.isDevtoolsEnv()) {
      sheetItems.push('模拟器设为石家庄坐标');
    }

    wx.showActionSheet({
      itemList: [...sheetItems, ...cities.slice(0, 6)],
      success(res) {
        if (res.tapIndex === 0) {
          that.getUserLocation();
          return;
        }
        if (res.tapIndex === 1) {
          wx.showActionSheet({
            itemList: cities,
            success(inner) {
              const selectedCity = cities[inner.tapIndex];
              that.applyManualCity(selectedCity);
            }
          });
          return;
        }
        let cityOffset = 2;
        if (locationUtil.isDevtoolsEnv()) {
          if (res.tapIndex === 2) {
            that.applyManualCity('石家庄');
            wx.showToast({ title: '已设为石家庄坐标', icon: 'none' });
            return;
          }
          cityOffset = 3;
        }
        const selectedCity = cities[res.tapIndex - cityOffset];
        if (selectedCity) that.applyManualCity(selectedCity);
      }
    });
  },

  applyManualCity: function (cityName) {
    locationUtil.setManualCityLocation(cityName);
    const cached = locationUtil.getCachedUserLocation();
    if (cached) {
      this.setData({
        latitude: cached.latitude,
        longitude: cached.longitude,
        location: cityName,
        city: cityName
      });
      wx.setStorageSync('userCity', cityName);
      this.resolveCityName(cached.latitude, cached.longitude);
    } else {
      this.setData({ location: cityName, city: cityName });
      wx.setStorageSync('userCity', cityName);
    }
  },

  onShow: function () {
    updateTabBar(this, 0);
    const cached = locationUtil.getCachedUserLocation();
    if (cached && cached.latitude != null) {
      let lat = cached.latitude;
      let lng = cached.longitude;
      if (
        locationUtil.isDevtoolsEnv() &&
        locationUtil.isDevtoolsGuangzhouMock(lat, lng) &&
        (wx.getStorageSync('userCity') === '石家庄' || !wx.getStorageSync('userCity'))
      ) {
        lat = locationUtil.SHIJIAZHUANG.latitude;
        lng = locationUtil.SHIJIAZHUANG.longitude;
        locationUtil.setManualCityLocation('石家庄');
      }
      this.setData({ latitude: lat, longitude: lng });
      this.resolveCityName(lat, lng);
    }
  },

  onPullDownRefresh: function () {
    const p1 = this.loadData();
    const p2 = locationUtil.refreshLocationIfPermitted({ isHighAccuracy: true }).then((pos) => {
      if (pos) {
        this.setData({ latitude: pos.latitude, longitude: pos.longitude });
        this.resolveCityName(pos.latitude, pos.longitude);
      }
    });
    Promise.all([p1, p2]).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadData: function () {
    this.setData({ loading: true });
    return Promise.all([
      backendApi.getMovies({ status: 'showing' }).catch(() => ({ data: { items: [] } })),
      backendApi.getMovies({ status: 'coming' }).catch(() => ({ data: { items: [] } }))
    ])
      .then(([showingRes, comingRes]) => {
        const showing = (showingRes.data && showingRes.data.items) || [];
        const coming = (comingRes.data && comingRes.data.items) || [];
        const showingMovies = showing.map(normalizeMovie).filter(Boolean);
        const comingMovies = coming.map(normalizeMovie).filter(Boolean);
        const hotMovies = showingMovies.slice().sort((a, b) => (b.hot || 0) - (a.hot || 0)).slice(0, 6).map(normalizeMovie);

        const bannerList = hotMovies.slice(0, 3).map((m) => ({
          id: m._id,
          image: m.poster,
          title: m.title,
          url: `/pages/movie-detail/movie-detail?id=${m._id}`
        }));

        this.setData({
          bannerList,
          hotMovies: hotMovies.length ? hotMovies : showingMovies.slice(0, 6),
          showingMovies,
          comingMovies,
          loading: false
        });
      })
      .catch((e) => {
        console.error(e);
        this.setData({ loading: false });
      });
  },

  onBannerTap: function (e) {
    const { id } = e.currentTarget.dataset;
    const banner = this.data.bannerList.find((b) => b.id === id);
    if (banner && banner.url) {
      wx.navigateTo({ url: banner.url });
    }
  },

  onMovieTap: function (e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/movie-detail/movie-detail?id=${id}`
    });
  },

  onMoreTap: function () {
    wx.switchTab({
      url: '/pages/movie/movie'
    });
  },

  onSearchTap: function () {
    wx.navigateTo({
      url: '/pages/search/search'
    });
  },

  onMiniPosterError: function (e) {
    const id = String(e.currentTarget.dataset.id || '');
    const listName = String(e.currentTarget.dataset.list || '');
    if (!id || !listName) return;
    const list = this.data[listName];
    if (!Array.isArray(list)) return;
    const fb = getDefaultPosterUrl();
    if (!fb) return;
    const next = list.map((m) => (String(m._id) === id ? { ...m, poster: fb } : m));
    this.setData({ [listName]: next });
  },

  onShareAppMessage: function () {
    return {
      title: '电影购票小程序',
      path: '/pages/index/index'
    };
  }
});
