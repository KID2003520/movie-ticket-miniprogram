const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const PAY_CONFIG = require('../shared/pay-config');
const payUtil = require('../shared/pay-util');

const httpsPost = (url, data) => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { resolve(body); });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const appId = wxContext.APPID;

  try {
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

    if (order.status !== 'paid') {
      return { code: -1, message: '订单状态不允许退款' };
    }

    if (order.date && order.startTime) {
      const showTime = new Date(`${order.date} ${order.startTime}`);
      if (Date.now() >= showTime.getTime() - 30 * 60 * 1000) {
        return { code: -1, message: '开场前30分钟不可退款' };
      }
    }

    if (!PAY_CONFIG.mchId || !PAY_CONFIG.apiKey) {
      return await mockRefund(orderId, order);
    }

    const nonceStr = payUtil.generateNonceStr();
    const outTradeNo = order.orderNo;
    const outRefundNo = 'REF' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
    const totalFee = order.totalPrice;
    const refundFee = order.totalPrice;
    const notifyUrl = PAY_CONFIG.refundNotifyUrl;

    const refundParams = {
      appid: appId,
      mch_id: PAY_CONFIG.mchId,
      nonce_str: nonceStr,
      out_trade_no: outTradeNo,
      out_refund_no: outRefundNo,
      total_fee: totalFee,
      refund_fee: refundFee,
      notify_url: notifyUrl,
      op_user_id: PAY_CONFIG.mchId
    };

    const sign = payUtil.generateSignature(refundParams, PAY_CONFIG.apiKey);
    refundParams.sign = sign;

    const xmlData = payUtil.buildXml(refundParams);
    const resultXml = await httpsPost('https://api.mch.weixin.qq.com/secapi/pay/refund', xmlData);
    const result = payUtil.parseXml(resultXml);

    if (result.return_code !== 'SUCCESS') {
      return { code: -1, message: result.return_msg || '退款请求失败' };
    }

    if (result.result_code !== 'SUCCESS') {
      return { code: -1, message: result.err_code_des || '退款失败' };
    }

    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'refunded',
        refundNo: outRefundNo,
        refundId: result.refund_id || '',
        refundFee: refundFee,
        refundTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });

    const seatsRes = await db.collection('seats')
      .where({ orderId: orderId })
      .get();

    for (const seat of seatsRes.data) {
      await db.collection('seats').doc(seat._id).update({
        data: {
          status: 'available',
          orderId: '',
          updateTime: db.serverDate()
        }
      });
    }

    if (order.scheduleId) {
      await updateScheduleAvailableSeats(order.scheduleId, seatsRes.data.length);
    }

    return {
      code: 0,
      message: '退款成功',
      data: {
        refundNo: outRefundNo,
        refundId: result.refund_id || ''
      }
    };
  } catch (err) {
    console.error('refundOrder error:', err);
    return { code: -1, message: err.message || '退款失败' };
  }
};

async function mockRefund(orderId, order) {
  const outRefundNo = 'REF' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();

  await db.collection('orders').doc(orderId).update({
    data: {
      status: 'refunded',
      refundNo: outRefundNo,
      refundFee: order.totalPrice,
      refundTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  });

  const seatsRes = await db.collection('seats')
    .where({ orderId: orderId })
    .get();

  for (const seat of seatsRes.data) {
    await db.collection('seats').doc(seat._id).update({
      data: {
        status: 'available',
        orderId: '',
        updateTime: db.serverDate()
      }
    });
  }

  if (order.scheduleId) {
    await updateScheduleAvailableSeats(order.scheduleId, seatsRes.data.length);
  }

  return {
    code: 0,
    message: '退款成功（模拟退款）',
    data: {
      refundNo: outRefundNo,
      isMock: true
    }
  };
}

async function updateScheduleAvailableSeats(scheduleId, seatCount) {
  try {
    const scheduleRes = await db.collection('schedules').doc(scheduleId).get();
    if (scheduleRes.data) {
      const currentAvailable = scheduleRes.data.availableSeats || 0;
      await db.collection('schedules').doc(scheduleId).update({
        data: {
          availableSeats: currentAvailable + seatCount,
          updateTime: db.serverDate()
        }
      });
    }
  } catch (err) {
    console.error('更新场次座位数失败:', err);
  }
}
