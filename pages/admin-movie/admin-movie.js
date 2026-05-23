const backendApi = require('../../utils/backendApi.js');
const { normalizeMovie } = require('../../utils/normalizeMovie.js');

Page({
  data: {
    movies: [],
    loading: true,
    hasMore: true,
    page: 1,
    pageSize: 10,
    keyword: '',
    currentGenre: '',
    currentGenreLabel: '电影类型',
    currentStatus: '',
    currentStatusLabel: '上映状态',
    currentSort: 'releaseDate',
    currentSortLabel: '上映时间',
    genreList: [
      { value: '', label: '全部类型' },
      { value: '动作', label: '动作' },
      { value: '喜剧', label: '喜剧' },
      { value: '剧情', label: '剧情' },
      { value: '科幻', label: '科幻' },
      { value: '爱情', label: '爱情' },
      { value: '动画', label: '动画' },
      { value: '悬疑', label: '悬疑' }
    ],
    statusList: [
      { value: '', label: '全部状态' },
      { value: 'showing', label: '上映中' },
      { value: 'coming', label: '即将上映' },
      { value: 'off', label: '已下架' }
    ],
    sortList: [
      { value: 'releaseDate', label: '上映时间' },
      { value: 'hot', label: '热度' },
      { value: 'createTime', label: '添加时间' }
    ],
    showConfirmModal: false,
    modalTitle: '',
    modalDesc: '',
    confirmAction: null,
    confirmData: null
  },

  onLoad: function () {
    this.loadMovies();
  },

  onPullDownRefresh: function () {
    this.setData({ page: 1, movies: [], hasMore: true });
    this.loadMovies().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadMovies: function () {
    this.setData({ loading: true });
    return backendApi
      .getMovies({})
      .then((res) => {
        const allMovies = ((res && res.data && res.data.items) || []).map(normalizeMovie).filter(Boolean);
        let filtered = [...allMovies];

        if (this.data.currentGenre) {
          filtered = filtered.filter((m) => String(m.genre || '').includes(this.data.currentGenre));
        }

        if (this.data.currentStatus) {
          filtered = filtered.filter((m) => m.status === this.data.currentStatus);
        }

        if (this.data.keyword) {
          filtered = filtered.filter((m) =>
            String(m.title || '').toLowerCase().includes(this.data.keyword.toLowerCase())
          );
        }

        filtered.sort((a, b) => {
          if (this.data.currentSort === 'hot') return (b.hot || 0) - (a.hot || 0);
          if (this.data.currentSort === 'createTime') return new Date(b.createTime || 0) - new Date(a.createTime || 0);
          return new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0);
        });

        const end = this.data.page * this.data.pageSize;
        const pagedMovies = filtered.slice(0, end);
        this.setData({
          movies: pagedMovies,
          hasMore: end < filtered.length,
          loading: false
        });
      })
      .catch((e) => {
        wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
        this.setData({ loading: false, movies: [] });
      });
  },

  onGenreChange: function (e) {
    const index = e.detail.value;
    const genre = this.data.genreList[index];
    this.setData({
      currentGenre: genre.value,
      currentGenreLabel: genre.label,
      page: 1,
      movies: []
    });
    this.loadMovies();
  },

  onStatusChange: function (e) {
    const index = e.detail.value;
    const status = this.data.statusList[index];
    this.setData({
      currentStatus: status.value,
      currentStatusLabel: status.label,
      page: 1,
      movies: []
    });
    this.loadMovies();
  },

  onSortChange: function (e) {
    const index = e.detail.value;
    const sort = this.data.sortList[index];
    this.setData({
      currentSort: sort.value,
      currentSortLabel: sort.label,
      page: 1,
      movies: []
    });
    this.loadMovies();
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch: function () {
    this.setData({ page: 1, movies: [] });
    this.loadMovies();
  },

  onLoadMore: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadMovies();
    }
  },

  onAddMovie: function () {
    wx.navigateTo({ url: '/pages/admin-movie-add/admin-movie-add' });
  },

  onEdit: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin-movie-add/admin-movie-add?id=${id}` });
  },

  onToggleStatus: function (e) {
    const { id, status } = e.currentTarget.dataset;
    const action = status === 'off' ? '上架' : '下架';
    
    this.setData({
      showConfirmModal: true,
      modalTitle: `确认${action}`,
      modalDesc: `确定要${action}这部电影吗？`,
      confirmAction: 'toggleStatus',
      confirmData: { id, newStatus: status === 'off' ? 'showing' : 'off' }
    });
  },

  onDelete: function (e) {
    const id = e.currentTarget.dataset.id;
    
    this.setData({
      showConfirmModal: true,
      modalTitle: '确认删除',
      modalDesc: '删除后将无法恢复，确定要删除这部电影吗？',
      confirmAction: 'delete',
      confirmData: { id }
    });
  },

  onCancelModal: function () {
    this.setData({
      showConfirmModal: false,
      modalTitle: '',
      modalDesc: '',
      confirmAction: null,
      confirmData: null
    });
  },

  onConfirmModal: function () {
    const { confirmAction, confirmData } = this.data;
    
    if (confirmAction === 'toggleStatus') {
      this.doToggleStatus(confirmData.id, confirmData.newStatus);
    } else if (confirmAction === 'delete') {
      this.doDelete(confirmData.id);
    }
    
    this.onCancelModal();
  },

  doToggleStatus: function (id, newStatus) {
    backendApi
      .updateMovieStatus(id, newStatus)
      .then(() => {
        wx.showToast({
          title: newStatus === 'off' ? '已下架' : '已上架',
          icon: 'success'
        });
        this.setData({ page: 1, movies: [] });
        this.loadMovies();
      })
      .catch((e) => {
        wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' });
      });
  },

  doDelete: function (id) {
    backendApi
      .deleteMovie(id)
      .then(() => {
        wx.showToast({ title: '删除成功', icon: 'success' });
        this.setData({ page: 1, movies: [] });
        this.loadMovies();
      })
      .catch((e) => {
        wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' });
      });
  }
});
