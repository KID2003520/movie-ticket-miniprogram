const util = require('../../utils/util.js');
const backendApi = require('../../utils/backendApi.js');

Page({
  data: {
    schedule: null,
    seats: [],
    selectedSeats: [],
    rows: 8,
    cols: 12,
    loading: true,
    totalPrice: 0,
    selectedCoupon: null,
    showCouponPicker: false,
    availableCoupons: []
  },

  onLoad: function (options) {
    const { id } = options;
    const redirectUrl = `/pages/seat-selection/seat-selection?id=${id || ''}`;
    if (!util.checkLogin()) {
      wx.showModal({
        title: '请先登录',
        content: '登录账号后才能选座购票',
        confirmText: '去登录',
        cancelText: '返回',
        success: (res) => {
          if (res.confirm) {
            wx.redirectTo({ url: `/pages/login/login?redirect=${encodeURIComponent(redirectUrl)}` });
          } else {
            wx.navigateBack({ delta: 1 });
          }
        },
        fail: () => wx.navigateBack({ delta: 1 })
      });
      return;
    }
    this.scheduleId = id;
    this.loadScheduleDetail();
  },

  loadScheduleDetail: function () {
    wx.showLoading({ title: '加载场次中...' });
    backendApi
      .getScheduleDetail(this.scheduleId)
      .then((res) => {
        wx.hideLoading();
        if (!res || !res.data || !res.data.schedule) throw new Error('schedule数据缺失');

        const scheduleRes = res.data.schedule;
        const seatsRes = res.data.seats || [];

        const schedule = {
          ...scheduleRes,
          price: scheduleRes.priceCents / 100
        };
        this.setData({ schedule, loading: false, selectedCoupon: null, availableCoupons: [] });
        this.generateSeats(seatsRes);
        this.updateTotalPrice();
      })
      .catch(() => {
        wx.hideLoading();
        this.loadMockScheduleDetail();
      });
  },

  loadMockScheduleDetail: function () {
    const schedule = {
      _id: this.scheduleId || '1',
      movieId: '1',
      movieTitle: '流浪地球2',
      moviePoster: 'https://picsum.photos/300/420?random=1',
      cinemaId: '1',
      cinemaName: '万达影城（万达广场店）',
      hallName: 'IMAX厅',
      hallType: 'IMAX',
      date: util.formatDate(new Date(), 'YYYY-MM-DD'),
      startTime: '14:30',
      endTime: '17:23',
      price: 68,
      totalSeats: 96,
      availableSeats: 80
    };

    this.setData({ schedule, loading: false });
    this.generateSeats([]);
  },

  generateSeats: function (seatRecords) {
    const seatStatusPriority = (status) => {
      if (status === 'sold') return 3;
      if (status === 'locked') return 2;
      return 1; // available / 其他
    };

    // 将同一座位的多条记录合并成“最高优先级状态”
    const stateMap = new Map();
    for (const s of seatRecords || []) {
      const key = `${s.row}-${s.col}`;
      const prev = stateMap.get(key);
      const prevPriority = prev ? seatStatusPriority(prev) : 0;
      const nextPriority = seatStatusPriority(s.status);
      if (!prev || nextPriority > prevPriority) {
        stateMap.set(key, s.status);
      }
    }

    const seats = [];
    for (let row = 0; row < this.data.rows; row++) {
      const rowSeats = [];
      for (let col = 0; col < this.data.cols; col++) {
        const key = `${row + 1}-${col + 1}`;
        const state = stateMap.get(key) || 'available';
        rowSeats.push({
          row: row + 1,
          col: col + 1,
          status: state === 'sold' ? 'sold' : (state === 'locked' ? 'locked' : 'available')
        });
      }
      seats.push(rowSeats);
    }
    this.setData({ seats });
  },

  onSeatTap: function (e) {
    const { row, col, status } = e.currentTarget.dataset;
    if (status === 'sold' || status === 'locked') {
      wx.showToast({ title: status === 'sold' ? '该座位已售出' : '该座位正在占用中', icon: 'none' });
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

    this.setData({ selectedSeats: selectedSeats, seats: seats });
    this.ensureSelectedCouponStillEligible();
    this.updateTotalPrice();
  },

  onSubmit: function () {
    if (!util.requireLoginForPurchase(`/pages/seat-selection/seat-selection?id=${this.scheduleId || ''}`)) {
      return;
    }
    if (this.data.selectedSeats.length === 0) {
      wx.showToast({ title: '请选择座位', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '创建订单中...' });
    backendApi
      .createOrder({
        scheduleId: this.scheduleId,
        seats: this.data.selectedSeats,
        totalPriceCents: Math.round(this.data.totalPrice * 100),
        couponId: this.data.selectedCoupon ? this.data.selectedCoupon._id : ''
      })
      .then((res) => {
        wx.hideLoading();
        if (res && res.code === 0) {
          wx.showToast({ title: '订单创建成功', icon: 'success' });
          setTimeout(() => {
            wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${res.data.orderId}` });
          }, 1500);
        } else {
          wx.showToast({ title: (res && res.message) || '订单创建失败', icon: 'none' });
        }
      })
      .catch((err) => {
        wx.hideLoading();
        console.error('创建订单失败:', err);
        const msg = (err && err.message) || '订单创建失败';
        wx.showToast({ title: typeof msg === 'string' ? msg : '订单创建失败', icon: 'none' });
      });
  },

  updateTotalPrice: function () {
    if (!this.data.schedule) return;
    
    const basePrice = this.data.schedule.price * this.data.selectedSeats.length;
    let finalPrice = basePrice;
    
    // 应用优惠券
    if (this.data.selectedCoupon) {
      const coupon = this.data.selectedCoupon;
      if (basePrice >= coupon.minAmount) {
        finalPrice = basePrice - coupon.amount;
        if (finalPrice < 0) finalPrice = 0;
      }
    }
    
    this.setData({ totalPrice: finalPrice });
  },

  ensureSelectedCouponStillEligible: function () {
    const c = this.data.selectedCoupon;
    if (!c) return;
    const basePrice = (this.data.schedule ? this.data.schedule.price : 0) * this.data.selectedSeats.length;
    if (basePrice < c.minAmount) {
      this.setData({ selectedCoupon: null });
    }
  },

  onCouponTap: function () {
    if (!this.data.selectedSeats.length) {
      wx.showToast({ title: '请先选择座位', icon: 'none' });
      return;
    }
    const amountCents = Math.round((this.data.schedule ? this.data.schedule.price : 0) * this.data.selectedSeats.length * 100);
    wx.showLoading({ title: '加载优惠券...' });
    backendApi
      .getAvailableCoupons(amountCents)
      .then((res) => {
        wx.hideLoading();
        const all = (res && res.data && res.data.items) || [];
        const availableCoupons = all.filter((c) => !!c.eligible);
        if (!availableCoupons.length) {
          wx.showToast({ title: '暂无可用优惠券', icon: 'none' });
          return;
        }
        this.setData({ showCouponPicker: true, availableCoupons });
      })
      .catch((err) => {
        wx.hideLoading();
        const msg = (err && err.message) || '加载失败';
        wx.showToast({ title: typeof msg === 'string' ? msg : '加载失败', icon: 'none' });
      });
  },

  onSelectCoupon: function (e) {
    const couponId = String(e.currentTarget.dataset.id || '');
    const coupon = (this.data.availableCoupons || []).find((c) => String(c._id) === couponId) || null;
    this.setData({
      selectedCoupon: coupon,
      showCouponPicker: false
    });
    this.updateTotalPrice();
  },

  onRemoveCoupon: function () {
    this.setData({ selectedCoupon: null });
    this.updateTotalPrice();
  },

  onCloseCouponPicker: function () {
    this.setData({ showCouponPicker: false });
  }
});
