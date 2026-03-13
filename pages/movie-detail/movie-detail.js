const app = getApp();

Page({
  data: {
    movie: null,
    comments: [],
    isCollected: false,
    loading: true,
    commentText: '',
    commentRating: 5,
    showCommentInput: false
  },

  onLoad: function (options) {
    const { id } = options;
    this.movieId = id;
    this.loadMovieDetail();
    this.loadComments();
    this.checkCollection();
  },

  loadMovieDetail: function () {
    const movies = {
      '1': { _id: '1', title: '流浪地球2', poster: 'https://picsum.photos/300/420?random=41', rating: 8.3, genre: '科幻/冒险', duration: 173, director: '郭帆', actors: '吴京,刘德华,李雪健', description: '太阳即将毁灭，人类在地球表面建造出巨大的推进器，寻找新的家园。然而宇宙之路危机四伏，为了拯救地球，流浪地球时代的年轻人再次挺身而出，展开争分夺秒的生死之战。', releaseDate: '2023-01-22', price: 35, status: 'showing', hot: 1000 },
      '2': { _id: '2', title: '满江红', poster: 'https://picsum.photos/300/420?random=42', rating: 7.8, genre: '悬疑/喜剧', duration: 159, director: '张艺谋', actors: '沈腾,易烊千玺,张译', description: '南宋绍兴年间，岳飞死后四年，秦桧率兵与金国会谈。会谈前夜，金国使者死在宰相驻地，所携密信也不翼而飞。', releaseDate: '2023-01-22', price: 32, status: 'showing', hot: 950 },
      '3': { _id: '3', title: '熊出没·伴我熊芯', poster: 'https://picsum.photos/300/420?random=43', rating: 7.5, genre: '动画/冒险', duration: 97, director: '林汇达', actors: '张伟,张秉君,谭笑', description: '熊大熊二和光头强发现了一个神秘的机器人，这个机器人似乎与熊妈妈的失踪有着千丝万缕的联系。', releaseDate: '2023-01-22', price: 28, status: 'showing', hot: 800 },
      '4': { _id: '4', title: '无名', poster: 'https://picsum.photos/300/420?random=44', rating: 7.6, genre: '剧情/悬疑', duration: 131, director: '程耳', actors: '梁朝伟,王一博,周迅', description: '1938年至1945年间，数段隐秘历史故事在上海发生。一群无名英雄在黑暗中前行，用生命守护信仰。', releaseDate: '2023-01-22', price: 38, status: 'showing', hot: 900 },
      '5': { _id: '5', title: '深海', poster: 'https://picsum.photos/300/420?random=45', rating: 7.3, genre: '动画/奇幻', duration: 112, director: '田晓鹏', actors: '苏鑫,王亭文,滕奎兴', description: '在大海的最深处，藏着一个神秘的世界。少女参宿误入深海，邂逅了一段独特的生命旅程。', releaseDate: '2023-01-22', price: 30, status: 'showing', hot: 750 }
    };

    const movie = movies[this.movieId] || movies['1'];
    this.setData({ movie: movie, loading: false });
    wx.setNavigationBarTitle({ title: movie.title });
  },

  loadComments: function () {
    const comments = [
      { _id: '1', nickName: '电影迷', avatarUrl: '', rating: 5, content: '非常精彩的电影，特效震撼，剧情紧凑！', createTime: '2023-01-22', likes: 128 },
      { _id: '2', nickName: '小明', avatarUrl: '', rating: 4, content: '整体不错，就是结尾有点仓促。', createTime: '2023-01-21', likes: 56 },
      { _id: '3', nickName: '影迷小王', avatarUrl: '', rating: 5, content: '国产科幻的骄傲，强烈推荐！', createTime: '2023-01-20', likes: 89 }
    ];
    this.setData({ comments: comments });
  },

  checkCollection: function () {
    const collections = wx.getStorageSync('collections') || [];
    const isCollected = collections.some(c => c.movieId === this.movieId);
    this.setData({ isCollected: isCollected });
  },

  onBuyTicket: function () {
    wx.navigateTo({
      url: `/pages/cinema/cinema?movieId=${this.movieId}`
    });
  },

  onCollect: function () {
    const isLogin = app.globalData.isLogin;
    if (!isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再收藏',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/login/login' });
          }
        }
      });
      return;
    }

    let collections = wx.getStorageSync('collections') || [];
    
    if (this.data.isCollected) {
      collections = collections.filter(c => c.movieId !== this.movieId);
      wx.setStorageSync('collections', collections);
      this.setData({ isCollected: false });
      wx.showToast({ title: '已取消收藏', icon: 'success' });
    } else {
      collections.push({
        movieId: this.movieId,
        movieTitle: this.data.movie.title,
        moviePoster: this.data.movie.poster,
        createTime: new Date().toISOString()
      });
      wx.setStorageSync('collections', collections);
      this.setData({ isCollected: true });
      wx.showToast({ title: '收藏成功', icon: 'success' });
    }
  },

  onShowCommentInput: function () {
    const isLogin = app.globalData.isLogin;
    if (!isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再评论',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/login/login' });
          }
        }
      });
      return;
    }
    this.setData({ showCommentInput: true });
  },

  onHideCommentInput: function () {
    this.setData({ showCommentInput: false, commentText: '' });
  },

  onCommentInput: function (e) {
    this.setData({ commentText: e.detail.value });
  },

  onRatingChange: function (e) {
    this.setData({ commentRating: e.currentTarget.dataset.rating });
  },

  onSubmitComment: function () {
    if (!this.data.commentText.trim()) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }

    const newComment = {
      _id: Date.now().toString(),
      nickName: app.globalData.userInfo?.nickName || '用户',
      avatarUrl: app.globalData.userInfo?.avatarUrl || '',
      rating: this.data.commentRating,
      content: this.data.commentText,
      createTime: new Date().toLocaleDateString(),
      likes: 0
    };

    this.setData({
      comments: [newComment, ...this.data.comments],
      showCommentInput: false,
      commentText: '',
      commentRating: 5
    });

    wx.showToast({ title: '评论成功', icon: 'success' });
  },

  onShareAppMessage: function () {
    return {
      title: this.data.movie?.title || '电影详情',
      path: `/pages/movie-detail/movie-detail?id=${this.movieId}`,
      imageUrl: this.data.movie?.poster
    };
  }
});
