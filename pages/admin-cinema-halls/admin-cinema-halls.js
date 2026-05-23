const appConfig = require('../../utils/config.js');
const backendApi = require('../../utils/backendApi.js');

function emptyForm() {
  return {
    _id: '',
    name: '',
    hallType: '普通厅',
    seatRows: '8',
    seatCols: '12',
    sortOrder: '0'
  };
}

Page({
  data: {
    cinemaId: '',
    cinemaName: '',
    loading: false,
    halls: [],
    showFormModal: false,
    isEdit: false,
    form: emptyForm()
  },

  onLoad(query) {
    const cinemaId = decodeURIComponent(String(query.cinemaId || '').trim());
    const cinemaName = decodeURIComponent(String(query.name || '').trim());
    if (!cinemaId) {
      wx.showToast({ title: '缺少影院', icon: 'none' });
      return;
    }
    this.setData({ cinemaId, cinemaName });
    wx.setNavigationBarTitle({ title: (cinemaName || '影院') + ' · 影厅' });
    this.loadHalls();
  },

  onPullDownRefresh() {
    this.loadHalls().finally(() => wx.stopPullDownRefresh());
  },

  loadHalls() {
    if (!appConfig.USE_BACKEND_ONLY) {
      wx.showToast({ title: '仅后端模式支持', icon: 'none' });
      return Promise.resolve();
    }
    const { cinemaId } = this.data;
    if (!cinemaId) return Promise.resolve();
    this.setData({ loading: true });
    return backendApi
      .getAdminCinemaHalls(cinemaId)
      .then((body) => {
        this.setData({
          halls: (body.data && body.data.items) || []
        });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      })
      .finally(() => this.setData({ loading: false }));
  },

  onAddHall() {
    this.setData({
      showFormModal: true,
      isEdit: false,
      form: emptyForm()
    });
  },

  onEditHall(e) {
    const id = String(e.currentTarget.dataset.id || '');
    const item = (this.data.halls || []).find((h) => String(h._id) === id);
    if (!item) return;
    this.setData({
      showFormModal: true,
      isEdit: true,
      form: {
        _id: item._id,
        name: item.name || '',
        hallType: item.hallType || '普通厅',
        seatRows: String(item.seatRows != null ? item.seatRows : 8),
        seatCols: String(item.seatCols != null ? item.seatCols : 12),
        sortOrder: String(item.sortOrder != null ? item.sortOrder : 0)
      }
    });
  },

  onDeleteHall(e) {
    const hallId = String(e.currentTarget.dataset.id || '');
    const { cinemaId } = this.data;
    if (!hallId || !cinemaId) return;
    wx.showModal({
      title: '确认删除',
      content: '删除影厅记录；已生成的排期不会自动变更，需重建排片后才会按新厅配置生成。',
      success: (res) => {
        if (!res.confirm) return;
        backendApi
          .deleteAdminCinemaHall(cinemaId, hallId)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadHalls();
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
    const { cinemaId, isEdit, form } = this.data;
    const name = String(form.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写影厅名称', icon: 'none' });
      return;
    }
    const seatRows = Math.max(4, Math.min(30, parseInt(String(form.seatRows || '8'), 10) || 8));
    const seatCols = Math.max(6, Math.min(30, parseInt(String(form.seatCols || '12'), 10) || 12));
    const sortOrder = parseInt(String(form.sortOrder || '0'), 10);
    const hallType = String(form.hallType || '').trim() || '普通厅';

    const payload = { name, hallType, seatRows, seatCols, sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0 };
    const req = isEdit
      ? backendApi.updateAdminCinemaHall(cinemaId, form._id, payload)
      : backendApi.createAdminCinemaHall(cinemaId, payload);

    req
      .then(() => {
        wx.showToast({ title: isEdit ? '更新成功' : '创建成功', icon: 'success' });
        this.onCloseForm();
        this.loadHalls();
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      });
  }
});
