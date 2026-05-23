/**
 * 会员积分：余额表 + 流水表分离；仅由服务端业务事件写入，前端不可直接改分。
 * 人工调整须传 operatorOpenid + reason，写入流水 operator_openid / remark。
 */
const { v4: uuidv4 } = require('uuid');

function safeInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** 每 100 分（1 元实付）对应积分，默认 1；可用环境变量 POINTS_PER_100_CENTS 覆盖 */
function pointsFromOrderCents(totalPriceCents) {
  const per = Math.max(0, safeInt(process.env.POINTS_PER_100_CENTS, 1));
  return Math.floor(Math.max(0, safeInt(totalPriceCents, 0)) / 100) * per;
}

function checkInPoints() {
  return Math.max(0, safeInt(process.env.POINTS_CHECKIN_DAILY, 10));
}

/**
 * 从库读取积分数值规则（与 points_rule_config 表同步）；无行时回落环境变量。
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').Connection} conn
 */
async function getPointsPer100CentsFromDb(conn) {
  try {
    const [rows] = await conn.query(
      `SELECT rule_value FROM points_rule_config WHERE rule_key='points_per_100_cents' LIMIT 1`
    );
    const v = rows && rows[0] && rows[0].rule_value;
    if (v != null && v !== '') return Math.max(0, safeInt(v, 1));
  } catch (_) {}
  return Math.max(0, safeInt(process.env.POINTS_PER_100_CENTS, 1));
}

async function getCheckInPointsFromDb(conn) {
  try {
    const [rows] = await conn.query(
      `SELECT rule_value FROM points_rule_config WHERE rule_key='checkin_daily' LIMIT 1`
    );
    const v = rows && rows[0] && rows[0].rule_value;
    if (v != null && v !== '') return Math.max(0, safeInt(v, 10));
  } catch (_) {}
  return Math.max(0, safeInt(process.env.POINTS_CHECKIN_DAILY, 10));
}

async function pointsFromOrderCentsWithConn(conn, totalPriceCents) {
  const per = await getPointsPer100CentsFromDb(conn);
  return Math.floor(Math.max(0, safeInt(totalPriceCents, 0)) / 100) * per;
}

/**
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').Connection} conn
 */
async function ensureBalanceRow(conn, openid) {
  await conn.query(
    `INSERT IGNORE INTO user_points_balance (_openid, balance, updateTime) VALUES (?, 0, NOW())`,
    [openid]
  );
}

/**
 * 原子变更积分（同一连接内应在事务中调用）
 * @returns {{ balance: number, skipped?: boolean }}
 */
async function applyPointsDelta(conn, { openid, delta, sourceType, sourceId, remark, operatorOpenid = null }) {
  const oid = String(openid || '').trim();
  if (!oid) throw new Error('openid 缺失');
  const d = safeInt(delta, 0);
  if (!d) throw new Error('积分变动为 0');
  const st = String(sourceType || '').trim().slice(0, 32);
  const sid = String(sourceId || '').trim().slice(0, 96);
  if (!st || !sid) throw new Error('sourceType/sourceId 无效');

  await ensureBalanceRow(conn, oid);

  const [[row]] = await conn.query(`SELECT balance FROM user_points_balance WHERE _openid=? FOR UPDATE`, [oid]);
  const cur = safeInt(row && row.balance, 0);
  const next = cur + d;
  if (next < 0 && st !== 'order_refund') throw new Error('积分余额不足，无法完成扣减');

  const logId = `ptl_${uuidv4().replace(/-/g, '').slice(0, 22)}`;
  const rm = String(remark || '').slice(0, 512);
  const op = operatorOpenid ? String(operatorOpenid).slice(0, 128) : null;

  const [ins] = await conn.query(
    `
    INSERT IGNORE INTO user_points_log
      (_id,_openid,delta,balance_after,source_type,source_id,remark,operator_openid,createTime)
    VALUES (?,?,?,?,?,?,?,?,NOW())
    `,
    [logId, oid, d, next, st, sid, rm, op]
  );
  if (!ins.affectedRows) {
    const [[b2]] = await conn.query(`SELECT balance FROM user_points_balance WHERE _openid=? LIMIT 1`, [oid]);
    return { balance: safeInt(b2 && b2.balance, cur), skipped: true };
  }
  await conn.query(`UPDATE user_points_balance SET balance=?, updateTime=NOW() WHERE _openid=?`, [next, oid]);
  return { balance: next };
}

async function grantPointsForOrderPaid(conn, orderId, openid) {
  const oid = String(openid || '');
  const o = String(orderId || '');
  if (!oid || !o) return;
  const [[ord]] = await conn.query(`SELECT totalPrice FROM orders WHERE _id=? AND _openid=? LIMIT 1`, [o, oid]);
  const cents = safeInt(ord && ord.totalPrice, 0);
  const pts = await pointsFromOrderCentsWithConn(conn, cents);
  if (pts <= 0) return;
  await applyPointsDelta(conn, {
    openid: oid,
    delta: pts,
    sourceType: 'order_pay',
    sourceId: o,
    remark: `购票实付积分（${cents} 分）`,
    operatorOpenid: null
  });
}

/** 退款时扣回该笔订单发放的积分（若发过）；幂等 source_id */
async function reversePointsForOrderRefund(conn, orderId, openid) {
  const oid = String(openid || '');
  const o = String(orderId || '');
  if (!oid || !o) return;
  const [[payLog]] = await conn.query(
    `
    SELECT delta FROM user_points_log
    WHERE _openid=? AND source_type='order_pay' AND source_id=?
    LIMIT 1
    `,
    [oid, o]
  );
  if (!payLog || !payLog.delta) return;
  const earned = safeInt(payLog.delta, 0);
  if (earned <= 0) return;
  await applyPointsDelta(conn, {
    openid: oid,
    delta: -earned,
    sourceType: 'order_refund',
    sourceId: `refund_${o}`,
    remark: `订单退款扣回积分（原发放 ${earned}）`,
    operatorOpenid: null
  });
}

/** 每日签到一次，按本地日期 source_id 幂等 */
async function grantPointsDailyCheckIn(conn, openid) {
  const oid = String(openid || '').trim();
  if (!oid) throw new Error('未登录');
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const pts = await getCheckInPointsFromDb(conn);
  if (pts <= 0) throw new Error('签到积分未配置');
  return applyPointsDelta(conn, {
    openid: oid,
    delta: pts,
    sourceType: 'check_in',
    sourceId: dayKey,
    remark: '每日签到',
    operatorOpenid: null
  });
}

/** 活动领取：同一用户同一 activityKey 仅一次 */
async function grantPointsActivity(conn, openid, activityKey, pointsAmount, remark) {
  const oid = String(openid || '').trim();
  const key = String(activityKey || '').trim().slice(0, 64);
  const pts = safeInt(pointsAmount, 0);
  if (!oid || !key) throw new Error('参数无效');
  if (pts <= 0) throw new Error('活动积分无效');
  return applyPointsDelta(conn, {
    openid: oid,
    delta: pts,
    sourceType: 'activity',
    sourceId: key,
    remark: String(remark || `活动：${key}`).slice(0, 512),
    operatorOpenid: null
  });
}

async function adjustPointsManual(conn, { targetOpenid, delta, reason, operatorOpenid }) {
  const tgt = String(targetOpenid || '').trim();
  const op = String(operatorOpenid || '').trim();
  const d = safeInt(delta, 0);
  const rs = String(reason || '').trim();
  if (!tgt) throw new Error('缺少目标用户');
  if (!op) throw new Error('缺少操作人');
  if (!d) throw new Error('调整幅度不能为 0');
  if (!rs) throw new Error('请填写调整原因');
  const sid = `manual_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  return applyPointsDelta(conn, {
    openid: tgt,
    delta: d,
    sourceType: 'manual_adjust',
    sourceId: sid,
    remark: rs.slice(0, 512),
    operatorOpenid: op
  });
}

function getPointsRulesText(perOpt, cinOpt) {
  const per = perOpt != null ? Math.max(0, safeInt(perOpt, 1)) : Math.max(0, safeInt(process.env.POINTS_PER_100_CENTS, 1));
  const cin = cinOpt != null ? Math.max(0, safeInt(cinOpt, 10)) : checkInPoints();
  return [
    `购票：订单支付成功后，按实付金额每 100 分（1 元）获得 ${per} 积分（向下取整）。`,
    `签到：每日首次签到可获得 ${cin} 积分，当日重复签到不重复发放。`,
    '活动：参与平台活动可获得一次性积分，具体以活动说明为准。',
    '退款：订单退款成功后将扣回该笔订单已发放的购票积分。',
    '人工调整：仅管理员可操作，系统记录操作账号、原因与时间，可在积分流水中核对。',
    '说明：积分仅用于站内权益展示与活动，不可兑换现金；严禁通过接口伪造增减，所有变更以服务端流水为准。'
  ];
}

module.exports = {
  applyPointsDelta,
  grantPointsForOrderPaid,
  reversePointsForOrderRefund,
  grantPointsDailyCheckIn,
  grantPointsActivity,
  adjustPointsManual,
  pointsFromOrderCents,
  getPointsRulesText,
  getPointsPer100CentsFromDb,
  getCheckInPointsFromDb
};
