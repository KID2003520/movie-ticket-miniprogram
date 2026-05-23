const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const getMovies = () => [
  { title: "流浪地球2", poster: "https://picsum.photos/300/420?random=1", rating: 8.3, genre: "科幻/冒险", duration: 173, director: "郭帆", actors: "吴京,刘德华,李雪健", description: "太阳即将毁灭，人类在地球表面建造出巨大的推进器，寻找新的家园。", releaseDate: "2023-01-22", price: 3500, status: "showing", hot: 1000, createTime: db.serverDate(), updateTime: db.serverDate() },
  { title: "满江红", poster: "https://picsum.photos/300/420?random=2", rating: 7.8, genre: "悬疑/喜剧", duration: 159, director: "张艺谋", actors: "沈腾,易烊千玺,张译", description: "南宋绍兴年间，岳飞死后四年，秦桧率兵与金国会谈。", releaseDate: "2023-01-22", price: 3200, status: "showing", hot: 950, createTime: db.serverDate(), updateTime: db.serverDate() },
  { title: "熊出没·伴我熊芯", poster: "https://picsum.photos/300/420?random=3", rating: 7.5, genre: "动画/冒险", duration: 97, director: "林汇达", actors: "张伟,张秉君,谭笑", description: "熊大熊二和光头强发现了一个神秘的机器人。", releaseDate: "2023-01-22", price: 2800, status: "showing", hot: 800, createTime: db.serverDate(), updateTime: db.serverDate() },
  { title: "无名", poster: "https://picsum.photos/300/420?random=4", rating: 7.6, genre: "剧情/悬疑", duration: 131, director: "程耳", actors: "梁朝伟,王一博,周迅", description: "1938年至1945年间，数段隐秘历史故事在上海发生。", releaseDate: "2023-01-22", price: 3800, status: "showing", hot: 900, createTime: db.serverDate(), updateTime: db.serverDate() },
  { title: "深海", poster: "https://picsum.photos/300/420?random=5", rating: 7.3, genre: "动画/奇幻", duration: 112, director: "田晓鹏", actors: "苏鑫,王亭文,滕奎兴", description: "在大海的最深处，藏着一个神秘的世界。", releaseDate: "2023-01-22", price: 3000, status: "showing", hot: 750, createTime: db.serverDate(), updateTime: db.serverDate() },
  { title: "蚁人与黄蜂女：量子领域", poster: "https://picsum.photos/300/420?random=6", rating: 6.8, genre: "动作/科幻", duration: 125, director: "佩顿·里德", actors: "保罗·路德,伊万杰琳·莉莉", description: "蚁人和黄蜂女意外进入量子领域。", releaseDate: "2026-04-15", price: 4500, status: "coming", hot: 600, createTime: db.serverDate(), updateTime: db.serverDate() },
  { title: "阿凡达3", poster: "https://picsum.photos/300/420?random=7", rating: 0, genre: "科幻/冒险", duration: 180, director: "詹姆斯·卡梅隆", actors: "萨姆·沃辛顿,佐伊·索尔达娜", description: "潘多拉星球的新冒险即将开启。", releaseDate: "2026-05-20", price: 5000, status: "coming", hot: 850, createTime: db.serverDate(), updateTime: db.serverDate() }
];

const getCinemas = () => [
  { name: "万达影城（万达广场店）", address: "北京市朝阳区建国路93号万达广场B1层", phone: "010-85588388", latitude: 39.908823, longitude: 116.461312, city: "北京", district: "朝阳区", tags: ["IMAX", "杜比全景声", "VIP厅"], minPrice: 3500, distance: 1.2, facilities: ["免费停车", "儿童厅", "情侣座"], createTime: db.serverDate(), updateTime: db.serverDate() },
  { name: "CGV影城（颐堤港店）", address: "北京市朝阳区酒仙桥路18号颐堤港购物中心3层", phone: "010-84700688", latitude: 39.977856, longitude: 116.492315, city: "北京", district: "朝阳区", tags: ["IMAX", "4DX", "ScreenX"], minPrice: 3800, distance: 2.5, facilities: ["免费停车", "儿童厅", "餐饮"], createTime: db.serverDate(), updateTime: db.serverDate() },
  { name: "博纳国际影城（悠唐店）", address: "北京市朝阳区朝阳门外大街悠唐购物中心5层", phone: "010-85629888", latitude: 39.923456, longitude: 116.442378, city: "北京", district: "朝阳区", tags: ["激光厅", "巨幕厅"], minPrice: 3200, distance: 0.8, facilities: ["免费停车", "餐饮"], createTime: db.serverDate(), updateTime: db.serverDate() }
];

const generateSchedules = (movieIds, cinemaIds) => {
  const schedules = [];
  const today = new Date();
  const times = ['10:30', '13:00', '15:30', '18:00', '20:30'];
  const halls = ['1号厅', 'IMAX厅', 'VIP厅'];
  
  for (let day = 0; day < 7; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split('T')[0];
    
    movieIds.slice(0, 3).forEach((movieId, idx) => {
      cinemaIds.forEach(cinemaId => {
        times.slice(0, 2).forEach(time => {
          schedules.push({
            movieId, cinemaId, hallName: halls[idx % 3], hallType: '2D', date: dateStr, startTime: time,
            endTime: '22:00', price: 3500 + idx * 500, totalSeats: 96, availableSeats: 96,
            status: 'available', createTime: db.serverDate(), updateTime: db.serverDate()
          });
        });
      });
    });
  }
  return schedules;
};

exports.main = async (event, context) => {
  try {
    const movieIds = [];
    const cinemaIds = [];
    let scheduleCount = 0;
    const rows = 8;
    const cols = 12;

    for (const movie of getMovies()) {
      const result = await db.collection('movies').add({ data: movie });
      movieIds.push(result._id);
    }

    for (const cinema of getCinemas()) {
      const result = await db.collection('cinemas').add({ data: cinema });
      cinemaIds.push(result._id);
    }

    const schedules = generateSchedules(movieIds, cinemaIds);
    for (const schedule of schedules) {
      const scheduleRes = await db.collection('schedules').add({ data: schedule });
      const scheduleId = scheduleRes._id;

      // 为每个场次预建座位：available -> locked -> sold
      // 这样 createOrder 就能通过“条件更新 available -> locked”保证并发一致性
      const seatDocs = [];
      for (let row = 1; row <= rows; row++) {
        for (let col = 1; col <= cols; col++) {
          seatDocs.push({
            docId: `${scheduleId}_${row}_${col}`,
            data: {
              scheduleId,
              row,
              col,
              status: 'available',
              orderId: '',
              createTime: db.serverDate(),
              updateTime: db.serverDate()
            }
          });
        }
      }

      await Promise.all(
        seatDocs.map(s =>
          db.collection('seats').doc(s.docId).set({ data: s.data })
        )
      );
      scheduleCount++;
    }

    return { code: 0, message: '示例数据导入成功', data: { movies: movieIds.length, cinemas: cinemaIds.length, schedules: scheduleCount } };
  } catch (err) {
    return { code: -1, message: err.message, data: null };
  }
};
