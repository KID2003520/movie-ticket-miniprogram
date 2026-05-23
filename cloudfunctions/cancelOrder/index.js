const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { orderId } = event || {};
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

    // 只允许对待支付订单执行取消（已支付/已取消/已退款等都视为已处理）
    if (order.status !== 'pending') {
      return { code: 0, message: '订单已处理，无需取消' };
    }

    // 1) 取消订单
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'cancelled',
        updateTime: db.serverDate()
      }
    });

    // 2) 释放锁座：pending 订单尚未扣减 availableSeats，因此不需要调整场次 availableSeats
    await db.collection('seats').where({ orderId }).update({
      data: {
        status: 'available',
        orderId: '',
        updateTime: db.serverDate()
      }
    });

    return { code: 0, message: '取消成功' };
  } catch (err) {
    console.error('cancelOrder error:', err);
    return { code: -1, message: err.message || '取消失败' };
  }
};

