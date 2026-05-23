const appConfig = require('./config.js');

function getMiniProgramPlatform() {
  try {
    if (wx.getDeviceInfo && typeof wx.getDeviceInfo === 'function') {
      const d = wx.getDeviceInfo();
      if (d && d.platform) return d.platform;
    }
  } catch (e) {}
  try {
    if (wx.getAppBaseInfo && typeof wx.getAppBaseInfo === 'function') {
      const b = wx.getAppBaseInfo();
      if (b && b.platform) return b.platform;
    }
  } catch (e) {}
  return '';
}

function getBackendBaseUrl() {
  const defaultUrl = appConfig.BACKEND_BASE_URL || 'http://127.0.0.1:3000';
  const isLocalhost = (url) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(String(url || '').trim());
  const platform = getMiniProgramPlatform();
  const isRealDevice = platform === 'ios' || platform === 'android';

  // 开发者工具 / Windows 模拟器访问本机 Node，必须用回环地址；配置里的旧局域网 IP 会 ERR_CONNECTION_TIMED_OUT
  if (!isRealDevice) {
    const m = String(defaultUrl || '').match(/:(\d+)\/?$/);
    const port = (m && m[1]) || '3000';
    return `http://127.0.0.1:${port}`;
  }

  try {
    const custom = wx.getStorageSync('backendBaseUrl');
    if (custom) {
      // 真机上若历史缓存仍是 localhost，自动回退到配置里的局域网地址，避免连接被拒绝
      if (isRealDevice && isLocalhost(custom) && !isLocalhost(defaultUrl)) {
        return defaultUrl;
      }
      return custom;
    }
  } catch (e) {}
  return defaultUrl;
}

function getOpenid() {
  const openid = wx.getStorageSync('openid') || (getApp && getApp().globalData && getApp().globalData.openid);
  if (openid) return openid;
  // 无 openid 时使用稳定 mock，保证后端能按“同一用户”隔离
  const seed = wx.getStorageSync('mockOpenidSeed') || String(Date.now());
  wx.setStorageSync('mockOpenidSeed', seed);
  const mock = 'mock_openid_' + seed;
  return mock;
}

/** 与后端 TMDB_SYNC_SECRET 一致时可写入 storage：wx.setStorageSync('tmdbSyncSecret','xxx') */
function getTmdbSyncSecret(explicit) {
  if (explicit) return explicit;
  try {
    const s = wx.getStorageSync('tmdbSyncSecret');
    if (s) return s;
  } catch (e) {}
  return appConfig.TMDB_SYNC_SECRET || '';
}

function request(path, { method = 'GET', data = {}, header = {}, useOpenid = true } = {}) {
  const openid = getOpenid();
  if (method === 'GET') {
    const query = useOpenid ? { ...data, openid } : { ...data };
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${getBackendBaseUrl()}${path}`,
        method: 'GET',
        data: query,
        header,
        success: (res) => {
          const body = res.data;
          if (body && body.code === 0) resolve(body);
          else reject(body || res);
        },
        fail: (err) => reject(err)
      });
    });
  }

  // POST/DELETE/PATCH 等：必须声明 JSON，否则部分基础库以表单提交，Express 无法解析 req.body
  const payload = useOpenid ? { ...data, openid } : { ...data };
  const jsonHeader = {
    ...header,
    'content-type': 'application/json',
    ...(useOpenid && openid ? { 'x-openid': openid } : {})
  };
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBackendBaseUrl()}${path}`,
      method,
      data: payload,
      header: jsonHeader,
      success: (res) => {
        const body = res.data;
        if (body && body.code === 0) resolve(body);
        else reject(body || res);
      },
      fail: (err) => reject(err)
    });
  });
}

module.exports = {
  getBackendBaseUrl,

  getScheduleDetail(scheduleId) {
    return request('/api/schedule-detail', { data: { scheduleId } });
  },

  createOrder({ scheduleId, seats, totalPriceCents, couponId = '' }) {
    return request('/api/orders/create', {
      method: 'POST',
      data: { scheduleId, seats, totalPriceCents, couponId }
    });
  },

  getOrders({ status = '', page = 1, pageSize = 20 }) {
    const data = { status, page, pageSize };
    return request('/api/orders', { data });
  },

  getOrderDetail(orderId) {
    return request(`/api/orders/${orderId}`, { data: {} });
  },

  cancelOrder(orderId) {
    return request(`/api/orders/${orderId}/cancel`, { method: 'POST', data: {} });
  },

  mockPay(orderId) {
    return request(`/api/orders/${orderId}/mockPay`, { method: 'POST', data: {} });
  },

  getPayCapabilities() {
    return request('/api/pay/capabilities', { data: {} });
  },

  prepareAlipayPay(orderId) {
    return request(`/api/orders/${orderId}/alipay/prepare`, { method: 'POST', data: {} });
  },

  getCouponShop() {
    return request('/api/coupon-shop', { data: {} });
  },

  getMyCoupons() {
    return request('/api/coupons/my', { data: {} });
  },

  getAvailableCoupons(amountCents = 0) {
    return request('/api/coupons/available', { data: { amountCents } });
  },

  createCouponPurchase(templateId, qty = 1) {
    return request('/api/coupon-purchase/create', {
      method: 'POST',
      data: { templateId, qty }
    });
  },

  payCouponPurchaseMock(purchaseId) {
    return request(`/api/coupon-purchase/${purchaseId}/mockPay`, {
      method: 'POST',
      data: {}
    });
  },

  applyOrderCoupon(orderId, couponId) {
    return request(`/api/orders/${orderId}/apply-coupon`, {
      method: 'POST',
      data: { couponId }
    });
  },

  removeOrderCoupon(orderId) {
    return request(`/api/orders/${orderId}/remove-coupon`, {
      method: 'POST',
      data: {}
    });
  },

  refundOrder(orderId) {
    return request(`/api/orders/${orderId}/refund`, { method: 'POST', data: {} });
  },

  deleteOrder(orderId) {
    return request(`/api/orders/${orderId}`, { method: 'DELETE', data: {} });
  },

  registerPhonePassword({ phone, password }) {
    return request('/api/auth/register-phone-password', {
      method: 'POST',
      data: { phone, password },
      useOpenid: false
    });
  },

  loginPhonePassword({ phone, password }) {
    return request('/api/auth/login-phone-password', {
      method: 'POST',
      data: { phone, password },
      useOpenid: false
    });
  },

  getUserProfile() {
    return request('/api/user/profile', { data: {} });
  },

  patchUserProfile(data) {
    return request('/api/user/profile/update', { method: 'POST', data });
  },

  changeProfilePhone({ newPhone, password }) {
    return request('/api/user/profile/change-phone', {
      method: 'POST',
      data: { newPhone, password }
    });
  },

  uploadProfileAvatarBase64(imageBase64) {
    return request('/api/user/profile/avatar-base64', {
      method: 'POST',
      data: { imageBase64 }
    });
  },

  getPointsBalance() {
    return request('/api/points/balance', { data: {} });
  },

  getPointsLog({ page = 1, pageSize = 20 } = {}) {
    return request('/api/points/log', { data: { page, pageSize } });
  },

  getPointsRules() {
    return request('/api/points/rules', { data: {} });
  },

  postPointsCheckIn() {
    return request('/api/points/check-in', { method: 'POST', data: {} });
  },

  postPointsActivityClaim(activityKey) {
    return request('/api/points/activity/claim', { method: 'POST', data: { activityKey } });
  },

  /** 电影列表（MySQL） */
  getMovies({ status = '' } = {}) {
    return request('/api/movies', { data: { status } });
  },

  /**
   * 从 TMDB 同步海报与资料到数据库（需后端配置 TMDB_API_KEY；若配置了 TMDB_SYNC_SECRET 需传 syncSecret）
   */
  syncMoviesFromTmdb({ ids, syncSecret } = {}) {
    const header = {};
    const secret = getTmdbSyncSecret(syncSecret);
    if (secret) header['x-sync-secret'] = secret;
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${getBackendBaseUrl()}/api/movies/sync-from-tmdb`,
        method: 'POST',
        data: ids && ids.length ? { ids } : {},
        header,
        success: (res) => {
          const body = res.data;
          if (body && body.code === 0) resolve(body);
          else reject(body || res);
        },
        fail: (err) => reject(err)
      });
    });
  },

  /**
   * 从 TMDB 导入“新电影”（会新增/更新 movies 表记录），可选为新电影生成未来场次与座位。
   */
  importMoviesFromTmdb({
    mode = 'popular',
    count = 20,
    priceCents,
    withSchedules = false,
    scheduleDays = 7,
    scheduleTemplatesCount = 6,
    forceSeats = false,
    syncSecret
  } = {}) {
    const header = {};
    const secret = getTmdbSyncSecret(syncSecret);
    if (secret) header['x-sync-secret'] = secret;
    const data = {
      mode,
      count,
      priceCents,
      withSchedules,
      scheduleDays,
      scheduleTemplatesCount,
      forceSeats
    };

    return new Promise((resolve, reject) => {
      wx.request({
        url: `${getBackendBaseUrl()}/api/movies/import-from-tmdb`,
        method: 'POST',
        data,
        header,
        success: (res) => {
          const body = res.data;
          if (body && body.code === 0) resolve(body);
          else reject(body || res);
        },
        fail: (err) => reject(err)
      });
    });
  },

  /**
   * 多榜单聚合导入（更接近“全量电影”抓取），自动去重并写入 movies 表。
   */
  /** 仅从 TMDB upcoming 导入即将上映影片，并重算上映状态 */
  importUpcomingFromTmdb({ count = 50, priceCents, syncSecret, timeoutMs = 120000 } = {}) {
    const header = {};
    const secret = getTmdbSyncSecret(syncSecret);
    if (secret) header['x-sync-secret'] = secret;
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${getBackendBaseUrl()}/api/movies/import-upcoming-from-tmdb`,
        method: 'POST',
        data: { count, priceCents },
        header,
        timeout: timeoutMs,
        success: (res) => {
          const body = res.data;
          if (body && body.code === 0) resolve(body);
          else reject(body || res);
        },
        fail: (err) => reject(err)
      });
    });
  },

  /** 按数据库 releaseDate 重算 showing / coming */
  recomputeMovieStatuses({ syncSecret } = {}) {
    const header = {};
    const secret = getTmdbSyncSecret(syncSecret);
    if (secret) header['x-sync-secret'] = secret;
    return request('/api/movies/recompute-movie-statuses', {
      method: 'POST',
      data: {},
      header
    });
  },

  /**
   * 按 TMDB 重新写入 tmdb_* 影片的 releaseDate（优先 CN 等地区分级数据），并重算状态
   * @param {{ onlyComing?: boolean, syncSecret?: string, timeoutMs?: number }} [opts]
   */
  refreshReleaseDatesFromTmdb({ onlyComing = false, syncSecret, timeoutMs = 300000 } = {}) {
    const header = {};
    const secret = getTmdbSyncSecret(syncSecret);
    if (secret) header['x-sync-secret'] = secret;
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${getBackendBaseUrl()}/api/movies/refresh-release-dates-from-tmdb`,
        method: 'POST',
        data: { onlyComing },
        header,
        timeout: timeoutMs,
        success: (res) => {
          const body = res.data;
          if (body && body.code === 0) resolve(body);
          else reject(body || res);
        },
        fail: (err) => reject(err)
      });
    });
  },

  importAllMoviesFromTmdb({
    modes = ['now_playing', 'popular', 'upcoming', 'top_rated'],
    countPerMode = 30,
    totalLimit = 120,
    priceCents,
    withSchedules = false,
    scheduleDays = 7,
    scheduleTemplatesCount = 6,
    forceSeats = false,
    syncSecret
  } = {}) {
    const header = {};
    const secret = getTmdbSyncSecret(syncSecret);
    if (secret) header['x-sync-secret'] = secret;
    const data = {
      modes,
      countPerMode,
      totalLimit,
      priceCents,
      withSchedules,
      scheduleDays,
      scheduleTemplatesCount,
      forceSeats
    };

    return new Promise((resolve, reject) => {
      wx.request({
        url: `${getBackendBaseUrl()}/api/movies/import-all-from-tmdb`,
        method: 'POST',
        data,
        header,
        timeout: 180000,
        success: (res) => {
          const body = res.data;
          if (body && body.code === 0) resolve(body);
          else {
            const err = body && typeof body === 'object' ? { ...body } : { message: '导入失败' };
            if (res.statusCode) err.statusCode = res.statusCode;
            reject(err);
          }
        },
        fail: (err) => reject(err)
      });
    });
  },

  /**
   * TMDB Discover 热度榜批量写入 movies（默认约 1000 条），耗时数分钟，请保持网络与后端运行。
   */
  importDiscoverBulk({ count = 1000, sleepMs = 200, syncSecret, timeoutMs = 666000 } = {}) {
    const header = {};
    const secret = getTmdbSyncSecret(syncSecret);
    if (secret) header['x-sync-secret'] = secret;
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${getBackendBaseUrl()}/api/movies/import-discover-bulk`,
        method: 'POST',
        data: { count, sleepMs },
        header,
        timeout: timeoutMs,
        success: (res) => {
          const body = res.data;
          if (body && body.code === 0) resolve(body);
          else reject(body || res);
        },
        fail: (err) => reject(err)
      });
    });
  },

  getMovieById(movieId) {
    return request(`/api/movies/${movieId}`, { data: {} });
  },

  enrichMovieFromTmdb(movieId) {
    return request(`/api/movies/${movieId}/enrich-from-tmdb`, {
      method: 'POST',
      data: {}
    });
  },

  enrichMissingMoviesFromTmdb({ limit = 30, rounds = 2, status = '', syncSecret, timeoutMs = 180000 } = {}) {
    const header = {};
    const secret = getTmdbSyncSecret(syncSecret);
    if (secret) header['x-sync-secret'] = secret;
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${getBackendBaseUrl()}/api/movies/enrich-missing-from-tmdb`,
        method: 'POST',
        data: { limit, rounds, status },
        header,
        timeout: timeoutMs,
        success: (res) => {
          const body = res.data;
          if (body && body.code === 0) resolve(body);
          else reject(body || res);
        },
        fail: (err) => reject(err)
      });
    });
  },

  searchMovies({ q = '' } = {}) {
    return request('/api/movies/search', { data: { q } });
  },

  getCinemas({ city = '', q = '' } = {}) {
    const data = {};
    if (city) data.city = city;
    if (q) data.q = q;
    return request('/api/cinemas', { data });
  },

  /** 逆地理：需后端配置 TENCENT_LBS_KEY；未配置时仍返回 code:0 但 city 为空 */
  reverseGeocode({ lat, lng }) {
    return request('/api/location/reverse', {
      data: { lat, lng },
      useOpenid: false
    });
  },

  getCinemaById(cinemaId) {
    return request(`/api/cinemas/${cinemaId}`, { data: {} });
  },

  getSchedules({ cinemaId, date, movieId = '' }) {
    const data = { cinemaId, date };
    if (movieId) data.movieId = movieId;
    return request('/api/schedules', { data });
  },

  getUserStats() {
    return request('/api/user/stats', { data: {} });
  },

  getCollections() {
    return request('/api/collections', { data: {} });
  },

  addCollection({ movieId, title, poster }) {
    return request('/api/collections', {
      method: 'POST',
      data: { movieId, title, poster }
    });
  },

  removeCollection(movieId) {
    return request(`/api/collections/${movieId}`, { method: 'DELETE', data: {} });
  },

  checkCollection(movieId) {
    return request('/api/collections/check', { data: { movieId } });
  },

  getMovieComments(movieId) {
    return request(`/api/movies/${movieId}/comments`, { data: {} });
  },

  postMovieComment(movieId, { rating, content }) {
    return request(`/api/movies/${movieId}/comments`, {
      method: 'POST',
      data: { rating, content }
    });
  },

  getAdminUsers() {
    return request('/api/admin/users', { data: {} });
  },

  getAdminCinemas({ keyword = '' } = {}) {
    return request('/api/admin/cinemas', { data: { keyword } });
  },

  createAdminCinema(payload) {
    return request('/api/admin/cinemas', {
      method: 'POST',
      data: payload || {}
    });
  },

  updateAdminCinema(cinemaId, payload) {
    return request(`/api/admin/cinemas/${cinemaId}`, {
      method: 'PUT',
      data: payload || {}
    });
  },

  deleteAdminCinema(cinemaId) {
    return request(`/api/admin/cinemas/${cinemaId}`, {
      method: 'DELETE',
      data: {}
    });
  },

  getAdminCinemaHalls(cinemaId) {
    return request(`/api/admin/cinemas/${cinemaId}/halls`, { data: {} });
  },

  createAdminCinemaHall(cinemaId, payload) {
    return request(`/api/admin/cinemas/${cinemaId}/halls`, {
      method: 'POST',
      data: payload || {}
    });
  },

  updateAdminCinemaHall(cinemaId, hallId, payload) {
    return request(`/api/admin/cinemas/${cinemaId}/halls/${hallId}`, {
      method: 'PUT',
      data: payload || {}
    });
  },

  deleteAdminCinemaHall(cinemaId, hallId) {
    return request(`/api/admin/cinemas/${cinemaId}/halls/${hallId}`, {
      method: 'DELETE',
      data: {}
    });
  },

  deleteAdminUser(userId) {
    return request(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      data: {}
    });
  },

  /** 管理首页今日数据（需管理员账号且 isAdmin=1） */
  getAdminDashboardStats() {
    return request('/api/admin/dashboard-stats', { data: {} });
  },

  getAdminReportOverview({ days = 7 } = {}) {
    return request('/api/admin/reports/overview', { data: { days } });
  },

  /** 全站订单（管理端，需 isAdmin）；支持 orderNo、userKeyword、scheduleId、status、filter、userOpenid */
  getAdminOrders({
    status = '',
    page = 1,
    pageSize = 20,
    orderNo = '',
    userKeyword = '',
    scheduleId = '',
    filter = '',
    userOpenid = ''
  } = {}) {
    return request('/api/admin/orders', {
      data: { status, page, pageSize, orderNo, userKeyword, scheduleId, filter, userOpenid }
    });
  },

  getAdminOrderDetail(orderId) {
    return request(`/api/admin/orders/${orderId}`, { data: {} });
  },

  adminOrderSyncAlipay(orderId, { note = '' } = {}) {
    return request(`/api/admin/orders/${orderId}/sync-alipay`, { method: 'POST', data: { note } });
  },

  adminOrderCancelPending(orderId, { note = '' } = {}) {
    return request(`/api/admin/orders/${orderId}/cancel-pending`, { method: 'POST', data: { note } });
  },

  adminOrderRefundRequest(orderId, { note = '' } = {}) {
    return request(`/api/admin/orders/${orderId}/refund-request`, { method: 'POST', data: { note } });
  },

  adminOrderRefundApprove(orderId, { note = '' } = {}) {
    return request(`/api/admin/orders/${orderId}/refund-approve`, { method: 'POST', data: { note } });
  },

  adminOrderRefundReject(orderId, { note = '' } = {}) {
    return request(`/api/admin/orders/${orderId}/refund-reject`, { method: 'POST', data: { note } });
  },

  adminOrderRefundDirect(orderId, { note = '' } = {}) {
    return request(`/api/admin/orders/${orderId}/refund-direct`, { method: 'POST', data: { note } });
  },

  getAdminPointsRulesConfig() {
    return request('/api/admin/points/rules-config', { data: {} });
  },

  putAdminPointsRulesConfig({ pointsPer100Cents, checkInDaily }) {
    return request('/api/admin/points/rules-config', {
      method: 'PUT',
      data: { pointsPer100Cents, checkInDaily }
    });
  },

  adminPointsAdjust({ targetOpenid, delta, reason, riskAck = false }) {
    return request('/api/admin/points/adjust', {
      method: 'POST',
      data: { targetOpenid, delta, reason, riskAck }
    });
  },

  adminPointsBulkGrant({ batchReason, items, riskAck = false }) {
    return request('/api/admin/points/bulk-grant', {
      method: 'POST',
      data: { batchReason, items, riskAck }
    });
  },

  getAdminPointsLogs({ targetOpenid = '', sourceType = '', page = 1, pageSize = 30 } = {}) {
    return request('/api/admin/points/logs', {
      data: { targetOpenid, sourceType, page, pageSize }
    });
  },

  getTmdbConfig() {
    return request('/api/admin/tmdb-config', { data: {} });
  },

  updateMovieStatus(movieId, status) {
    return request(`/api/admin/movies/${movieId}/status`, {
      method: 'PATCH',
      data: { status }
    });
  },

  deleteMovie(movieId) {
    return request(`/api/admin/movies/${movieId}`, {
      method: 'DELETE',
      data: {}
    });
  },

  rebuildCinemaSchedules({ days = 7 } = {}) {
    return request('/api/admin/rebuild-cinema-schedules', {
      method: 'POST',
      data: { days }
    });
  }
};

