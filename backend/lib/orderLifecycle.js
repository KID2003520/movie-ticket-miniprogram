/**
 * 订单支付、取消、退款（与 server.js 用户接口共用逻辑，供管理端人工干预调用）
 */
const pointsService = require('./pointsService');

function safeInt(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

/** 将待支付订单置为已支付并扣减场次可售座位（与 mockPay / 支付宝回调共用） */
async function fulfillOrderAfterPayment(conn, order) {
  const orderId = order._id;
  const openid = order._openid;
  const [r1] = await conn.query(
    `UPDATE orders SET status='paid', payTime=NOW(), updateTime=NOW() WHERE _id=? AND _openid=? AND status='pending'`,
    [orderId, openid]
  );
  if (!r1 || !r1.affectedRows) return false;
  await conn.query(`UPDATE seats SET status='sold', updateTime=NOW() WHERE orderId=?`, [orderId]);
  const seatCount = safeInt(order.seatCount, 0);
  await conn.query(
    `UPDATE schedules SET availableSeats = GREATEST(0, availableSeats - ?) , updateTime=NOW() WHERE _id=?`,
    [seatCount, order.scheduleId]
  );
  const couponId = String(order.couponId || '').trim();
  if (couponId) {
    await conn.query(
      `
        UPDATE user_coupons
        SET status='used', lockOrderId=NULL, usedOrderId=?, usedTime=NOW(), updateTime=NOW()
        WHERE _id=? AND _openid=? AND status='locked' AND lockOrderId=?
      `,
      [orderId, couponId, openid, orderId]
    );
  }
  try {
    await pointsService.grantPointsForOrderPaid(conn, orderId, openid);
  } catch (pe) {
    console.error('[points] order pay grant:', pe.message || pe);
  }
  return true;
}

/** 管理端：取消待支付订单并释放座位、优惠券 */
async function cancelPendingOrder(conn, orderId) {
  const [rowsData] = await conn.query(
    `SELECT _id, _openid, status, couponId FROM orders WHERE _id=? LIMIT 1`,
    [orderId]
  );
  const order = rowsData[0];
  if (!order) throw new Error('订单不存在');
  if (order.status !== 'pending') throw new Error('仅待支付订单可取消');

  const [r] = await conn.query(
    `UPDATE orders SET status='cancelled', updateTime=NOW() WHERE _id=? AND status='pending'`,
    [orderId]
  );
  if (!r || !r.affectedRows) throw new Error('取消失败（状态可能已变更）');

  await conn.query(
    `UPDATE seats SET status='available', orderId=NULL, updateTime=NOW() WHERE orderId=?`,
    [orderId]
  );
  const openid = String(order._openid || '');
  if (order.couponId && openid) {
    await conn.query(
      `
        UPDATE user_coupons
        SET status='available', lockOrderId=NULL, updateTime=NOW()
        WHERE _id=? AND _openid=? AND status='locked' AND lockOrderId=?
      `,
      [String(order.couponId), openid, orderId]
    );
  }
}

/** 管理端 / 用户：已支付订单退款（释放座位、回补场次库存、积分冲正） */
async function refundPaidOrder(conn, orderId) {
  const [rowsData] = await conn.query(
    `SELECT _id, _openid, status, seatCount, scheduleId FROM orders WHERE _id=? LIMIT 1`,
    [orderId]
  );
  const order = rowsData[0];
  if (!order) throw new Error('订单不存在');
  if (order.status !== 'paid') throw new Error('仅已支付订单可退款');

  const [r] = await conn.query(
    `UPDATE orders SET status='refunded', refundTime=NOW(), updateTime=NOW() WHERE _id=? AND status='paid'`,
    [orderId]
  );
  if (!r || !r.affectedRows) throw new Error('退款失败（状态可能已变更）');

  await conn.query(
    `UPDATE seats SET status='available', orderId=NULL, updateTime=NOW() WHERE orderId=?`,
    [orderId]
  );

  const seatCount = safeInt(order.seatCount, 0);
  await conn.query(
    `UPDATE schedules SET availableSeats = availableSeats + ?, updateTime=NOW() WHERE _id=?`,
    [seatCount, order.scheduleId]
  );

  try {
    await pointsService.reversePointsForOrderRefund(conn, orderId, order._openid);
  } catch (pe) {
    console.error('[points] order refund reversal:', pe.message || pe);
  }
}

module.exports = {
  safeInt,
  fulfillOrderAfterPayment,
  cancelPendingOrder,
  refundPaidOrder
};
