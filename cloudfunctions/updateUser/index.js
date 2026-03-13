const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { nickName, avatarUrl, phone, gender } = event;

    const userRes = await db.collection('users').where({
      _openid: openid
    }).get();

    if (userRes.data.length > 0) {
      const updateData = {
        updateTime: db.serverDate()
      };

      if (nickName) updateData.nickName = nickName;
      if (avatarUrl) updateData.avatarUrl = avatarUrl;
      if (phone) updateData.phone = phone;
      if (gender !== undefined) updateData.gender = gender;

      await db.collection('users').doc(userRes.data[0]._id).update({
        data: updateData
      });

      return {
        code: 0,
        message: '更新成功',
        data: userRes.data[0]._id
      };
    } else {
      const result = await db.collection('users').add({
        data: {
          _openid: openid,
          nickName: nickName || '微信用户',
          avatarUrl: avatarUrl || '',
          phone: phone || '',
          gender: gender || 0,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      return {
        code: 0,
        message: '创建成功',
        data: result._id
      };
    }
  } catch (err) {
    return {
      code: -1,
      message: err.message,
      data: null
    };
  }
};
