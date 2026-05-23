/**
 * 解析后端/MySQL 常见时间（如 "2026-03-22 16:59:25"）。
 * 部分 iOS/小程序环境不支持 "yyyy-MM-dd HH:mm:ss"（空格分隔），需转为 ISO 子集 "yyyy-MM-ddTHH:mm:ss"。
 */
const parseBackendDate = (input) => {
  if (input == null || input === '') return new Date(NaN);
  if (typeof input === 'number') return new Date(input);
  if (input instanceof Date) return input;
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return new Date(s.replace(' ', 'T'));
  }
  return new Date(s);
};

const formatDate = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (date !== 0 && !date) return '';
  const d = date instanceof Date ? date : parseBackendDate(date);
  if (Number.isNaN(d.getTime())) return '';
  return format
    .replace(/YYYY/g, d.getFullYear())
    .replace(/MM/g, String(d.getMonth() + 1).padStart(2, '0'))
    .replace(/DD/g, String(d.getDate()).padStart(2, '0'))
    .replace(/HH/g, String(d.getHours()).padStart(2, '0'))
    .replace(/mm/g, String(d.getMinutes()).padStart(2, '0'))
    .replace(/ss/g, String(d.getSeconds()).padStart(2, '0'));
};

const showToast = (title, icon = 'none') => { wx.showToast({ title, icon }); };
const showLoading = (title = '加载中...') => { wx.showLoading({ title, mask: true }); };
const hideLoading = () => { wx.hideLoading(); };

const showModal = (content, title = '提示') => {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success: (res) => {
        resolve(res.confirm);
      },
      fail: () => {
        resolve(false);
      }
    });
  });
};

const checkLogin = () => {
  const app = getApp();
  return !!(app && app.globalData && app.globalData.isLogin) || !!wx.getStorageSync('isLogin');
};

/** 未登录时提示并跳转登录页（可选登录后 redirect 回非 tab 页） */
const promptLoginForPurchase = (redirectUrl = '') => {
  wx.showModal({
    title: '请先登录',
    content: '登录账号后才能选座购票',
    confirmText: '去登录',
    cancelText: '取消',
    success(res) {
      if (!res.confirm) return;
      const q = redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : '';
      wx.navigateTo({ url: `/pages/login/login${q}` });
    }
  });
};

/** 购票链路入口：已登录返回 true，否则弹窗并返回 false */
const requireLoginForPurchase = (redirectUrl = '') => {
  if (checkLogin()) return true;
  promptLoginForPurchase(redirectUrl);
  return false;
};

const getMockMovies = () => {
  return [
    { _id: '1', title: '流浪地球2', poster: 'https://picsum.photos/300/420?random=1', rating: 8.3, genre: '科幻/冒险', price: 35, hot: 1000, status: 'showing', duration: 173, director: '郭帆', actors: '吴京,刘德华,李雪健', description: '太阳即将毁灭，人类在地球表面建造出巨大的推进器，寻找新的家园。' },
    { _id: '2', title: '满江红', poster: 'https://picsum.photos/300/420?random=2', rating: 7.8, genre: '剧情/悬疑', price: 38, hot: 980, status: 'showing', duration: 159, director: '张艺谋', actors: '沈腾,易烊千玺,张译', description: '南宋绍兴年间，岳飞死后四年，秦桧率兵与金国会谈。' },
    { _id: '3', title: '熊出没·伴我"熊芯"', poster: 'https://picsum.photos/300/420?random=3', rating: 7.0, genre: '动画/喜剧', price: 30, hot: 850, status: 'showing', duration: 101, director: '林汇达', actors: '张伟,张秉君,谭笑', description: '熊大熊二光头强与天才威发明的高科技新伙伴。' },
    { _id: '4', title: '无名', poster: 'https://picsum.photos/300/420?random=4', rating: 7.5, genre: '剧情/悬疑', price: 35, hot: 720, status: 'showing', duration: 131, director: '程耳', actors: '梁朝伟,王一博,周迅', description: '1937年至1945年，一段发生在上海的秘密故事。' },
    { _id: '5', title: '深海', poster: 'https://picsum.photos/300/420?random=5', rating: 7.3, genre: '动画/奇幻', price: 32, hot: 650, status: 'showing', duration: 112, director: '田晓鹏', actors: '苏鑫,王亭文,滕奎兴', description: '在大海的最深处，藏着一个神秘的世界。' },
    { _id: '6', title: '交换人生', poster: 'https://picsum.photos/300/420?random=6', rating: 6.5, genre: '喜剧/奇幻', price: 35, hot: 580, status: 'showing', duration: 118, director: '苏伦', actors: '雷佳音,张小斐', description: '一次意外，让两个不同阶层的人交换了人生。' },
    { _id: '7', title: '蚁人与黄蜂女：量子狂潮', poster: 'https://picsum.photos/300/420?random=7', rating: 7.2, genre: '科幻/动作', price: 45, hot: 500, status: 'coming', duration: 125, director: '佩顿·里德', actors: '保罗·路德,伊万杰琳·莉莉', description: '蚁人家族探索量子领域，遭遇征服者康。' },
    { _id: '8', title: '黑豹2', poster: 'https://picsum.photos/300/420?random=8', rating: 6.8, genre: '动作/科幻', price: 45, hot: 480, status: 'coming', duration: 161, director: '瑞恩·库格勒', actors: '利蒂希娅·赖特,露皮塔·尼永奥', description: '瓦坎达面临新的威胁，守护者的使命。' },
    { _id: '9', title: '阿凡达：水之道', poster: 'https://picsum.photos/300/420?random=9', rating: 8.0, genre: '科幻/冒险', price: 48, hot: 920, status: 'showing', duration: 192, director: '詹姆斯·卡梅隆', actors: '萨姆·沃辛顿,佐伊·索尔达娜', description: '杰克·萨利一家在潘多拉星球的新冒险。' },
    { _id: '10', title: '铃芽之旅', poster: 'https://picsum.photos/300/420?random=10', rating: 8.1, genre: '动画/奇幻', price: 38, hot: 880, status: 'coming', duration: 122, director: '新海诚', actors: '原菜乃华,松村北斗', description: '少女铃芽与神秘少年草太相遇后的冒险故事。' }
  ];
};

const getMockCinemas = () => {
  return [
    { _id: '1', name: '万达影城(万达广场店)', address: '朝阳区建国路93号万达广场B1层', distance: '1.2km', tags: ['IMAX', '杜比全景声'], phone: '010-85588188' },
    { _id: '2', name: 'CGV影城(颐堤港店)', address: '朝阳区酒仙桥路18号颐堤港购物中心3层', distance: '2.5km', tags: ['IMAX', '4DX'], phone: '010-84700900' },
    { _id: '3', name: '金逸影城(大悦城店)', address: '朝阳区朝阳北路101号大悦城购物中心10层', distance: '3.1km', tags: ['IMAX'], phone: '010-85551234' },
    { _id: '4', name: '博纳国际影城(悠唐店)', address: '朝阳区朝阳门外大街悠唐购物中心5层', distance: '1.8km', tags: ['杜比全景声'], phone: '010-65889988' },
    { _id: '5', name: 'UME国际影城(双井店)', address: '朝阳区东三环中路39号建外SOHO西区B1层', distance: '2.2km', tags: ['IMAX', 'VIP'], phone: '010-58693388' }
  ];
};

const getMockSchedules = () => {
  return [
    { _id: '1', movieId: '1', movieTitle: '流浪地球2', moviePoster: 'https://picsum.photos/300/420?random=1', cinemaId: '1', hallName: 'IMAX厅', date: '2023-01-22', startTime: '10:30', endTime: '13:23', price: 68, status: 'available' },
    { _id: '2', movieId: '1', movieTitle: '流浪地球2', moviePoster: 'https://picsum.photos/300/420?random=1', cinemaId: '1', hallName: '杜比厅', date: '2023-01-22', startTime: '14:00', endTime: '16:53', price: 58, status: 'available' },
    { _id: '3', movieId: '2', movieTitle: '满江红', moviePoster: 'https://picsum.photos/300/420?random=2', cinemaId: '1', hallName: 'IMAX厅', date: '2023-01-22', startTime: '11:00', endTime: '13:39', price: 58, status: 'available' }
  ];
};

const getMockOrders = () => {
  return [
    { _id: '1', orderNo: 'ORD20230122001', movieTitle: '流浪地球2', moviePoster: 'https://picsum.photos/300/420?random=1', cinemaName: '万达影城', hallName: 'IMAX厅', date: '2023-01-22', startTime: '14:30', seats: [{row: 5, col: 8}, {row: 5, col: 9}], totalPrice: 70, status: 'paid', createTime: '2023-01-20 10:30' },
    { _id: '2', orderNo: 'ORD20230122002', movieTitle: '满江红', moviePoster: 'https://picsum.photos/300/420?random=2', cinemaName: 'CGV影城', hallName: '杜比厅', date: '2023-01-23', startTime: '16:00', seats: [{row: 3, col: 6}], totalPrice: 38, status: 'pending', createTime: '2023-01-21 15:20' }
  ];
};

module.exports = {
  parseBackendDate,
  formatDate,
  showToast,
  showLoading,
  hideLoading,
  showModal,
  checkLogin,
  promptLoginForPurchase,
  requireLoginForPurchase,
  getMockMovies,
  getMockCinemas,
  getMockSchedules,
  getMockOrders
};
