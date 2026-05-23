const app = getApp();
const appConfig = require('../../utils/config.js');
const backendApi = require('../../utils/backendApi.js');

const PROFILE_CACHE = 'userProfileCacheV1';

const PRESET_TAGS = ['动作', '喜剧', '爱情', '科幻', '悬疑', '动画', '文艺', '惊悚', '纪录片', '亲子'];

function maskPhone(phone) {
  const s = String(phone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(s)) return '';
  return `${s.slice(0, 3)}****${s.slice(7)}`;
}

function backendBase() {
  const u = appConfig.BACKEND_BASE_URL || 'http://127.0.0.1:3000';
  return String(u).replace(/\/$/, '');
}

function fullMediaUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  const s = String(pathOrUrl);
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return backendBase() + s;
  return s;
}

function mergeUserStorage(profile) {
  try {
    const user = wx.getStorageSync('userInfo') || {};
    const next = {
      ...user,
      nickName: profile.nickName != null ? profile.nickName : user.nickName,
      avatarUrl: profile.avatarUrl != null ? profile.avatarUrl : user.avatarUrl,
      preferenceTags: Array.isArray(profile.preferenceTags) ? profile.preferenceTags : user.preferenceTags || []
    };
    wx.setStorageSync('userInfo', next);
    if (app && app.globalData) {
      app.globalData.userInfo = next;
    }
  } catch (e) {
    console.warn(e);
  }
}

Page({
  data: {
    loadingRemote: false,
    useBackend: false,
    existsInDb: true,
    nickName: '',
    avatarUrl: '',
    displayAvatar: '',
    phoneMasked: '',
    hasBoundPhone: false,
    hasPassword: false,
    preferenceTags: [],
    presetTags: PRESET_TAGS,
    phoneModal: false,
    newPhone: '',
    verifyPassword: ''
  },

  noop() {},

  onLoad() {
    this.setData({ useBackend: !!appConfig.USE_BACKEND_ONLY });
    this.paintFromLocal();
    if (this.data.useBackend) {
      this.refreshFromServer(true);
    }
  },

  onShow() {
    // 仅合并本地缓存，避免每次 onShow 拉服务端覆盖用户正在编辑的昵称/标签
    this.paintFromLocal();
  },

  onPullDownRefresh() {
    if (!this.data.useBackend) {
      wx.stopPullDownRefresh();
      return;
    }
    this.refreshFromServer(false).finally(() => wx.stopPullDownRefresh());
  },

  paintFromLocal() {
    try {
      const cache = wx.getStorageSync(PROFILE_CACHE);
      const user = wx.getStorageSync('userInfo') || {};
      const p = cache && cache.profile ? cache.profile : null;
      this.applyView(p, user);
    } catch (e) {
      console.warn(e);
    }
  },

  applyView(profile, user) {
    const userTags = Array.isArray(user.preferenceTags) ? user.preferenceTags : [];
    const nick = (profile && profile.nickName) || user.nickName || '';
    const avatar = (profile && profile.avatarUrl) || user.avatarUrl || '';
    let phoneMasked = (profile && profile.phoneMasked) || '';
    if (!phoneMasked && user.phone) phoneMasked = maskPhone(user.phone);
    if (!phoneMasked) phoneMasked = '';

    let existsInDb = true;
    if (profile && Object.prototype.hasOwnProperty.call(profile, 'existsInDb')) {
      existsInDb = !!profile.existsInDb;
    } else if (!profile) {
      existsInDb = /^1[3-9]\d{9}$/.test(String(user.phone || '').trim());
    }
    const hasBoundPhone =
      (profile && profile.hasBoundPhone) || /^1[3-9]\d{9}$/.test(String(user.phone || '').trim());
    const hasPassword = !!(profile && profile.hasPassword);
    const tags =
      profile && Array.isArray(profile.preferenceTags) && profile.preferenceTags.length
        ? profile.preferenceTags
        : userTags;

    this.setData({
      existsInDb,
      nickName: nick,
      avatarUrl: avatar,
      displayAvatar: fullMediaUrl(avatar) || 'https://picsum.photos/100/100?random=88',
      phoneMasked: phoneMasked || (existsInDb ? '未绑定' : '仅本地'),
      hasBoundPhone: !!hasBoundPhone,
      hasPassword: !!hasPassword,
      preferenceTags: tags
    });
  },

  refreshFromServer(silent) {
    if (!this.data.useBackend) return Promise.resolve();
    const user = wx.getStorageSync('userInfo');
    if (!user || !wx.getStorageSync('isLogin')) return Promise.resolve();
    this.setData({ loadingRemote: true });
    return backendApi
      .getUserProfile()
      .then((res) => {
        const d = (res && res.data) || {};
        wx.setStorageSync(PROFILE_CACHE, { profile: d, savedAt: Date.now() });
        const u = wx.getStorageSync('userInfo') || {};
        this.applyView(d, u);
        if (d.existsInDb) {
          mergeUserStorage({
            nickName: d.nickName,
            avatarUrl: d.avatarUrl,
            preferenceTags: d.preferenceTags || []
          });
        }
        if (!silent) {
          wx.showToast({ title: '已更新', icon: 'success', duration: 1200 });
        }
      })
      .catch(() => {
        if (!silent) wx.showToast({ title: '网络异常，已保留本地展示', icon: 'none' });
      })
      .finally(() => {
        this.setData({ loadingRemote: false });
      });
  },

  onNickInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  onToggleTag(e) {
    const tag = e.currentTarget.dataset.tag;
    if (!tag) return;
    const list = (this.data.preferenceTags || []).slice();
    const i = list.indexOf(tag);
    if (i >= 0) list.splice(i, 1);
    else if (list.length < 8) list.push(tag);
    else {
      wx.showToast({ title: '最多选择 8 个标签', icon: 'none' });
      return;
    }
    this.setData({ preferenceTags: list });
  },

  onSaveProfile() {
    if (!this.data.useBackend) {
      wx.showToast({ title: '当前非仅后端模式，资料仅存本地', icon: 'none' });
      return;
    }
    const nick = String(this.data.nickName || '').trim();
    if (!nick || nick.length > 32) {
      wx.showToast({ title: '请填写 1～32 字昵称', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中' });
    backendApi
      .patchUserProfile({
        nickName: nick,
        preferenceTags: this.data.preferenceTags
      })
      .then((res) => {
        const d = (res && res.data) || {};
        wx.setStorageSync(PROFILE_CACHE, { profile: d, savedAt: Date.now() });
        mergeUserStorage({
          nickName: d.nickName,
          avatarUrl: d.avatarUrl,
          preferenceTags: d.preferenceTags || []
        });
        const u = wx.getStorageSync('userInfo') || {};
        this.applyView(d, u);
        wx.showToast({ title: '已保存', icon: 'success' });
      })
      .catch((err) => {
        const msg = (err && (err.message || err.errMsg)) || '保存失败';
        wx.showToast({ title: String(msg).slice(0, 36), icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  },

  onChooseAvatar(e) {
    if (!this.data.useBackend) {
      wx.showToast({ title: '请开启仅后端模式后上传头像', icon: 'none' });
      return;
    }
    const localPath = e.detail.avatarUrl;
    if (!localPath) return;
    wx.showLoading({ title: '上传中' });
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: localPath,
      encoding: 'base64',
      success: (r) => {
        const raw = r.data;
        backendApi
          .uploadProfileAvatarBase64(String(raw))
          .then((res) => {
            const url = res && res.data && res.data.avatarUrl;
            if (!url) throw new Error('无返回地址');
            mergeUserStorage({ avatarUrl: url });
            this.setData({
              avatarUrl: url,
              displayAvatar: fullMediaUrl(url)
            });
            wx.showToast({ title: '头像已更新', icon: 'success' });
            this.refreshFromServer(true);
          })
          .catch((err) => {
            const msg = (err && (err.message || err.errMsg)) || '上传失败';
            wx.showToast({ title: String(msg).slice(0, 36), icon: 'none' });
          })
          .finally(() => wx.hideLoading());
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '读取头像失败', icon: 'none' });
      }
    });
  },

  openPhoneModal() {
    this.setData({ phoneModal: true, newPhone: '', verifyPassword: '' });
  },

  closePhoneModal() {
    this.setData({ phoneModal: false });
  },

  onNewPhoneInput(e) {
    this.setData({ newPhone: e.detail.value });
  },

  onPwdInput(e) {
    this.setData({ verifyPassword: e.detail.value });
  },

  submitPhoneChange() {
    const newPhone = String(this.data.newPhone || '').trim();
    const password = String(this.data.verifyPassword || '');
    if (!/^1[3-9]\d{9}$/.test(newPhone)) {
      wx.showToast({ title: '新手机号格式不正确', icon: 'none' });
      return;
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '提交中' });
    backendApi
      .changeProfilePhone({ newPhone, password })
      .then((res) => {
        const d = (res && res.data) || {};
        wx.setStorageSync(PROFILE_CACHE, { profile: d, savedAt: Date.now() });
        const user = wx.getStorageSync('userInfo') || {};
        user.phone = newPhone;
        wx.setStorageSync('userInfo', user);
        if (app && app.globalData) app.globalData.userInfo = user;
        this.applyView(d, user);
        this.closePhoneModal();
        wx.showToast({ title: '手机号已更新', icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '修改失败', icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  }
});
