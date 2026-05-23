# 微信支付集成指南

## 一、前置条件

### 1. 微信支付商户号申请
- 登录 [微信支付商户平台](https://pay.weixin.qq.com/)
- 完成商户入驻申请
- 获取商户号 (mch_id)

### 2. API密钥配置
- 在商户平台 -> 账户中心 -> API安全
- 设置API密钥 (32位字符串)
- 下载商户证书（退款需要）

### 3. 小程序关联
- 在微信支付商户平台关联小程序AppID
- 在小程序后台开通微信支付功能

---

## 二、配置步骤

### 1. 修改支付配置文件

编辑 `cloudfunctions/shared/pay-config.js`:

```javascript
const PAY_CONFIG = {
  appId: '',                              // 小程序AppID（从小程序后台获取）
  mchId: '',                              // 商户号（从微信支付商户平台获取）
  apiKey: '',                             // API密钥V2（32位，商户平台->账户中心->API安全设置）
  apiV3Key: '',                           // APIv3密钥（32位，V3接口用，可选）
  serialNo: '',                           // 商户证书序列号（商户平台->账户中心->API安全查看）
  privateKey: '',                         // 商户私钥内容（从apiclient_key.pem文件读取）
  notifyUrl: '',                          // 支付回调地址（需配置HTTP触发器或独立服务器）
  refundNotifyUrl: '',                    // 退款回调地址
};

module.exports = PAY_CONFIG;
```

#### 配置项获取方式：

| 配置项 | 获取位置 | 说明 |
|--------|----------|------|
| `appId` | 小程序后台 -> 开发 -> 开发设置 | 小程序的AppID |
| `mchId` | 微信支付商户平台 -> 账户中心 | 商户号，纯数字 |
| `apiKey` | 商户平台 -> 账户中心 -> API安全 | 32位字符串，自己设置 |
| `serialNo` | 商户平台 -> 账户中心 -> API安全 | 下载证书后可查看序列号 |
| `privateKey` | 下载的证书压缩包 | 打开 `apiclient_key.pem` 文件复制内容 |
| `notifyUrl` | 需自行配置 | 云函数HTTP触发器地址或服务器地址 |

### 2. 配置支付回调地址

微信支付需要配置回调地址接收支付结果通知。

#### 方案一：使用云函数HTTP触发器

1. 在云开发控制台开启HTTP触发器
2. 配置触发器路径：`/api/pay/notify`
3. 绑定到 `payNotify` 云函数

#### 方案二：使用独立服务器

1. 部署Node.js服务器处理回调
2. 配置Nginx反向代理
3. 在服务器中调用云函数处理业务逻辑

### 3. 上传云函数

在微信开发者工具中：

1. 右键 `cloudfunctions/wxPay` -> 上传并部署
2. 右键 `cloudfunctions/payNotify` -> 上传并部署
3. 右键 `cloudfunctions/refundOrder` -> 上传并部署
4. 右键 `cloudfunctions/payOrder` -> 上传并部署

---

## 三、支付流程

### 1. 用户发起支付

```
用户点击支付
    ↓
调用 wxPay 云函数
    ↓
统一下单接口获取 prepay_id
    ↓
生成支付签名返回前端
    ↓
调用 wx.requestPayment 拉起支付
```

### 2. 支付回调处理

```
微信支付完成
    ↓
回调通知到 payNotify 云函数
    ↓
验证签名
    ↓
更新订单状态
    ↓
更新座位状态
    ↓
返回成功响应
```

### 3. 退款流程

```
用户申请退款
    ↓
调用 refundOrder 云函数
    ↓
调用微信退款接口
    ↓
更新订单状态为已退款
    ↓
释放座位
```

---

## 四、核心代码说明

### 1. 发起支付（前端）

```javascript
// pages/order-detail/order-detail.js
async onPay() {
  // 1. 调用云函数获取支付参数
  const payRes = await wx.cloud.callFunction({
    name: 'wxPay',
    data: { orderId: this.orderId }
  });

  const payData = payRes.result.data;

  // 2. 拉起微信支付
  await wx.requestPayment({
    timeStamp: payData.timeStamp,
    nonceStr: payData.nonceStr,
    package: payData.package,
    signType: payData.signType,
    paySign: payData.paySign
  });

  // 3. 支付成功处理
  console.log('支付成功');
}
```

### 2. 统一下单（云函数）

```javascript
// cloudfunctions/wxPay/index.js
const unifiedOrderParams = {
  appid: appId,
  mch_id: PAY_CONFIG.mchId,
  nonce_str: nonceStr,
  body: `电影票-${order.movieTitle}`,
  out_trade_no: order.orderNo,
  total_fee: order.totalPrice,  // 单位：分
  spbill_create_ip: '127.0.0.1',
  notify_url: PAY_CONFIG.notifyUrl,
  trade_type: 'JSAPI',
  openid: openid
};

// 生成签名
const sign = generateSignature(unifiedOrderParams, PAY_CONFIG.apiKey);

// 调用统一下单接口
const result = await httpsPost('https://api.mch.weixin.qq.com/pay/unifiedorder', xmlData);
```

### 3. 退款处理

```javascript
// cloudfunctions/refundOrder/index.js
const refundParams = {
  appid: appId,
  mch_id: PAY_CONFIG.mchId,
  nonce_str: nonceStr,
  out_trade_no: order.orderNo,
  out_refund_no: outRefundNo,
  total_fee: order.totalPrice,
  refund_fee: order.totalPrice,  // 全额退款
  notify_url: PAY_CONFIG.refundNotifyUrl,
  op_user_id: PAY_CONFIG.mchId
};

// 调用退款接口
const result = await httpsPost('https://api.mch.weixin.qq.com/secapi/pay/refund', xmlData);
```

---

## 五、注意事项

### 1. 金额单位
- 微信支付金额单位为**分**
- 数据库存储时使用分，前端展示时转换为元

### 2. 订单超时
- 待支付订单15分钟自动取消
- 需要在支付前检查订单是否超时

### 3. 退款限制
- 开场前30分钟不可退款
- 退款需要商户证书

### 4. 安全措施
- API密钥不要泄露
- 回调通知需验证签名
- 订单金额需二次校验

### 5. 测试环境
- 未配置商户信息时自动使用模拟支付
- 模拟支付仅更新订单状态，不产生真实交易

---

## 六、常见问题

### Q1: 支付提示"商户号不存在"
- 检查 mchId 是否正确
- 确认商户号已开通小程序支付权限

### Q2: 支付提示"签名错误"
- 检查 apiKey 是否正确
- 确认签名算法和参数顺序

### Q3: 回调通知收不到
- 检查 notifyUrl 是否可访问
- 确认服务器防火墙配置
- 查看云函数日志

### Q4: 退款提示"证书错误"
- 确认已上传商户证书
- 检查证书路径配置

---

## 七、文件清单

| 文件 | 说明 |
|------|------|
| `cloudfunctions/shared/pay-config.js` | 支付配置文件 |
| `cloudfunctions/shared/pay-util.js` | 支付工具函数 |
| `cloudfunctions/wxPay/index.js` | 统一下单云函数 |
| `cloudfunctions/payNotify/index.js` | 支付回调云函数 |
| `cloudfunctions/payOrder/index.js` | 模拟支付处理 |
| `cloudfunctions/refundOrder/index.js` | 退款云函数 |
| `pages/order-detail/order-detail.js` | 订单详情页支付逻辑 |
| `pages/order/order.js` | 订单列表页支付逻辑 |
