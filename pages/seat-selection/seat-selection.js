Page({
  data: {
    schedule: null,
    seats: [],
    selectedSeats: [],
    rows: 8,
    cols: 12,
    loading: true,
    totalPrice: 0
  },

  onLoad: function (options) {
    const { id } = options;
    this.scheduleId = id;
    this.loadScheduleDetail();
  },

  loadScheduleDetail: function () {
    const schedule = {
      _id: this.scheduleId || '1',
      movieTitle: '流浪地球2',
      moviePoster: 'https://picsum.photos/300/420?random=81',
      hallName: 'IMAX厅',
      date: '2023-01-22',
      startTime: '14:30',
      price: 68
    };
    this.setData({ schedule: schedule, loading: false });
    this.generateSeats();
  },

  generateSeats: function () {
    const seats = [];
    for (let row = 0; row < this.data.rows; row++) {
      const rowSeats = [];
      for (let col = 0; col < this.data.cols; col++) {
        const sold = Math.random() > 0.7;
        rowSeats.push({
          row: row + 1,
          col: col + 1,
          status: sold ? 'sold' : 'available'
        });
      }
      seats.push(rowSeats);
    }
    this.setData({ seats: seats });
  },

  onSeatTap: function (e) {
    const { row, col, status } = e.currentTarget.dataset;
    if (status === 'sold') {
      wx.showToast({ title: '该座位已售出', icon: 'none' });
      return;
    }

    const selectedSeats = [...this.data.selectedSeats];
    const seatIndex = selectedSeats.findIndex(s => s.row === row && s.col === col);

    if (seatIndex !== -1) {
      selectedSeats.splice(seatIndex, 1);
    } else {
      if (selectedSeats.length >= 4) {
        wx.showToast({ title: '最多选择4个座位', icon: 'none' });
        return;
      }
      selectedSeats.push({ row, col });
    }

    const seats = this.data.seats.map(rowSeats =>
      rowSeats.map(seat => {
        const isSelected = selectedSeats.some(s => s.row === seat.row && s.col === seat.col);
        return {
          ...seat,
          status: isSelected ? 'selected' : seat.status === 'selected' ? 'available' : seat.status
        };
      })
    );

    const totalPrice = selectedSeats.length * this.data.schedule.price;
    this.setData({ selectedSeats: selectedSeats, seats: seats, totalPrice: totalPrice });
  },

  onSubmit: function () {
    if (this.data.selectedSeats.length === 0) {
      wx.showToast({ title: '请选择座位', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '提交中...' });
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({ title: '下单成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/order/order' });
      }, 1500);
    }, 1000);
  }
});
