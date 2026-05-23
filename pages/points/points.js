const appConfig = require('../../utils/config.js');
const backendApi = require('../../utils/backendApi.js');

const CACHE_KEY = 'pointsBalanceCacheV1';

Page({
  data: {
    useBackend: false,
    balance: 0,
    rules: [],
    logItems: []
  },

  onLoad() {
    this.setData({ useBackend: !!appConfig.USE_BACKEND_ONLY });
    try {
      const c = wx.getStorageSync(CACHE_KEY);
      if (c && typeof c.balance === 'number') {
        this.setData({ balance: c.balance });
      }
    } catch (e) {}
    this.loadRules();
    this.refreshAll(false);
  },

  onPullDownRefresh() {
    this.refreshAll(false).finally(() => wx.stopPullDownRefresh());
  },

  loadRules() {
    if (!this.data.useBackend) {
      this.setData({
        rules: [
          '当前为演示模式。开启仅后端模式后，可查看服务端规则与真实流水。',
          '购票、签到、活动积分均由服务器在业务发生时写入，前端不能直接改分。'
        ]
      });
      return;
    }
    backendApi
      .getPointsRules()
      .then((res) => {
        const rules = (res && res.data && res.data.rules) || [];
        this.setData({ rules });
      })
      .catch(() => {
        this.setData({ rules: ['规则加载失败，请稍后下拉重试'] });
      });
  },

  refreshAll(silent) {
    if (!this.data.useBackend) {
      return Promise.resolve();
    }
    if (!wx.getStorageSync('isLogin')) {
      if (!silent) wx.showToast({ title: '请先登录', icon: 'none' });
      return Promise.resolve();
    }
    const p1 = backendApi.getPointsBalance().then((res) => {
      const b = res && res.data && typeof res.data.balance === 'number' ? res.data.balance : 0;
      this.setData({ balance: b });
      try {
        wx.setStorageSync(CACHE_KEY, { balance: b, t: Date.now() });
      } catch (e) {}
    });
    const p2 = backendApi.getPointsLog({ page: 1, pageSize: 30 }).then((res) => {
      const items = (res && res.data && res.data.items) || [];
      this.setData({ logItems: items });
    });
    return Promise.all([p1, p2]).catch(() => {
      if (!silent) wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  onCheckIn() {
    if (!this.data.useBackend) {
      wx.showToast({ title: '请开启仅后端模式', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '签到中' });
    backendApi
      .postPointsCheckIn()
      .then((res) => {
        const d = (res && res.data) || {};
        if (typeof d.balance === 'number') {
          this.setData({ balance: d.balance });
          try {
            wx.setStorageSync(CACHE_KEY, { balance: d.balance, t: Date.now() });
          } catch (e) {}
        }
        wx.showToast({ title: res.message || '完成', icon: 'none' });
        this.refreshAll(true);
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '签到失败', icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  },

  onActivity(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || !this.data.useBackend) {
      wx.showToast({ title: '请开启仅后端模式', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '领取中' });
    backendApi
      .postPointsActivityClaim(key)
      .then((res) => {
        const d = (res && res.data) || {};
        if (typeof d.balance === 'number') {
          this.setData({ balance: d.balance });
          try {
            wx.setStorageSync(CACHE_KEY, { balance: d.balance, t: Date.now() });
          } catch (e) {}
        }
        wx.showToast({ title: res.message || '完成', icon: 'none' });
        this.refreshAll(true);
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '领取失败', icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  }
});
