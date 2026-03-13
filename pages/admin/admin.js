const app = getApp();

Page({
  data: {
    adminInfo: {},
    stats: {
      todayOrders: 128,
      todayRevenue: 4580,
      newUsers: 23,
      activeMovies: 15
    }
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

    const isAdmin = userInfo.role === 'admin' || userInfo.openid;
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
    const movies = wx.getStorageSync('movies') || [];
    const users = wx.getStorageSync('users') || [];
    
    this.setData({
      stats: {
        todayOrders: Math.floor(Math.random() * 200) + 50,
        todayRevenue: Math.floor(Math.random() * 5000) + 1000,
        newUsers: users.length || Math.floor(Math.random() * 30) + 10,
        activeMovies: movies.length || 15
      }
    });
  },

  onMovieManage: function () {
    wx.navigateTo({ url: '/pages/admin-movie/admin-movie' });
  },

  onUserManage: function () {
    wx.navigateTo({ url: '/pages/admin-user/admin-user' });
  },

  onOrderManage: function () {
    wx.navigateTo({ url: '/pages/order/order' });
  },

  onCinemaManage: function () {
    wx.navigateTo({ url: '/pages/cinema/cinema' });
  },

  onAddMovie: function () {
    wx.navigateTo({ url: '/pages/admin-movie-add/admin-movie-add' });
  },

  onAddUser: function () {
    wx.navigateTo({ url: '/pages/admin-user-add/admin-user-add' });
  },

  onViewReport: function () {
    wx.showToast({ title: '数据报表开发中', icon: 'none' });
  },

  onSettings: function () {
    wx.showToast({ title: '系统设置开发中', icon: 'none' });
  }
});
