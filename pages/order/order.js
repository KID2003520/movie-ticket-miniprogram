const util = require('../../utils/util.js');
const dataStorage = require('../../utils/data-storage.js');
const backendApi = require('../../utils/backendApi.js');
const appConfig = require('../../utils/config.js');

Page({
  data: {
    orders: [],
    loading: true,
    currentStatus: '',
    statusList: [
      { value: '', label: '全部' },
      { value: 'pending', label: '待支付' },
      { value: 'paid', label: '已支付' },
      { value: 'cancelled', label: '已取消' },
      { value: 'refunded', label: '已退款' }
    ],
    page: 1,
    hasMore: true,
    alipayEnabled: false
  },

  onLoad(options) {
    const statusFromQuery = options && options.status !== undefined ? String(options.status) : '';
    if (statusFromQuery) {
      this.setData({ currentStatus: statusFromQuery });
    }
    this.refreshPayCapabilities();
    this.loadOrders();
  },

  onShow() {
    this.refreshPayCapabilities();
  },

  async refreshPayCapabilities() {
    if (!appConfig.USE_BACKEND_ONLY) {
      this.setData({ alipayEnabled: false });
      return;
    }
    try {
      const res = await backendApi.getPayCapabilities();
      const alipay = !!(res && res.data && res.data.alipay);
      this.setData({ alipayEnabled: alipay });
    } catch (_) {
      this.setData({ alipayEnabled: false });
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true });
    this.loadOrders(true);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadOrders();
    }
  },

  async loadOrders(refresh = false) {
    const app = getApp();
    wx.showLoading({ title: '加载订单中...' });
    try {
      const openid = wx.getStorageSync('openid') || app.globalData.openid || '';
      const res = await backendApi.getOrders({
        status: this.data.currentStatus,
        page: this.data.page,
        pageSize: 20,
        openid
      });

      const items = res && res.data && res.data.items ? res.data.items : [];
      const orders = items.map((o) => ({
        ...o,
        totalPrice: o.totalPrice / 100,
        createTime: util.formatDate(o.createTime, 'YYYY-MM-DD HH:mm')
      }));

      this.setData({
        orders: refresh ? orders : [...this.data.orders, ...orders],
        loading: false,
        hasMore: orders.length === 20
      });
      if (refresh) wx.stopPullDownRefresh();
    } catch (e) {
      console.error('加载订单失败(后端):', e);
      this.loadLocalOrders(refresh);
    } finally {
      wx.hideLoading();
    }
  },

  loadLocalOrders(refresh = false) {
    let orders = dataStorage.getOrders();
    let filteredOrders = orders;

    if (this.data.currentStatus) {
      filteredOrders = orders.filter((o) => o.status === this.data.currentStatus);
    }

    const pageSize = 20;
    const start = (this.data.page - 1) * pageSize;
    const pagedOrders = filteredOrders.slice(start, start + pageSize).map((o) => ({
      ...o,
      totalPrice: o.totalPrice / 100,
      createTime: util.formatDate(o.createTime, 'YYYY-MM-DD HH:mm')
    }));

    this.setData({
      orders: refresh ? pagedOrders : [...this.data.orders, ...pagedOrders],
      loading: false,
      hasMore: start + pageSize < filteredOrders.length
    });

    if (refresh) wx.stopPullDownRefresh();
  },

  onStatusChange(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      currentStatus: status,
      loading: true,
      page: 1,
      orders: [],
      hasMore: true
    });
    this.loadOrders();
  },

  onOrderTap(e) {
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${e.currentTarget.dataset.id}`
    });
  },

  async onAlipayPay(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.showLoading({ title: '获取支付页...' });
    try {
      const res = await backendApi.prepareAlipayPay(orderId);
      wx.hideLoading();
      if (!res || !res.data || !res.data.bridgeUrl) {
        util.showToast((res && res.message) || '无法发起支付', 'none');
        return;
      }
      const u = encodeURIComponent(res.data.bridgeUrl);
      wx.navigateTo({ url: `/pages/pay-alipay/pay-alipay?url=${u}` });
    } catch (err) {
      wx.hideLoading();
      const msg =
        (err && (err.message || (err.data && err.message))) || (err && err.errMsg) || '发起支付失败';
      util.showToast(typeof msg === 'string' ? msg : '发起支付失败', 'none');
    }
  },

  async onPay(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.showLoading({ title: '支付中...' });
    try {
      const res = await backendApi.mockPay(orderId);
      if (res && res.code === 0) {
        util.showToast('支付成功', 'success');
        this.setData({ page: 1, orders: [] });
        this.loadOrders(true);
      } else {
        util.showToast((res && res.message) || '支付失败', 'none');
      }
    } catch (err) {
      console.error('支付失败:', err);
      util.showToast('支付失败', 'none');
    } finally {
      wx.hideLoading();
    }
  },

  async onDelete(e) {
    const orderId = e.currentTarget.dataset.id;

    wx.showModal({
      title: '提示',
      content: '确定要删除此订单吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await backendApi.deleteOrder(orderId);
          dataStorage.deleteOrder(orderId);
          util.showToast('删除成功', 'success');
          this.setData({ page: 1, orders: [] });
          this.loadOrders(true);
        } catch (err) {
          console.error('删除订单失败(后端):', err);
          util.showToast((err && err.message) || '删除失败', 'none');
        }
      }
    });
  }
});
