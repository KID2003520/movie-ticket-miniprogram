const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  try {
    const { phone, code } = event;

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return {
        code: -1,
        message: '手机号格式不正确',
        data: null
      };
    }

    const sdkAppId = 'your_sms_sdk_app_id';
    const appKey = 'your_sms_app_key';
    const templateId = 'your_template_id';

    const verifyCode = Math.random().toString().slice(-6);

    console.log(`发送验证码到手机: ${phone}, 验证码: ${verifyCode}`);

    return {
      code: 0,
      message: '验证码发送成功',
      data: {
        verifyCode: verifyCode
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
