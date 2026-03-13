const app = getApp();

Page({
  data: {
    userInfo: null,
    isLogin: false,
    isAdmin: false,
    orderStats: { pending: 0, paid: 0, used: 0 },
    menuList: [
      { icon: 'orders', title: '我的订单', url: '/pages/order/order' },
      { icon: 'star', title: '我的收藏', url: '' },
      { icon: 'coupon', title: '优惠券', url: '' },
      { icon: 'location', title: '常用影院', url: '' },
      { icon: 'service', title: '客服中心', url: '' },
      { icon: 'setting', title: '设置', url: '' }
    ]
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    this.checkLogin();
  },

  checkLogin: function () {
    const isLogin = app.globalData.isLogin || wx.getStorageSync('isLogin');
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    const isAdmin = userInfo && (userInfo.level === 'admin' || userInfo.openid);
    
    this.setData({ 
      isLogin: isLogin, 
      userInfo: userInfo,
      isAdmin: isAdmin
    });
  },

  onLogin: function () {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onOrderTap: function () {
    if (!this.data.isLogin) {
      this.onLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/order/order' });
  },

  onMenuTap: function (e) {
    const { url } = e.currentTarget.dataset;
    if (!this.data.isLogin) {
      this.onLogin();
      return;
    }
    if (url) {
      wx.navigateTo({ url: url });
    } else {
      wx.showToast({ title: '功能开发中', icon: 'none' });
    }
  },

  onAdminTap: function () {
    wx.navigateTo({ url: '/pages/admin/admin' });
  }
});
