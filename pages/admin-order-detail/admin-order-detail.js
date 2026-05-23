const backendApi = require('../../utils/backendApi.js');
const appConfig = require('../../utils/config.js');

const STATUS_LABEL = {
  pending: '待支付',
  paid: '已支付',
  used: '已使用',
  cancelled: '已取消',
  refunded: '已退款'
};

function formatOrder(d) {
  const cents = Number(d.totalPrice) || 0;
  const seats = d.seats || [];
  const seatText =
    seats.length > 0
      ? seats
          .map((s) => `${s.row}排${s.col}座`)
          .join('、')
      : '—';
  return {
    ...d,
    statusLabel: STATUS_LABEL[d.status] || d.status,
    priceYuan: (cents / 100).toFixed(2),
    seatText,
    createTime: String(d.createTime || '').slice(0, 19),
    payTime: d.payTime ? String(d.payTime).slice(0, 19) : '',
    refundRequestTime: d.refundRequestTime ? String(d.refundRequestTime).slice(0, 19) : ''
  };
}

Page({
  data: {
    orderId: '',
    order: null,
    loadErr: '',
    note: ''
  },

  onLoad(options) {
    const id = (options && options.id) || '';
    if (!id) {
      this.setData({ loadErr: '缺少订单 ID' });
      return;
    }
    this.setData({ orderId: id });
    this.refresh();
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  refresh() {
    if (!appConfig.USE_BACKEND_ONLY) {
      this.setData({ loadErr: '请开启后端模式' });
      return;
    }
    backendApi
      .getAdminOrderDetail(this.data.orderId)
      .then((body) => {
        const d = (body && body.data) || null;
        if (!d) {
          this.setData({ order: null, loadErr: '无数据' });
          return;
        }
        this.setData({ order: formatOrder(d), loadErr: '' });
      })
      .catch((err) => {
        this.setData({ order: null, loadErr: (err && err.message) || '加载失败' });
      });
  },

  onSyncAlipay() {
    const note = (this.data.note || '').trim();
    backendApi.adminOrderSyncAlipay(this.data.orderId, { note }).then((body) => {
      const al = (body && body.data && body.data.alipay) || {};
      const ts = al.tradeStatus || '';
      const synced = body && body.data && body.data.synced;
      wx.showToast({
        title: ts ? `支付宝:${ts}${synced ? ' 已补账' : ''}` : synced ? '已补记账' : '已核对',
        icon: 'none',
        duration: 2500
      });
      this.refresh();
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '失败', icon: 'none' });
    });
  },

  onCancelPending() {
    wx.showModal({
      title: '取消待支付',
      content: '将释放座位与锁券，确定？',
      success: (res) => {
        if (!res.confirm) return;
        backendApi
          .adminOrderCancelPending(this.data.orderId, { note: (this.data.note || '').trim() })
          .then(() => {
            wx.showToast({ title: '已取消' });
            this.refresh();
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '失败', icon: 'none' }));
      }
    });
  },

  onRefundRequest() {
    backendApi
      .adminOrderRefundRequest(this.data.orderId, { note: (this.data.note || '').trim() })
      .then(() => {
        wx.showToast({ title: '已标记待审批' });
        this.refresh();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '失败', icon: 'none' }));
  },

  onRefundApprove() {
    wx.showModal({
      title: '批准退款',
      content: '将释放座位并冲正积分，确定？',
      success: (res) => {
        if (!res.confirm) return;
        backendApi
          .adminOrderRefundApprove(this.data.orderId, { note: (this.data.note || '').trim() })
          .then(() => {
            wx.showToast({ title: '已退款' });
            this.refresh();
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '失败', icon: 'none' }));
      }
    });
  },

  onRefundReject() {
    backendApi
      .adminOrderRefundReject(this.data.orderId, { note: (this.data.note || '').trim() })
      .then(() => {
        wx.showToast({ title: '已驳回' });
        this.refresh();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '失败', icon: 'none' }));
  },

  onRefundDirect() {
    wx.showModal({
      title: '强制退款',
      content: '跳过审批流程，直接退款，仅用于异常场景。确定？',
      success: (res) => {
        if (!res.confirm) return;
        backendApi
          .adminOrderRefundDirect(this.data.orderId, { note: (this.data.note || '').trim() })
          .then(() => {
            wx.showToast({ title: '已退款' });
            this.refresh();
          })
          .catch((err) => wx.showToast({ title: (err && err.message) || '失败', icon: 'none' }));
      }
    });
  }
});
