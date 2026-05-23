# 部署指南

## ✅ 已完成的工作

### 1. 数据库层
- ✅ 数据库初始化云函数 ([`cloudfunctions/initDatabase/index.js`](../cloudfunctions/initDatabase/index.js))
- ✅ 示例数据导入云函数 ([`cloudfunctions/importSampleData/index.js`](../cloudfunctions/importSampleData/index.js))
  - 包含7部电影数据
  - 包含3家影院数据
  - 自动生成未来7天的场次数据

### 2. 云函数层
- ✅ 登录云函数 ([`cloudfunctions/login/index.js`](../cloudfunctions/login/index.js))
  - 自动获取用户openid
  - 自动创建用户记录
- ✅ 用户更新云函数 ([`cloudfunctions/updateUser/index.js`](../cloudfunctions/updateUser/index.js))
- ✅ 订单创建云函数 ([`cloudfunctions/createOrder/index.js`](../cloudfunctions/createOrder/index.js))
  - 验证座位可用性
  - 锁定座位
  - 创建订单
- ✅ 支付订单云函数 ([`cloudfunctions/payOrder/index.js`](../cloudfunctions/payOrder/index.js))
  - 更新订单状态
  - 更新座位状态

### 3. 前端页面
- ✅ 首页 ([`pages/index/index.js`](../pages/index/index.js))
  - 连接真实数据库
  - 显示热门电影、正在热映、即将上映
- ✅ 电影详情页 ([`pages/movie-detail/movie-detail.js`](../pages/movie-detail/movie-detail.js))
  - 从数据库加载电影信息
  - 显示评论列表
- ✅ 选座页面 ([`pages/seat-selection/seat-selection.js`](../pages/seat-selection/seat-selection.js))
  - 从数据库加载座位状态
  - 连接订单创建云函数

## 🚀 部署步骤

### 第一步：配置云开发环境

1. 打开微信开发者工具
2. 打开项目
3. 点击"云开发"按钮
4. 开通云开发服务（如果还没开通）
5. 记录你的云开发环境ID

### 第二步：修改环境配置

修改 [`app.js`](../app.js) 中的环境ID：
```javascript
wx.cloud.init({
  env: 'your-cloud-env-id',  // 替换为你的环境ID
  traceUser: true,
});
```

### 第三步：部署云函数

1. 在微信开发者工具中，右键 `cloudfunctions` 目录
2. 选择"同步云函数列表"
3. 依次上传并部署以下云函数：
   - `initDatabase`
   - `importSampleData`
   - `login`
   - `updateUser`
   - `createOrder`
   - `payOrder`

### 第四步：初始化数据库

1. 在云开发控制台，进入"云函数"页面
2. 找到 `initDatabase` 云函数，点击"测试"
3. 点击"运行测试"，等待执行完成
4. 确认返回结果显示所有数据表创建成功

### 第五步：导入示例数据

1. 在云开发控制台，找到 `importSampleData` 云函数
2. 点击"测试"，然后"运行测试"
3. 等待执行完成（可能需要几秒钟）
4. 确认返回结果显示数据导入成功

### 第六步：验证数据

1. 在云开发控制台，进入"数据库"页面
2. 检查以下数据表是否有数据：
   - `movies` - 应该有7条记录
   - `cinemas` - 应该有3条记录
   - `schedules` - 应该有多条记录

### 第七步：测试小程序

1. 在微信开发者工具中点击"编译"
2. 测试以下功能：
   - 首页是否显示电影列表
   - 点击电影是否能进入详情页
   - 电影详情页是否显示完整信息

## 📝 下一步工作

### 优先级高
1. **完善订单列表页** ([`pages/order/order.js`](../pages/order/order.js))
   - 从数据库加载订单
   - 显示订单状态
   
2. **完善订单详情页** ([`pages/order-detail/order-detail.js`](../pages/order-detail/order-detail.js))
   - 显示订单完整信息
   - 实现支付功能

3. **完善影院相关页面**
   - 影院列表 ([`pages/cinema/cinema.js`](../pages/cinema/cinema.js))
   - 影院详情 ([`pages/cinema-detail/cinema-detail.js`](../pages/cinema-detail/cinema-detail.js))

### 优先级中
4. **完善用户中心** ([`pages/user/user.js`](../pages/user/user.js))
   - 显示用户信息
   - 显示订单统计

5. **完善登录功能** ([`pages/login/login.js`](../pages/login/login.js))
   - 连接登录云函数
   - 保存用户信息

6. **实现搜索功能** ([`pages/search/search.js`](../pages/search/search.js))

### 优先级低
7. **完善管理后台**
8. **添加图片资源**
9. **优化UI/UX**

## ⚠️ 注意事项

1. **云开发环境**：确保已开通云开发服务
2. **数据库权限**：默认权限为"仅创建者可读写"，可根据需要调整
3. **图片资源**：当前使用占位图，后期需要替换
4. **支付功能**：当前为模拟支付，真实支付需要商户号

## 🐛 常见问题

### Q: 云函数调用失败？
**A**: 检查云函数是否已上传部署，检查环境ID是否正确

### Q: 数据库查询为空？
**A**: 确认是否已执行数据初始化，检查数据库中是否有数据

### Q: 页面显示异常？
**A**: 打开调试器查看控制台错误信息，检查数据格式是否正确

## 📚 相关文档

- [系统完善计划](../plans/system-improvement-plan.md)
- [系统架构图](../plans/architecture-diagram.md)
- [快速开始指南](../plans/quick-start-guide.md)
