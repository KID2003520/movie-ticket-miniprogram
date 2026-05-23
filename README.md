# 电影票小程序

一个基于微信小程序云开发的电影票预订系统，支持电影浏览、在线选座、订单管理、评论收藏等完整功能。

## 功能特性

### 核心功能
- 🎬 **电影浏览** - 热门电影、正在热映、即将上映
- 🎫 **在线选座** - 可视化座位选择，实时状态同步
- 💳 **订单管理** - 创建订单、在线支付、订单查询、申请退款
- ⭐ **评论收藏** - 电影评分、发表评论、收藏电影
- 🔍 **搜索功能** - 电影搜索、搜索历史、热门搜索
- 👤 **用户中心** - 个人信息、订单统计、功能菜单

### 技术特性
- 云开发架构，无需后端服务器
- 完整的数据库设计和索引优化
- 云函数权限验证和错误处理
- 下拉刷新、上拉加载
- 支付倒计时、自动取消订单
- 座位锁定机制

## 快速开始

### 环境要求
- 微信开发者工具
- 微信小程序账号
- 开通云开发服务

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd movie-ticket-miniprogram
   ```

2. **配置小程序**
   - 在微信开发者工具中打开项目
   - 修改 [`project.config.json`](./project.config.json:1) 中的 `appid`
   - 开通云开发，获取环境ID

3. **上传云函数**
   - 右键每个云函数目录
   - 选择"上传并部署：云端安装依赖"
   - 等待部署完成

4. **初始化数据库**
   ```javascript
   // 在小程序中调用云函数
   wx.cloud.callFunction({ name: 'initDatabase' })
   wx.cloud.callFunction({ name: 'importSampleData' })
   ```

5. **运行项目**
   - 点击"编译"按钮
   - 在模拟器或真机中预览

详细部署说明请查看：[部署指南](./docs/deployment-guide.md:1)

## 项目结构

```
movie-ticket-miniprogram/
├── cloudfunctions/          # 云函数
│   ├── initDatabase/        # 数据库初始化
│   ├── importSampleData/    # 示例数据导入
│   ├── login/               # 用户登录
│   ├── createOrder/         # 创建订单
│   ├── payOrder/            # 订单支付
│   ├── refundOrder/         # 订单退款
│   └── updateUser/          # 更新用户
├── pages/                   # 页面
│   ├── index/               # 首页
│   ├── movie/               # 电影列表
│   ├── movie-detail/        # 电影详情
│   ├── seat-selection/      # 选座
│   ├── order/               # 订单列表
│   ├── order-detail/        # 订单详情
│   ├── user/                # 用户中心
│   ├── collection/          # 我的收藏
│   └── search/              # 搜索
├── utils/                   # 工具函数
│   ├── util.js              # 通用工具
│   └── api.js               # API 接口
├── database/                # 数据库设计
├── docs/                    # 文档
└── plans/                   # 规划文档
```

## 核心功能说明

### 购票流程
1. 浏览电影列表，查看电影详情
2. 选择影院和场次
3. 可视化选座
4. 创建订单（座位锁定）
5. 15分钟内完成支付
6. 支付成功，生成取票码

### 订单管理
- **待支付**：15分钟倒计时，可支付/取消
- **已支付**：可申请退款（开场前30分钟）
- **退款中**：处理中状态
- **已退款/已取消**：可删除订单

### 评论收藏
- 登录后可收藏电影
- 发表评论和评分（1-5星）
- 评论实时显示在电影详情页

## 数据库设计

系统包含8个核心集合：

- **users** - 用户信息
- **movies** - 电影信息
- **cinemas** - 影院信息
- **schedules** - 电影排期
- **seats** - 座位状态
- **orders** - 订单管理
- **comments** - 用户评论
- **collections** - 用户收藏

详细设计请查看：[`database/database-design.json`](./database/database-design.json:1)

## 云函数说明

| 云函数 | 功能 | 文件 |
|--------|------|------|
| initDatabase | 初始化数据库集合和索引 | [`cloudfunctions/initDatabase/index.js`](./cloudfunctions/initDatabase/index.js:1) |
| importSampleData | 导入示例数据 | [`cloudfunctions/importSampleData/index.js`](./cloudfunctions/importSampleData/index.js:1) |
| login | 用户登录 | [`cloudfunctions/login/index.js`](./cloudfunctions/login/index.js:1) |
| createOrder | 创建订单 | [`cloudfunctions/createOrder/index.js`](./cloudfunctions/createOrder/index.js:1) |
| payOrder | 订单支付 | [`cloudfunctions/payOrder/index.js`](./cloudfunctions/payOrder/index.js:1) |
| refundOrder | 订单退款 | [`cloudfunctions/refundOrder/index.js`](./cloudfunctions/refundOrder/index.js:1) |
| updateUser | 更新用户信息 | [`cloudfunctions/updateUser/index.js`](./cloudfunctions/updateUser/index.js:1) |

## 技术栈

- **前端框架**：微信小程序原生框架
- **后端服务**：微信云开发
- **数据库**：云数据库
- **云函数**：Node.js
- **存储**：云存储

## 开发文档

- [系统改进计划](./plans/system-improvement-plan.md:1)
- [架构设计图](./plans/architecture-diagram.md:1)
- [快速开始指南](./plans/quick-start-guide.md:1)
- [部署指南](./docs/deployment-guide.md:1)
- [工作总结](./docs/work-summary.md:1)
- [开发总结](./docs/development-summary.md:1)

## 待完善功能

- [ ] 管理后台（电影管理、用户管理、订单管理）
- [ ] 真实图片资源
- [ ] 微信支付集成
- [ ] 安全防护增强
- [ ] 性能优化
- [ ] 优惠券系统
- [ ] 会员积分

## 注意事项

1. 本项目使用模拟支付，生产环境需接入真实支付
2. 图片使用占位图，需替换为真实电影海报
3. 需配置云开发环境ID
4. 需配置服务器域名白名单

## 许可证

MIT License

## 联系方式

如有问题或建议，欢迎提交 Issue 或 Pull Request。
