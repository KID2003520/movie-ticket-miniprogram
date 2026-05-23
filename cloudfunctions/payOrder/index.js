const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const PAY_CONFIG = require('../shared/pay-config');

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 防止在真实支付已配置时被客户端直接调用把订单伪造成已支付
    if (PAY_CONFIG && PAY_CONFIG.mchId && PAY_CONFIG.apiKey) {
      return { code: -1, message: '已配置真实支付，不允许使用模拟支付接口' };
    }

    const { orderId } = event;

    if (!orderId) {
      return { code: -1, message: '缺少订单ID' };
    }

    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
      return { code: -1, message: '订单不存在' };
    }

    const order = orderRes.data;

    if (order._openid !== openid) {
      return { code: -1, message: '无权操作此订单' };
    }

    if (order.status !== 'pending') {
      return { code: -1, message: '订单状态不允许支付' };
    }

    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'paid',
        payTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });

    const seatsRes = await db.collection('seats')
      .where({ orderId: orderId })
      .get();

    for (const seat of seatsRes.data) {
      await db.collection('seats').doc(seat._id).update({
        data: {
          status: 'sold',
          updateTime: db.serverDate()
        }
      });
    }

    if (order.scheduleId) {
      await updateScheduleAvailableSeats(order.scheduleId, seatsRes.data.length);
    }

    return { code: 0, message: '支付成功' };
  } catch (err) {
    console.error('payOrder error:', err);
    return { code: -1, message: err.message || '支付失败' };
  }
};

async function updateScheduleAvailableSeats(scheduleId, seatCount) {
  try {
    const scheduleRes = await db.collection('schedules').doc(scheduleId).get();
    if (scheduleRes.data) {
      const currentAvailable = scheduleRes.data.availableSeats || 0;
      await db.collection('schedules').doc(scheduleId).update({
        data: {
          availableSeats: Math.max(0, currentAvailable - seatCount),
          updateTime: db.serverDate()
        }
      });
    }
  } catch (err) {
    console.error('更新场次座位数失败:', err);
  }
}
