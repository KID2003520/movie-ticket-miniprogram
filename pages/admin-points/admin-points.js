const backendApi = require('../../utils/backendApi.js');
const appConfig = require('../../utils/config.js');

Page({
  data: {
    rulePer: '',
    ruleCin: '',
    ruleLines: [],
    adjTarget: '',
    adjDelta: '',
    adjReason: '',
    adjRisk: false,
    bulkBatch: '',
    bulkJson: '',
    bulkRisk: false,
    logTarget: '',
    logSource: '',
    logItems: [],
    logPage: 1,
    logHasMore: false
  },

  onLoad() {
    this.refreshRules();
  },

  onPullDownRefresh() {
    this.refreshRules();
    this.onLogSearch(true).finally(() => wx.stopPullDownRefresh());
  },

  refreshRules() {
    if (!appConfig.USE_BACKEND_ONLY) return Promise.resolve();
    return backendApi
      .getAdminPointsRulesConfig()
      .then((body) => {
        const d = (body && body.data) || {};
        const rules = Array.isArray(d.rules) ? d.rules : [];
        this.setData({
          rulePer: String(d.pointsPer100Cents != null ? d.pointsPer100Cents : ''),
          ruleCin: String(d.checkInDaily != null ? d.checkInDaily : ''),
          ruleLines: rules
        });
      })
      .catch((e) => {
        wx.showToast({ title: (e && e.message) || '规则加载失败', icon: 'none' });
      });
  },

  onRulePer(e) {
    this.setData({ rulePer: e.detail.value });
  },

  onRuleCin(e) {
    this.setData({ ruleCin: e.detail.value });
  },

  onSaveRules() {
    const pointsPer100Cents = parseInt(this.data.rulePer, 10);
    const checkInDaily = parseInt(this.data.ruleCin, 10);
    if (!Number.isFinite(pointsPer100Cents) || !Number.isFinite(checkInDaily)) {
      wx.showToast({ title: '请填写有效整数', icon: 'none' });
      return;
    }
    backendApi
      .putAdminPointsRulesConfig({ pointsPer100Cents, checkInDaily })
      .then(() => {
        wx.showToast({ title: '已保存' });
        this.refreshRules();
      })
      .catch((e) => wx.showToast({ title: (e && e.message) || '失败', icon: 'none' }));
  },

  onAdjTarget(e) {
    this.setData({ adjTarget: e.detail.value });
  },

  onAdjDelta(e) {
    this.setData({ adjDelta: e.detail.value });
  },

  onAdjReason(e) {
    this.setData({ adjReason: e.detail.value });
  },

  onAdjRiskSwitch(e) {
    this.setData({ adjRisk: !!e.detail.value });
  },

  onAdjust() {
    const targetOpenid = (this.data.adjTarget || '').trim();
    const delta = parseInt(this.data.adjDelta, 10);
    const reason = (this.data.adjReason || '').trim();
    if (!targetOpenid || !Number.isFinite(delta) || !reason) {
      wx.showToast({ title: '请填写 openid、积分、原因', icon: 'none' });
      return;
    }
    const riskAck = !!this.data.adjRisk;
    backendApi
      .adminPointsAdjust({ targetOpenid, delta, reason, riskAck })
      .then(() => {
        wx.showToast({ title: '已调整' });
        this.setData({ adjDelta: '', adjReason: '', adjRisk: false });
        this.onLogSearch(true);
      })
      .catch((e) => wx.showToast({ title: (e && e.message) || '失败', icon: 'none' }));
  },

  onBulkBatch(e) {
    this.setData({ bulkBatch: e.detail.value });
  },

  onBulkJson(e) {
    this.setData({ bulkJson: e.detail.value });
  },

  onBulkRiskSwitch(e) {
    this.setData({ bulkRisk: !!e.detail.value });
  },

  onBulkSubmit() {
    const batchReason = (this.data.bulkBatch || '').trim();
    let items;
    try {
      items = JSON.parse(this.data.bulkJson || '[]');
    } catch (_) {
      wx.showToast({ title: 'JSON 格式错误', icon: 'none' });
      return;
    }
    if (!Array.isArray(items) || !items.length) {
      wx.showToast({ title: 'items 须为非空数组', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认批量',
      content: `将执行 ${items.length} 条积分变动，是否继续？`,
      success: (res) => {
        if (!res.confirm) return;
        backendApi
          .adminPointsBulkGrant({
            batchReason,
            items,
            riskAck: !!this.data.bulkRisk
          })
          .then((body) => {
            const n = (body && body.data && body.data.count) || 0;
            wx.showToast({ title: `完成${n}条`, icon: 'none' });
            this.setData({ bulkJson: '', bulkRisk: false });
            this.onLogSearch(true);
          })
          .catch((e) => wx.showToast({ title: (e && e.message) || '失败', icon: 'none' }));
      }
    });
  },

  onLogTarget(e) {
    this.setData({ logTarget: e.detail.value });
  },

  onLogSource(e) {
    this.setData({ logSource: e.detail.value });
  },

  onLogSearch(reset) {
    if (!appConfig.USE_BACKEND_ONLY) return Promise.resolve();
    const page = reset ? 1 : this.data.logPage;
    return backendApi
      .getAdminPointsLogs({
        targetOpenid: (this.data.logTarget || '').trim(),
        sourceType: (this.data.logSource || '').trim(),
        page,
        pageSize: 20
      })
      .then((body) => {
        const d = (body && body.data) || {};
        const items = (d.items || []).map((x) => ({ ...x, id: x.id || x.openid + (x.createTime || '') }));
        const merged = reset ? items : this.data.logItems.concat(items);
        this.setData({
          logItems: merged,
          logPage: page,
          logHasMore: items.length >= 20
        });
      })
      .catch((e) => wx.showToast({ title: (e && e.message) || '查询失败', icon: 'none' }));
  },

  onLogMore() {
    if (!this.data.logHasMore) return;
    const next = this.data.logPage + 1;
    if (!appConfig.USE_BACKEND_ONLY) return;
    backendApi
      .getAdminPointsLogs({
        targetOpenid: (this.data.logTarget || '').trim(),
        sourceType: (this.data.logSource || '').trim(),
        page: next,
        pageSize: 20
      })
      .then((body) => {
        const d = (body && body.data) || {};
        const items = (d.items || []).map((x) => ({ ...x, id: x.id || x.openid + (x.createTime || '') }));
        this.setData({
          logItems: this.data.logItems.concat(items),
          logPage: next,
          logHasMore: items.length >= 20
        });
      })
      .catch((e) => wx.showToast({ title: (e && e.message) || '失败', icon: 'none' }));
  }
});
