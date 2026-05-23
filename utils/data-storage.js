/**
 * 统一数据管理模块
 * 集中管理本地存储数据，提供统一的增删改查接口
 */

const STORAGE_KEYS = {
  ORDERS: 'orders',
  COLLECTIONS: 'collections',
  SEARCH_HISTORY: 'searchHistory',
  USER_INFO: 'userInfo',
  IS_LOGIN: 'isLogin',
  CLOUD_ENV_ID: 'cloudEnvId'
};

class DataStorage {
  /**
   * 获取所有数据
   */
  getAllData() {
    const data = {};
    Object.keys(STORAGE_KEYS).forEach(key => {
      data[key.toLowerCase()] = this.get(STORAGE_KEYS[key]);
    });
    return data;
  }

  /**
   * 清空所有数据
   */
  clearAll() {
    Object.keys(STORAGE_KEYS).forEach(key => {
      wx.removeStorageSync(STORAGE_KEYS[key]);
    });
  }

  /**
   * 通用获取方法
   */
  get(key, defaultValue = null) {
    try {
      const data = wx.getStorageSync(key);
      return data !== '' && data !== null ? data : defaultValue;
    } catch (e) {
      console.error('读取本地数据失败:', e);
      return defaultValue;
    }
  }

  /**
   * 通用设置方法
   */
  set(key, value) {
    try {
      wx.setStorageSync(key, value);
      return true;
    } catch (e) {
      console.error('写入本地数据失败:', e);
      return false;
    }
  }

  /**
   * 通用删除方法
   */
  remove(key) {
    try {
      wx.removeStorageSync(key);
      return true;
    } catch (e) {
      console.error('删除本地数据失败:', e);
      return false;
    }
  }

  // ============ 订单管理 ============
  
  /**
   * 获取所有订单
   */
  getOrders() {
    return this.get(STORAGE_KEYS.ORDERS, []);
  }

  /**
   * 根据状态筛选订单
   */
  getOrdersByStatus(status) {
    const orders = this.getOrders();
    if (!status) return orders;
    return orders.filter(order => order.status === status);
  }

  /**
   * 根据 ID 获取订单
   */
  getOrderById(orderId) {
    const orders = this.getOrders();
    return orders.find(order => order._id === orderId);
  }

  /**
   * 添加订单
   */
  addOrder(order) {
    const orders = this.getOrders();
    orders.unshift(order);
    return this.set(STORAGE_KEYS.ORDERS, orders);
  }

  /**
   * 更新订单
   */
  updateOrder(orderId, updates) {
    const orders = this.getOrders();
    const index = orders.findIndex(order => order._id === orderId);
    
    if (index !== -1) {
      orders[index] = { ...orders[index], ...updates };
      return this.set(STORAGE_KEYS.ORDERS, orders);
    }
    return false;
  }

  /**
   * 删除订单
   */
  deleteOrder(orderId) {
    const orders = this.getOrders();
    const filteredOrders = orders.filter(order => order._id !== orderId);
    
    if (filteredOrders.length !== orders.length) {
      return this.set(STORAGE_KEYS.ORDERS, filteredOrders);
    }
    return false;
  }

  /**
   * 获取订单统计
   */
  getOrderStats() {
    const orders = this.getOrders();
    return {
      total: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      paid: orders.filter(o => o.status === 'paid').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
      refunded: orders.filter(o => o.status === 'refunded').length
    };
  }

  // ============ 收藏管理 ============
  
  /**
   * 获取所有收藏
   */
  getCollections() {
    return this.get(STORAGE_KEYS.COLLECTIONS, []);
  }

  /**
   * 检查是否已收藏
   */
  isCollected(movieId) {
    const collections = this.getCollections();
    return collections.some(c => c.movieId === movieId);
  }

  /**
   * 添加收藏
   */
  addCollection(movieId, movieTitle, moviePoster) {
    const collections = this.getCollections();
    
    if (collections.some(c => c.movieId === movieId)) {
      return false;
    }

    collections.push({
      movieId,
      movieTitle,
      moviePoster,
      createTime: new Date().toISOString()
    });
    
    return this.set(STORAGE_KEYS.COLLECTIONS, collections);
  }

  /**
   * 取消收藏
   */
  removeCollection(movieId) {
    const collections = this.getCollections();
    const filteredCollections = collections.filter(c => c.movieId !== movieId);
    
    if (filteredCollections.length !== collections.length) {
      return this.set(STORAGE_KEYS.COLLECTIONS, filteredCollections);
    }
    return false;
  }

  /**
   * 切换收藏状态
   */
  toggleCollection(movieId, movieTitle, moviePoster) {
    if (this.isCollected(movieId)) {
      this.removeCollection(movieId);
      return false;
    } else {
      this.addCollection(movieId, movieTitle, moviePoster);
      return true;
    }
  }

  /**
   * 获取收藏数量
   */
  getCollectionCount() {
    return this.getCollections().length;
  }

  // ============ 搜索历史管理 ============
  
  /**
   * 获取搜索历史
   */
  getSearchHistory() {
    return this.get(STORAGE_KEYS.SEARCH_HISTORY, []);
  }

  /**
   * 添加搜索历史
   */
  addSearchHistory(keyword) {
    if (!keyword || !keyword.trim()) {
      return false;
    }

    const history = this.getSearchHistory();
    const filteredHistory = history.filter(h => h !== keyword);
    
    filteredHistory.unshift(keyword.trim());
    
    if (filteredHistory.length > 10) {
      filteredHistory.splice(10);
    }
    
    return this.set(STORAGE_KEYS.SEARCH_HISTORY, filteredHistory);
  }

  /**
   * 清空搜索历史
   */
  clearSearchHistory() {
    return this.remove(STORAGE_KEYS.SEARCH_HISTORY);
  }

  // ============ 用户信息管理 ============
  
  /**
   * 获取用户信息
   */
  getUserInfo() {
    return this.get(STORAGE_KEYS.USER_INFO, null);
  }

  /**
   * 设置用户信息
   */
  setUserInfo(userInfo) {
    return this.set(STORAGE_KEYS.USER_INFO, userInfo);
  }

  /**
   * 检查是否已登录
   */
  isLogin() {
    return this.get(STORAGE_KEYS.IS_LOGIN, false);
  }

  /**
   * 设置登录状态
   */
  setLoginStatus(isLogin) {
    return this.set(STORAGE_KEYS.IS_LOGIN, isLogin);
  }

  /**
   * 退出登录
   */
  logout() {
    this.remove(STORAGE_KEYS.USER_INFO);
    this.remove(STORAGE_KEYS.IS_LOGIN);
    // 清理登录身份标识，避免退出后仍携带旧 openid 请求后端
    this.remove('openid');
    return true;
  }

  // ============ 云环境管理 ============
  
  /**
   * 获取云环境 ID
   */
  getCloudEnvId() {
    return this.get(STORAGE_KEYS.CLOUD_ENV_ID, '');
  }

  /**
   * 设置云环境 ID
   */
  setCloudEnvId(envId) {
    return this.set(STORAGE_KEYS.CLOUD_ENV_ID, envId);
  }
}

module.exports = new DataStorage();
