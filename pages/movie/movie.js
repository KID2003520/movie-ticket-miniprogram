const app = getApp();
const backendApi = require('../../utils/backendApi.js');
const util = require('../../utils/util.js');
const { normalizeMovie, getDefaultPosterUrl } = require('../../utils/normalizeMovie.js');
const { updateTabBar } = require('../../utils/updateTabBar.js');

Page({
  data: {
    currentTab: 0,
    tabs: ['正在热映', '即将上映'],
    movies: [],
    loading: true,
    hasMore: true,
    page: 1
  },

  onLoad: function () {
    this.loadMovies(true);
  },

  onShow: function () {
    updateTabBar(this, 1);
  },

  onPullDownRefresh: function () {
    this.setData({ page: 1, movies: [], hasMore: true });
    this.loadMovies(true);
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadMovies(false);
    }
  },

  onTabChange: function (e) {
    const index = e.currentTarget.dataset.index;
    if (index !== this.data.currentTab) {
      this._allForTab = null;
      this.setData({
        currentTab: index,
        page: 1,
        movies: [],
        hasMore: true
      });
      this.loadMovies(true);
    }
  },

  loadMovies: function (refresh) {
    const status = this.data.currentTab === 0 ? 'showing' : 'coming';
    if (refresh) {
      this._allForTab = null;
    }

    if (!this._allForTab) {
      this.setData({ loading: true });
      const done = (list) => {
        this._allForTab = list;
        const pageSize = 20;
        const start = (this.data.page - 1) * pageSize;
        const end = start + pageSize;
        const slice = this._allForTab.slice(start, end);
        this.setData({
          movies: refresh ? slice : [...this.data.movies, ...slice],
          loading: false,
          hasMore: end < this._allForTab.length
        });
        if (refresh) wx.stopPullDownRefresh();
      };

      backendApi
        .getMovies({ status })
        .then((res) => {
          const items = (res && res.data && res.data.items) || [];
          const list = items.map((m) => normalizeMovie(m)).filter(Boolean);
          done(list);
        })
        .catch((err) => {
          console.warn('电影列表(后端)失败，使用本地演示数据:', err);
          const all = this.getMockMovies().filter((m) => m.status === status);
          const list = all.map((m) => normalizeMovie(m)).filter(Boolean);
          done(list);
        });
      return;
    }

    const pageSize = 20;
    const start = (this.data.page - 1) * pageSize;
    const end = start + pageSize;
    const slice = this._allForTab.slice(start, end);
    this.setData({
      movies: refresh ? slice : [...this.data.movies, ...slice],
      loading: false,
      hasMore: end < this._allForTab.length
    });
    if (refresh) wx.stopPullDownRefresh();
  },

  getMockMovies: function () {
    return [
      { _id: '1', title: '流浪地球2', poster: 'https://picsum.photos/300/420?random=41', rating: 8.3, genre: '科幻', price: 35, hot: 1000, status: 'showing', duration: 173, director: '郭帆', actors: '吴京,刘德华', description: '太阳即将毁灭，人类在地球表面建造出巨大的推进器，寻找新的家园。' },
      { _id: '2', title: '满江红', poster: 'https://picsum.photos/300/420?random=42', rating: 7.8, genre: '剧情', price: 38, hot: 980, status: 'showing', duration: 159, director: '张艺谋', actors: '沈腾,易烊千玺', description: '南宋绍兴年间，岳飞死后四年，秦桧率兵与金国会谈。' },
      { _id: '3', title: '熊出没·伴我"熊芯"', poster: 'https://picsum.photos/300/420?random=43', rating: 7.0, genre: '动画', price: 30, hot: 850, status: 'showing', duration: 101, director: '林汇达', actors: '张伟,张秉君', description: '熊大熊二光头强与天才威发明的高科技新伙伴。' },
      { _id: '4', title: '无名', poster: 'https://picsum.photos/300/420?random=44', rating: 7.5, genre: '悬疑', price: 35, hot: 720, status: 'showing', duration: 131, director: '程耳', actors: '梁朝伟,王一博', description: '1937年至1945年，一段发生在上海的秘密故事。' },
      { _id: '5', title: '深海', poster: 'https://picsum.photos/300/420?random=45', rating: 7.3, genre: '动画', price: 32, hot: 650, status: 'showing', duration: 112, director: '田晓鹏', actors: '苏鑫,王亭文', description: '在大海的最深处，藏着一个神秘的世界。' },
      { _id: '6', title: '交换人生', poster: 'https://picsum.photos/300/420?random=46', rating: 6.5, genre: '喜剧', price: 35, hot: 580, status: 'showing', duration: 118, director: '苏伦', actors: '雷佳音,张小斐', description: '一次意外，让两个不同阶层的人交换了人生。' },
      { _id: '9', title: '阿凡达：水之道', poster: 'https://picsum.photos/300/420?random=49', rating: 8.0, genre: '科幻', price: 48, hot: 920, status: 'showing', duration: 192, director: '詹姆斯·卡梅隆', actors: '萨姆·沃辛顿,佐伊·索尔达娜', description: '杰克·萨利一家在潘多拉星球的新冒险。' },
      { _id: '7', title: '蚁人与黄蜂女：量子狂潮', poster: 'https://picsum.photos/300/420?random=47', rating: 7.2, genre: '科幻', price: 45, hot: 500, status: 'coming', duration: 125, director: '佩顿·里德', actors: '保罗·路德,伊万杰琳·莉莉', description: '蚁人家族探索量子领域，遭遇征服者康。' },
      { _id: '8', title: '黑豹2', poster: 'https://picsum.photos/300/420?random=48', rating: 6.8, genre: '动作', price: 45, hot: 480, status: 'coming', duration: 161, director: '瑞恩·库格勒', actors: '利蒂希娅·赖特,露皮塔·尼永奥', description: '瓦坎达面临新的威胁，守护者的使命。' },
      { _id: '10', title: '铃芽之旅', poster: 'https://picsum.photos/300/420?random=50', rating: 8.1, genre: '动画', price: 38, hot: 880, status: 'coming', duration: 122, director: '新海诚', actors: '原菜乃华,松村北斗', description: '少女铃芽与神秘少年草太相遇后的冒险故事。' },
      { _id: '11', title: '银河护卫队3', poster: 'https://picsum.photos/300/420?random=51', rating: 8.2, genre: '科幻', price: 45, hot: 750, status: 'coming', duration: 150, director: '詹姆斯·古恩', actors: '克里斯·帕拉特,佐伊·索尔达娜', description: '银河护卫队的最终章。' }
    ];
  },

  onMovieTap: function (e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/movie-detail/movie-detail?id=${id}` });
  },

  onBuyTap: function (e) {
    const { id } = e.currentTarget.dataset;
    const movie = (this.data.movies || []).find((m) => String(m._id) === String(id));
    if (movie && movie.status === 'coming') {
      util.showToast('影片尚未上映');
      return;
    }
    if (!util.requireLoginForPurchase()) {
      app.globalData.selectedMovieId = id;
      return;
    }
    app.globalData.selectedMovieId = id;
    wx.switchTab({ url: '/pages/cinema/cinema' });
  },

  /** 外链海报被重置连接时降级为占位，避免刷屏报错 */
  onPosterError: function (e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const movies = (this.data.movies || []).map((m) =>
      m._id === id ? { ...m, poster: getDefaultPosterUrl() || m.poster } : m
    );
    if (this._allForTab && Array.isArray(this._allForTab)) {
      this._allForTab = this._allForTab.map((m) =>
        m._id === id ? { ...m, poster: getDefaultPosterUrl() || m.poster } : m
      );
    }
    this.setData({ movies });
  }
});
