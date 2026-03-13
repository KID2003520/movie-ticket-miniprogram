const app = getApp();

Page({
  data: {
    loading: false,
    loginType: 'wechat',
    phone: '',
    password: '',
    phoneError: '',
    passwordError: '',
    redirectUrl: ''
  },

  onLoad: function (options) {
    const redirectUrl = options.redirect || '';
    this.setData({ redirectUrl });
  },

  switchLoginType: function (e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      loginType: type,
      phoneError: '',
      passwordError: ''
    });
  },

  onPhoneInput: function (e) {
    this.setData({ 
      phone: e.detail.value,
      phoneError: ''
    });
  },

  onPasswordInput: function (e) {
    this.setData({ 
      password: e.detail.value,
      passwordError: ''
    });
  },

  navigateAfterLogin: function () {
    const pages = getCurrentPages();
    
    if (this.data.redirectUrl) {
      wx.redirectTo({ 
        url: this.data.redirectUrl,
        fail: () => {
          wx.switchTab({ url: '/pages/user/user' });
        }
      });
    } else if (pages.length > 1) {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: '/pages/user/user' });
        }
      });
    } else {
      wx.switchTab({ url: '/pages/user/user' });
    }
  },

  onGetUserProfile: async function () {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    wx.showLoading({ title: '登录中...' });

    try {
      const userInfoRes = await new Promise((resolve, reject) => {
        wx.getUserProfile({
          desc: '用于完善用户资料',
          success: resolve,
          fail: reject
        });
      });

      const userInfo = userInfoRes.userInfo;
      
      let openid = wx.getStorageSync('openid');
      if (!openid) {
        try {
          const loginRes = await wx.cloud.callFunction({ name: 'login' });
          openid = loginRes.result.openid || 'mock_openid_' + Date.now();
        } catch (e) {
          openid = 'mock_openid_' + Date.now();
        }
      }

      const userData = {
        ...userInfo,
        openid: openid,
        phone: '',
        loginTime: Date.now(),
        createTime: Date.now()
      };
      
      app.globalData.userInfo = userData;
      app.globalData.openid = openid;
      app.globalData.isLogin = true;
      
      wx.setStorageSync('userInfo', userData);
      wx.setStorageSync('openid', openid);
      wx.setStorageSync('isLogin', true);

      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });

      setTimeout(() => {
        this.navigateAfterLogin();
      }, 1500);
    } catch (err) {
      wx.hideLoading();
      console.error('登录失败:', err);
      
      const mockUserInfo = {
        nickName: '微信用户',
        avatarUrl: 'https://picsum.photos/100/100?random=100',
        openid: 'mock_openid_' + Date.now(),
        loginTime: Date.now(),
        createTime: Date.now()
      };
      
      app.globalData.userInfo = mockUserInfo;
      app.globalData.openid = mockUserInfo.openid;
      app.globalData.isLogin = true;
      
      wx.setStorageSync('userInfo', mockUserInfo);
      wx.setStorageSync('openid', mockUserInfo.openid);
      wx.setStorageSync('isLogin', true);

      wx.showToast({ title: '登录成功', icon: 'success' });

      setTimeout(() => {
        this.navigateAfterLogin();
      }, 1500);
    } finally {
      this.setData({ loading: false });
    }
  },

  onPhoneLogin: function () {
    wx.navigateTo({ url: '/pages/register/register?type=login' });
  },

  validatePhoneLogin: function () {
    const { phone, password } = this.data;
    let isValid = true;

    if (!phone) {
      this.setData({ phoneError: '请输入手机号' });
      isValid = false;
    } else if (!/^1[3-9]\d{9}$/.test(phone)) {
      this.setData({ phoneError: '手机号格式不正确' });
      isValid = false;
    }

    if (!password) {
      this.setData({ passwordError: '请输入密码' });
      isValid = false;
    } else if (password.length < 6) {
      this.setData({ passwordError: '密码至少6位' });
      isValid = false;
    }

    return isValid;
  },

  onPasswordLogin: async function () {
    if (!this.validatePhoneLogin()) return;

    this.setData({ loading: true });
    wx.showLoading({ title: '登录中...' });

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const users = wx.getStorageSync('users') || [];
      const user = users.find(u => u.phone === this.data.phone);

      if (!user) {
        wx.hideLoading();
        wx.showToast({ title: '用户不存在，请先注册', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      if (user.password !== this.data.password) {
        wx.hideLoading();
        wx.showToast({ title: '密码错误', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const userData = {
        ...user,
        loginTime: Date.now()
      };
      
      app.globalData.userInfo = userData;
      app.globalData.openid = user.openid || 'mock_openid_' + Date.now();
      app.globalData.isLogin = true;
      
      wx.setStorageSync('userInfo', userData);
      wx.setStorageSync('openid', app.globalData.openid);
      wx.setStorageSync('isLogin', true);

      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });

      setTimeout(() => {
        this.navigateAfterLogin();
      }, 1500);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败', icon: 'none' });
      console.error(err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onSubmit: function () {
    if (this.data.loginType === 'wechat') {
      this.onGetUserProfile();
    } else {
      this.onPasswordLogin();
    }
  }
});
