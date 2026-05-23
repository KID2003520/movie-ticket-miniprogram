const app = getApp();
const backendApi = require('../../utils/backendApi.js');

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

    // 由于当前项目没有真实短信服务，这里做“本地模拟验证码”
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6位
    const expireAt = Date.now() + 5 * 60 * 1000; // 5分钟过期
    const phoneKey = `smsCode_${this.data.phone}`;
    wx.setStorageSync(phoneKey, { code, expireAt });

    wx.showToast({ title: `验证码已发送（${code}）`, icon: 'success' });
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

    // type=register：验证码必填；type=login：允许不填（纯“手机号+密码”登录）
    if (this.data.type === 'register') {
      if (!this.data.code) {
        this.setData({ codeError: '请输入验证码' });
        isValid = false;
      } else if (this.data.code.length < 4) {
        this.setData({ codeError: '验证码格式不正确' });
        isValid = false;
      }

      // 校验本地模拟验证码
      if (isValid) {
        const phoneKey = `smsCode_${this.data.phone}`;
        const saved = wx.getStorageSync(phoneKey);
        if (!saved || !saved.code || !saved.expireAt) {
          this.setData({ codeError: '请先获取验证码' });
          wx.showToast({ title: '请先获取验证码', icon: 'none' });
          isValid = false;
        } else if (Date.now() > saved.expireAt) {
          this.setData({ codeError: '验证码已过期，请重新获取' });
          wx.showToast({ title: '验证码已过期', icon: 'none' });
          isValid = false;
        } else if (String(saved.code) !== String(this.data.code)) {
          this.setData({ codeError: '验证码错误' });
          wx.showToast({ title: '验证码错误', icon: 'none' });
          isValid = false;
        }
      }
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
    } else if (this.data.type === 'login') {
      // 登录也需要密码
      if (!this.data.password) {
        this.setData({ passwordError: '请输入密码' });
        isValid = false;
      } else if (this.data.password.length < 6) {
        this.setData({ passwordError: '密码至少6位' });
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

  onRegister: async function () {
    if (!this.validateForm()) return;

    this.setData({ loading: true });
    wx.showLoading({ title: '注册中...' });

    try {
      const app = getApp();
      // 非云开发：走后端 MySQL（手机号+密码）
      if (!app.globalData.cloudReady) {
        if (this.data.type === 'login') {
          const res = await backendApi.loginPhonePassword({
            phone: this.data.phone,
            password: this.data.password
          });

          if (!res || res.code !== 0) {
            wx.hideLoading();
            wx.showToast({ title: res?.message || '登录失败', icon: 'none' });
            this.setData({ loading: false });
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
          setTimeout(() => this.navigateAfterSuccess(), 800);
          return;
        }

        // type=register：注册
        const res = await backendApi.registerPhonePassword({
          phone: this.data.phone,
          password: this.data.password
        });

        if (!res || res.code !== 0) {
          wx.hideLoading();
          wx.showToast({ title: res?.message || '注册失败', icon: 'none' });
          this.setData({ loading: false });
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
        setTimeout(() => this.navigateAfterSuccess(), 800);
        return;
      }

      const users = wx.getStorageSync('users') || [];
      
      const existingUser = users.find(u => u.phone === this.data.phone);

      // type=login：手机号登录（不创建新用户）
      if (this.data.type === 'login') {
        if (!existingUser) {
          wx.hideLoading();
          wx.showToast({ title: '该手机号未注册', icon: 'none' });
          this.setData({ loading: false });
          return;
        }

        app.globalData.userInfo = existingUser;
        app.globalData.openid = existingUser.openid;
        app.globalData.isLogin = true;

        wx.setStorageSync('userInfo', existingUser);
        wx.setStorageSync('openid', existingUser.openid);
        wx.setStorageSync('isLogin', true);

        setTimeout(() => {
          wx.hideLoading();
          wx.showToast({ title: '登录成功', icon: 'success' });
          setTimeout(() => {
            this.navigateAfterSuccess();
          }, 1500);
        }, 500);

        return;
      }

      // type=register：注册（不存在才创建）
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
        // 用手机号生成稳定 openid，保证同一个手机号多次登录不会创建不同 openid
        openid: 'mock_openid_' + this.data.phone,
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
    // 账号切换：
    // type=login: 去注册（type=register）
    // type=register: 去登录（type=login）
    const nextType = this.data.type === 'login' ? 'register' : 'login';
    wx.redirectTo({ url: `/pages/register/register?type=${nextType}` });
  }
});
