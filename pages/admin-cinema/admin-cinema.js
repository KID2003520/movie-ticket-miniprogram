const appConfig = require('../../utils/config.js');
const backendApi = require('../../utils/backendApi.js');

function emptyForm() {
  return {
    _id: '',
    name: '',
    city: '',
    address: '',
    phone: '',
    latitude: '',
    longitude: '',
    minPrice: '',
    tagsText: ''
  };
}

Page({
  data: {
    loading: false,
    keyword: '',
    cinemas: [],
    showFormModal: false,
    isEdit: false,
    form: emptyForm()
  },

  onLoad() {
    this.loadCinemas();
  },

  onShow() {
    this.loadCinemas();
  },

  onPullDownRefresh() {
    this.loadCinemas().finally(() => wx.stopPullDownRefresh());
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  onSearch() {
    this.loadCinemas();
  },

  loadCinemas() {
    if (!appConfig.USE_BACKEND_ONLY) {
      wx.showToast({ title: '仅后端模式支持影院管理', icon: 'none' });
      return Promise.resolve();
    }
    this.setData({ loading: true });
    return backendApi
      .getAdminCinemas({ keyword: this.data.keyword })
      .then((body) => {
        this.setData({
          cinemas: (body.data && body.data.items) || []
        });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      })
      .finally(() => this.setData({ loading: false }));
  },

  onAddCinema() {
    this.setData({
      showFormModal: true,
      isEdit: false,
      form: emptyForm()
    });
  },

  onManageHalls(e) {
    if (!appConfig.USE_BACKEND_ONLY) {
      wx.showToast({ title: '仅后端模式支持', icon: 'none' });
      return;
    }
    const id = String(e.currentTarget.dataset.id || '');
    const name = String(e.currentTarget.dataset.name || '');
    if (!id) return;
    wx.navigateTo({
      url: `/pages/admin-cinema-halls/admin-cinema-halls?cinemaId=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`
    });
  },

  onEditCinema(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const item = (this.data.cinemas || []).find((c) => String(c._id) === id);
    if (!item) return;
    this.setData({
      showFormModal: true,
      isEdit: true,
      form: {
        _id: item._id,
        name: item.name || '',
        city: item.city || '',
        address: item.address || '',
        phone: item.phone || '',
        latitude: item.latitude != null ? String(item.latitude) : '',
        longitude: item.longitude != null ? String(item.longitude) : '',
        minPrice: item.minPrice != null ? String(item.minPrice) : '',
        tagsText: Array.isArray(item.tags) ? item.tags.join(',') : ''
      }
    });
  },

  onDeleteCinema(e) {
    const id = String(e.currentTarget.dataset.id || '');
    wx.showModal({
      title: '确认删除',
      content: '删除后将同时删除该影院影厅、排片与座位数据，是否继续？',
      success: (res) => {
        if (!res.confirm) return;
        backendApi
          .deleteAdminCinema(id)
          .then(() => {
            wx.showToast({ title: '删除成功', icon: 'success' });
            this.loadCinemas();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
          });
      }
    });
  },

  onCloseForm() {
    this.setData({
      showFormModal: false,
      isEdit: false,
      form: emptyForm()
    });
  },

  onFormInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value || '';
    this.setData({
      form: {
        ...this.data.form,
        [key]: value
      }
    });
  },

  onSubmitForm() {
    const f = this.data.form;
    const payload = {
      name: String(f.name || '').trim(),
      city: String(f.city || '').trim(),
      address: String(f.address || '').trim(),
      phone: String(f.phone || '').trim(),
      latitude: Number(f.latitude || 0),
      longitude: Number(f.longitude || 0),
      minPrice: Number(f.minPrice || 0),
      tags: String(f.tagsText || '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
    };

    if (!payload.name || !payload.address) {
      wx.showToast({ title: '请填写影院名称和地址', icon: 'none' });
      return;
    }

    const req = this.data.isEdit
      ? backendApi.updateAdminCinema(f._id, payload)
      : backendApi.createAdminCinema(payload);

    req
      .then(() => {
        wx.showToast({ title: this.data.isEdit ? '更新成功' : '创建成功', icon: 'success' });
        this.onCloseForm();
        this.loadCinemas();
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      });
  }
});
