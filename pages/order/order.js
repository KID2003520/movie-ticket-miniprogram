Page({
  data: {
    orders: [],
    loading: true,
    currentStatus: '',
    statusList: [
      { value: '', label: '全部' },
      { value: 'pending', label: '待支付' },
      { value: 'paid', label: '已支付' },
      { value: 'used', label: '已完成' }
    ]
  },

  onLoad: function () {
    this.loadOrders();
  },

  loadOrders: function () {
    const allOrders = [
      { _id: '1', orderNo: 'ORD20230101001', movieTitle: '流浪地球2', moviePoster: 'https://picsum.photos/300/420?random=61', cinemaName: '万达影城', date: '2023-01-22', startTime: '14:30', hallName: 'IMAX厅', seats: [{row: 5, col: 8}, {row: 5, col: 9}], totalPrice: 70, status: 'paid', createTime: '2023-01-20 10:30' },
      { _id: '2', orderNo: 'ORD20230101002', movieTitle: '满江红', moviePoster: 'https://picsum.photos/300/420?random=62', cinemaName: 'CGV影城', date: '2023-01-23', startTime: '16:00', hallName: '杜比厅', seats: [{row: 3, col: 6}], totalPrice: 38, status: 'pending', createTime: '2023-01-21 15:20' },
      { _id: '3', orderNo: 'ORD20230101003', movieTitle: '熊出没·伴我"熊芯"', moviePoster: 'https://picsum.photos/300/420?random=63', cinemaName: '金逸影城', date: '2023-01-24', startTime: '10:00', hallName: '3号厅', seats: [{row: 2, col: 4}, {row: 2, col: 5}], totalPrice: 60, status: 'used', createTime: '2023-01-22 09:00' }
    ];
    
    let filteredOrders = allOrders;
    if (this.data.currentStatus) {
      filteredOrders = allOrders.filter(order => order.status === this.data.currentStatus);
    }
    
    this.setData({ orders: filteredOrders, loading: false });
  },

  onStatusChange: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ currentStatus: status, loading: true });
    this.loadOrders();
  },

  onOrderTap: function (e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` });
  },

  onPay: function (e) {
    const { id } = e.currentTarget.dataset;
    wx.showToast({ title: '支付成功', icon: 'success' });
    this.loadOrders();
  }
});
