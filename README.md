# 电影购票微信小程序

基于微信小程序云开发的电影在线购票平台，采用前后端分离架构设计。

## 项目结构

```
movie-ticket-miniprogram/
├── cloudfunctions/          # 云函数目录
│   ├── login/              # 登录云函数
│   ├── updateUser/         # 更新用户信息
│   ├── createOrder/        # 创建订单
│   ├── payOrder/           # 支付订单
│   ├── wxPay/              # 微信支付
│   ├── sendSms/            # 发送短信
│   ├── initDatabase/       # 初始化数据库
│   └── importSampleData/   # 导入示例数据
├── pages/                   # 页面目录
│   ├── index/              # 首页
│   ├── movie/              # 电影列表
│   ├── movie-detail/       # 电影详情
│   ├── cinema/             # 影院列表
│   ├── cinema-detail/      # 影院详情
│   ├── seat-selection/     # 座位选择
│   ├── order/              # 订单列表
│   ├── order-detail/       # 订单详情
│   ├── user/               # 个人中心
│   ├── login/              # 登录
│   └── register/           # 注册
├── utils/                   # 工具类
│   ├── util.js             # 通用工具
│   └── api.js              # API接口
├── database/                # 数据库相关
│   ├── database-design.json # 数据库设计
│   └── sample-data.js      # 示例数据
├── images/                  # 图片资源
├── app.js                   # 小程序入口
├── app.json                 # 小程序配置
├── app.wxss                 # 全局样式
└── project.config.json      # 项目配置
```

## 技术栈

### 前端技术
- 微信小程序原生框架
- WXML + WXSS + JavaScript
- Vant Weapp UI组件库
- ECharts数据可视化

### 后端技术
- 微信小程序云开发
- 云函数 (Node.js)
- 云数据库 (JSON数据库)
- 云存储

### 第三方服务
- 微信支付
- 腾讯地图
- 短信服务

## 功能模块

### 1. 用户管理模块
- 微信一键登录
- 手机号注册登录
- 个人信息管理
- 用户状态管理

### 2. 电影信息模块
- 电影列表展示
- 电影详情查看
- 电影搜索
- 电影收藏
- 用户评论

### 3. 影院场次模块
- 影院列表
- 影院详情
- 场次查询
- 座位选择
- 地图导航

### 4. 订单支付模块
- 订单创建
- 订单支付
- 订单管理
- 订单详情
- 退款功能

### 5. 个人中心模块
- 订单历史
- 收藏管理
- 优惠券管理
- 常用影院

## 数据库设计

### 数据表
1. **users** - 用户表
2. **movies** - 电影表
3. **cinemas** - 影院表
4. **schedules** - 场次表
5. **seats** - 座位表
6. **orders** - 订单表
7. **comments** - 评论表
8. **collections** - 收藏表
9. **coupons** - 优惠券表

详细设计请查看 [database/database-design.json](database/database-design.json)

## 部署说明

### 1. 环境准备
- 安装微信开发者工具
- 注册微信小程序账号
- 开通云开发服务

### 2. 配置修改
修改以下文件中的配置：
- `app.js` - 修改云开发环境ID
- `project.config.json` - 修改小程序AppID
- 云函数中的商户号、密钥等配置

### 3. 云函数部署
```bash
# 在微信开发者工具中
# 右键 cloudfunctions 目录
# 选择"同步云函数列表"
# 依次上传并部署所有云函数
```

### 4. 数据库初始化
```bash
# 调用 initDatabase 云函数创建数据表
# 调用 importSampleData 云函数导入示例数据
```

### 5. 图片资源
将tab栏图标放入 `images/tab/` 目录：
- home.png / home-active.png
- movie.png / movie-active.png
- cinema.png / cinema-active.png
- user.png / user-active.png

## API接口

### 用户相关
- `login` - 获取用户openid
- `updateUser` - 更新用户信息

### 订单相关
- `createOrder` - 创建订单
- `payOrder` - 支付订单

### 支付相关
- `wxPay` - 获取微信支付参数

### 其他
- `sendSms` - 发送短信验证码
- `initDatabase` - 初始化数据库
- `importSampleData` - 导入示例数据

## 注意事项

1. **云开发环境**：需要在微信开发者工具中开通云开发服务
2. **支付功能**：需要申请微信支付商户号
3. **地图功能**：需要申请腾讯地图key
4. **短信功能**：需要申请短信服务
5. **图片资源**：需要自行准备图片资源并上传到云存储

## 开发计划

- [ ] 添加电影评分功能
- [ ] 添加电影推荐算法
- [ ] 添加社交分享功能
- [ ] 添加会员系统
- [ ] 添加积分系统
- [ ] 优化用户体验
- [ ] 添加更多支付方式

## 许可证

MIT License
