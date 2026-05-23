/**
 * 运行模式配置
 * - USE_BACKEND_ONLY: 为 true 时不初始化微信云开发，业务统一走 utils/backendApi.js（Express + MySQL）
 * - BACKEND_BASE_URL: 后端根地址
 *   - 仅本机微信开发者工具模拟器：可用 http://127.0.0.1:3000
 *   - 真机预览 / 远程调试：必须改为电脑局域网 IP，例如 http://192.168.1.5:3000（cmd 执行 ipconfig 看 IPv4）
 *   - 也可在小程序里写：wx.setStorageSync('backendBaseUrl', 'http://192.168.x.x:3000') 覆盖（不写入代码）
 * - 首页城市名：优先 backend/.env 的 TENCENT_LBS_KEY；也可在本文件填 TENCENT_LBS_KEY（小程序 request 须加 https://apis.map.qq.com）；都不配时用粗略「最近大城市」估算
 * - 海报：TMDB 直连常失败，默认走后端 /api/poster-proxy（需与 BACKEND_BASE_URL 同域）。
 *   开发者工具请勾选「不校验合法域名」；真机预览若后端为 http，<image> 可能无法加载 http 图，请改用 https 端口（见下）或局域网 https。
 * - 可选：backend/.env 配置 HTTPS_PROXY，后端拉 TMDB 图时会走代理（与 TMDB API 相同）。
 * - 真机 HTTPS：配置 HTTPS_KEY_PATH/HTTPS_CERT_PATH 后 BACKEND_BASE_URL 改为 https://你的IP:3443
 */
module.exports = {
  USE_BACKEND_ONLY: true,
  /** 模拟器用 127.0.0.1；真机预览改为 ipconfig 里的 IPv4，如 http://172.20.10.4:3000 */
  BACKEND_BASE_URL: 'http://127.0.0.1:3000',
  /** 为 true 且 BACKEND_BASE_URL 为 https 时，海报走 /api/poster-proxy；http 后端会自动直连 TMDB/豆瓣 HTTPS */
  USE_POSTER_PROXY: true,
  /** 若后端 .env 配置了 TMDB_SYNC_SECRET，须与此一致，或运行时 wx.setStorageSync('tmdbSyncSecret','你的密钥') */
  TMDB_SYNC_SECRET: '',
  /**
   * 可选：腾讯位置服务 Key（与后端 TENCENT_LBS_KEY 可相同）。
   * 仅在后端未返回城市时，由小程序直连逆地理；需在小程序后台配置 request 合法域名 apis.map.qq.com
   */
  TENCENT_LBS_KEY: ''
};
