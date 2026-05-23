/**
 * 直连 TMDB 失败时，自动尝试本机常见代理端口（Clash / v2rayN 等），找出可用的 HTTPS_PROXY。
 *
 *   cd backend && node scripts/detectTmdbProxy.js
 *
 * 需: .env 中已有 TMDB_API_KEY。若找到端口会打印一行可粘贴进 .env 的配置。
 */
require('dotenv').config();
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

const TIMEOUT_MS = 15000;
const COMMON_PORTS = [7890, 7897, 7891, 10808, 10809, 1080, 8080, 8888, 33210, 20171, 20172];
const HOSTS = ['127.0.0.1', 'localhost'];

function probe(url, agent) {
  return new Promise((resolve) => {
    const opts = { timeout: TIMEOUT_MS, headers: { Accept: 'application/json', 'User-Agent': 'detectTmdbProxy/1.0' } };
    if (agent) opts.agent = agent;
    const req = https.get(url, opts, (res) => {
      res.resume();
      const code = Number(res.statusCode || 0);
      resolve({ ok: code >= 200 && code < 300, code });
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (e) => resolve({ ok: false, err: e.message || String(e) }));
  });
}

(async () => {
  const apiKey = (process.env.TMDB_API_KEY || '').trim();
  if (!apiKey) {
    console.error('请在 backend/.env 中配置 TMDB_API_KEY');
    process.exit(1);
  }

  const testUrl = `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey)}`;

  console.log('[1/2] 尝试直连 api.themoviedb.org …');
  const direct = await probe(testUrl);
  if (direct.ok) {
    console.log('直连成功（HTTP', direct.code, '）。无需配置 HTTPS_PROXY，可直接跑导入脚本。');
    process.exit(0);
  }
  console.log('直连失败:', direct.err != null ? direct.err : `HTTP ${direct.code || '?'}`);

  console.log('[2/2] 扫描本机常见代理端口 …');
  for (const port of COMMON_PORTS) {
    for (const host of HOSTS) {
      const proxyUrl = `http://${host}:${port}`;
      const agent = new HttpsProxyAgent(proxyUrl);
      process.stdout.write(`  试 ${proxyUrl} … `);
      const r = await probe(testUrl, agent);
      if (r.ok) {
        console.log('成功 (HTTP ' + r.code + ')');
        console.log('');
        console.log('请把下面一行追加到 backend/.env ，保存后重启后端再执行导入：');
        console.log('');
        console.log('HTTPS_PROXY=' + proxyUrl);
        console.log('');
        console.log('（若 Clash 端口不是上面这个，请到 Clash → 设置 → 端口 里查看「混合代理」或 HTTP 端口，再手动改端口号。）');
        process.exit(0);
      }
      console.log('失败', r.err ? '(' + r.err + ')' : '');
    }
  }

  console.log('');
  console.log('未检测到可用本机代理。你可以：');
  console.log('1) 打开 Clash / v2rayN，开启「允许局域网连接」或「系统代理」，记下 HTTP 端口；');
  console.log('2) 在 backend/.env 手动写：HTTPS_PROXY=http://127.0.0.1:你的端口');
  console.log('3) 使用手机热点 / 其他网络再试直连。');
  process.exit(2);
})();
