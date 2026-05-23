const util = require('../../utils/util.js');
const dataStorage = require('../../utils/data-storage.js');

Page({
  data: {
    searchValue: '',
    searchResults: [],
    hotSearchList: [],
    historyList: [],
    loading: false,
    searched: false,
    searchTimer: null
  },

  onLoad: function () {
    this.loadHistory();
    this.loadHotSearch();
  },

  loadHistory: function () {
    const historyList = dataStorage.getSearchHistory();
    this.setData({ historyList: historyList });
  },

  loadHotSearch: function () {
    const movies = util.getMockMovies();
    const hotSearchList = movies.sort((a, b) => (b.hot || 0) - (a.hot || 0)).slice(0, 6).map(m => m.title);
    this.setData({ hotSearchList: hotSearchList });
  },

  onSearchInput: function (e) {
    this.setData({ searchValue: e.detail.value });
    
    // 实现搜索防抖，提升用户体验
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer);
    }
    
    const value = e.detail.value.trim();
    if (value) {
      this.data.searchTimer = setTimeout(() => {
        this.doSearch(value, false);
      }, 500);
    } else {
      this.setData({ searched: false, searchResults: [] });
    }
  },

  onSearch: function () {
    const value = this.data.searchValue.trim();
    if (!value) {
      util.showToast('请输入搜索内容');
      return;
    }
    this.saveHistory(value);
    this.doSearch(value, true);
  },

  doSearch: function (keyword, saveHistoryFlag = true) {
    this.setData({ loading: true, searched: true });

    setTimeout(() => {
      const movies = util.getMockMovies();
      const results = movies.filter(m => 
        m.title.toLowerCase().includes(keyword.toLowerCase()) ||
        m.genre.toLowerCase().includes(keyword.toLowerCase()) ||
        (m.director && m.director.toLowerCase().includes(keyword.toLowerCase())) ||
        (m.actors && m.actors.toLowerCase().includes(keyword.toLowerCase()))
      );

      this.setData({ searchResults: results, loading: false });
      
      if (saveHistoryFlag) {
        this.saveHistory(keyword);
      }
    }, 300);
  },

  saveHistory: function (keyword) {
    dataStorage.addSearchHistory(keyword);
    this.loadHistory();
  },

  onClearHistory: function () {
    wx.showModal({
      title: '提示',
      content: '确定清空搜索历史吗？',
      success: (res) => {
        if (res.confirm) {
          dataStorage.clearSearchHistory();
          this.setData({ historyList: [] });
        }
      }
    });
  },

  onHotSearchTap: function (e) {
    const keyword = e.currentTarget.dataset.keyword;
    this.setData({ searchValue: keyword });
    this.saveHistory(keyword);
    this.doSearch(keyword);
  },

  onHistoryTap: function (e) {
    const keyword = e.currentTarget.dataset.keyword;
    this.setData({ searchValue: keyword });
    this.doSearch(keyword);
  },

  onMovieTap: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/movie-detail/movie-detail?id=${id}` });
  },

  onClearInput: function () {
    this.setData({ searchValue: '', searched: false, searchResults: [] });
  }
});
