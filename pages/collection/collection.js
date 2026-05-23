const util = require('../../utils/util.js');
const backendApi = require('../../utils/backendApi.js');
const { proxyPosterUrl } = require('../../utils/normalizeMovie.js');

Page({
  data: {
    collections: [],
    loading: true
  },

  onLoad() {
    this.loadCollections();
  },

  onShow() {
    this.loadCollections();
  },

  async loadCollections() {
    this.setData({ loading: true });
    try {
      const res = await backendApi.getCollections();
      const items = (res && res.data && res.data.items) || [];
      const collections = items.map((c) => ({
        ...c,
        movieTitle: c.title,
        moviePoster: proxyPosterUrl(c.poster),
        createTime: util.formatDate(c.createTime, 'YYYY-MM-DD')
      }));
      this.setData({ collections, loading: false });
    } catch (err) {
      console.error('加载收藏失败:', err);
      this.setData({ collections: [], loading: false });
    }
  },

  onMovieTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/movie-detail/movie-detail?id=${id}` });
  },

  async onDelete(e) {
    const { movieid } = e.currentTarget.dataset;
    const confirm = await util.showModal('确定要取消收藏吗？');
    if (!confirm) return;

    try {
      await backendApi.removeCollection(movieid);
      util.showToast('已取消收藏', 'success');
      this.loadCollections();
    } catch (err) {
      console.error('删除收藏失败:', err);
      util.showToast('取消收藏失败', 'none');
    }
  }
});
