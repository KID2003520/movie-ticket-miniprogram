# 云开发环境配置说明

## 错误原因

当前错误：`[100003] Param Invalid: env check invalid`

**原因**：[`app.js`](../app.js:13) 中的云开发环境ID未配置或配置错误。

## 解决方案

### 1. 获取云开发环境ID

1. 打开微信开发者工具
2. 点击顶部菜单：**云开发** → **云开发控制台**
3. 在控制台页面，查看左上角的**环境ID**（格式类似：`cloud1-xxx` 或 `prod-xxx`）
4. 复制该环境ID

### 2. 配置环境ID

修改 [`app.js`](../app.js:12-15) 文件：

```javascript
wx.cloud.init({
  env: 'your-cloud-env-id',  // ← 替换为真实的环境ID
  traceUser: true,
});
```

**修改为**：

```javascript
wx.cloud.init({
  env: 'cloud1-xxxxx',  // ← 替换为你的真实环境ID
  traceUser: true,
});
```

### 3. 重新编译

1. 保存文件
2. 点击开发者工具的**编译**按钮
3. 查看控制台，确认错误消失

## 完整配置步骤

### 步骤1：开通云开发

如果还未开通云开发：

1. 在微信开发者工具中点击**云开发**按钮
2. 按照提示开通云开发服务
3. 创建一个云开发环境（推荐选择按量付费）
4. 记录环境ID

### 步骤2：配置项目

修改 [`app.js`](../app.js:13)：

```javascript
// 将 'your-cloud-env-id' 替换为实际的环境ID
env: 'cloud1-xxxxx'
```

### 步骤3：上传云函数

右键每个云函数目录，选择：
- **上传并部署：云端安装依赖**

需要上传的云函数：
- `initDatabase`
- `importSampleData`
- `login`
- `createOrder`
- `payOrder`
- `refundOrder`
- `updateUser`

### 步骤4：初始化数据库

在小程序中调用云函数初始化数据库：

```javascript
// 方法1：在控制台手动调用
wx.cloud.callFunction({
  name: 'initDatabase'
}).then(res => {
  console.log('数据库初始化成功', res);
  
  // 导入示例数据
  return wx.cloud.callFunction({
    name: 'importSampleData'
  });
}).then(res => {
  console.log('示例数据导入成功', res);
});

// 方法2：在云开发控制台的云函数页面手动调用
```

### 步骤5：配置数据库权限

1. 打开云开发控制台
2. 进入**数据库**页面
3. 为每个集合设置权限：
   - `users` - 仅创建者可读写
   - `movies` - 所有用户可读，仅管理员可写
   - `cinemas` - 所有用户可读，仅管理员可写
   - `schedules` - 所有用户可读，仅管理员可写
   - `seats` - 所有用户可读，仅创建者和管理员可写
   - `orders` - 仅创建者可读写
   - `comments` - 所有用户可读，仅创建者可写
   - `collections` - 仅创建者可读写

## 常见问题

### Q1: 找不到云开发按钮？

**A**: 确保：
- 使用的是正式的小程序 AppID（不是测试号）
- 小程序已认证
- 开发者工具版本 >= 1.02.1904090

### Q2: 云函数上传失败？

**A**: 
- 检查网络连接
- 确保云开发环境已开通
- 尝试重新上传

### Q3: 数据库初始化失败？

**A**:
- 检查云函数是否上传成功
- 查看云函数日志排查错误
- 确保云开发环境ID配置正确

### Q4: 如何查看云函数日志？

**A**:
1. 打开云开发控制台
2. 进入**云函数**页面
3. 点击对应的云函数
4. 查看**日志**标签页

## 环境ID示例

正确的环境ID格式：
- `cloud1-xxxxx`
- `prod-xxxxx`
- `test-xxxxx`

错误的配置：
- `'your-cloud-env-id'` ❌
- `''` ❌
- `undefined` ❌

## 验证配置

配置完成后，在小程序控制台应该看到：

```
[云开发] 初始化成功
[云开发] 环境ID: cloud1-xxxxx
```

如果看到错误信息，请检查环境ID是否正确。

## 相关文档

- [微信云开发官方文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
- [云开发快速开始](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/quick-start/miniprogram.html)
- [项目部署指南](./deployment-guide.md)
