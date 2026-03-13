Page({
  data: {
    isEdit: false,
    movieId: '',
    form: {
      title: '',
      genre: '',
      genreValue: '',
      releaseDate: '',
      duration: '',
      director: '',
      actors: '',
      poster: '',
      description: '',
      price: '',
      rating: '',
      status: 'showing'
    },
    genrePickerData: [
      ['动作', '喜剧', '剧情', '科幻', '爱情', '动画', '悬疑', '恐怖', '战争', '纪录片']
    ],
    genreMap: {
      '动作': 'action',
      '喜剧': 'comedy',
      '剧情': 'drama',
      '科幻': 'scifi',
      '爱情': 'romance',
      '动画': 'animation',
      '悬疑': 'thriller',
      '恐怖': 'horror',
      '战争': 'war',
      '纪录片': 'documentary'
    },
    showConfirmModal: false,
    hasChanges: false
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ isEdit: true, movieId: options.id });
      this.loadMovieData(options.id);
      wx.setNavigationBarTitle({ title: '编辑电影' });
    } else {
      wx.setNavigationBarTitle({ title: '添加电影' });
    }
  },

  loadMovieData: function (id) {
    const movies = wx.getStorageSync('adminMovies') || [];
    const movie = movies.find(m => m._id === id);
    
    if (movie) {
      this.setData({
        form: {
          title: movie.title || '',
          genre: movie.genre || '',
          genreValue: movie.genreValue || '',
          releaseDate: movie.releaseDate || '',
          duration: movie.duration ? String(movie.duration) : '',
          director: movie.director || '',
          actors: movie.actors || '',
          poster: movie.poster || '',
          description: movie.description || '',
          price: movie.price ? String(movie.price) : '',
          rating: movie.rating ? String(movie.rating) : '',
          status: movie.status || 'showing'
        }
      });
    }
  },

  onTitleInput: function (e) {
    this.setData({ 'form.title': e.detail.value, hasChanges: true });
  },

  onGenreChange: function (e) {
    const index = e.detail.value[0];
    const genreLabel = this.data.genrePickerData[0][index];
    const genreValue = this.data.genreMap[genreLabel];
    
    this.setData({
      'form.genre': genreLabel,
      'form.genreValue': genreValue,
      hasChanges: true
    });
  },

  onGenreColumnChange: function (e) {
  },

  onDateChange: function (e) {
    this.setData({ 'form.releaseDate': e.detail.value, hasChanges: true });
  },

  onDurationInput: function (e) {
    this.setData({ 'form.duration': e.detail.value, hasChanges: true });
  },

  onDirectorInput: function (e) {
    this.setData({ 'form.director': e.detail.value, hasChanges: true });
  },

  onActorsInput: function (e) {
    this.setData({ 'form.actors': e.detail.value, hasChanges: true });
  },

  onDescriptionInput: function (e) {
    this.setData({ 'form.description': e.detail.value, hasChanges: true });
  },

  onPriceInput: function (e) {
    this.setData({ 'form.price': e.detail.value, hasChanges: true });
  },

  onRatingInput: function (e) {
    let value = e.detail.value;
    if (parseFloat(value) > 10) {
      value = '10';
    }
    this.setData({ 'form.rating': value, hasChanges: true });
  },

  onStatusChange: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ 'form.status': status, hasChanges: true });
  },

  onUploadPoster: function () {
    const that = this;
    wx.showActionSheet({
      itemList: ['输入图片链接', '选择本地图片'],
      success: function (res) {
        if (res.tapIndex === 0) {
          wx.showModal({
            title: '输入图片链接',
            editable: true,
            placeholderText: '请输入图片URL',
            success: function (modalRes) {
              if (modalRes.confirm && modalRes.content) {
                that.setData({ 'form.poster': modalRes.content, hasChanges: true });
              }
            }
          });
        } else if (res.tapIndex === 1) {
          wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            success: function (chooseRes) {
              const tempFilePath = chooseRes.tempFiles[0].tempFilePath;
              that.setData({ 'form.poster': tempFilePath, hasChanges: true });
            }
          });
        }
      }
    });
  },

  validateForm: function () {
    const { form } = this.data;
    const errors = [];

    if (!form.title.trim()) {
      errors.push('请输入电影名称');
    }
    if (!form.genre) {
      errors.push('请选择电影类型');
    }
    if (!form.releaseDate) {
      errors.push('请选择上映日期');
    }
    if (!form.duration || parseInt(form.duration) <= 0) {
      errors.push('请输入有效的电影时长');
    }
    if (!form.poster) {
      errors.push('请上传电影海报');
    }
    if (!form.price || parseFloat(form.price) <= 0) {
      errors.push('请输入有效的票价');
    }

    if (errors.length > 0) {
      wx.showToast({
        title: errors[0],
        icon: 'none'
      });
      return false;
    }

    return true;
  },

  onSubmit: function () {
    if (!this.validateForm()) return;

    wx.showLoading({ title: '保存中...' });

    setTimeout(() => {
      const { form, isEdit, movieId } = this.data;
      const movies = wx.getStorageSync('adminMovies') || [];

      const movieData = {
        _id: isEdit ? movieId : 'movie_' + Date.now(),
        title: form.title.trim(),
        genre: form.genre,
        genreValue: form.genreValue,
        releaseDate: form.releaseDate,
        duration: parseInt(form.duration),
        director: form.director.trim(),
        actors: form.actors.trim(),
        poster: form.poster,
        description: form.description.trim(),
        price: parseFloat(form.price),
        rating: parseFloat(form.rating) || 0,
        status: form.status,
        boxOffice: 0,
        createTime: isEdit ? (movies.find(m => m._id === movieId)?.createTime || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]
      };

      if (isEdit) {
        const index = movies.findIndex(m => m._id === movieId);
        if (index !== -1) {
          movieData.boxOffice = movies[index].boxOffice || 0;
          movies[index] = movieData;
        }
      } else {
        movies.unshift(movieData);
      }

      wx.setStorageSync('adminMovies', movies);

      wx.hideLoading();
      wx.showToast({
        title: isEdit ? '修改成功' : '添加成功',
        icon: 'success'
      });

      this.setData({ hasChanges: false });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }, 500);
  },

  onCancel: function () {
    if (this.data.hasChanges) {
      this.setData({ showConfirmModal: true });
    } else {
      wx.navigateBack();
    }
  },

  onCancelModal: function () {
    this.setData({ showConfirmModal: false });
  },

  onConfirmLeave: function () {
    this.setData({ showConfirmModal: false, hasChanges: false });
    wx.navigateBack();
  }
});
