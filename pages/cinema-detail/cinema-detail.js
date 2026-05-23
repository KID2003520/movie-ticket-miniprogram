const backendApi = require('../../utils/backendApi.js');
const util = require('../../utils/util.js');
const { proxyPosterUrl } = require('../../utils/normalizeMovie.js');

Page({
  data: {
    cinema: null,
    movies: [],
    currentMovieId: '',
    schedules: [],
    allSchedules: [],
    dateList: [],
    currentDateIndex: 0,
    loading: true,
    movieId: ''
  },

  onLoad: function (options) {
    const { id, movieId } = options;
    this.cinemaId = id;
    this.movieId = movieId || '';
    this.setData({ currentMovieId: this.movieId || '' });
    this.generateDateList();
    this.loadCinemaDetail();
  },

  generateDateList: function () {
    const dateList = [];
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const weekDay = weekDays[date.getDay()];
      dateList.push({
        date: `${month}月${day}日`,
        weekDay: i === 0 ? '今天' : i === 1 ? '明天' : weekDay,
        fullDate: `${date.getFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      });
    }
    this.setData({ dateList: dateList });
  },

  loadCinemaDetail: function () {
    this.setData({ loading: true });
    backendApi
      .getCinemaById(this.cinemaId)
      .then((res) => {
        const cinema = res && res.data ? res.data : null;
        if (!cinema) throw new Error('影院不存在');
        this.setData({ cinema, loading: false });
        wx.setNavigationBarTitle({ title: cinema.name });
        this.loadSchedules();
      })
      .catch(() => {
        this.setData({ loading: false, cinema: null, schedules: [] });
        wx.showToast({ title: '加载影院失败', icon: 'none' });
      });
  },

  loadSchedules: function () {
    const date = this.data.dateList[this.data.currentDateIndex];
    /** 仅从「影片详情·购票」进来时带 this.movieId；传给后端后无排期会为该片 bootstrap。浏览影院列表进来的不要带，否则会只返回单场电影且无法切换场次条上的其它片 */
    const focusMovieId = String(this.movieId || '').trim();
    const req = {
      cinemaId: this.cinemaId,
      date: date.fullDate,
      movieId: focusMovieId
    };
    backendApi
      .getSchedules(req)
      .then((res) => {
        const items = (res && res.data && res.data.items) || [];
        const movieMap = new Map();
        items.forEach((s) => {
          const key = String(s.movieId || '');
          if (!key) return;
          if (!movieMap.has(key)) {
            movieMap.set(key, {
              movieId: key,
              movieTitle: s.movieTitle || '未命名电影',
              moviePoster: proxyPosterUrl(s.moviePoster) || ''
            });
          }
        });
        const movies = Array.from(movieMap.values());

        let currentMovieId = this.data.currentMovieId;
        if (!currentMovieId || !movieMap.has(String(currentMovieId))) {
          currentMovieId = movies.length ? movies[0].movieId : '';
        }

        const schedules = currentMovieId
          ? items.filter((s) => String(s.movieId) === String(currentMovieId))
          : items;

        this.setData({
          allSchedules: items,
          movies,
          currentMovieId,
          schedules
        });
      })
      .catch(() => {
        this.setData({ schedules: [], allSchedules: [], movies: [], currentMovieId: '' });
      });
  },

  onMovieChange: function (e) {
    const movieId = e.currentTarget.dataset.movieid;
    const all = this.data.allSchedules || [];
    const schedules = all.filter((s) => String(s.movieId) === String(movieId));
    this.setData({
      currentMovieId: String(movieId),
      schedules
    });
  },

  onDateChange: function (e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ currentDateIndex: index });
    this.loadSchedules();
  },

  onScheduleTap: function (e) {
    const { id } = e.currentTarget.dataset;
    const url = `/pages/seat-selection/seat-selection?id=${id}`;
    if (!util.requireLoginForPurchase(url)) return;
    wx.navigateTo({ url });
  },

  onLocationTap: function () {
    if (this.data.cinema) {
      wx.openLocation({
        latitude: this.data.cinema.latitude,
        longitude: this.data.cinema.longitude,
        name: this.data.cinema.name,
        address: this.data.cinema.address,
        scale: 15
      });
    }
  }
});
