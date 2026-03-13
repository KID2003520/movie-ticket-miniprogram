const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const movies = [
  {
    title: "流浪地球2",
    poster: "cloud://your-env-id.xxxx/movie1.jpg",
    rating: 8.3,
    genre: "科幻/冒险",
    duration: 173,
    director: "郭帆",
    actors: "吴京,刘德华,李雪健",
    description: "太阳即将毁灭，人类在地球表面建造出巨大的推进器，寻找新的家园。然而宇宙之路危机四伏，为了拯救地球，流浪地球时代的年轻人再次挺身而出，展开争分夺秒的生死之战。",
    releaseDate: "2023-01-22",
    price: 3500,
    status: "showing",
    hot: 1000,
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  },
  {
    title: "满江红",
    poster: "cloud://your-env-id.xxxx/movie2.jpg",
    rating: 7.8,
    genre: "悬疑/喜剧",
    duration: 159,
    director: "张艺谋",
    actors: "沈腾,易烊千玺,张译",
    description: "南宋绍兴年间，岳飞死后四年，秦桧率兵与金国会谈。会谈前夜，金国使者死在宰相驻地，所携密信也不翼而飞。",
    releaseDate: "2023-01-22",
    price: 3200,
    status: "showing",
    hot: 950,
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  },
  {
    title: "熊出没·伴我熊芯",
    poster: "cloud://your-env-id.xxxx/movie3.jpg",
    rating: 7.5,
    genre: "动画/冒险",
    duration: 97,
    director: "林汇达",
    actors: "张伟,张秉君,谭笑",
    description: "熊大熊二和光头强发现了一个神秘的机器人，这个机器人似乎与熊妈妈的失踪有着千丝万缕的联系。",
    releaseDate: "2023-01-22",
    price: 2800,
    status: "showing",
    hot: 800,
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  },
  {
    title: "无名",
    poster: "cloud://your-env-id.xxxx/movie4.jpg",
    rating: 7.6,
    genre: "剧情/悬疑",
    duration: 131,
    director: "程耳",
    actors: "梁朝伟,王一博,周迅",
    description: "1938年至1945年间，数段隐秘历史故事在上海发生。一群无名英雄在黑暗中前行。",
    releaseDate: "2023-01-22",
    price: 3800,
    status: "showing",
    hot: 900,
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  },
  {
    title: "深海",
    poster: "cloud://your-env-id.xxxx/movie5.jpg",
    rating: 7.3,
    genre: "动画/奇幻",
    duration: 112,
    director: "田晓鹏",
    actors: "苏鑫,王亭文,滕奎兴",
    description: "在大海的最深处，藏着一个神秘的世界。少女参宿误入深海，邂逅了一段独特的生命旅程。",
    releaseDate: "2023-01-22",
    price: 3000,
    status: "showing",
    hot: 750,
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  },
  {
    title: "蚁人与黄蜂女：量子领域",
    poster: "cloud://your-env-id.xxxx/movie6.jpg",
    rating: 6.8,
    genre: "动作/科幻",
    duration: 125,
    director: "佩顿·里德",
    actors: "保罗·路德,伊万杰琳·莉莉",
    description: "蚁人和黄蜂女意外进入量子领域，他们必须面对征服者康。",
    releaseDate: "2023-02-17",
    price: 4500,
    status: "coming",
    hot: 600,
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }
];

const cinemas = [
  {
    name: "万达影城（万达广场店）",
    address: "北京市朝阳区建国路93号万达广场B1层",
    phone: "010-85588388",
    latitude: 39.908823,
    longitude: 116.461312,
    city: "北京",
    district: "朝阳区",
    tags: ["IMAX", "杜比全景声", "VIP厅"],
    minPrice: 3500,
    distance: 1.2,
    facilities: ["免费停车", "儿童厅", "情侣座"],
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  },
  {
    name: "CGV影城（颐堤港店）",
    address: "北京市朝阳区酒仙桥路18号颐堤港购物中心3层",
    phone: "010-84700688",
    latitude: 39.977856,
    longitude: 116.492315,
    city: "北京",
    district: "朝阳区",
    tags: ["IMAX", "4DX", "ScreenX"],
    minPrice: 3800,
    distance: 2.5,
    facilities: ["免费停车", "儿童厅", "餐饮"],
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  },
  {
    name: "博纳国际影城（悠唐店）",
    address: "北京市朝阳区朝阳门外大街悠唐购物中心5层",
    phone: "010-85629888",
    latitude: 39.923456,
    longitude: 116.442378,
    city: "北京",
    district: "朝阳区",
    tags: ["激光厅", "巨幕厅"],
    minPrice: 3200,
    distance: 0.8,
    facilities: ["免费停车", "餐饮"],
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  },
  {
    name: "金逸影城（朝阳大悦城店）",
    address: "北京市朝阳区朝阳北路101号朝阳大悦城9层",
    phone: "010-85551234",
    latitude: 39.934567,
    longitude: 116.474589,
    city: "北京",
    district: "朝阳区",
    tags: ["IMAX", "杜比全景声"],
    minPrice: 3600,
    distance: 3.1,
    facilities: ["免费停车", "儿童厅"],
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  },
  {
    name: "UME影城（双井店）",
    address: "北京市朝阳区东三环中路39号建外SOHO西区",
    phone: "010-58693388",
    latitude: 39.906789,
    longitude: 116.458901,
    city: "北京",
    district: "朝阳区",
    tags: ["激光厅", "VIP厅"],
    minPrice: 3400,
    distance: 1.8,
    facilities: ["免费停车", "情侣座"],
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }
];

exports.main = async (event, context) => {
  try {
    const movieResults = [];
    const cinemaResults = [];

    for (const movie of movies) {
      const result = await db.collection('movies').add({ data: movie });
      movieResults.push(result._id);
    }

    for (const cinema of cinemas) {
      const result = await db.collection('cinemas').add({ data: cinema });
      cinemaResults.push(result._id);
    }

    return {
      code: 0,
      message: '示例数据导入成功',
      data: {
        movies: movieResults.length,
        cinemas: cinemaResults.length
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
