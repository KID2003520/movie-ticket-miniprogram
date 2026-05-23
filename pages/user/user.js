const app = getApp();
const appConfig = require('../../utils/config.js');
const dataStorage = require('../../utils/data-storage.js');
const backendApi = require('../../utils/backendApi.js');
const { updateTabBar } = require('../../utils/updateTabBar.js');

Page({
  data: {
    userInfo: null,
    isLogin: false,
    isAdmin: false,
    orderStats: { pending: 0, paid: 0, cancelled: 0, refunded: 0 },
    collectionCount: 0,
    menuList: [
      { icon: '📋', title: '我的订单', url: '/pages/order/order' },
      { icon: '⭐', title: '我的收藏', url: '/pages/collection/collection' },
      { icon: '🎫', title: '优惠券', url: '/pages/coupon/coupon' },
      { icon: '💬', title: '客服中心', url: '/pages/customer-service/customer-service' },
      { icon: '👤', title: '个人资料', url: '/pages/profile/profile' },
      { icon: '✨', title: '会员积分', url: '/pages/points/points' },
      { icon: '⚙️', title: '设置', url: '/pages/settings/settings' }
    ]
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    updateTabBar(this, 3);
    this.checkLogin();
    if (this.data.isLogin) {
      this.syncUserPanelStats();
    }
  },

  checkLogin: function () {
    const isLogin = app.globalData.isLogin || wx.getStorageSync('isLogin');
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    const isAdmin = userInfo && (userInfo.level === 'admin' || userInfo.role === 'admin' || userInfo.isAdmin === true);
    
    this.setData({ isLogin: isLogin, userInfo: userInfo, isAdmin: isAdmin });
  },

  /** 订单角标 + 收藏数：纯后端模式走 MySQL 统计，否则走本地 storage */
  syncUserPanelStats: function () {
    const defaults = { pending: 0, paid: 0, cancelled: 0, refunded: 0 };
    if (appConfig.USE_BACKEND_ONLY) {
      backendApi
        .getUserStats()
        .then((res) => {
          const d = (res && res.data) || {};
          const os = d.orderStats || {};
          this.setData({
            orderStats: {
              pending: Number(os.pending) || 0,
              paid: Number(os.paid) || 0,
              cancelled: Number(os.cancelled) || 0,
              refunded: Number(os.refunded) || 0
            },
            collectionCount: Number(d.collectionCount) || 0
          });
        })
        .catch(() => {
          this.setData({
            orderStats: dataStorage.getOrderStats(),
            collectionCount: dataStorage.getCollectionCount()
          });
        });
      return;
    }
    this.setData({
      orderStats: dataStorage.getOrderStats(),
      collectionCount: dataStorage.getCollectionCount()
    });
  },

  onLogin: function () {
    if (this.data.isLogin) return;
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onProfileCardTap: function () {
    if (this.data.isLogin) {
      wx.navigateTo({ url: '/pages/profile/profile' });
      return;
    }
    this.onLogin();
  },

  onOrderTap: function (e) {
    if (!this.data.isLogin) {
      this.onLogin();
      return;
    }
    const status = e.currentTarget.dataset.status || '';
    wx.navigateTo({ url: `/pages/order/order?status=${status}` });
  },

  onMenuTap: function (e) {
    const url = e.currentTarget.dataset.url;
    const tip = e.currentTarget.dataset.tip;
    if (!this.data.isLogin) {
      this.onLogin();
      return;
    }
    if (url) {
      wx.navigateTo({ url: url });
    } else {
      wx.showToast({ title: tip || '功能开发中', icon: 'none' });
    }
  },

  onAdminTap: function () {
    wx.navigateTo({ url: '/pages/admin/admin' });
  },

  onLogout: function () {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          dataStorage.logout();
          try {
            wx.removeStorageSync('userProfileCacheV1');
          } catch (e) {}
          app.globalData.isLogin = false;
          app.globalData.userInfo = null;
          app.globalData.openid = null;
          
          this.setData({
            isLogin: false,
            userInfo: null,
            isAdmin: false,
            orderStats: { pending: 0, paid: 0, cancelled: 0, refunded: 0 },
            collectionCount: 0
          });
          
          wx.showToast({ title: '已退出登录', icon: 'success' });

          // 退出登录后跳转到登录页（类似淘票票）
          wx.reLaunch({
            url: '/pages/login/login',
            fail: () => {
              // 兜底：在少数机型/场景下 reLaunch 可能受限
              wx.navigateTo({ url: '/pages/login/login' });
            }
          });
        }
      }
    });
  }
});
