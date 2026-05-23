/**
 * 支付宝手机网站支付（alipay.trade.wap.pay）+ 异步通知验签
 * 需在 .env 配置密钥与 PUBLIC_BASE_URL；小程序内通过 web-view 打开 bridge 页跳转收银台。
 */
const { AlipaySdk } = require('alipay-sdk');

function safeInt(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

function normalizePrivateKey(raw) {
  if (!raw) return '';
  let k = String(raw).trim();
  if (k.includes('BEGIN')) return k.replace(/\\n/g, '\n');
  const body = k.replace(/\s/g, '');
  const isPkcs8 = process.env.ALIPAY_KEY_TYPE === 'PKCS8';
  if (isPkcs8) {
    return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
  }
  return `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`;
}

function normalizePublicKey(raw) {
  if (!raw) return '';
  let k = String(raw).trim();
  if (k.includes('BEGIN')) return k.replace(/\\n/g, '\n');
  const body = k.replace(/\s/g, '');
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

let cachedSdk = null;

function getSdk() {
  if (cachedSdk) return cachedSdk;
  const appId = String(process.env.ALIPAY_APP_ID || '').trim();
  const privateKey = normalizePrivateKey(process.env.ALIPAY_PRIVATE_KEY);
  const alipayPublicKey = normalizePublicKey(
    process.env.ALIPAY_ALIPAY_PUBLIC_KEY || process.env.ALIPAY_PUBLIC_KEY
  );
  if (!appId || !privateKey || !alipayPublicKey) return null;

  const gateway =
    String(process.env.ALIPAY_GATEWAY || '').trim() || 'https://openapi.alipay.com/gateway.do';

  cachedSdk = new AlipaySdk({
    appId,
    privateKey,
    alipayPublicKey,
    signType: 'RSA2',
    gateway,
    keyType: process.env.ALIPAY_KEY_TYPE === 'PKCS8' ? 'PKCS8' : 'PKCS1'
  });
  return cachedSdk;
}

function isAlipayConfigured() {
  return !!getSdk();
}

function hasPublicBaseUrl() {
  return !!String(process.env.PUBLIC_BASE_URL || '').trim();
}

function isAlipayPayReady() {
  return isAlipayConfigured() && hasPublicBaseUrl();
}

function centsToYuanStr(cents) {
  return (safeInt(cents, 0) / 100).toFixed(2);
}

/**
 * @param {{ outTradeNo: string, totalCents: number, subject: string, returnUrl: string, notifyUrl: string }} opts
 */
function buildWapPayHtml(opts) {
  const sdk = getSdk();
  if (!sdk) throw new Error('Alipay SDK 未配置');

  const subject = String(opts.subject || '电影票订单').slice(0, 256);
  const totalAmount = centsToYuanStr(opts.totalCents);

  return sdk.pageExecute('alipay.trade.wap.pay', 'POST', {
    notifyUrl: opts.notifyUrl,
    returnUrl: opts.returnUrl,
    bizContent: {
      outTradeNo: String(opts.outTradeNo),
      productCode: 'QUICK_WAP_WAY',
      totalAmount,
      subject
    }
  });
}

function verifyNotify(postData) {
  const sdk = getSdk();
  if (!sdk || !postData) return false;
  try {
    return sdk.checkNotifySignV2(postData);
  } catch (_) {
    return false;
  }
}

/**
 * 查询支付宝订单状态（alipay.trade.query）
 * @returns {Promise<{ configured: boolean, ok?: boolean, tradeStatus?: string, code?: string, subMsg?: string, msg?: string, error?: string }>}
 */
async function queryTradeByOutTradeNo(outTradeNo) {
  const sdk = getSdk();
  if (!sdk) return { configured: false };
  const no = String(outTradeNo || '').trim();
  if (!no) return { configured: true, ok: false, error: 'empty_out_trade_no' };
  try {
    const raw = await sdk.exec('alipay.trade.query', {
      bizContent: { out_trade_no: no }
    });
    const body =
      raw && (raw.alipayTradeQueryResponse || raw.alipay_trade_query_response || raw.tradeQueryResponse);
    if (!body || typeof body !== 'object') {
      return { configured: true, ok: false, error: 'unexpected_response' };
    }
    const code = String(body.code || '');
    if (code !== '10000') {
      return {
        configured: true,
        ok: false,
        code,
        subMsg: String(body.sub_msg || body.subMsg || ''),
        msg: String(body.msg || '')
      };
    }
    const tradeStatus = String(body.trade_status || body.tradeStatus || '');
    return {
      configured: true,
      ok: true,
      tradeStatus,
      totalAmount: body.total_amount || body.totalAmount,
      buyerPayAmount: body.buyer_pay_amount || body.buyerPayAmount
    };
  } catch (e) {
    return { configured: true, ok: false, error: String(e.message || e) };
  }
}

module.exports = {
  getSdk,
  isAlipayConfigured,
  hasPublicBaseUrl,
  isAlipayPayReady,
  buildWapPayHtml,
  verifyNotify,
  centsToYuanStr,
  queryTradeByOutTradeNo
};
