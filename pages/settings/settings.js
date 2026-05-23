const app = getApp();

Page({
  data: {
    settings: {
      notification: true,
      autoPlay: false,
      nightMode: false,
      language: 'zh-CN'
    },
    cacheSize: '0KB',
    version: '1.0.0'
  },

  onLoad() {
    this.loadSettings();
    this.calculateCacheSize();
  },

  onProfileTap() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  loadSettings() {
    const settings = wx.getStorageSync('appSettings') || this.data.settings;
    this.setData({ settings });
  },

  calculateCacheSize() {
    try {
      const res = wx.getStorageInfoSync();
      const size = res.currentSize;
      let sizeText = '';
      
      if (size < 1024) {
        sizeText = size + 'KB';
      } else {
        sizeText = (size / 1024).toFixed(2) + 'MB';
      }
      
      this.setData({ cacheSize: sizeText });
    } catch (e) {
      console.error('获取缓存大小失败:', e);
    }
  },

  onSwitchChange(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    
    const settings = { ...this.data.settings, [key]: value };
    this.setData({ settings });
    wx.setStorageSync('appSettings', settings);
    
    wx.showToast({
      title: value ? '已开启' : '已关闭',
      icon: 'success'
    });
  },

  onClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有缓存数据吗？这不会影响您的订单和收藏数据。',
      success: (res) => {
        if (res.confirm) {
          try {
            // 保留重要数据
            const orders = wx.getStorageSync('orders');
            const collections = wx.getStorageSync('collections');
            const userInfo = wx.getStorageSync('userInfo');
            const isLogin = wx.getStorageSync('isLogin');
            
            // 清除所有缓存
            wx.clearStorageSync();
            
            // 恢复重要数据
            if (orders) wx.setStorageSync('orders', orders);
            if (collections) wx.setStorageSync('collections', collections);
            if (userInfo) wx.setStorageSync('userInfo', userInfo);
            if (isLogin) wx.setStorageSync('isLogin', isLogin);
            
            this.calculateCacheSize();
            
            wx.showToast({
              title: '清除成功',
              icon: 'success'
            });
          } catch (e) {
            wx.showToast({
              title: '清除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  onAboutTap() {
    wx.showModal({
      title: '关于淘票票',
      content: '淘票票小程序 v' + this.data.version + '\n\n一款便捷的电影购票应用，为您提供优质的电影购票体验。',
      showCancel: false
    });
  },

  onPrivacyTap() {
    wx.showModal({
      title: '隐私政策',
      content: '我们重视您的隐私保护，所有个人信息仅用于提供更好的服务体验。',
      showCancel: false
    });
  },

  onUserAgreementTap() {
    wx.showModal({
      title: '用户协议',
      content: '使用本应用即表示您同意遵守我们的用户协议和服务条款。',
      showCancel: false
    });
  },

  onFeedbackTap() {
    wx.navigateTo({
      url: '/pages/customer-service/customer-service'
    });
  }
});
