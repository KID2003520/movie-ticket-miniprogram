const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const PAY_CONFIG = require('../shared/pay-config');
const payUtil = require('../shared/pay-util');

exports.main = async (event, context) => {
  console.log('payNotify event:', JSON.stringify(event));

  try {
    const outTradeNo = event.outTradeNo || event.out_trade_no;
    const transactionId = event.transactionId || event.transaction_id || '';
    const openid = event.openid || '';
    const totalFee = Number(event.totalFee || event.total_fee);

    if (!outTradeNo) return buildFailResponse('缺少订单号');
    if (!Number.isFinite(totalFee)) return buildFailResponse('金额参数错误');

    // 可选：在回调中强制做签名校验（默认 false）
    // 注意：微信回调字段在不同集成方式下可能不一致，因此默认不做强校验，避免误拒真实支付回调
    if (PAY_CONFIG && PAY_CONFIG.apiKey && PAY_CONFIG.requireNotifySignature === true && event && event.sign) {
      const ok = payUtil.verifySignature(event, PAY_CONFIG.apiKey);
      if (!ok) return buildFailResponse('签名校验失败');
    }

    const orderRes = await db.collection('orders').where({ orderNo: outTradeNo }).get();
    if (!orderRes.data || orderRes.data.length === 0) return buildFailResponse('订单不存在');

    const order = orderRes.data[0];

    if (order.status !== 'pending') return buildSuccessResponse();

    // 如果回调里带了 openid，做越权一致性校验
    if (openid && order._openid && order._openid !== openid) {
      return buildFailResponse('openid 不匹配');
    }

    if (Number(order.totalPrice) !== totalFee) {
      console.error('金额不匹配:', order.totalPrice, totalFee);
      return buildFailResponse('金额不匹配');
    }

    await db.collection('orders').doc(order._id).update({
      data: {
        status: 'paid',
        transactionId: transactionId || '',
        payTime: db.serverDate(),
        payOpenid: openid || order._openid,
        updateTime: db.serverDate()
      }
    });

    const seatsRes = await db.collection('seats')
      .where({
        orderId: order._id
      })
      .get();

    for (const seat of seatsRes.data) {
      await db.collection('seats').doc(seat._id).update({
        data: {
          status: 'sold',
          updateTime: db.serverDate()
        }
      });
    }

    await updateScheduleAvailableSeats(order.scheduleId, seatsRes.data.length);

    console.log('支付回调处理成功:', outTradeNo);

    return buildSuccessResponse('SUCCESS');
  } catch (err) {
    console.error('payNotify error:', err);
    return buildFailResponse(err.message || 'FAIL');
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

function buildSuccessResponse(message) {
  // 微信支付回调通常要求返回 SUCCESS；HTTP触发器返回字符串即可
  return 'SUCCESS';
}

function buildFailResponse(message) {
  return 'FAIL';
}
