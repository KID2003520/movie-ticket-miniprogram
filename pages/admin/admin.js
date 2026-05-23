const app = getApp();
const appConfig = require('../../utils/config.js');
const backendApi = require('../../utils/backendApi.js');

Page({
  data: {
    adminInfo: {},
    stats: {
      todayOrders: 0,
      todayRevenue: 0,
      newUsers: 0,
      activeMovies: 0
    },
    statsLoading: false
  },

  onLoad: function () {
    this.checkAdminAuth();
    this.loadAdminInfo();
    this.loadStats();
  },

  onShow: function () {
    this.loadStats();
  },

  checkAdminAuth: function () {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) {
      wx.showModal({
        title: '提示',
        content: '请先登录管理员账号',
        showCancel: false,
        success: () => {
          wx.redirectTo({ url: '/pages/login/login?redirect=/pages/admin/admin' });
        }
      });
      return;
    }

    const isAdmin = userInfo.role === 'admin' || userInfo.level === 'admin' || userInfo.isAdmin === true;
    if (!isAdmin) {
      wx.showModal({
        title: '权限不足',
        content: '您没有管理员权限',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
    }
  },

  loadAdminInfo: function () {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      adminInfo: {
        nickName: userInfo.nickName || '管理员',
        avatarUrl: userInfo.avatarUrl || ''
      }
    });
  },

  loadStats: function () {
    if (!appConfig.USE_BACKEND_ONLY) {
      this.setData({
        stats: {
          todayOrders: 0,
          todayRevenue: 0,
          newUsers: 0,
          activeMovies: 0
        }
      });
      return;
    }

    this.setData({ statsLoading: true });
    const that = this;
    backendApi
      .getAdminDashboardStats()
      .then((body) => {
        const d = (body && body.data) || {};
        that.setData({
          stats: {
            todayOrders: Number(d.todayOrders) || 0,
            todayRevenue: Number(d.todayRevenue) || 0,
            newUsers: Number(d.newUsers) || 0,
            activeMovies: Number(d.activeMovies) || 0
          },
          statsLoading: false
        });
      })
      .catch(() => {
        that.setData({
          stats: {
            todayOrders: 0,
            todayRevenue: 0,
            newUsers: 0,
            activeMovies: 0
          },
          statsLoading: false
        });
      });
  },

  onMovieManage: function () {
    wx.navigateTo({ url: '/pages/admin-movie/admin-movie' });
  },

  onUserManage: function () {
    wx.navigateTo({ url: '/pages/admin-user/admin-user' });
  },

  onOrderManage: function () {
    wx.navigateTo({ url: '/pages/admin-order/admin-order' });
  },

  onPointsManage: function () {
    wx.navigateTo({ url: '/pages/admin-points/admin-points' });
  },

  onCinemaManage: function () {
    wx.navigateTo({ url: '/pages/admin-cinema/admin-cinema' });
  },

  onAddMovie: function () {
    wx.navigateTo({ url: '/pages/admin-movie-add/admin-movie-add' });
  },

  onAddUser: function () {
    wx.navigateTo({ url: '/pages/admin-user-add/admin-user-add' });
  },

  onViewReport: function () {
    wx.navigateTo({ url: '/pages/admin-report/admin-report' });
  },

  onSettings: function () {
    wx.showToast({ title: '系统设置开发中', icon: 'none' });
  }
});
