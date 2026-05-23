const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    
    if (userRes.data.length === 0) {
      await db.collection('users').add({
        data: {
          _openid: openid,
          nickName: '微信用户',
          avatarUrl: 'https://picsum.photos/100/100',
          phone: '',
          gender: 0,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });
    }

    const user = userRes.data[0] || await db.collection('users').where({ _openid: openid }).get().then(res => res.data[0]);
    
    return { code: 0, message: '登录成功', data: { openid, userInfo: user } };
  } catch (err) {
    return { code: -1, message: err.message, data: null };
  }
};
