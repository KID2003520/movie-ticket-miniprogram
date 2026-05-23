const backendApi = require('../../utils/backendApi.js');
const appConfig = require('../../utils/config.js');

const STATUS_VALUES = ['', 'pending', 'paid', 'used', 'cancelled', 'refunded'];
const STATUS_LABELS = ['全部状态', '待支付', '已支付', '已使用', '已取消', '已退款'];
const FILTER_VALUES = ['', 'abnormal', 'refund_queue'];
const FILTER_LABELS = ['全部记录', '异常视图', '待退款审批'];

function statusLabel(st) {
  const i = STATUS_VALUES.indexOf(st);
  return i > 0 ? STATUS_LABELS[i] : st || '未知';
}

function mapItem(o) {
  const cents = Number(o.totalPrice) || 0;
  return {
    ...o,
    statusLabel: statusLabel(o.status),
    priceYuan: (cents / 100).toFixed(2)
  };
}

Page({
  data: {
    statusIndex: 0,
    statusLabels: STATUS_LABELS,
    filterIndex: 0,
    filterLabels: FILTER_LABELS,
    orderNo: '',
    userKeyword: '',
    scheduleId: '',
    items: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    total: -1
  },

  onLoad() {
    this.loadList(true);
  },

  onPullDownRefresh() {
    this.loadList(true).finally(() => wx.stopPullDownRefresh());
  },

  onStatusPick(e) {
    const i = Number(e.detail.value) || 0;
    this.setData({ statusIndex: i });
    this.loadList(true);
  },

  onFilterPick(e) {
    const i = Number(e.detail.value) || 0;
    this.setData({ filterIndex: i });
    this.loadList(true);
  },

  onOrderNo(e) {
    this.setData({ orderNo: e.detail.value });
  },

  onUserKw(e) {
    this.setData({ userKeyword: e.detail.value });
  },

  onScheduleId(e) {
    this.setData({ scheduleId: e.detail.value });
  },

  onSearch() {
    this.loadList(true);
  },

  onReset() {
    this.setData({
      statusIndex: 0,
      filterIndex: 0,
      orderNo: '',
      userKeyword: '',
      scheduleId: ''
    });
    this.loadList(true);
  },

  onLoadMore() {
    if (!this.data.hasMore || this.data.loading) return;
    const nextPage = this.data.page + 1;
    this.loadList(false, nextPage);
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/admin-order-detail/admin-order-detail?id=${encodeURIComponent(id)}` });
  },

  loadList(reset, explicitPage) {
    if (!appConfig.USE_BACKEND_ONLY) {
      wx.showToast({ title: '请开启后端模式', icon: 'none' });
      return Promise.resolve();
    }
    const page = reset ? 1 : explicitPage != null ? explicitPage : this.data.page;
    if (reset) {
      this.setData({ page: 1, hasMore: true, items: [] });
    }
    this.setData({ loading: true });
    const status = STATUS_VALUES[this.data.statusIndex] || '';
    const filter = FILTER_VALUES[this.data.filterIndex] || '';
    return backendApi
      .getAdminOrders({
        status,
        filter,
        orderNo: (this.data.orderNo || '').trim(),
        userKeyword: (this.data.userKeyword || '').trim(),
        scheduleId: (this.data.scheduleId || '').trim(),
        page,
        pageSize: this.data.pageSize
      })
      .then((body) => {
        const d = (body && body.data) || {};
        const raw = d.items || [];
        const mapped = raw.map(mapItem);
        const items = reset ? mapped : this.data.items.concat(mapped);
        const hasMore = raw.length === this.data.pageSize;
        this.setData({
          items,
          hasMore,
          page,
          total: d.total != null ? Number(d.total) : -1,
          loading: false
        });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
        this.setData({ loading: false });
      });
  }
});
