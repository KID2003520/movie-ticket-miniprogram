const app = getApp();
const backendApi = require('../../utils/backendApi.js');

Page({
  data: {
    loading: false,
    loginType: 'phone_login',
    phone: '',
    password: '',
    confirmPassword: '',
    agreeProtocol: false,
    phoneError: '',
    passwordError: '',
    confirmError: '',
    redirectUrl: '',
    showPassword: false,
    showRegPassword: false,
    showRegConfirmPassword: false
  },

  onLoad: function (options) {
    const redirectUrl = options.redirect || '';
    const type = options.type || '';
    const loginType = type === 'phone_register' ? 'phone_register' : 'phone_login';
    this.setData({ redirectUrl, loginType });
  },

  onGoRegister: function () {
    this.setData({
      loginType: 'phone_register',
      phoneError: '',
      passwordError: '',
      confirmError: '',
      agreeProtocol: false,
      confirmPassword: ''
    });
  },

  onGoLogin: function () {
    this.setData({
      loginType: 'phone_login',
      phoneError: '',
      passwordError: '',
      confirmError: '',
      agreeProtocol: false,
      confirmPassword: ''
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

  onConfirmPasswordInput: function (e) {
    this.setData({
      confirmPassword: e.detail.value,
      confirmError: ''
    });
  },

  toggleProtocol: function () {
    this.setData({ agreeProtocol: !this.data.agreeProtocol });
  },

  toggleShowPassword: function () {
    this.setData({ showPassword: !this.data.showPassword });
  },

  toggleShowRegPassword: function () {
    this.setData({ showRegPassword: !this.data.showRegPassword });
  },

  toggleShowRegConfirmPassword: function () {
    this.setData({ showRegConfirmPassword: !this.data.showRegConfirmPassword });
  },

  navigateAfterLogin: function () {
    const tabPages = [
      '/pages/index/index',
      '/pages/movie/movie',
      '/pages/cinema/cinema',
      '/pages/user/user'
    ];
    if (this.data.redirectUrl) {
      const pathOnly = String(this.data.redirectUrl).split('?')[0];
      if (tabPages.includes(pathOnly)) {
        wx.switchTab({ url: pathOnly });
        return;
      }
      wx.redirectTo({
        url: this.data.redirectUrl,
        fail: () => wx.switchTab({ url: '/pages/user/user' })
      });
      return;
    }
    if (app.globalData.selectedMovieId) {
      wx.switchTab({ url: '/pages/cinema/cinema' });
      return;
    }
    wx.switchTab({ url: '/pages/user/user' });
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

  validatePhoneRegister: function () {
    const { phone, password, confirmPassword, agreeProtocol } = this.data;
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

    if (!confirmPassword) {
      this.setData({ confirmError: '请再次输入密码' });
      isValid = false;
    } else if (confirmPassword !== password) {
      this.setData({ confirmError: '两次密码不一致' });
      isValid = false;
    }

    if (!agreeProtocol) {
      wx.showToast({ title: '请同意用户协议', icon: 'none' });
      isValid = false;
    }

    return isValid;
  },

  onRegister: async function () {
    if (this.data.loginType !== 'phone_register') return;
    if (!this.validatePhoneRegister()) return;

    this.setData({ loading: true });
    wx.showLoading({ title: '注册中...' });

    try {
      const res = await backendApi.registerPhonePassword({
        phone: this.data.phone,
        password: this.data.password
      });

      if (!res || res.code !== 0) {
        wx.hideLoading();
        wx.showToast({ title: (res && res.message) || '注册失败', icon: 'none' });
        return;
      }

      const { openid, userInfo } = res.data || {};
      app.globalData.userInfo = userInfo;
      app.globalData.openid = openid;
      app.globalData.isLogin = true;
      wx.setStorageSync('userInfo', userInfo);
      wx.setStorageSync('openid', openid);
      wx.setStorageSync('isLogin', true);

      wx.hideLoading();
      wx.showToast({ title: '注册成功', icon: 'success' });
      setTimeout(() => this.navigateAfterLogin(), 800);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '注册失败', icon: 'none' });
      console.error(err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onPasswordLogin: async function () {
    if (this.data.loginType !== 'phone_login') return;
    if (!this.validatePhoneLogin()) return;

    this.setData({ loading: true });
    wx.showLoading({ title: '登录中...' });

    try {
      const res = await backendApi.loginPhonePassword({
        phone: this.data.phone,
        password: this.data.password
      });

      if (!res || res.code !== 0) {
        wx.hideLoading();
        wx.showToast({ title: (res && res.message) || '登录失败', icon: 'none' });
        return;
      }

      const { openid, userInfo } = res.data || {};
      app.globalData.userInfo = userInfo;
      app.globalData.openid = openid;
      app.globalData.isLogin = true;
      wx.setStorageSync('userInfo', userInfo);
      wx.setStorageSync('openid', openid);
      wx.setStorageSync('isLogin', true);

      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => this.navigateAfterLogin(), 800);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败', icon: 'none' });
      console.error(err);
    } finally {
      this.setData({ loading: false });
    }
  }
});
