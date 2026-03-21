# 股小蜜投资组合管理系统 - 完整开发文档

## 项目概述

股小蜜是一个专业的股票投资组合管理工具，支持美股、港股和A股的实时跟踪、补仓模拟、技术分析和盈亏统计。

### 核心特性
- 多市场支持（美股/港股/A股）
- 实时价格更新
- 技术指标分析（RSI、MACD、MA）
- 补仓模拟与优化
- 资金池管理
- 持仓汇总统计
- 数据云端同步

---

## 技术架构

### 前端技术栈
- **React 18** - UI框架
- **TailwindCSS** - 样式框架
- **Chart.js** - 图表库
- **Lucide Icons** - 图标库

### 数据存储
- **Trickle Database** - 云端数据库（主存储）
- **LocalStorage** - 本地缓存

### 外部API
- **Yahoo Finance API** - 美股实时数据
- **Sina Finance API** - 港股/A股实时数据
- **Alpha Vantage API** - 美股技术指标

---

## 项目结构

```
/
├── index.html              # 主页面
├── app.js                  # 主应用入口
├── ziwei.html             # 紫微斗数页面
├── ziwei-app.js           # 紫微斗数应用
├── components/            # React组件
│   ├── StockCard.js           # 股票卡片（核心组件）
│   ├── PortfolioSummary.js    # 投资组合摘要
│   ├── HoldingsSummaryTable.js # 持仓明细汇总
│   ├── AddStockModal.js       # 添加股票弹窗
│   ├── StockNavigation.js     # 股票导航
│   ├── StockCardSections.js   # 股票卡片各区块
│   ├── PositionForm.js        # 持仓表单
│   ├── BuyFeesDetail.js       # 手续费详情
│   ├── CapitalPoolCard.js     # 资金池卡片
│   ├── PositionAllocationCard.js # 仓位配置卡片
│   └── StockCharts.js         # 技术指标图表
├── utils/                 # 工具函数
│   ├── stockAPI.js            # 股票API接口
│   ├── storage.js             # 本地存储
│   ├── calculations.js        # 盈亏计算
│   ├── feeCalculations.js     # 手续费计算
│   ├── technicalIndicators.js # 技术指标
│   └── databaseSync.js        # 数据库同步
└── trickle/              # Trickle特殊文件夹
    ├── assets/               # 资源文件
    ├── notes/                # 项目文档
    └── rules/                # 开发规则
```

---

## 核心功能详解

### 1. 股票管理

#### 1.1 添加股票
- 支持通过股票代码添加
- 自动识别市场类型（US/HK/CN）
- 自动获取股票名称和实时价格
- 支持自定义股票名称

**关键代码位置**: `components/AddStockModal.js`

#### 1.2 股票信息显示
每个股票卡片包含：
- 基本信息（代码、名称、市场）
- 实时价格和涨跌幅
- 持仓明细
- 技术指标
- 补仓建议

**关键代码位置**: `components/StockCard.js`

### 2. 持仓管理

#### 2.1 添加持仓
- 买入价格
- 买入数量
- 买入日期
- 手续费自动计算

**费率标准**:
- **美股**: 0.003% + $1最低收费
- **港股**: 0.03%佣金 + 0.00507%交易费 + 0.003%交易征费 + $1印花税
- **A股**: 0.03%佣金 + 0.001%过户费

**关键代码位置**: 
- `components/PositionForm.js`
- `utils/feeCalculations.js`

#### 2.2 补仓模拟
系统会根据当前价格和持仓情况，计算：
- 建议补仓价格
- 补仓后成本价
- 所需资金
- 手续费明细

**算法**: 采用等额补仓法，保证每次补仓金额相等

**关键代码位置**: `utils/calculations.js`

#### 2.3 持仓统计
- 总成本计算
- 当前市值
- 浮动盈亏（金额+百分比）
- 当日盈亏（新增）
- 持仓天数

### 3. 技术分析

#### 3.1 支持的指标
- **RSI** (相对强弱指标)
  - 超买线: 70
  - 超卖线: 30
  
- **MACD** (指数平滑移动平均线)
  - MACD线
  - Signal线
  - 柱状图
  
- **MA** (移动平均线)
  - MA5 (5日均线)
  - MA20 (20日均线)
  - MA60 (60日均线)

#### 3.2 数据来源
- **美股**: Alpha Vantage API
- **港股/A股**: Sina Finance + 本地计算

**关键代码位置**: 
- `utils/technicalIndicators.js`
- `components/StockCharts.js`

### 4. 资金池管理

支持多个资金池，每个资金池包含：
- 资金池名称
- 总金额
- 已用金额
- 可用金额
- 使用百分比

**使用场景**: 区分不同账户或投资策略

**关键代码位置**: `components/CapitalPoolCard.js`

### 5. 投资组合统计

#### 5.1 总览数据
- 总投入成本
- 当前总市值
- 总浮动盈亏
- 总盈亏百分比
- 总收益率

#### 5.2 持仓明细汇总表
展示所有股票的所有持仓记录：
- 股票代码
- 市场类型
- 买入价格
- 持仓数量
- 买入日期
- 持仓天数
- 当前价格
- 当日盈亏（金额+百分比）
- 浮动盈亏（金额+百分比）

**关键代码位置**: 
- `components/PortfolioSummary.js`
- `components/HoldingsSummaryTable.js`

### 6. 数据同步

#### 6.1 云端存储
使用Trickle Database存储：
- 股票列表
- 持仓记录
- 资金池信息
- 技术指标数据

**对象类型**:
- `stock` - 股票基本信息
- `position:{stockId}` - 特定股票的持仓
- `capital_pool` - 资金池

#### 6.2 本地缓存
使用LocalStorage缓存：
- 最近使用的数据
- 离线访问支持

**关键代码位置**: 
- `utils/databaseSync.js`
- `utils/storage.js`

---

## API集成详解

### 1. Yahoo Finance API (美股)

**获取实时价格**:
```
GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
```

**返回数据**:
- 当前价格
- 涨跌额
- 涨跌幅
- 开盘价/收盘价/最高价/最低价

### 2. Sina Finance API (港股/A股)

**港股**:
```
GET https://hq.sinajs.cn/list=hk{code}
```

**A股**:
```
GET https://hq.sinajs.cn/list={market}{code}
```
- 市场代码: sh(上海) / sz(深圳)

### 3. Alpha Vantage API (美股技术指标)

需要API Key，功能：
- RSI指标
- MACD指标
- 移动平均线

**限制**: 免费版每分钟5次请求

**关键代码位置**: `utils/stockAPI.js`

---

## 关键算法

### 1. 补仓计算算法

```javascript
// 等额补仓法
targetAmount = totalCost / (positions.length + 1)

// 遍历计算每个补仓点
for (let i = 1; i <= 5; i++) {
  buyInPrice = currentPrice * (1 - i * 0.05) // 下跌5%递减
  shares = Math.floor(targetAmount / buyInPrice)
  newAvgCost = (totalCost + actualCost) / (totalShares + shares)
}
```

### 2. 手续费计算

**美股**:
```javascript
commission = Math.max(totalAmount * 0.00003, 1)
totalFees = commission
```

**港股**:
```javascript
commission = totalAmount * 0.0003
tradingFee = totalAmount * 0.00507 / 100
transactionLevy = totalAmount * 0.003 / 100
stampDuty = 1
totalFees = commission + tradingFee + transactionLevy + stampDuty
```

**A股**:
```javascript
commission = totalAmount * 0.0003
transferFee = totalAmount * 0.00001
totalFees = commission + transferFee
```

### 3. 盈亏计算

```javascript
// 单个持仓盈亏
profitLoss = (currentPrice - buyPrice) * shares

// 盈亏百分比
profitLossPercent = ((currentPrice / buyPrice) - 1) * 100

// 当日盈亏
dailyProfitLoss = currentPrice * shares * (dailyChangePercent / 100)
```

---

## 数据模型

### Stock对象结构
```javascript
{
  id: string,              // 唯一标识
  symbol: string,          // 股票代码
  market: 'US'|'HK'|'CN', // 市场类型
  name: string,            // 股票名称
  currentPrice: number,    // 当前价格
  positions: [             // 持仓列表
    {
      id: string,
      price: number,
      shares: number,
      date: string,
      enabled: boolean,
      fees: number
    }
  ],
  marketData: {            // 市场数据
    price: number,
    change: number,
    changePercent: number,
    open: number,
    high: number,
    low: number,
    volume: number
  },
  technicalIndicators: {   // 技术指标
    rsi: number,
    macd: {...},
    ma: {ma5, ma20, ma60}
  }
}
```

### CapitalPool对象结构
```javascript
{
  id: string,              // 唯一标识
  name: string,            // 资金池名称
  totalAmount: number,     // 总金额
  usedAmount: number       // 已用金额
}
```

---

## 响应式设计

### 断点设置
- **移动端**: < 768px
- **桌面端**: >= 768px

### 移动端优化
- 卡片式布局
- 折叠式详情
- 触摸友好的按钮尺寸
- 简化的表格显示

### 桌面端优化
- 表格式布局
- 并排显示
- 更多信息展示
- 悬停效果

---

## 性能优化

### 1. 数据缓存
- LocalStorage缓存常用数据
- 避免重复API调用
- 缓存技术指标数据

### 2. 按需加载
- 技术指标按需获取
- 图表延迟渲染
- 组件懒加载

### 3. 批量操作
- 批量刷新价格
- 批量数据同步

---

## 错误处理

### 1. API失败处理
- 显示用户友好的错误信息
- 提供重试机制
- 降级到模拟数据（仅限全局刷新）

### 2. 数据验证
- 输入验证（价格、数量）
- 数据完整性检查
- 防止重复添加

### 3. 同步失败
- 本地数据备份
- 自动重试机制
- 用户提示

---

## 安全考虑

### 1. API密钥管理
- 前端暴露的API需要限流
- 考虑后端代理敏感API

### 2. 数据隐私
- 投资数据仅存储在用户账户
- 支持数据导出
- 可删除所有数据

### 3. CORS处理
- 使用Trickle代理API避免CORS问题
- 代理地址: `https://proxy-api.trickle-app.host/?url={target-url}`

---

## 未来扩展方向

### 1. 功能增强
- [ ] 支持更多市场（欧洲、日本等）
- [ ] 添加期权管理
- [ ] 股息记录和统计
- [ ] 交易历史记录
- [ ] 收益率曲线图

### 2. 技术优化
- [ ] 实时WebSocket价格推送
- [ ] PWA离线支持
- [ ] 数据导出功能
- [ ] 多语言支持

### 3. 分析工具
- [ ] 投资组合风险分析
- [ ] 行业分布分析
- [ ] 回测功能
- [ ] AI投资建议

---

## 开发者注意事项

### 1. 代码规范
- 使用ES6+语法
- 组件化开发
- 函数职责单一
- 注释清晰

### 2. Git工作流
- 每个功能独立commit
- 清晰的commit message
- 定期同步代码

### 3. 测试建议
- 测试不同市场股票
- 测试边界情况
- 测试网络失败场景
- 测试数据同步

---

## 常见问题 (FAQ)

### Q1: 为什么单个股票刷新会失败？
A: 单个股票刷新直接调用实时API，如果API不可用会显示错误提示。建议使用"刷新全部"功能。

### Q2: 技术指标数据不准确？
A: 港股和A股的技术指标是基于Sina Finance的历史数据本地计算的，可能与专业工具有差异。

### Q3: 手续费计算准确吗？
A: 手续费按照主流券商标准计算，但各券商费率可能不同，建议以实际账单为准。

### Q4: 数据会丢失吗？
A: 数据存储在Trickle Database云端，同时本地有LocalStorage备份，正常情况下不会丢失。

### Q5: 支持多账户吗？
A: 通过资金池功能可以区分不同账户，但所有数据在同一个Trickle账户下。

---

## 联系与支持

- **开发者**: Trickle团队
- **更新日期**: 2025年12月15日
- **版本**: v2.0

本文档持续更新中...