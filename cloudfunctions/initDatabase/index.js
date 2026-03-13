const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const collections = [
      'users',
      'movies',
      'cinemas',
      'schedules',
      'seats',
      'orders',
      'comments',
      'collections',
      'coupons'
    ];

    const results = [];

    for (const name of collections) {
      try {
        await db.createCollection(name);
        results.push({
          collection: name,
          status: 'created'
        });
      } catch (err) {
        if (err.errCode === -1) {
          results.push({
            collection: name,
            status: 'already_exists'
          });
        } else {
          results.push({
            collection: name,
            status: 'error',
            message: err.message
          });
        }
      }
    }

    return {
      code: 0,
      message: '数据库初始化完成',
      data: results
    };
  } catch (err) {
    return {
      code: -1,
      message: err.message,
      data: null
    };
  }
};
