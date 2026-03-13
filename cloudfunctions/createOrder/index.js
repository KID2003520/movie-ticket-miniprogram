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
    const { scheduleId, seats, totalPrice, couponId } = event;

    const schedule = await db.collection('schedules').doc(scheduleId).get();
    if (!schedule.data) {
      return {
        code: -1,
        message: '场次不存在',
        data: null
      };
    }

    const orderNo = 'ORD' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();

    const orderData = {
      _openid: openid,
      orderNo: orderNo,
      scheduleId: scheduleId,
      movieId: schedule.data.movieId,
      cinemaId: schedule.data.cinemaId,
      seats: seats,
      seatCount: seats.length,
      totalPrice: totalPrice,
      couponId: couponId || '',
      status: 'pending',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    };

    const result = await db.collection('orders').add({
      data: orderData
    });

    for (const seat of seats) {
      await db.collection('seats').add({
        data: {
          scheduleId: scheduleId,
          row: seat.row,
          col: seat.col,
          status: 'locked',
          orderId: result._id,
          createTime: db.serverDate()
        }
      });
    }

    return {
      code: 0,
      message: '订单创建成功',
      data: {
        orderId: result._id,
        orderNo: orderNo
      }
    };
  } catch (err) {
    return {
      code: -1,
      message: err.message,
      data: null
    };
  }
};
