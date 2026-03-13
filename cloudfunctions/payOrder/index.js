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
    const { orderId, payResult } = event;

    const order = await db.collection('orders').doc(orderId).get();
    if (!order.data) {
      return {
        code: -1,
        message: '订单不存在',
        data: null
      };
    }

    if (order.data._openid !== openid) {
      return {
        code: -1,
        message: '无权操作此订单',
        data: null
      };
    }

    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'paid',
        payTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });

    const seats = await db.collection('seats')
      .where({
        orderId: orderId
      })
      .get();

    for (const seat of seats.data) {
      await db.collection('seats').doc(seat._id).update({
        data: {
          status: 'sold',
          updateTime: db.serverDate()
        }
      });
    }

    return {
      code: 0,
      message: '支付成功',
      data: null
    };
  } catch (err) {
    return {
      code: -1,
      message: err.message,
      data: null
    };
  }
};
