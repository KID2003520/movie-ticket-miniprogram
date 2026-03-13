const db = wx.cloud.database();
const _ = db.command;

const request = (cloudName, data = {}) => {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: cloudName,
      data: data
    }).then(res => {
      if (res.result.code === 0) {
        resolve(res.result.data);
      } else {
        reject(res.result);
      }
    }).catch(err => {
      reject(err);
    });
  });
};

const formatDate = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (!date) return '';
  
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  const second = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second);
};

const formatPrice = (price) => {
  return (price / 100).toFixed(2);
};

const showToast = (title, icon = 'none', duration = 2000) => {
  wx.showToast({
    title: title,
    icon: icon,
    duration: duration
  });
};

const showLoading = (title = '加载中...') => {
  wx.showLoading({
    title: title,
    mask: true
  });
};

const hideLoading = () => {
  wx.hideLoading();
};

const showModal = (content, title = '提示') => {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: title,
      content: content,
      success: (res) => {
        if (res.confirm) {
          resolve(true);
        } else {
          resolve(false);
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

const checkLogin = () => {
  const app = getApp();
  return app.globalData.isLogin;
};

const requireLogin = (callback) => {
  if (checkLogin()) {
    callback && callback();
  } else {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  }
};

const debounce = (fn, delay = 500) => {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
};

const throttle = (fn, delay = 500) => {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= delay) {
      fn.apply(this, args);
      lastTime = now;
    }
  };
};

module.exports = {
  db,
  _,
  request,
  formatDate,
  formatPrice,
  showToast,
  showLoading,
  hideLoading,
  showModal,
  checkLogin,
  requireLogin,
  debounce,
  throttle
};
