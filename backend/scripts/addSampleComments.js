require('dotenv').config();
const { pool } = require('../db');

const nicknames = ['影迷小周', '电影控阿杰', '爱看电影的林', '晴天观影', '爆米花女孩', '深夜放映员', '小城影评人', '观影达人M'];
const avatars = [
  'https://picsum.photos/80/80?random=901',
  'https://picsum.photos/80/80?random=902',
  'https://picsum.photos/80/80?random=903',
  'https://picsum.photos/80/80?random=904',
  'https://picsum.photos/80/80?random=905',
  'https://picsum.photos/80/80?random=906'
];
const texts = [
  '节奏很紧凑，几乎没有冷场，值得二刷。',
  '画面和配乐都很在线，影院观感特别好。',
  '剧情有反转，后半段越看越上头。',
  '演员发挥稳定，情绪表达很到位。',
  '整体完成度不错，适合周末放松看。',
  '前期铺垫稍长，但结尾收得很漂亮。',
  '笑点和泪点都拿捏住了，推荐。',
  '设定很新鲜，细节也挺用心的。'
];

function pick(arr, i) {
  return arr[i % arr.length];
}

function randomRating(seed) {
  const n = seed % 10;
  if (n < 2) return 3;
  if (n < 6) return 4;
  return 5;
}

async function main() {
  const conn = await pool.getConnection();
  let inserted = 0;
  try {
    const [movies] = await conn.query(`SELECT _id, title FROM movies ORDER BY hot DESC, updateTime DESC LIMIT 20`);
    if (!movies || !movies.length) {
      console.log('未找到电影数据，跳过。');
      return;
    }

    await conn.beginTransaction();
    for (let i = 0; i < movies.length; i++) {
      const m = movies[i];
      const movieId = String(m._id);
      for (let k = 0; k < 3; k++) {
        const seed = i * 7 + k;
        const id = `c_seed_${movieId}_${Date.now()}_${k}`;
        const openid = `seed_user_${(i % 12) + 1}`;
        const nickName = pick(nicknames, seed);
        const avatarUrl = pick(avatars, seed);
        const content = `${pick(texts, seed)}（${m.title || '这部电影'}）`;
        const rating = randomRating(seed);
        await conn.query(
          `INSERT INTO movie_comments (_id, movieId, _openid, nickName, avatarUrl, rating, content, likes, createTime) VALUES (?,?,?,?,?,?,?,?, NOW())`,
          [id, movieId, openid, nickName, avatarUrl, rating, content, seed % 50]
        );
        inserted += 1;
      }
    }
    await conn.commit();
    console.log(`完成：新增评论 ${inserted} 条（覆盖 ${movies.length} 部电影）。`);
  } catch (e) {
    await conn.rollback();
    console.error('导入评论失败：', e.message || e);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
