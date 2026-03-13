App({
  globalData: {
    userInfo: null,
    openid: null,
    isLogin: false
  },

  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'your-cloud-env-id',
        traceUser: true,
      });
    }

    this.checkLoginStatus();
  },

  checkLoginStatus: function () {
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    
    if (userInfo && openid) {
      this.globalData.userInfo = userInfo;
      this.globalData.openid = openid;
      this.globalData.isLogin = true;
    }
  },

  login: function () {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login',
        data: {}
      }).then(res => {
        const openid = res.result.openid;
        this.globalData.openid = openid;
        wx.setStorageSync('openid', openid);
        resolve(openid);
      }).catch(err => {
        reject(err);
      });
    });
  },

  getUserInfo: function () {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于完善用户资料',
        success: (res) => {
          const userInfo = res.userInfo;
          this.globalData.userInfo = userInfo;
          this.globalData.isLogin = true;
          wx.setStorageSync('userInfo', userInfo);
          resolve(userInfo);
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  }
});
