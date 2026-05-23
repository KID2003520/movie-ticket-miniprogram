const PAY_CONFIG = {
  appId: '',           // 小程序AppID
  mchId: '',           // 商户号
  apiKey: '',          // API密钥（V2）
  apiV3Key: '',        // APIv3密钥（V3）
  serialNo: '',        // 商户证书序列号
  privateKey: '',      // 商户私钥内容或路径
  // 是否在 payNotify 中强制做回调签名校验
  // 默认为 false，避免不同回调集成方式下字段不一致导致支付失败
  requireNotifySignature: false,
  notifyUrl: 'https://your-domain.com/api/pay/notify',  // 支付回调地址
  refundNotifyUrl: 'https://your-domain.com/api/pay/refund-notify',  // 退款回调地址
};

module.exports = PAY_CONFIG;
