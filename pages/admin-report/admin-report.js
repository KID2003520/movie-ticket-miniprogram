const backendApi = require('../../utils/backendApi.js');
const appConfig = require('../../utils/config.js');

const STATUS_LABEL_MAP = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  refunded: '已退款'
};

Page({
  data: {
    days: 7,
    dayOptions: [7, 15, 30],
    loading: false,
    summary: {
      totalOrders: 0,
      totalRevenue: 0,
      totalUsers: 0
    },
    trend: [],
    statusBreakdown: [],
    topMovies: [],
    topCinemas: []
  },

  onLoad() {
    this.loadReport();
  },

  onPullDownRefresh() {
    this.loadReport().finally(() => wx.stopPullDownRefresh());
  },

  onRangeChange(e) {
    const idx = Number(e.detail.value || 0);
    const days = this.data.dayOptions[idx] || 7;
    this.setData({ days });
    this.loadReport();
  },

  loadReport() {
    if (!appConfig.USE_BACKEND_ONLY) {
      wx.showToast({ title: '仅后端模式支持报表', icon: 'none' });
      return Promise.resolve();
    }
    this.setData({ loading: true });
    return backendApi
      .getAdminReportOverview({ days: this.data.days })
      .then((body) => {
        const d = (body && body.data) || {};
        this.setData({
          summary: d.summary || { totalOrders: 0, totalRevenue: 0, totalUsers: 0 },
          trend: (d.trend || []).map((t) => ({
            ...t,
            shortDate: String(t.date || '').slice(5)
          })),
          statusBreakdown: (d.statusBreakdown || []).map((s) => ({
            ...s,
            label: STATUS_LABEL_MAP[s.status] || s.status || '未知状态'
          })),
          topMovies: d.topMovies || [],
          topCinemas: d.topCinemas || []
        });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  onExportCsv() {
    const lines = [];
    lines.push(`报表周期,最近${this.data.days}天`);
    lines.push('模块,名称,订单数,收入(元),活跃用户');
    lines.push(
      `汇总,总览,${this.data.summary.totalOrders},${this.data.summary.totalRevenue},${this.data.summary.totalUsers}`
    );
    lines.push('');
    lines.push('趋势日期,订单数,收入(元),活跃用户');
    this.data.trend.forEach((t) => {
      lines.push(`${t.date},${t.orderCount},${t.revenue},${t.activeUsers}`);
    });
    lines.push('');
    lines.push('订单状态,数量');
    this.data.statusBreakdown.forEach((s) => {
      lines.push(`${s.label},${s.count}`);
    });
    lines.push('');
    lines.push('热门电影,订单数,收入(元)');
    this.data.topMovies.forEach((m) => {
      lines.push(`${m.title},${m.orderCount},${m.revenue}`);
    });
    lines.push('');
    lines.push('热门影院,订单数,收入(元)');
    this.data.topCinemas.forEach((c) => {
      lines.push(`${c.name},${c.orderCount},${c.revenue}`);
    });

    wx.setClipboardData({
      data: lines.join('\n'),
      success: () => wx.showToast({ title: 'CSV已复制', icon: 'success' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
    });
  }
});
