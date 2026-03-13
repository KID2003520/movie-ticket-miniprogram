const app = getApp();

Page({
  data: {
    phone: '',
    code: '',
    password: '',
    confirmPassword: '',
    countdown: 0,
    loading: false,
    type: 'register',
    agreeProtocol: false,
    phoneError: '',
    codeError: '',
    passwordError: '',
    confirmError: ''
  },

  onLoad: function (options) {
    const type = options.type || 'register';
    this.setData({ type });
    
    wx.setNavigationBarTitle({
      title: type === 'login' ? '手机号登录' : '新用户注册'
    });
  },

  onPhoneInput: function (e) {
    this.setData({ 
      phone: e.detail.value,
      phoneError: ''
    });
  },

  onCodeInput: function (e) {
    this.setData({ 
      code: e.detail.value,
      codeError: ''
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

  onSendCode: function () {
    if (!this.data.phone) {
      this.setData({ phoneError: '请输入手机号' });
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(this.data.phone)) {
      this.setData({ phoneError: '手机号格式不正确' });
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    if (this.data.countdown > 0) return;

    wx.showToast({ title: '验证码已发送', icon: 'success' });
    this.startCountdown();
  },

  startCountdown: function () {
    this.setData({ countdown: 60 });
    const timer = setInterval(() => {
      const countdown = this.data.countdown - 1;
      if (countdown <= 0) {
        clearInterval(timer);
        this.setData({ countdown: 0 });
      } else {
        this.setData({ countdown: countdown });
      }
    }, 1000);
  },

  validateForm: function () {
    let isValid = true;

    if (!this.data.phone) {
      this.setData({ phoneError: '请输入手机号' });
      isValid = false;
    } else if (!/^1[3-9]\d{9}$/.test(this.data.phone)) {
      this.setData({ phoneError: '手机号格式不正确' });
      isValid = false;
    }

    if (!this.data.code) {
      this.setData({ codeError: '请输入验证码' });
      isValid = false;
    } else if (this.data.code.length < 4) {
      this.setData({ codeError: '验证码格式不正确' });
      isValid = false;
    }

    if (this.data.type === 'register') {
      if (!this.data.password) {
        this.setData({ passwordError: '请输入密码' });
        isValid = false;
      } else if (this.data.password.length < 6) {
        this.setData({ passwordError: '密码至少6位' });
        isValid = false;
      }

      if (!this.data.confirmPassword) {
        this.setData({ confirmError: '请再次输入密码' });
        isValid = false;
      } else if (this.data.confirmPassword !== this.data.password) {
        this.setData({ confirmError: '两次密码不一致' });
        isValid = false;
      }

      if (!this.data.agreeProtocol) {
        wx.showToast({ title: '请同意用户协议', icon: 'none' });
        isValid = false;
      }
    }

    return isValid;
  },

  navigateAfterSuccess: function () {
    const pages = getCurrentPages();
    
    if (pages.length > 1) {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: '/pages/user/user' });
        }
      });
    } else {
      wx.switchTab({ url: '/pages/user/user' });
    }
  },

  onRegister: function () {
    if (!this.validateForm()) return;

    this.setData({ loading: true });
    wx.showLoading({ title: '注册中...' });

    try {
      const users = wx.getStorageSync('users') || [];
      
      const existingUser = users.find(u => u.phone === this.data.phone);
      if (existingUser) {
        wx.hideLoading();
        wx.showToast({ title: '该手机号已注册', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const newUser = {
        _id: 'user_' + Date.now(),
        phone: this.data.phone,
        password: this.data.password,
        nickName: '用户' + this.data.phone.slice(-4),
        avatarUrl: 'https://picsum.photos/100/100?random=' + Math.floor(Math.random() * 100),
        openid: 'mock_openid_' + Date.now(),
        createTime: Date.now(),
        loginTime: Date.now()
      };

      users.push(newUser);
      wx.setStorageSync('users', users);

      app.globalData.userInfo = newUser;
      app.globalData.openid = newUser.openid;
      app.globalData.isLogin = true;
      
      wx.setStorageSync('userInfo', newUser);
      wx.setStorageSync('openid', newUser.openid);
      wx.setStorageSync('isLogin', true);

      setTimeout(() => {
        wx.hideLoading();
        wx.showToast({ title: '注册成功', icon: 'success' });
        
        setTimeout(() => {
          this.navigateAfterSuccess();
        }, 1500);
      }, 1000);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '注册失败', icon: 'none' });
      console.error(err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onLogin: function () {
    const pages = getCurrentPages();
    
    if (pages.length > 1) {
      wx.navigateBack({
        fail: () => {
          wx.redirectTo({ url: '/pages/login/login' });
        }
      });
    } else {
      wx.redirectTo({ url: '/pages/login/login' });
    }
  }
});
