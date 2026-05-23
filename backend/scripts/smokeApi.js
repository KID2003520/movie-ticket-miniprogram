/**
 * 接口冒烟：需先启动 backend（默认 PORT=3000）
 *   cd backend && node server.js
 *   另开终端: node scripts/smokeApi.js
 */
require('dotenv').config();
const http = require('http');

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';

function request(method, path) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE);
    const req = http.request(
      u,
      { method, timeout: 8000 },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, body: data });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.end();
  });
}

(async () => {
  let failed = 0;

  const core = ['/api/health', '/api/movies', '/api/movies?status=coming', '/api/cinemas'];
  for (const path of core) {
    try {
      const { status, body } = await request('GET', path);
      let j = {};
      try {
        j = JSON.parse(body);
      } catch (_) {}
      if (status !== 200 || j.code !== 0) {
        console.error(`[FAIL] GET ${path} -> HTTP ${status} body=${body.slice(0, 120)}`);
        failed += 1;
      } else {
        console.log(`[OK]   GET ${path} -> 200 code=0`);
      }
    } catch (e) {
      console.error(`[FAIL] GET ${path}`, e.message);
      failed += 1;
    }
  }

  try {
    const { status, body } = await request('GET', '/api/admin/dashboard-stats');
    if (status === 404) {
      console.warn('[WARN] GET /api/admin/dashboard-stats -> 404（请重启后端以加载最新代码）');
    } else if (status === 401 || status === 403) {
      console.log(`[OK]   GET /api/admin/dashboard-stats -> ${status}（需管理员 openid）`);
    } else if (status === 200) {
      let j = {};
      try {
        j = JSON.parse(body);
      } catch (_) {}
      console.log(
        j.code === 0
          ? `[OK]   GET /api/admin/dashboard-stats -> 200 code=0`
          : `[FAIL] GET /api/admin/dashboard-stats -> 200 code=${j.code}`
      );
      if (j.code !== 0) failed += 1;
    } else {
      console.error(`[FAIL] GET /api/admin/dashboard-stats -> HTTP ${status}`);
      failed += 1;
    }
  } catch (e) {
    console.error('[FAIL] GET /api/admin/dashboard-stats', e.message);
    failed += 1;
  }

  if (failed) {
    console.error(`\n完成: ${failed} 项失败`);
    process.exit(1);
  }
  console.log('\n冒烟通过');
  process.exit(0);
})();
