const backendApi = require('../../utils/backendApi.js');

function pickErrMsg(err) {
  if (!err) return '购买失败';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.errMsg) return err.errMsg;
  return '购买失败';
}

Page({
  data: {
    coupons: [],
    shopItems: [],
    loading: true,
    currentTab: 0,
    buyingTemplateId: ''
  },

  onLoad() {
    this.loadAll();
  },

  onShow() {
    this.loadAll(false);
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  },

  async loadAll(showLoading = true) {
    if (showLoading) this.setData({ loading: true });
    try {
      const [couponRes, shopRes] = await Promise.all([backendApi.getMyCoupons(), backendApi.getCouponShop()]);
      const coupons = (couponRes && couponRes.data && couponRes.data.items) || [];
      const shopItems = (shopRes && shopRes.data && shopRes.data.items) || [];
      const validDaysByTemplate = {};
      shopItems.forEach((s) => {
        if (s && s._id != null) validDaysByTemplate[String(s._id)] = Number(s.validDays) || 0;
      });
      const now = Date.now();
      const processedCoupons = coupons.map((c) => {
        const validDays =
          Number(c.validDays) > 0
            ? Number(c.validDays)
            : validDaysByTemplate[String(c.templateId || '')] || 0;
        let expireTimeText = '';
        if (c.expireTime) {
          const d = new Date(c.expireTime);
          if (Number.isFinite(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            expireTimeText = `${y}-${m}-${day}`;
          }
        }
        const exp = expireTimeText ? new Date(expireTimeText).getTime() : NaN;
        const isExpired = c.status === 'expired' || (Number.isFinite(exp) && exp <= now && c.status !== 'used');
        const isUsed = c.status === 'used';
        let validityText = '';
        if (!isExpired && !isUsed) {
          validityText = validDays > 0 ? `有效期 ${validDays} 天` : (expireTimeText ? `有效期至 ${expireTimeText}` : '');
        }
        return {
          ...c,
          validDays,
          expireTimeText,
          validityText,
          isExpired,
          isUsed,
          description: c.minAmount > 0 ? `满${c.minAmount}元可用` : '无门槛可用'
        };
      });
      this.setData({ coupons: processedCoupons, shopItems, loading: false });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onTabChange(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    this.setData({ currentTab: index });
  },

  onUseCoupon() {
    wx.showModal({
      title: '使用说明',
      content: '选座下单时可在选座页使用优惠券；已生成的待支付订单可在「订单详情」中选择优惠券抵扣。',
      confirmText: '去看订单',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/order/order?status=pending' });
        }
      }
    });
  },

  async onBuyCoupon(e) {
    const templateId = String(e.currentTarget.dataset.id || '');
    const item = (this.data.shopItems || []).find((x) => String(x._id) === templateId);
    if (!templateId || this.data.buyingTemplateId) return;

    const remain = item ? Math.max(0, (item.stock || 0) - (item.soldCount || 0)) : 0;
    if (item && remain <= 0) {
      wx.showToast({ title: '该券已售罄', icon: 'none' });
      return;
    }

    const openid = wx.getStorageSync('openid');
    if (!openid) {
      wx.showModal({
        title: '请先登录',
        content: '购买优惠券需先登录账号',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/login/login?type=phone_login' });
        }
      });
      return;
    }

    const priceText = item ? `¥${item.sellPrice}` : '';
    const titleText = item ? item.title : '优惠券';
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认购买',
        content: `购买「${titleText}」${priceText ? '，支付 ' + priceText : ''}？`,
        success: (res) => resolve(!!res.confirm)
      });
    });
    if (!confirmed) return;

    this.setData({ buyingTemplateId: templateId });
    wx.showLoading({ title: '下单中...' });
    try {
      const p = await backendApi.createCouponPurchase(templateId, 1);
      const purchaseId = p && p.data && p.data.purchaseId;
      if (!purchaseId) throw new Error('创建购买单失败');
      wx.showLoading({ title: '支付中...' });
      const payRes = await backendApi.payCouponPurchaseMock(purchaseId);
      wx.hideLoading();
      wx.showToast({
        title: (payRes && payRes.message) || '购买成功',
        icon: 'success'
      });
      this.setData({ currentTab: 0 });
      this.loadAll(false);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: pickErrMsg(err), icon: 'none', duration: 2500 });
    } finally {
      this.setData({ buyingTemplateId: '' });
    }
  }
});
