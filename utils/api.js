const util = require('./util');

const getUserInfo = () => {
  return util.db.collection('users').where({
    _openid: '{openid}'
  }).get();
};

const updateUserInfo = (data) => {
  return util.request('updateUser', data);
};

const addUser = (data) => {
  return util.db.collection('users').add({
    data: {
      ...data,
      createTime: util.db.serverDate(),
      updateTime: util.db.serverDate()
    }
  });
};

const getMovieList = (params = {}) => {
  const { status = 'showing', limit = 10, skip = 0 } = params;
  
  return util.db.collection('movies')
    .where({
      status: status
    })
    .orderBy('hot', 'desc')
    .skip(skip)
    .limit(limit)
    .get();
};

const getMovieDetail = (id) => {
  return util.db.collection('movies').doc(id).get();
};

const getCinemaList = (params = {}) => {
  const { city = '', limit = 10, skip = 0 } = params;
  
  let query = util.db.collection('cinemas');
  
  if (city) {
    query = query.where({
      city: city
    });
  }
  
  return query
    .orderBy('distance', 'asc')
    .skip(skip)
    .limit(limit)
    .get();
};

const getCinemaDetail = (id) => {
  return util.db.collection('cinemas').doc(id).get();
};

const getScheduleList = (params = {}) => {
  const { cinemaId, movieId, date } = params;
  
  let query = util.db.collection('schedules');
  
  if (cinemaId) {
    query = query.where({ cinemaId: cinemaId });
  }
  
  if (movieId) {
    query = query.where({ movieId: movieId });
  }
  
  if (date) {
    query = query.where({ date: date });
  }
  
  return query
    .orderBy('startTime', 'asc')
    .get();
};

const getScheduleDetail = (id) => {
  return util.db.collection('schedules').doc(id).get();
};

const createOrder = (data) => {
  return util.request('createOrder', data);
};

const getOrderList = (params = {}) => {
  const { status = '', limit = 10, skip = 0 } = params;
  
  let query = util.db.collection('orders').where({
    _openid: '{openid}'
  });
  
  if (status) {
    query = query.where({ status: status });
  }
  
  return query
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(limit)
    .get();
};

const getOrderDetail = (id) => {
  return util.db.collection('orders').doc(id).get();
};

const updateOrderStatus = (id, status) => {
  return util.db.collection('orders').doc(id).update({
    data: {
      status: status,
      updateTime: util.db.serverDate()
    }
  });
};

const getSeatList = (scheduleId) => {
  return util.db.collection('seats')
    .where({
      scheduleId: scheduleId
    })
    .get();
};

const createSeat = (data) => {
  return util.db.collection('seats').add({
    data: {
      ...data,
      createTime: util.db.serverDate()
    }
  });
};

const getCommentList = (params = {}) => {
  const { movieId, limit = 10, skip = 0 } = params;
  
  return util.db.collection('comments')
    .where({
      movieId: movieId
    })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(limit)
    .get();
};

const addComment = (data) => {
  return util.db.collection('comments').add({
    data: {
      ...data,
      createTime: util.db.serverDate()
    }
  });
};

const getCollectionList = (params = {}) => {
  const { limit = 10, skip = 0 } = params;
  
  return util.db.collection('collections')
    .where({
      _openid: '{openid}'
    })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(limit)
    .get();
};

const addCollection = (data) => {
  return util.db.collection('collections').add({
    data: {
      ...data,
      createTime: util.db.serverDate()
    }
  });
};

const removeCollection = (id) => {
  return util.db.collection('collections').doc(id).remove();
};

const checkCollection = (movieId) => {
  return util.db.collection('collections')
    .where({
      _openid: '{openid}',
      movieId: movieId
    })
    .count();
};

const getCouponList = (params = {}) => {
  const { status = 'valid', limit = 10, skip = 0 } = params;
  
  return util.db.collection('coupons')
    .where({
      _openid: '{openid}',
      status: status
    })
    .orderBy('expireTime', 'asc')
    .skip(skip)
    .limit(limit)
    .get();
};

module.exports = {
  getUserInfo,
  updateUserInfo,
  addUser,
  getMovieList,
  getMovieDetail,
  getCinemaList,
  getCinemaDetail,
  getScheduleList,
  getScheduleDetail,
  createOrder,
  getOrderList,
  getOrderDetail,
  updateOrderStatus,
  getSeatList,
  createSeat,
  getCommentList,
  addComment,
  getCollectionList,
  addCollection,
  removeCollection,
  checkCollection,
  getCouponList
};
