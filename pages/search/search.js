Page({
  data: {
    searchValue: '',
    searchType: 'movie',
    searchResults: [],
    hotSearchList: ['流浪地球2', '满江红', '熊出没', '无名', '深海', '蚁人'],
    historyList: [],
    loading: false,
    searched: false
  },

  onLoad: function (options) {
    const { type } = options;
    if (type) {
      this.setData({ searchType: type });
    }
    this.loadHistory();
  },

  loadHistory: function () {
    const historyList = wx.getStorageSync('searchHistory') || [];
    this.setData({ historyList: historyList });
  },

  onSearchInput: function (e) {
    this.setData({ searchValue: e.detail.value });
  },

  onSearch: function () {
    const value = this.data.searchValue.trim();
    if (!value) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' });
      return;
    }

    this.saveHistory(value);
    this.doSearch(value);
  },

  doSearch: function (keyword) {
    this.setData({ loading: true, searched: true });

    setTimeout(() => {
      const allMovies = [
        { _id: '1', title: '流浪地球2', poster: 'https://picsum.photos/300/420?random=51', rating: 8.3, genre: '科幻', price: 35 },
        { _id: '2', title: '满江红', poster: 'https://picsum.photos/300/420?random=52', rating: 7.8, genre: '悬疑', price: 32 },
        { _id: '3', title: '熊出没·伴我熊芯', poster: 'https://picsum.photos/300/420?random=53', rating: 7.5, genre: '动画', price: 28 },
        { _id: '4', title: '无名', poster: 'https://picsum.photos/300/420?random=54', rating: 7.6, genre: '剧情', price: 38 },
        { _id: '5', title: '深海', poster: 'https://picsum.photos/300/420?random=55', rating: 7.3, genre: '动画', price: 30 },
        { _id: '6', title: '蚁人与黄蜂女', poster: 'https://picsum.photos/300/420?random=56', rating: 6.8, genre: '科幻', price: 45 }
      ];

      const results = allMovies.filter(m => 
        m.title.toLowerCase().includes(keyword.toLowerCase())
      );

      this.setData({
        searchResults: results,
        loading: false
      });
    }, 300);
  },

  saveHistory: function (keyword) {
    let historyList = this.data.historyList.filter(h => h !== keyword);
    historyList.unshift(keyword);
    if (historyList.length > 10) {
      historyList = historyList.slice(0, 10);
    }
    wx.setStorageSync('searchHistory', historyList);
    this.setData({ historyList: historyList });
  },

  onClearHistory: function () {
    wx.showModal({
      title: '提示',
      content: '确定清空搜索历史吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('searchHistory');
          this.setData({ historyList: [] });
        }
      }
    });
  },

  onHotSearchTap: function (e) {
    const { keyword } = e.currentTarget.dataset;
    this.setData({ searchValue: keyword });
    this.saveHistory(keyword);
    this.doSearch(keyword);
  },

  onHistoryTap: function (e) {
    const { keyword } = e.currentTarget.dataset;
    this.setData({ searchValue: keyword });
    this.doSearch(keyword);
  },

  onMovieTap: function (e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/movie-detail/movie-detail?id=${id}`
    });
  },

  onClearInput: function () {
    this.setData({ searchValue: '', searched: false, searchResults: [] });
  }
});
