const util = require('../../utils/util.js');
const backendApi = require('../../utils/backendApi.js');
const appConfig = require('../../utils/config.js');

Page({
  data: {
    order: null,
    loading: true,
    qrcodeUrl: '',
    countdown: 0,
    countdownTimer: null,
    alipayEnabled: false,
    showCouponPicker: false,
    availableCoupons: [],
    applyingCoupon: false
  },

  onLoad(options) {
    if (options.id) {
      this.orderId = options.id;
      this.refreshPayCapabilities();
      this.loadOrderDetail();
    }
  },

  onShow() {
    this.refreshPayCapabilities();
    if (this.orderId) this.loadOrderDetail(false);
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

  onUnload() {
    this.clearCountdown();
  },

  async loadOrderDetail(showLoading = true) {
    if (showLoading) wx.showLoading({ title: '加载订单中...' });
    try {
      const res = await backendApi.getOrderDetail(this.orderId);
      if (!res || !res.data) throw new Error('订单数据缺失');

      const rawCreateTime = res.data.createTime;
      const baseTotalPrice = (res.data.baseTotalPrice || res.data.totalPrice) / 100;
      const totalPrice = res.data.totalPrice / 100;
      const discountYuan = (res.data.discountCents || 0) / 100;
      const order = {
        ...res.data,
        baseTotalPrice,
        totalPrice,
        discountYuan,
        couponAmountYuan: (res.data.couponAmount || 0) / 100,
        hasCoupon: !!(res.data.couponId && discountYuan > 0),
        createTime: util.formatDate(rawCreateTime),
        payTime: res.data.payTime ? util.formatDate(res.data.payTime) : null
      };

      this.setData({
        order,
        loading: false,
        qrcodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${order.orderNo}`
      });

      if (order.status === 'pending') {
        this.clearCountdown();
        this.startCountdown(rawCreateTime);
      } else {
        this.clearCountdown();
      }
    } catch (e) {
      console.error('加载订单失败(后端):', e);
      util.showToast('订单不存在或网络错误', 'none');
      this.setData({ loading: false });
    } finally {
      if (showLoading) wx.hideLoading();
    }
  },

  startCountdown(createTime) {
    const base = util.parseBackendDate(createTime).getTime();
    if (Number.isNaN(base)) return;
    const expireTime = base + 15 * 60 * 1000;
    const updateCountdown = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expireTime - now) / 1000));

      if (diff === 0) {
        this.clearCountdown();
        this.autoCancel();
      } else {
        this.setData({ countdown: diff });
      }
    };

    updateCountdown();
    this.countdownTimer = setInterval(updateCountdown, 1000);
  },

  clearCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  },

  async autoCancel() {
    try {
      await backendApi.cancelOrder(this.orderId);
    } catch (e) {
      console.error('自动取消失败(后端):', e);
    }
    util.showToast('订单已超时自动取消');
    this.loadOrderDetail();
  },

  async onAlipayPay() {
    wx.showLoading({ title: '获取支付页...' });
    try {
      const res = await backendApi.prepareAlipayPay(this.orderId);
      wx.hideLoading();
      if (!res || !res.data || !res.data.bridgeUrl) {
        util.showToast((res && res.message) || '无法发起支付', 'none');
        return;
      }
      const u = encodeURIComponent(res.data.bridgeUrl);
      wx.navigateTo({ url: `/pages/pay-alipay/pay-alipay?url=${u}` });
    } catch (e) {
      wx.hideLoading();
      const msg =
        (e && (e.message || (e.data && e.message))) || (e && e.errMsg) || '发起支付失败';
      util.showToast(typeof msg === 'string' ? msg : '发起支付失败', 'none');
    }
  },

  async onCouponTap() {
    const order = this.data.order;
    if (!order || order.status !== 'pending') return;
    const amountCents = Math.round((order.baseTotalPrice || order.totalPrice) * 100);
    wx.showLoading({ title: '加载优惠券...' });
    try {
      const res = await backendApi.getAvailableCoupons(amountCents);
      wx.hideLoading();
      const all = (res && res.data && res.data.items) || [];
      const availableCoupons = all.filter((c) => !!c.eligible);
      if (!availableCoupons.length) {
        wx.showToast({ title: '暂无可用优惠券', icon: 'none' });
        return;
      }
      this.setData({ showCouponPicker: true, availableCoupons });
    } catch (e) {
      wx.hideLoading();
      const msg = (e && e.message) || '加载失败';
      wx.showToast({ title: typeof msg === 'string' ? msg : '加载失败', icon: 'none' });
    }
  },

  onCloseCouponPicker() {
    this.setData({ showCouponPicker: false });
  },

  async onSelectCoupon(e) {
    const couponId = String(e.currentTarget.dataset.id || '').trim();
    if (!couponId || this.data.applyingCoupon) return;
    const coupon = (this.data.availableCoupons || []).find((c) => String(c._id) === couponId);
    if (!coupon) {
      wx.showToast({ title: '优惠券数据异常，请重试', icon: 'none' });
      return;
    }
    this.setData({ showCouponPicker: false, applyingCoupon: true });
    wx.showLoading({ title: '应用中...' });
    try {
      await backendApi.applyOrderCoupon(this.orderId, couponId);
      wx.hideLoading();
      wx.showToast({ title: '优惠券已应用', icon: 'success' });
      this.loadOrderDetail(false);
    } catch (e) {
      wx.hideLoading();
      const msg =
        (e && e.message) ||
        (e && e.data && e.data.message) ||
        (typeof e === 'string' ? e : '') ||
        '应用失败';
      wx.showToast({ title: msg, icon: 'none', duration: 2500 });
    } finally {
      this.setData({ applyingCoupon: false });
    }
  },

  async onRemoveCoupon() {
    const order = this.data.order;
    if (!order || !order.hasCoupon || this.data.applyingCoupon) return;
    this.setData({ applyingCoupon: true });
    wx.showLoading({ title: '处理中...' });
    try {
      await backendApi.removeOrderCoupon(this.orderId);
      wx.hideLoading();
      wx.showToast({ title: '已取消优惠券', icon: 'success' });
      this.loadOrderDetail(false);
    } catch (e) {
      wx.hideLoading();
      const msg = (e && e.message) || '操作失败';
      wx.showToast({ title: typeof msg === 'string' ? msg : '操作失败', icon: 'none' });
    } finally {
      this.setData({ applyingCoupon: false });
    }
  },

  async onPay() {
    wx.showLoading({ title: '支付中...' });
    try {
      const res = await backendApi.mockPay(this.orderId);
      if (res && res.code === 0) {
        this.clearCountdown();
        util.showToast('支付成功', 'success');
        setTimeout(() => this.loadOrderDetail(false), 1500);
      } else {
        util.showToast((res && res.message) || '支付失败', 'none');
      }
    } catch (e) {
      console.error('支付失败:', e);
      util.showToast('支付失败', 'none');
    } finally {
      wx.hideLoading();
    }
  },

  onCancel() {
    wx.showModal({
      title: '提示',
      content: '确定要取消订单吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await backendApi.cancelOrder(this.orderId);
          this.clearCountdown();
          util.showToast('取消成功', 'success');
          this.loadOrderDetail();
        } catch (err) {
          console.error('取消订单失败(后端):', err);
          util.showToast('取消失败', 'none');
        }
      }
    });
  },

  onCopyOrderNo() {
    wx.setClipboardData({
      data: this.data.order.orderNo,
      success: () => util.showToast('已复制订单号', 'success')
    });
  },

  onRefund() {
    wx.showModal({
      title: '申请退款',
      content: '确定要申请退款吗？退款将在3-5个工作日内到账',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '申请退款中...' });
        try {
          await backendApi.refundOrder(this.orderId);
          util.showToast('退款成功（模拟）', 'success');
          this.loadOrderDetail();
        } catch (e) {
          console.error('退款失败(后端):', e);
          util.showToast('退款失败', 'none');
        } finally {
          wx.hideLoading();
        }
      }
    });
  }
});
