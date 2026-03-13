Page({
  data: {
    order: null,
    loading: true,
    qrcodeUrl: ''
  },

  onLoad: function (options) {
    const { id } = options;
    if (id) {
      this.orderId = id;
      this.loadOrderDetail();
    }
  },

  loadOrderDetail: function () {
    const order = {
      _id: this.orderId || '1',
      orderNo: 'ORD20230101001',
      movieTitle: '流浪地球2',
      moviePoster: 'https://picsum.photos/300/420?random=71',
      cinemaName: '万达影城（万达广场店）',
      hallName: 'IMAX厅',
      date: '2023-01-22',
      startTime: '14:30',
      seats: [{row: 5, col: 8}, {row: 5, col: 9}],
      totalPrice: 136,
      status: 'paid',
      createTime: '2023-01-20 10:30:00',
      payTime: '2023-01-20 10:32:00'
    };
    this.setData({ order: order, loading: false });
    this.generateQRCode();
  },

  generateQRCode: function () {
    const qrcodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${this.data.order.orderNo}`;
    this.setData({ qrcodeUrl: qrcodeUrl });
  },

  onPay: function () {
    wx.showLoading({ title: '支付中...' });
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({ title: '支付成功', icon: 'success' });
      this.loadOrderDetail();
    }, 1000);
  },

  onCancel: function () {
    wx.showModal({
      title: '提示',
      content: '确定要取消订单吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '取消成功', icon: 'success' });
        }
      }
    });
  },

  onCopyOrderNo: function () {
    wx.setClipboardData({
      data: this.data.order.orderNo,
      success: () => {
        wx.showToast({ title: '已复制订单号', icon: 'success' });
      }
    });
  }
});
