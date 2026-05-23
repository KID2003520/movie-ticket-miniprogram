const crypto = require('crypto');

const generateNonceStr = (length = 32) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const generateTimeStamp = () => {
  return Math.floor(Date.now() / 1000).toString();
};

const buildQueryString = (params, encode = false) => {
  return Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== '')
    .sort()
    .map(key => {
      const value = encode ? encodeURIComponent(params[key]) : params[key];
      return `${key}=${value}`;
    })
    .join('&');
};

const generateSignature = (params, apiKey) => {
  const stringA = buildQueryString(params);
  const stringSignTemp = `${stringA}&key=${apiKey}`;
  return crypto.createHash('md5').update(stringSignTemp, 'utf8').digest('hex').toUpperCase();
};

const generatePaySign = (appId, timeStamp, nonceStr, packageValue, signType, apiKey) => {
  const params = {
    appId,
    timeStamp,
    nonceStr,
    package: packageValue,
    signType
  };
  return generateSignature(params, apiKey);
};

const buildXml = (params) => {
  let xml = '<xml>';
  for (const key in params) {
    if (params.hasOwnProperty(key)) {
      const value = params[key];
      if (typeof value === 'number') {
        xml += `<${key}>${value}</${key}>`;
      } else {
        xml += `<${key}><![CDATA[${value}]]></${key}>`;
      }
    }
  }
  xml += '</xml>';
  return xml;
};

const parseXml = (xml) => {
  const result = {};
  const regex = /<(\w+)>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/\1>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    result[match[1]] = match[2] || match[3] || '';
  }
  return result;
};

const verifySignature = (params, apiKey) => {
  const { sign, ...rest } = params;
  const calculatedSign = generateSignature(rest, apiKey);
  return sign === calculatedSign;
};

const encryptWithRSA = (text, privateKey) => {
  const buffer = Buffer.from(text, 'utf8');
  const encrypted = crypto.privateEncrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    },
    buffer
  );
  return encrypted.toString('base64');
};

const decryptWithRSA = (encrypted, privateKey) => {
  const buffer = Buffer.from(encrypted, 'base64');
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    },
    buffer
  );
  return decrypted.toString('utf8');
};

const generateHmacSha256 = (data, key) => {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
};

const buildAuthorization = (method, url, timestamp, nonceStr, body, mchId, serialNo, privateKey) => {
  const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = encryptWithRSA(message, privateKey);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;
};

module.exports = {
  generateNonceStr,
  generateTimeStamp,
  buildQueryString,
  generateSignature,
  generatePaySign,
  buildXml,
  parseXml,
  verifySignature,
  encryptWithRSA,
  decryptWithRSA,
  generateHmacSha256,
  buildAuthorization
};
