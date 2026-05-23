require('dotenv').config();
const { pool } = require('../db');

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const cinemas = [
  { name: '万达影城(国贸店)', city: '北京', address: '北京市朝阳区建国路93号万达广场5层', phone: '010-85885588', latitude: 39.9087, longitude: 116.4668, minPrice: 42, tags: 'IMAX,杜比,停车场' },
  { name: 'CGV影城(中关村店)', city: '北京', address: '北京市海淀区中关村大街19号新中关购物中心B1', phone: '010-82686688', latitude: 39.9836, longitude: 116.3155, minPrice: 38, tags: '巨幕厅,可选座,交通便利' },
  { name: '百丽宫影城(陆家嘴店)', city: '上海', address: '上海市浦东新区世纪大道8号国金中心LG2', phone: '021-50128888', latitude: 31.2387, longitude: 121.5016, minPrice: 45, tags: 'IMAX,情侣座,商圈' },
  { name: 'SFC上影影城(港汇店)', city: '上海', address: '上海市徐汇区虹桥路1号港汇恒隆广场6层', phone: '021-64478888', latitude: 31.1942, longitude: 121.4376, minPrice: 40, tags: '杜比全景声,亲子友好' },
  { name: '金逸影城(珠江新城店)', city: '广州', address: '广州市天河区珠江东路6号高德置地广场4层', phone: '020-38886688', latitude: 23.1193, longitude: 113.3272, minPrice: 36, tags: 'IMAX,地铁直达' },
  { name: 'UA影城(天河城店)', city: '广州', address: '广州市天河区天河路208号天河城6层', phone: '020-85595599', latitude: 23.1321, longitude: 113.3224, minPrice: 35, tags: '3D,停车场,商圈' },
  { name: '博纳国际影城(福田店)', city: '深圳', address: '深圳市福田区福华一路3号怡景中心城B1', phone: '0755-83276688', latitude: 22.5372, longitude: 114.0601, minPrice: 39, tags: '激光厅,可退改签' },
  { name: '万象影城(南山店)', city: '深圳', address: '深圳市南山区深南大道9028号益田假日广场4层', phone: '0755-86696699', latitude: 22.5416, longitude: 113.9782, minPrice: 41, tags: '杜比,情侣座,商圈' },
  { name: '星轶影城(钱江新城店)', city: '杭州', address: '杭州市上城区富春路701号万象城5层', phone: '0571-87998866', latitude: 30.2451, longitude: 120.2194, minPrice: 34, tags: 'IMAX,儿童厅' },
  { name: 'UME影城(武林店)', city: '杭州', address: '杭州市拱墅区延安路609号国大城市广场7层', phone: '0571-87056688', latitude: 30.2741, longitude: 120.1619, minPrice: 33, tags: '巨幕厅,交通便利' },
  { name: '万达影城(石家庄裕华万达店)', city: '石家庄', address: '石家庄市裕华区建华南大街136号万达广场4层', phone: '0311-89896666', latitude: 38.0128, longitude: 114.5412, minPrice: 33, tags: 'IMAX,停车场,商圈' },
  { name: '金棕榈影城(石家庄勒泰店)', city: '石家庄', address: '石家庄市长安区中山东路39号勒泰中心6层', phone: '0311-66558877', latitude: 38.0458, longitude: 114.5146, minPrice: 31, tags: '杜比,可选座,商圈' },
  { name: '博纳国际影城(石家庄万象城店)', city: '石家庄', address: '石家庄市桥西区中山西路108号万象城5层', phone: '0311-85223344', latitude: 38.0415, longitude: 114.4772, minPrice: 35, tags: '激光厅,情侣座' },
  { name: 'CGV影城(石家庄海悦天地店)', city: '石家庄', address: '石家庄市桥西区裕华西路66号海悦天地4层', phone: '0311-69001234', latitude: 38.0326, longitude: 114.4664, minPrice: 32, tags: '巨幕厅,亲子友好' },
  { name: '横店电影城(石家庄北国商城店)', city: '石家庄', address: '石家庄市长安区建设北大街2号北国商城7层', phone: '0311-86001122', latitude: 38.0509, longitude: 114.5041, minPrice: 30, tags: '3D,交通便利' },
  { name: 'UME影城(石家庄中冶和悦汇店)', city: '石家庄', address: '石家庄市新华区和平西路与泰华街交口和悦汇5层', phone: '0311-87889900', latitude: 38.0568, longitude: 114.4768, minPrice: 29, tags: '普通厅,停车场' }
];

async function main() {
  const conn = await pool.getConnection();
  let inserted = 0;
  let updated = 0;
  try {
    await conn.beginTransaction();
    for (let i = 0; i < cinemas.length; i++) {
      const c = cinemas[i];
      const [exists] = await conn.query(`SELECT _id FROM cinemas WHERE name = ? LIMIT 1`, [c.name]);
      const minPriceCents = Math.max(0, Math.round(Number(c.minPrice || 0) * 100));
      if (exists && exists.length) {
        await conn.query(
          `UPDATE cinemas SET city=?, address=?, phone=?, latitude=?, longitude=?, minPrice=?, tags=?, updateTime=? WHERE _id=?`,
          [c.city, c.address, c.phone, c.latitude, c.longitude, minPriceCents, c.tags, now(), exists[0]._id]
        );
        updated += 1;
      } else {
        const id = `cin_${Date.now()}_${i + 1}`;
        await conn.query(
          `INSERT INTO cinemas (_id,name,address,phone,latitude,longitude,city,district,minPrice,tags,facilities,distance,createTime,updateTime) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, c.name, c.address, c.phone, c.latitude, c.longitude, c.city, '', minPriceCents, c.tags, '', 0, now(), now()]
        );
        inserted += 1;
      }
    }
    await conn.commit();
    console.log(`完成：新增 ${inserted} 家，更新 ${updated} 家。`);
  } catch (e) {
    await conn.rollback();
    console.error('导入失败：', e.message || e);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
