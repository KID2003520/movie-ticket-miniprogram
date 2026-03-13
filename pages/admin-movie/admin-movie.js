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
      { value: 'action', label: '动作' },
      { value: 'comedy', label: '喜剧' },
      { value: 'drama', label: '剧情' },
      { value: 'scifi', label: '科幻' },
      { value: 'romance', label: '爱情' },
      { value: 'animation', label: '动画' },
      { value: 'thriller', label: '悬疑' }
    ],
    statusList: [
      { value: '', label: '全部状态' },
      { value: 'showing', label: '上映中' },
      { value: 'coming', label: '即将上映' },
      { value: 'off', label: '已下架' }
    ],
    sortList: [
      { value: 'releaseDate', label: '上映时间' },
      { value: 'boxOffice', label: '票房' },
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

    return new Promise(resolve => {
      setTimeout(() => {
        const allMovies = wx.getStorageSync('adminMovies') || this.getMockMovies();
        
        let filtered = [...allMovies];
        
        if (this.data.currentGenre) {
          filtered = filtered.filter(m => m.genreValue === this.data.currentGenre);
        }
        
        if (this.data.currentStatus) {
          filtered = filtered.filter(m => m.status === this.data.currentStatus);
        }
        
        if (this.data.keyword) {
          filtered = filtered.filter(m => 
            m.title.toLowerCase().includes(this.data.keyword.toLowerCase())
          );
        }
        
        filtered.sort((a, b) => {
          if (this.data.currentSort === 'boxOffice') {
            return (b.boxOffice || 0) - (a.boxOffice || 0);
          } else if (this.data.currentSort === 'createTime') {
            return new Date(b.createTime) - new Date(a.createTime);
          } else {
            return new Date(b.releaseDate) - new Date(a.releaseDate);
          }
        });

        const start = 0;
        const end = this.data.page * this.data.pageSize;
        const pagedMovies = filtered.slice(start, end);

        this.setData({
          movies: pagedMovies,
          hasMore: end < filtered.length,
          loading: false
        });

        resolve();
      }, 500);
    });
  },

  getMockMovies: function () {
    const mockMovies = [
      { _id: '1', title: '流浪地球2', poster: 'https://picsum.photos/300/420?random=71', genre: '科幻', genreValue: 'scifi', duration: 173, price: 35, rating: 8.3, releaseDate: '2023-01-22', status: 'showing', boxOffice: 4029, createTime: '2023-01-01' },
      { _id: '2', title: '满江红', poster: 'https://picsum.photos/300/420?random=72', genre: '剧情', genreValue: 'drama', duration: 159, price: 38, rating: 7.8, releaseDate: '2023-01-22', status: 'showing', boxOffice: 4544, createTime: '2023-01-02' },
      { _id: '3', title: '熊出没·伴我"熊芯"', poster: 'https://picsum.photos/300/420?random=73', genre: '动画', genreValue: 'animation', duration: 101, price: 30, rating: 7.0, releaseDate: '2023-01-22', status: 'showing', boxOffice: 1479, createTime: '2023-01-03' },
      { _id: '4', title: '无名', poster: 'https://picsum.photos/300/420?random=74', genre: '悬疑', genreValue: 'thriller', duration: 131, price: 35, rating: 7.5, releaseDate: '2023-01-22', status: 'off', boxOffice: 931, createTime: '2023-01-04' },
      { _id: '5', title: '深海', poster: 'https://picsum.photos/300/420?random=75', genre: '动画', genreValue: 'animation', duration: 112, price: 32, rating: 7.3, releaseDate: '2023-01-22', status: 'coming', boxOffice: 0, createTime: '2023-01-05' },
      { _id: '6', title: '交换人生', poster: 'https://picsum.photos/300/420?random=76', genre: '喜剧', genreValue: 'comedy', duration: 118, price: 35, rating: 6.5, releaseDate: '2023-01-22', status: 'showing', boxOffice: 394, createTime: '2023-01-06' }
    ];
    
    wx.setStorageSync('adminMovies', mockMovies);
    return mockMovies;
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
    const movies = wx.getStorageSync('adminMovies') || [];
    const index = movies.findIndex(m => m._id === id);
    
    if (index !== -1) {
      movies[index].status = newStatus;
      wx.setStorageSync('adminMovies', movies);
      
      wx.showToast({
        title: newStatus === 'off' ? '已下架' : '已上架',
        icon: 'success'
      });
      
      this.setData({ page: 1, movies: [] });
      this.loadMovies();
    }
  },

  doDelete: function (id) {
    let movies = wx.getStorageSync('adminMovies') || [];
    movies = movies.filter(m => m._id !== id);
    wx.setStorageSync('adminMovies', movies);
    
    wx.showToast({ title: '删除成功', icon: 'success' });
    
    this.setData({ page: 1, movies: [] });
    this.loadMovies();
  }
});
