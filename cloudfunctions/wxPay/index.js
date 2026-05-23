const cloud = require('wx-server-sdk');
const https = require('https');
const querystring = require('querystring');

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
      return { code: -1, message: '缺少订单ID', data: null };
    }

    const orderRes = await db.collection('orders').doc(orderId).get();
    if (!orderRes.data) {
      return { code: -1, message: '订单不存在', data: null };
    }

    const order = orderRes.data;

    if (order._openid !== openid) {
      return { code: -1, message: '无权操作此订单', data: null };
    }

    if (order.status !== 'pending') {
      return { code: -1, message: '订单状态不允许支付', data: null };
    }

    const now = Date.now();
    const createTime = new Date(order.createTime).getTime();
    if (now - createTime > 15 * 60 * 1000) {
      await db.collection('orders').doc(orderId).update({
        data: { status: 'cancelled', updateTime: db.serverDate() }
      });

      // 释放超时锁座：pending 订单不会扣减 availableSeats
      await db.collection('seats').where({ orderId: orderId }).update({
        data: {
          status: 'available',
          orderId: '',
          updateTime: db.serverDate()
        }
      });

      return { code: -1, message: '订单已超时', data: null };
    }

    if (!PAY_CONFIG.mchId || !PAY_CONFIG.apiKey) {
      return await mockPayment(orderId, order);
    }

    const nonceStr = payUtil.generateNonceStr();
    const outTradeNo = order.orderNo;
    const totalFee = order.totalPrice;
    const body = `电影票-${order.movieTitle || '电影订单'}`;
    const spbillCreateIp = '127.0.0.1';
    const notifyUrl = PAY_CONFIG.notifyUrl;
    const tradeType = 'JSAPI';

    const unifiedOrderParams = {
      appid: appId,
      mch_id: PAY_CONFIG.mchId,
      nonce_str: nonceStr,
      body: body,
      out_trade_no: outTradeNo,
      total_fee: totalFee,
      spbill_create_ip: spbillCreateIp,
      notify_url: notifyUrl,
      trade_type: tradeType,
      openid: openid
    };

    const sign = payUtil.generateSignature(unifiedOrderParams, PAY_CONFIG.apiKey);
    unifiedOrderParams.sign = sign;

    const xmlData = payUtil.buildXml(unifiedOrderParams);
    const resultXml = await httpsPost('https://api.mch.weixin.qq.com/pay/unifiedorder', xmlData);
    const result = payUtil.parseXml(resultXml);

    if (result.return_code !== 'SUCCESS') {
      return { code: -1, message: result.return_msg || '统一下单失败', data: null };
    }

    if (result.result_code !== 'SUCCESS') {
      return { code: -1, message: result.err_code_des || '下单失败', data: null };
    }

    const prepayId = result.prepay_id;
    const timeStamp = payUtil.generateTimeStamp();
    const packageValue = `prepay_id=${prepayId}`;
    const paySign = payUtil.generatePaySign(
      appId,
      timeStamp,
      nonceStr,
      packageValue,
      'MD5',
      PAY_CONFIG.apiKey
    );

    await db.collection('orders').doc(orderId).update({
      data: {
        prepayId: prepayId,
        updateTime: db.serverDate()
      }
    });

    return {
      code: 0,
      message: '支付参数获取成功',
      data: {
        timeStamp: timeStamp,
        nonceStr: nonceStr,
        package: packageValue,
        signType: 'MD5',
        paySign: paySign,
        orderId: orderId
      }
    };
  } catch (err) {
    console.error('wxPay error:', err);
    return { code: -1, message: err.message || '支付失败', data: null };
  }
};

async function mockPayment(orderId, order) {
  const appId = 'wx' + Date.now();
  const nonceStr = payUtil.generateNonceStr();
  const timeStamp = payUtil.generateTimeStamp();
  const packageValue = `prepay_id=wxmock${Date.now()}`;
  const paySign = payUtil.generatePaySign(appId, timeStamp, nonceStr, packageValue, 'MD5', 'mock_key_12345678901234567890');

  return {
    code: 0,
    message: '模拟支付参数获取成功（未配置真实商户信息）',
    data: {
      timeStamp: timeStamp,
      nonceStr: nonceStr,
      package: packageValue,
      signType: 'MD5',
      paySign: paySign,
      orderId: orderId,
      isMock: true
    }
  };
}
