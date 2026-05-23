const app = getApp();
const util = require('../../utils/util.js');
const backendApi = require('../../utils/backendApi.js');
const { normalizeMovie } = require('../../utils/normalizeMovie.js');

Page({
  data: {
    movie: null,
    movieView: null,
    gallery: [],
    comments: [],
    isCollected: false,
    loading: true,
    commentText: '',
    commentRating: 5,
    showCommentInput: false,
    enriching: false
  },

  onLoad: function (options) {
    if (options.id) {
      this.movieId = options.id;
      this.loadMovieDetail();
      this.loadComments();
      this.checkCollection();
    }
  },

  loadMovieDetail: function () {
    this.setData({ loading: true });
    backendApi
      .getMovieById(this.movieId)
      .then((res) => {
        const m = normalizeMovie(res.data);
        if (!m) {
          util.showToast('电影不存在');
          this.setData({ loading: false });
          return;
        }
        const movieView = this.buildMovieView(m);
        const gallery = this.buildGallery(m);
        this.setData({ movie: m, movieView, gallery, loading: false });
        wx.setNavigationBarTitle({ title: m.title });
        this.tryAutoEnrichMovie(m);
      })
      .catch(() => {
        util.showToast('加载失败');
        this.setData({ loading: false });
      });
  },

  needEnrichMovie: function (movie) {
    if (!movie) return false;
    const missingPoster = !String(movie.poster || '').trim();
    const missingDesc = !String(movie.description || '').trim();
    const missingDirector = !String(movie.director || '').trim();
    const missingActors = !String(movie.actors || '').trim();
    const missingGenre = !String(movie.genre || '').trim();
    const missingReleaseDate = !String(movie.releaseDate || '').trim();
    const duration = Number(movie.duration || 0);
    const rating = Number(movie.rating || 0);
    const missingDuration = !Number.isFinite(duration) || duration <= 0;
    const missingRating = !Number.isFinite(rating) || rating <= 0;
    return (
      missingPoster ||
      missingDesc ||
      missingDirector ||
      missingActors ||
      missingGenre ||
      missingReleaseDate ||
      missingDuration ||
      missingRating
    );
  },

  tryAutoEnrichMovie: function (movie) {
    if (!this.needEnrichMovie(movie) || this.data.enriching) return;
    this.setData({ enriching: true });
    backendApi
      .enrichMovieFromTmdb(this.movieId)
      .then((res) => {
        const updatedMovie = res && res.data && res.data.movie ? normalizeMovie(res.data.movie) : null;
        if (!updatedMovie) return;
        const movieView = this.buildMovieView(updatedMovie);
        const gallery = this.buildGallery(updatedMovie);
        this.setData({ movie: updatedMovie, movieView, gallery });
      })
      .catch((err) => {
        console.warn('自动补全电影资料失败:', err);
      })
      .finally(() => {
        this.setData({ enriching: false });
      });
  },

  buildMovieView: function (movie) {
    const rating = Number(movie.rating);
    const score = Number.isFinite(rating) ? (Math.round(rating * 10) / 10).toFixed(1) : '暂无';
    const releaseDate = movie.releaseDate ? String(movie.releaseDate).slice(0, 10) : '暂无';
    const duration = Number(movie.duration) > 0 ? `${Number(movie.duration)}分钟` : '时长待定';
    const genreText = movie.genre || '类型待定';
    const director = movie.director || '暂无';
    const actors = movie.actors || '暂无';
    const description = movie.description || '暂无剧情简介';
    const poster = movie.poster || 'https://picsum.photos/600/900?random=801';
    const price = Number(movie.price);
    const priceText = Number.isFinite(price) ? price : '--';
    const statusLabel = movie.status === 'coming' ? '即将上映' : movie.status === 'off' ? '已下架' : '正在热映';
    const tags = this.buildTags(genreText, duration, statusLabel);
    return {
      score,
      releaseDate,
      duration,
      genreText,
      director,
      actors,
      description,
      poster,
      priceText,
      statusLabel,
      tags
    };
  },

  buildTags: function (genreText, duration, statusLabel) {
    const raw = []
      .concat(String(genreText || '').split(/[\/,，\s]+/))
      .concat([duration, statusLabel]);
    return raw.filter(Boolean).slice(0, 6);
  },

  buildGallery: function (movie) {
    const poster = movie.poster ? String(movie.poster) : '';
    if (!poster) return [];
    if (poster.indexOf('image.tmdb.org/t/p/') !== -1) {
      const path = poster.split('/t/p/')[1]?.split('/').slice(1).join('/');
      if (path) {
        return [
          `https://image.tmdb.org/t/p/w780/${path}`,
          `https://image.tmdb.org/t/p/w1280/${path}`,
          `https://image.tmdb.org/t/p/original/${path}`
        ];
      }
    }
    return [poster];
  },

  onPreviewImage: function (e) {
    const current = e.currentTarget.dataset.url;
    const urls = this.data.gallery || [];
    if (!current || !urls.length) return;
    wx.previewImage({ current, urls });
  },

  loadComments: function () {
    backendApi
      .getMovieComments(this.movieId)
      .then((res) => {
        const items = (res && res.data && res.data.items) || [];
        const comments = items.map((c) => ({
          ...c,
          createTime: util.formatDate(c.createTime, 'YYYY-MM-DD HH:mm')
        }));
        this.setData({ comments });
      })
      .catch(() => {
        this.setData({ comments: [] });
      });
  },

  checkCollection: function () {
    const isLogin = app.globalData.isLogin || wx.getStorageSync('isLogin');
    if (!isLogin) {
      this.setData({ isCollected: false });
      return;
    }
    backendApi
      .checkCollection(this.movieId)
      .then((res) => {
        const collected = res && res.data && res.data.collected;
        this.setData({ isCollected: !!collected });
      })
      .catch(() => {
        this.setData({ isCollected: false });
      });
  },

  onBuyTicket: function () {
    if (!this.movieId) {
      util.showToast('电影信息加载失败，请重试');
      return;
    }
    if (!util.requireLoginForPurchase()) {
      app.globalData.selectedMovieId = this.movieId;
      return;
    }
    app.globalData.selectedMovieId = this.movieId;
    wx.switchTab({
      url: '/pages/cinema/cinema',
      fail: (err) => {
        console.error('页面跳转失败:', err);
        util.showToast('页面跳转失败，请重试');
      }
    });
  },

  onCollect: function () {
    const isLogin = app.globalData.isLogin || wx.getStorageSync('isLogin');
    if (!isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再收藏',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/login/login' });
        }
      });
      return;
    }

    const movie = this.data.movie;
    if (!movie) return;

    if (this.data.isCollected) {
      backendApi
        .removeCollection(this.movieId)
        .then(() => {
          this.setData({ isCollected: false });
          util.showToast('已取消收藏', 'success');
        })
        .catch(() => util.showToast('操作失败', 'none'));
    } else {
      backendApi
        .addCollection({
          movieId: this.movieId,
          title: movie.title,
          poster: movie.poster
        })
        .then(() => {
          this.setData({ isCollected: true });
          util.showToast('收藏成功', 'success');
        })
        .catch(() => util.showToast('收藏失败', 'none'));
    }
  },

  onShowCommentInput: function () {
    const isLogin = app.globalData.isLogin || wx.getStorageSync('isLogin');
    if (!isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再评论',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/login/login' });
        }
      });
      return;
    }
    this.setData({ showCommentInput: true });
  },

  onHideCommentInput: function () {
    this.setData({ showCommentInput: false, commentText: '', commentRating: 5 });
  },

  onCommentInput: function (e) {
    this.setData({ commentText: e.detail.value });
  },

  onRatingChange: function (e) {
    this.setData({ commentRating: e.currentTarget.dataset.rating });
  },

  onSubmitComment: function () {
    const content = this.data.commentText.trim();
    if (!content) {
      util.showToast('请输入评论内容');
      return;
    }

    wx.showLoading({ title: '提交中...' });
    backendApi
      .postMovieComment(this.movieId, {
        rating: this.data.commentRating,
        content
      })
      .then(() => {
        wx.hideLoading();
        this.setData({
          showCommentInput: false,
          commentText: '',
          commentRating: 5
        });
        util.showToast('评论成功', 'success');
        this.loadComments();
      })
      .catch(() => {
        wx.hideLoading();
        util.showToast('评论失败', 'none');
      });
  },

  onShareAppMessage: function () {
    return {
      title: this.data.movie ? this.data.movie.title : '电影详情',
      path: `/pages/movie-detail/movie-detail?id=${this.movieId}`,
      imageUrl: this.data.movie ? this.data.movie.poster : ''
    };
  }
});
