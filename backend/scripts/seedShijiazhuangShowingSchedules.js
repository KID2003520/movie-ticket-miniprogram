/**
 * 为「正在热映」影片在石家庄所有影院生成未来 7 天排片与座位。
 *
 *   cd backend
 *   node scripts/seedShijiazhuangShowingSchedules.js
 *
 * 可选参数：
 *   --days=7
 *   --city=石家庄
 *   --max-movies=48    热映片过多时只取热度 Top N（默认 48）
 *   --replace          先清除该城市日期范围内的旧场次再重排（推荐，纠正冲突排片）
 *   --wait-trx=1       若库内有未完成回滚，先等待（最多约 30 分钟）
 *   --ensure-cinemas   若石家庄影院不足则先执行 addSampleCinemas.js
 */
require('dotenv').config();
const { execFileSync } = require('child_process');
const path = require('path');
const { pool } = require('../db');
const { seedSchedulesForCityMovies } = require('../lib/scheduleSeed');

const CITY = (() => {
  const arg = process.argv.find((a) => a.startsWith('--city='));
  return arg ? arg.split('=')[1] : '石家庄';
})();

const DAYS = (() => {
  const arg = process.argv.find((a) => a.startsWith('--days='));
  return arg ? Number(arg.split('=')[1]) : 7;
})();

const ENSURE_CINEMAS = process.argv.includes('--ensure-cinemas');
const WAIT_TRX = process.argv.includes('--wait-trx');

const MAX_MOVIES = (() => {
  const arg = process.argv.find((a) => a.startsWith('--max-movies='));
  return arg ? Number(arg.split('=')[1]) : 48;
})();

const REPLACE = !process.argv.includes('--no-replace');

async function countCityCinemas(city) {
  const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM cinemas WHERE city = ?`, [city]);
  return Number(row?.c || 0);
}

async function waitForInnoTrxClear(maxMinutes = 30) {
  const deadline = Date.now() + maxMinutes * 60 * 1000;
  let lastMod = -1;
  while (Date.now() < deadline) {
    const [rows] = await pool.query(
      `SELECT trx_state, trx_rows_modified FROM information_schema.innodb_trx`
    );
    if (!rows.length) {
      console.log('[seed] 数据库事务已空闲，开始排片…');
      return true;
    }
    const mod = Number(rows[0].trx_rows_modified || 0);
    if (rows[0].trx_state === 'ROLLING BACK') {
      if (mod !== lastMod) {
        console.log(`[seed] 等待历史事务回滚… 剩余约 ${mod} 行 (${rows[0].trx_state})`);
        lastMod = mod;
      }
    } else {
      console.log('[seed] 等待事务结束:', rows[0].trx_state);
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  return false;
}

async function main() {
  if (WAIT_TRX) {
    const ok = await waitForInnoTrxClear(30);
    if (!ok) {
      console.error(
        '[seed] 仍有未完成事务。请以管理员身份重启 MySQL 服务，或稍后再执行：node scripts/seedShijiazhuangShowingSchedules.js --wait-trx'
      );
      process.exit(1);
    }
  }

  let cityCount = await countCityCinemas(CITY);
  if (cityCount === 0 && ENSURE_CINEMAS) {
    console.log(`[seed] 未找到 ${CITY} 影院，正在执行 addSampleCinemas.js …`);
    execFileSync(process.execPath, [path.join(__dirname, 'addSampleCinemas.js')], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    cityCount = await countCityCinemas(CITY);
  }

  if (cityCount === 0) {
    console.error(`[seed] 仍无「${CITY}」影院。请先执行: node scripts/addSampleCinemas.js`);
    process.exit(1);
  }

  await pool.query(`SET SESSION innodb_lock_wait_timeout = 120`);

  try {
    const result = await seedSchedulesForCityMovies(pool, {
      city: CITY,
      movieStatus: 'showing',
      days: DAYS,
      maxMovies: MAX_MOVIES,
      replaceExisting: REPLACE
    });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (e) {
    console.error('[seed] 失败:', e.message || e);
    console.error(
      '若仍报 Lock wait timeout：1) 关闭 npm run dev  2) 以管理员重启 MySQL  3) 再执行本脚本并加 --wait-trx'
    );
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
