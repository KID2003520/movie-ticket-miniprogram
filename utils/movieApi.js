const API_BASE = 'https://api.wmdb.tv';

const request = (url, data = {}) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: url,
      data: data,
      method: 'GET',
      header: {
        'content-type': 'application/json'
      },
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data);
        } else {
          reject(new Error('请求失败: ' + res.statusCode));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

const searchMovies = (keyword, options = {}) => {
  const params = {
    q: keyword,
    limit: options.limit || 10,
    skip: options.skip || 0,
    lang: 'Cn'
  };
  
  if (options.actor) params.actor = options.actor;
  if (options.year) params.year = options.year;
  
  return request(`${API_BASE}/api/v1/movie/search`, params);
};

const getMovieById = (doubanId) => {
  return request(`${API_BASE}/movie/api`, { id: doubanId });
};

const getTopMovies = (type = 'imdb', limit = 50) => {
  return request(`${API_BASE}/api/v1/top`, {
    type: type,
    skip: 0,
    limit: limit,
    lang: 'Cn'
  });
};

const getComingSoon = (limit = 20) => {
  return request(`${API_BASE}/api/v1/movie/search`, {
    q: '即将上映',
    limit: limit,
    lang: 'Cn'
  });
};

const transformMovieData = (apiData) => {
  if (!apiData) return null;
  
  return {
    _id: apiData.doubanId || String(Date.now()),
    title: apiData.name || apiData.originalName || '未知电影',
    originalTitle: apiData.originalName || '',
    poster: apiData.poster || 'https://picsum.photos/300/420?random=' + Math.floor(Math.random() * 100),
    rating: apiData.doubanRating || apiData.imdbRating || 0,
    genre: (apiData.genre || []).join('/') || '未知',
    director: (apiData.director || []).map(d => d.name).join(',') || '未知',
    actors: (apiData.actor || []).map(a => a.name).join(',') || '未知',
    writer: (apiData.writer || []).map(w => w.name).join(',') || '',
    year: apiData.year || apiData.dateReleased ? apiData.dateReleased.split('-')[0] : '',
    duration: apiData.duration || 0,
    country: (apiData.country || []).join('/') || '',
    language: (apiData.language || []).join('/') || '',
    description: apiData.description || apiData.summary || '',
    status: 'showing',
    price: 35 + Math.floor(Math.random() * 20),
    hot: Math.floor(Math.random() * 1000),
    doubanId: apiData.doubanId,
    imdbId: apiData.imdbId
  };
};

const transformMovieList = (apiDataList) => {
  if (!Array.isArray(apiDataList)) return [];
  return apiDataList.map(transformMovieData).filter(m => m !== null);
};

module.exports = {
  request,
  searchMovies,
  getMovieById,
  getTopMovies,
  getComingSoon,
  transformMovieData,
  transformMovieList
};
