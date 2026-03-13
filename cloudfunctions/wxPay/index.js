const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const { orderId } = event;

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

    const appid = wxContext.APPID;
    const mch_id = 'your_mch_id';
    const nonce_str = crypto.randomBytes(16).toString('hex');
    const body = `电影票-${order.data.movieTitle}`;
    const out_trade_no = order.data.orderNo;
    const total_fee = order.data.totalPrice;
    const spbill_create_ip = '127.0.0.1';
    const notify_url = 'https://your-domain.com/api/pay/notify';
    const trade_type = 'JSAPI';
    const key = 'your_mch_key';

    const params = {
      appid: appid,
      mch_id: mch_id,
      nonce_str: nonce_str,
      body: body,
      out_trade_no: out_trade_no,
      total_fee: total_fee,
      spbill_create_ip: spbill_create_ip,
      notify_url: notify_url,
      trade_type: trade_type,
      openid: openid
    };

    const stringA = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    const stringSignTemp = `${stringA}&key=${key}`;
    const sign = crypto.createHash('md5').update(stringSignTemp).digest('hex').toUpperCase();

    return {
      code: 0,
      message: '支付参数获取成功',
      data: {
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr: nonce_str,
        package: `prepay_id=wx${Date.now()}`,
        signType: 'MD5',
        paySign: sign
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
