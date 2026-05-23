const appConfig = require('./utils/config.js');

App({
  globalData: {
    userInfo: null,
    openid: null,
    isLogin: false,
    cloudReady: false,
    useBackendOnly: false,
    envId: null,
    selectedMovieId: null,
    selectedCoupon: null,
    /** 最近一次 wx.getLocation 结果（GCJ-02），供各页计算距离 */
    userLocation: null
  },

  onLaunch: function () {
    this.globalData.useBackendOnly = !!appConfig.USE_BACKEND_ONLY;
    try {
      const loc = wx.getStorageSync('userLocation');
      if (loc && loc.latitude != null && loc.longitude != null) {
        this.globalData.userLocation = loc;
      }
    } catch (e) {}
    this.initCloud();
    this.checkLoginStatus();
  },

  initCloud: function () {
    if (appConfig.USE_BACKEND_ONLY) {
      this.globalData.cloudReady = false;
      this.globalData.envId = '';
      console.log('[配置] 仅后端模式：已跳过云开发初始化');
      return;
    }

    if (!wx.cloud) {
      console.warn('当前基础库版本不支持云能力，将使用本地存储模式');
      this.globalData.cloudReady = false;
      return;
    }

    try {
      const envId = this.getEnvId();
      
      if (!envId) {
        console.warn('未配置云环境ID，将使用本地存储模式');
        this.globalData.cloudReady = false;
        return;
      }

      wx.cloud.init({
        env: envId,
        traceUser: true,
      });
      
      this.testCloudConnection().then(ready => {
        this.globalData.cloudReady = ready;
        if (ready) {
          console.log('云开发初始化成功');
        } else {
          console.warn('云开发环境不可用，将使用本地存储模式');
        }
      }).catch(err => {
        console.warn('云开发连接测试失败，将使用本地存储模式:', err);
        this.globalData.cloudReady = false;
      });
    } catch (err) {
      console.warn('云开发初始化失败，将使用本地存储模式:', err);
      this.globalData.cloudReady = false;
    }
  },

  getEnvId: function () {
    let envId = '';
    
    try {
      const projectConfig = require('./project.config.json');
      if (projectConfig.cloudenv) {
        envId = projectConfig.cloudenv;
      }
    } catch (e) {}

    if (!envId) {
      envId = wx.getStorageSync('cloudEnvId') || '';
    }

    this.globalData.envId = envId;
    return envId;
  },

  testCloudConnection: function () {
    return new Promise((resolve) => {
      if (!this.globalData.envId) {
        resolve(false);
        return;
      }

      const db = wx.cloud.database();
      db.collection('users').limit(1).get()
        .then(() => resolve(true))
        .catch((err) => {
          console.warn('云环境连接测试失败:', err);
          resolve(false);
        });
    });
  },

  checkLoginStatus: function () {
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    const isLogin = wx.getStorageSync('isLogin');
    
    if (userInfo && isLogin) {
      this.globalData.userInfo = userInfo;
      this.globalData.openid = openid;
      this.globalData.isLogin = true;
    }
  },

  login: function () {
    return new Promise((resolve, reject) => {
      if (!this.globalData.cloudReady) {
        const mockOpenid = 'mock_openid_' + Date.now();
        this.globalData.openid = mockOpenid;
        wx.setStorageSync('openid', mockOpenid);
        resolve(mockOpenid);
        return;
      }

      wx.cloud.callFunction({
        name: 'login',
        data: {}
      }).then(res => {
        const openid = res.result.openid || res.result.data?.openid;
        this.globalData.openid = openid;
        wx.setStorageSync('openid', openid);
        resolve(openid);
      }).catch(err => {
        console.warn('云函数调用失败，使用模拟openid');
        const mockOpenid = 'mock_openid_' + Date.now();
        this.globalData.openid = mockOpenid;
        wx.setStorageSync('openid', mockOpenid);
        resolve(mockOpenid);
      });
    });
  },

  getUserInfo: function () {
    return new Promise((resolve, reject) => {
      const mockUserInfo = {
        nickName: '微信用户',
        avatarUrl: 'https://picsum.photos/100/100?random=' + Math.floor(Math.random() * 100),
        gender: 0,
        city: '',
        province: '',
        country: ''
      };
      
      this.globalData.userInfo = mockUserInfo;
      this.globalData.isLogin = true;
      wx.setStorageSync('userInfo', mockUserInfo);
      wx.setStorageSync('isLogin', true);
      resolve(mockUserInfo);
    });
  },

  setCloudEnvId: function (envId) {
    if (appConfig.USE_BACKEND_ONLY) {
      console.warn('[配置] 仅后端模式：忽略 setCloudEnvId');
      return Promise.resolve(false);
    }
    this.globalData.envId = envId;
    wx.setStorageSync('cloudEnvId', envId);
    wx.cloud.init({
      env: envId,
      traceUser: true,
    });
    return this.testCloudConnection();
  }
});
