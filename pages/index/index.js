const app = getApp();

Page({
  data: {
    bannerList: [],
    hotMovies: [],
    showingMovies: [],
    comingMovies: [],
    loading: true,
    searchValue: '',
    showSearch: false
  },

  onLoad: function () {
    this.loadData();
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 0 });
    }
  },

  onPullDownRefresh: function () {
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadData: function () {
    return new Promise((resolve) => {
      setTimeout(() => {
        const bannerList = [
          { id: '1', image: 'https://picsum.photos/750/400?random=1', title: '流浪地球2', url: '/pages/movie-detail/movie-detail?id=1' },
          { id: '2', image: 'https://picsum.photos/750/400?random=2', title: '满江红', url: '/pages/movie-detail/movie-detail?id=2' },
          { id: '3', image: 'https://picsum.photos/750/400?random=3', title: '熊出没', url: '/pages/movie-detail/movie-detail?id=3' }
        ];

        const hotMovies = [
          { _id: '1', title: '流浪地球2', poster: 'https://picsum.photos/300/420?random=11', rating: 8.3, genre: '科幻', price: 35, hot: 1000 },
          { _id: '2', title: '满江红', poster: 'https://picsum.photos/300/420?random=12', rating: 7.8, genre: '悬疑', price: 32, hot: 950 },
          { _id: '3', title: '熊出没·伴我熊芯', poster: 'https://picsum.photos/300/420?random=13', rating: 7.5, genre: '动画', price: 28, hot: 800 },
          { _id: '4', title: '无名', poster: 'https://picsum.photos/300/420?random=14', rating: 7.6, genre: '剧情', price: 38, hot: 900 }
        ];

        const showingMovies = [
          { _id: '1', title: '流浪地球2', poster: 'https://picsum.photos/300/420?random=21', rating: 8.3, genre: '科幻/冒险', duration: 173, director: '郭帆', actors: '吴京,刘德华,李雪健', description: '太阳即将毁灭，人类在地球表面建造出巨大的推进器，寻找新的家园。然而宇宙之路危机四伏，为了拯救地球，流浪地球时代的年轻人再次挺身而出，展开争分夺秒的生死之战。', releaseDate: '2023-01-22', price: 35, status: 'showing', hot: 1000 },
          { _id: '2', title: '满江红', poster: 'https://picsum.photos/300/420?random=22', rating: 7.8, genre: '悬疑/喜剧', duration: 159, director: '张艺谋', actors: '沈腾,易烊千玺,张译', description: '南宋绍兴年间，岳飞死后四年，秦桧率兵与金国会谈。会谈前夜，金国使者死在宰相驻地，所携密信也不翼而飞。', releaseDate: '2023-01-22', price: 32, status: 'showing', hot: 950 },
          { _id: '3', title: '熊出没·伴我熊芯', poster: 'https://picsum.photos/300/420?random=23', rating: 7.5, genre: '动画/冒险', duration: 97, director: '林汇达', actors: '张伟,张秉君,谭笑', description: '熊大熊二和光头强发现了一个神秘的机器人，这个机器人似乎与熊妈妈的失踪有着千丝万缕的联系。', releaseDate: '2023-01-22', price: 28, status: 'showing', hot: 800 },
          { _id: '4', title: '无名', poster: 'https://picsum.photos/300/420?random=24', rating: 7.6, genre: '剧情/悬疑', duration: 131, director: '程耳', actors: '梁朝伟,王一博,周迅', description: '1938年至1945年间，数段隐秘历史故事在上海发生。一群无名英雄在黑暗中前行，用生命守护信仰。', releaseDate: '2023-01-22', price: 38, status: 'showing', hot: 900 },
          { _id: '5', title: '深海', poster: 'https://picsum.photos/300/420?random=25', rating: 7.3, genre: '动画/奇幻', duration: 112, director: '田晓鹏', actors: '苏鑫,王亭文,滕奎兴', description: '在大海的最深处，藏着一个神秘的世界。少女参宿误入深海，邂逅了一段独特的生命旅程。', releaseDate: '2023-01-22', price: 30, status: 'showing', hot: 750 },
          { _id: '6', title: '蚁人与黄蜂女', poster: 'https://picsum.photos/300/420?random=26', rating: 6.8, genre: '动作/科幻', duration: 125, director: '佩顿·里德', actors: '保罗·路德,伊万杰琳·莉莉', description: '蚁人和黄蜂女意外进入量子领域，他们必须面对征服者康，并找到回家的路。', releaseDate: '2023-02-17', price: 45, status: 'showing', hot: 600 }
        ];

        const comingMovies = [
          { _id: '7', title: '黑豹2：瓦坎达万岁', poster: 'https://picsum.photos/300/420?random=27', rating: 6.5, genre: '动作/科幻', duration: 161, director: '瑞恩·库格勒', actors: '莱蒂希娅·赖特,露皮塔·尼永奥', description: '瓦坎达正在为失去国王而哀悼，新的威胁从海底出现，瓦坎达必须团结起来保护自己的国家。', releaseDate: '2023-02-07', price: 42, status: 'coming', hot: 550 },
          { _id: '8', title: '蚁人与黄蜂女：量子领域', poster: 'https://picsum.photos/300/420?random=28', rating: 6.8, genre: '动作/科幻', duration: 125, director: '佩顿·里德', actors: '保罗·路德,伊万杰琳·莉莉,乔纳森·梅杰斯', description: '蚁人和黄蜂女意外进入量子领域，他们必须面对征服者康，并找到回家的路。', releaseDate: '2023-02-17', price: 45, status: 'coming', hot: 600 }
        ];

        this.setData({
          bannerList: bannerList,
          hotMovies: hotMovies,
          showingMovies: showingMovies,
          comingMovies: comingMovies,
          loading: false
        });

        resolve();
      }, 500);
    });
  },

  onBannerTap: function (e) {
    const { id } = e.currentTarget.dataset;
    const banner = this.data.bannerList.find(b => b.id === id);
    if (banner && banner.url) {
      wx.navigateTo({ url: banner.url });
    }
  },

  onMovieTap: function (e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/movie-detail/movie-detail?id=${id}`
    });
  },

  onMoreTap: function () {
    wx.switchTab({
      url: '/pages/movie/movie'
    });
  },

  onSearchTap: function () {
    wx.navigateTo({
      url: '/pages/search/search'
    });
  },

  onShareAppMessage: function () {
    return {
      title: '电影购票小程序',
      path: '/pages/index/index'
    };
  }
});
