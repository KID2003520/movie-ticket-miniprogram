# 系统架构与流程图

## 🏗️ 系统整体架构

```mermaid
graph TB
    subgraph 用户端
        A[微信小程序前端]
    end
    
    subgraph 云开发平台
        B[云函数层]
        C[云数据库]
        D[云存储]
    end
    
    subgraph 第三方服务
        E[微信支付]
        F[腾讯地图]
        G[短信服务]
    end
    
    A -->|API调用| B
    B -->|数据操作| C
    B -->|文件操作| D
    B -->|支付请求| E
    A -->|地图服务| F
    B -->|发送短信| G
```

## 📊 数据库架构

```mermaid
erDiagram
    USERS ||--o{ ORDERS : places
    USERS ||--o{ COMMENTS : writes
    USERS ||--o{ COLLECTIONS : has
    USERS ||--o{ COUPONS : owns
    
    MOVIES ||--o{ SCHEDULES : has
    MOVIES ||--o{ COMMENTS : receives
    MOVIES ||--o{ COLLECTIONS : collected
    
    CINEMAS ||--o{ SCHEDULES : hosts
    
    SCHEDULES ||--o{ SEATS : contains
    SCHEDULES ||--o{ ORDERS : generates
    
    ORDERS ||--o{ SEATS : reserves
    ORDERS ||--o| COUPONS : uses
    
    USERS {
        string _id
        string _openid
        string nickName
        string avatarUrl
        string phone
        int gender
        date createTime
    }
    
    MOVIES {
        string _id
        string title
        string poster
        float rating
        string genre
        int duration
        string director
        string actors
        string description
        date releaseDate
        int price
        string status
        int hot
    }
    
    CINEMAS {
        string _id
        string name
        string address
        string phone
        float latitude
        float longitude
        string city
        string district
        array tags
        int minPrice
    }
    
    SCHEDULES {
        string _id
        string movieId
        string cinemaId
        string hallName
        string date
        string startTime
        string endTime
        int price
        int totalSeats
        int availableSeats
    }
    
    ORDERS {
        string _id
        string _openid
        string orderNo
        string scheduleId
        array seats
        int totalPrice
        string status
        date payTime
    }
    
    SEATS {
        string _id
        string scheduleId
        int row
        int col
        string status
        string orderId
    }
```

## 🔄 核心业务流程

### 1. 用户登录流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant CF as login云函数
    participant DB as 数据库
    
    U->>F: 点击登录
    F->>F: wx.login获取code
    F->>CF: 调用login云函数
    CF->>CF: 获取openid
    CF->>DB: 查询用户是否存在
    alt 用户不存在
        CF->>DB: 创建新用户
    end
    CF->>F: 返回openid和用户信息
    F->>F: 保存到本地存储
    F->>U: 登录成功
```

### 2. 选座购票流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant CF as createOrder云函数
    participant DB as 数据库
    
    U->>F: 浏览电影
    F->>DB: 获取电影列表
    DB->>F: 返回电影数据
    
    U->>F: 选择电影
    F->>DB: 获取影院和场次
    DB->>F: 返回场次列表
    
    U->>F: 选择场次
    F->>DB: 获取座位状态
    DB->>F: 返回座位数据
    
    U->>F: 选择座位
    F->>F: 计算总价
    
    U->>F: 确认下单
    F->>CF: 调用createOrder
    
    CF->>DB: 开始事务
    CF->>DB: 验证场次和座位
    alt 座位可用
        CF->>DB: 创建订单
        CF->>DB: 锁定座位
        CF->>DB: 更新可用座位数
        CF->>DB: 提交事务
        CF->>F: 返回订单信息
        F->>U: 跳转支付页面
    else 座位已被占用
        CF->>DB: 回滚事务
        CF->>F: 返回错误
        F->>U: 提示座位已售
    end
```

### 3. 订单支付流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant WX as wxPay云函数
    participant PAY as payOrder云函数
    participant WXP as 微信支付
    participant DB as 数据库
    
    U->>F: 点击支付
    F->>WX: 获取支付参数
    WX->>DB: 查询订单信息
    WX->>WXP: 统一下单
    WXP->>WX: 返回支付参数
    WX->>F: 返回支付参数
    
    F->>F: wx.requestPayment
    F->>WXP: 调起支付
    
    U->>WXP: 完成支付
    WXP->>PAY: 支付回调
    
    PAY->>DB: 开始事务
    PAY->>DB: 更新订单状态为已支付
    PAY->>DB: 更新座位状态为已售
    PAY->>DB: 更新优惠券状态
    PAY->>DB: 提交事务
    
    PAY->>WXP: 返回成功
    WXP->>F: 支付成功
    F->>U: 显示支付成功
```

### 4. 评论功能流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant DB as 数据库
    
    U->>F: 查看电影详情
    F->>DB: 获取电影信息
    F->>DB: 获取评论列表
    DB->>F: 返回评论数据
    F->>U: 显示评论
    
    U->>F: 发表评论
    F->>F: 验证登录状态
    F->>DB: 添加评论
    DB->>F: 返回成功
    F->>U: 显示新评论
```

### 5. 收藏功能流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant DB as 数据库
    
    U->>F: 点击收藏按钮
    F->>DB: 检查是否已收藏
    
    alt 未收藏
        F->>DB: 添加收藏记录
        DB->>F: 返回成功
        F->>U: 显示已收藏
    else 已收藏
        F->>DB: 删除收藏记录
        DB->>F: 返回成功
        F->>U: 显示未收藏
    end
```

## 🎯 页面导航流程

```mermaid
graph LR
    A[首页] --> B[电影列表]
    A --> C[影院列表]
    A --> D[个人中心]
    
    B --> E[电影详情]
    E --> F[选择影院]
    F --> G[选择场次]
    G --> H[选座]
    H --> I[确认订单]
    I --> J[支付]
    J --> K[订单详情]
    
    C --> L[影院详情]
    L --> G
    
    D --> M[订单列表]
    M --> K
    D --> N[收藏列表]
    N --> E
    D --> O[优惠券列表]
    
    A --> P[搜索]
    P --> E
    P --> L
```

## 🔐 权限控制流程

```mermaid
graph TD
    A[用户请求] --> B{是否登录?}
    B -->|否| C[跳转登录页]
    B -->|是| D{是否需要管理员权限?}
    D -->|否| E[执行操作]
    D -->|是| F{是否为管理员?}
    F -->|否| G[提示无权限]
    F -->|是| E
```

## 📱 前端页面结构

```mermaid
graph TB
    subgraph TabBar页面
        A[首页 index]
        B[电影 movie]
        C[影院 cinema]
        D[我的 user]
    end
    
    subgraph 电影模块
        E[电影详情 movie-detail]
        F[搜索 search]
    end
    
    subgraph 影院模块
        G[影院详情 cinema-detail]
    end
    
    subgraph 订单模块
        H[选座 seat-selection]
        I[订单列表 order]
        J[订单详情 order-detail]
    end
    
    subgraph 用户模块
        K[登录 login]
        L[注册 register]
    end
    
    subgraph 管理模块
        M[管理主页 admin]
        N[电影管理 admin-movie]
        O[用户管理 admin-user]
    end
    
    A --> E
    A --> F
    B --> E
    B --> F
    C --> G
    E --> G
    G --> H
    H --> I
    I --> J
    D --> K
    D --> I
    D --> M
    M --> N
    M --> O
```

## 🛠️ 云函数架构

```mermaid
graph TB
    subgraph 用户相关
        A[login - 用户登录]
        B[updateUser - 更新用户信息]
    end
    
    subgraph 订单相关
        C[createOrder - 创建订单]
        D[payOrder - 支付订单]
    end
    
    subgraph 支付相关
        E[wxPay - 微信支付]
    end
    
    subgraph 其他服务
        F[sendSms - 发送短信]
    end
    
    subgraph 数据管理
        G[initDatabase - 初始化数据库]
        H[importSampleData - 导入示例数据]
    end
```

## 📈 数据流向

```mermaid
graph LR
    A[用户操作] --> B[前端页面]
    B --> C[API封装层]
    C --> D[云函数]
    D --> E[数据验证]
    E --> F[业务逻辑]
    F --> G[数据库操作]
    G --> H[返回结果]
    H --> I[前端展示]
    I --> J[用户查看]
```

## 🔄 状态管理

### 订单状态流转

```mermaid
stateDiagram-v2
    [*] --> pending: 创建订单
    pending --> paid: 支付成功
    pending --> cancelled: 取消订单
    paid --> used: 使用完成
    paid --> refunded: 申请退款
    cancelled --> [*]
    used --> [*]
    refunded --> [*]
```

### 座位状态流转

```mermaid
stateDiagram-v2
    [*] --> available: 初始化
    available --> locked: 创建订单
    locked --> sold: 支付成功
    locked --> available: 订单取消/超时
    sold --> [*]
```

### 优惠券状态流转

```mermaid
stateDiagram-v2
    [*] --> valid: 发放优惠券
    valid --> used: 使用优惠券
    valid --> expired: 过期
    used --> [*]
    expired --> [*]
```

## 🎨 UI组件层次

```mermaid
graph TB
    A[App] --> B[TabBar]
    A --> C[Pages]
    
    C --> D[首页组件]
    C --> E[电影组件]
    C --> F[影院组件]
    C --> G[用户组件]
    
    D --> H[轮播图]
    D --> I[电影卡片]
    
    E --> J[电影列表]
    E --> K[筛选器]
    
    F --> L[影院列表]
    F --> M[地图]
    
    G --> N[用户信息]
    G --> O[订单列表]
```

## 🔧 工具类架构

```mermaid
graph TB
    A[utils工具类] --> B[api.js - API封装]
    A --> C[util.js - 通用工具]
    
    B --> D[用户API]
    B --> E[电影API]
    B --> F[影院API]
    B --> G[订单API]
    
    C --> H[日期格式化]
    C --> I[价格格式化]
    C --> J[提示工具]
    C --> K[登录验证]
```

## 📊 性能优化策略

```mermaid
graph TB
    A[性能优化] --> B[前端优化]
    A --> C[后端优化]
    A --> D[数据库优化]
    
    B --> E[图片懒加载]
    B --> F[分页加载]
    B --> G[请求防抖]
    B --> H[数据缓存]
    
    C --> I[云函数复用]
    C --> J[批量操作]
    C --> K[异步处理]
    
    D --> L[索引优化]
    D --> M[聚合查询]
    D --> N[数据分片]
```

## 🔒 安全防护体系

```mermaid
graph TB
    A[安全防护] --> B[前端验证]
    A --> C[后端验证]
    A --> D[数据库安全]
    
    B --> E[表单验证]
    B --> F[登录验证]
    
    C --> G[参数验证]
    C --> H[权限验证]
    C --> I[频率限制]
    
    D --> J[数据权限]
    D --> K[SQL注入防护]
    D --> L[敏感信息加密]
```

这些架构图和流程图清晰地展示了整个系统的结构和运作方式，可以作为开发过程中的重要参考文档。
