# 测试说明

## 单元测试

```bash
cd backend
npm test
```

覆盖：`lib/movieApiFormat.js`（上映日格式化、price 分转元等）。

## 接口冒烟

先启动后端：

```bash
cd backend
npm run dev
```

另开终端：

```bash
cd backend
npm run smoke
```

会校验：`/api/health`、`/api/movies`、`/api/movies?status=coming`、`/api/cinemas`，以及 `/api/admin/dashboard-stats`（无登录时应 401/403；若返回 **404** 请**重启 Node 进程**以加载最新路由）。

自定义地址：

```bash
set SMOKE_BASE_URL=http://192.168.1.5:3000
npm run smoke
```

## 小程序端（人工）

在微信开发者工具中验证：`USE_BACKEND_ONLY: true` 时，首页→电影→选座→下单→支付/取消；管理端「今日数据」「用户列表」应与 MySQL 一致。

## 与 CI 集成（可选）

在 CI 中顺序执行：`npm test` → 启动 `node server.js` → `npm run smoke`。
