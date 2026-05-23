Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '首页',
        iconPath: '/images/tab/home.png',
        selectedIconPath: '/images/tab/home-active.png'
      },
      {
        pagePath: '/pages/movie/movie',
        text: '电影',
        iconPath: '/images/tab/movie.png',
        selectedIconPath: '/images/tab/movie-active.png'
      },
      {
        pagePath: '/pages/cinema/cinema',
        text: '影院',
        iconPath: '/images/tab/cinema.png',
        selectedIconPath: '/images/tab/cinema-active.png'
      },
      {
        pagePath: '/pages/user/user',
        text: '我的',
        iconPath: '/images/tab/user.png',
        selectedIconPath: '/images/tab/user-active.png'
      }
    ]
  },

  methods: {
    switchTab(e) {
      const { path, index } = e.currentTarget.dataset;
      if (this.data.selected === index) return;
      this.setData({ selected: index });
      wx.switchTab({ url: path });
    }
  }
});
