class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="text-center text-slate-100">
            <h1 className="text-2xl font-bold mb-4">出现错误</h1>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary"
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function getCurrentReturnPath() {
  if (typeof window === 'undefined') return 'index.html';
  return `${window.location.pathname.split('/').pop() || 'index.html'}${window.location.search || ''}${window.location.hash || ''}`;
}

function withCurrentSource(path) {
  const separator = path.indexOf('?') >= 0 ? '&' : '?';
  return `${path}${separator}from=${encodeURIComponent(getCurrentReturnPath())}`;
}

function getSourceReturnTarget(fallback) {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from') || '';
  if (from) {
    try {
      const target = new URL(from, window.location.href);
      if (target.origin === window.location.origin) {
        return `${target.pathname.split('/').pop() || fallback}${target.search || ''}${target.hash || ''}`;
      }
    } catch (_) {}
  }
  return fallback;
}

function goBackToSource() {
  const hasExplicitSource = new URLSearchParams(window.location.search).has('from');
  const target = getSourceReturnTarget('index.html');
  if (hasExplicitSource && target) {
    window.location.href = target;
    return;
  }
  if (window.history && window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = 'index.html';
}

/** 与股票分析页同源：Vercel 同域 或 env.js 的 ANALYSIS_API_BASE；本地默认 8123 */
function getZiweiApiBase() {
  try {
    var saved = (localStorage.getItem('analysis_api_base') || '').trim().replace(/\/+$/, '');
    var onDeployed =
      typeof location !== 'undefined' &&
      location.hostname !== 'localhost' &&
      location.hostname !== '127.0.0.1';
    if (saved && onDeployed && /^(https?:\/\/)?(localhost|127\.0\.0\.1)/i.test(saved)) {
      saved = '';
      try {
        localStorage.removeItem('analysis_api_base');
      } catch (_) {}
    }
    if (saved) return saved;
  } catch (_) {}
  if (typeof window !== 'undefined' && window.ANALYSIS_API_BASE) {
    return String(window.ANALYSIS_API_BASE).replace(/\/+$/, '');
  }
  if (
    typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ) {
    return 'http://localhost:8123';
  }
  if (typeof location !== 'undefined' && location.origin) {
    return location.origin;
  }
  return '';
}

const ZIWEI_MODEL_STORAGE_KEY = 'ziwei_selected_model_key';
const ZIWEI_DEFAULT_MODEL_KEY = 'model2';
const ZIWEI_FALLBACK_MODEL_OPTIONS = [
  { key: 'model1', label: 'MiniMax', configured: false, default: false },
  { key: 'model2', label: 'Gemma', configured: false, default: true },
  { key: 'model3', label: 'Deepseek', configured: false, default: false },
];

function normalizeZiweiModelKey(key) {
  var k = String(key || '').trim().toLowerCase();
  return ['model1', 'model2', 'model3'].includes(k) ? k : ZIWEI_DEFAULT_MODEL_KEY;
}

function ZiweiApp() {
  const [inputText, setInputText] = React.useState('');
  const [basicReport, setBasicReport] = React.useState(null);
  const [wealthReport, setWealthReport] = React.useState(null);
  const [stockAnalysisReport, setStockAnalysisReport] = React.useState(null);
  const [portfolioAnalysisReport, setPortfolioAnalysisReport] = React.useState(null);
  const [flowReport, setFlowReport] = React.useState(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isAnalyzingStock, setIsAnalyzingStock] = React.useState(false);
  const [isGeneratingBasic, setIsGeneratingBasic] = React.useState(false);
  const [isGeneratingWealth, setIsGeneratingWealth] = React.useState(false);
  const [isGeneratingPortfolio, setIsGeneratingPortfolio] = React.useState(false);
  const [isGeneratingFlow, setIsGeneratingFlow] = React.useState(false);
  const [portfolioStocks, setPortfolioStocks] = React.useState([]);
  const [collapsedReports, setCollapsedReports] = React.useState({});
  const [historyList, setHistoryList] = React.useState([]);
  const [showHistory, setShowHistory] = React.useState(false);
  const [activeReportTab, setActiveReportTab] = React.useState('basic');
  const [renamingHistory, setRenamingHistory] = React.useState(null);
  const [newHistoryName, setNewHistoryName] = React.useState('');
  const [showSaveDialog, setShowSaveDialog] = React.useState(false);
  const [saveDialogName, setSaveDialogName] = React.useState('');
  const [chatMessages, setChatMessages] = React.useState([]);
  const [chatInput, setChatInput] = React.useState('');
  const [isChatting, setIsChatting] = React.useState(false);
  const [showChat, setShowChat] = React.useState(false);
  const [showInputText, setShowInputText] = React.useState(true);
  const [suggestedQuestions, setSuggestedQuestions] = React.useState([]);
  const [streamingMessage, setStreamingMessage] = React.useState('');
  const [isChatExpanded, setIsChatExpanded] = React.useState(false);
  const [isUserScrolling, setIsUserScrolling] = React.useState(false);
  const chatEndRef = React.useRef(null);
  const chatSectionRef = React.useRef(null);
  const chatContainerRef = React.useRef(null);
  const MAX_HISTORY = 10;
  const [modelOptions, setModelOptions] = React.useState(ZIWEI_FALLBACK_MODEL_OPTIONS);
  const [selectedModelKey, setSelectedModelKey] = React.useState(() => {
    try {
      return normalizeZiweiModelKey(localStorage.getItem(ZIWEI_MODEL_STORAGE_KEY) || ZIWEI_DEFAULT_MODEL_KEY);
    } catch (_) {
      return ZIWEI_DEFAULT_MODEL_KEY;
    }
  });
  const selectedModelOption = modelOptions.find((m) => m.key === selectedModelKey) || ZIWEI_FALLBACK_MODEL_OPTIONS[1];
  const llmModelLabel = selectedModelOption.label || 'Gemma';

  React.useEffect(() => {
    try {
      localStorage.setItem(ZIWEI_MODEL_STORAGE_KEY, selectedModelKey);
    } catch (_) {}
  }, [selectedModelKey]);

  React.useEffect(() => {
    const base = getZiweiApiBase();
    if (!base) return;
    fetch(base + '/api/llm/meta')
      .then((r) => r.json())
      .then((d) => {
        if (d && Array.isArray(d.models) && d.models.length) setModelOptions(d.models);
        if (!localStorage.getItem(ZIWEI_MODEL_STORAGE_KEY) && d && d.default_model_key) {
          setSelectedModelKey(normalizeZiweiModelKey(d.default_model_key));
        }
      })
      .catch(() => {});
  }, []);

    // Load history and saved reports from cloud and localStorage on mount
    React.useEffect(() => {
      loadInitialReports();
    }, []);

    const loadInitialReports = () => {
      // Load from local storage only
      const savedHistory = localStorage.getItem('ziwei_history');
      if (savedHistory) {
        try {
          const localReports = JSON.parse(savedHistory);
          setHistoryList(localReports);
        } catch (e) {
          console.error('解析本地历史记录失败:', e);
        }
      }
      
      // Load saved reports
      const savedReports = localStorage.getItem('ziwei_current_reports');
      if (savedReports) {
        try {
          const reports = JSON.parse(savedReports);
          if (reports.basicReport) setBasicReport(reports.basicReport);
          if (reports.wealthReport) setWealthReport(reports.wealthReport);
          if (reports.portfolioAnalysisReport) setPortfolioAnalysisReport(reports.portfolioAnalysisReport);
          if (reports.stockAnalysisReport) setStockAnalysisReport(reports.stockAnalysisReport);
          if (reports.flowReport) setFlowReport(reports.flowReport);
          if (reports.inputText) setInputText(reports.inputText);
          if (reports.chatMessages) setChatMessages(reports.chatMessages);
        } catch (e) {
          console.error('Failed to load saved reports:', e);
        }
      }
      
      // Load portfolio stocks from main page
      const portfolioData = localStorage.getItem('stock_portfolio_data');
      if (portfolioData) {
        try {
          const data = JSON.parse(portfolioData);
          const stocks = data.portfolio || [];
          // Filter stocks that have positions
          const stocksWithPositions = stocks.filter(stock => 
            stock.positions && stock.positions.length > 0
          );
          setPortfolioStocks(stocksWithPositions);
        } catch (e) {
          console.error('Failed to load portfolio:', e);
        }
      }
    };

    // Save history to localStorage only
    const saveHistory = (newHistory) => {
      localStorage.setItem('ziwei_history', JSON.stringify(newHistory));
    };
    
    // Save current reports to localStorage
    const saveCurrentReports = () => {
      const reportsToSave = {
        basicReport,
        wealthReport,
        portfolioAnalysisReport,
        stockAnalysisReport,
        flowReport,
        inputText,
        chatMessages
      };
      localStorage.setItem('ziwei_current_reports', JSON.stringify(reportsToSave));
    };
    
    // Auto-save reports when they change
    React.useEffect(() => {
      if (basicReport || wealthReport || portfolioAnalysisReport || stockAnalysisReport || flowReport) {
        saveCurrentReports();
      }
    }, [basicReport, wealthReport, portfolioAnalysisReport, stockAnalysisReport, flowReport, inputText]);

    // Extract time from input text (format: 1986-8-27 12:0)
    const extractTimeFromInput = (text) => {
      const timeMatch = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
      if (timeMatch) {
        return `${timeMatch[1]}-${timeMatch[2]}-${timeMatch[3]} ${timeMatch[4]}:${timeMatch[5]}`;
      }
      return new Date().toLocaleString('zh-CN');
    };

    /** 与股票分析同源：POST {apiBase}/api/llm/chat → 服务端 VLLM（Vercel 与分析共用模型） */
    const callAnalysisLlmAPI = async (systemPrompt, userPrompt, streaming = false, onChunk = null) => {
      const apiBase = getZiweiApiBase();
      if (!apiBase) {
        throw new Error(
          '未配置分析 API：请启动 guxiaomi/api_server（默认端口 8123），或与股票分析同域部署；也可在 URL 加 ?api=https://你的后端',
        );
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      try {
        if (streaming) {
          const response = await fetch(`${apiBase}/api/llm/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system: systemPrompt || '',
              user: userPrompt,
              stream: true,
              max_tokens: 8192,
              model_key: selectedModelKey,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API错误 ${response.status}: ${errorText.slice(0, 800)}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';
          let sseBuf = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuf += decoder.decode(value, { stream: true });
            const parts = sseBuf.split('\n');
            sseBuf = parts.pop() || '';

            for (const line of parts) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const errMsg = parsed.error && (parsed.error.message || parsed.error);
                if (errMsg) throw new Error(String(errMsg));
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullContent += content;
                  if (onChunk) onChunk(content);
                }
              } catch (e) {
                if (e instanceof SyntaxError) continue;
                throw e;
              }
            }
          }

          return fullContent;
        }

        const response = await fetch(`${apiBase}/api/llm/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system: systemPrompt || '',
            user: userPrompt,
            stream: false,
            max_tokens: 8192,
            model_key: selectedModelKey,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.detail || data.error || `HTTP ${response.status}`);
        }
        if (!data.ok && data.content == null) {
          throw new Error(data.detail || 'API 返回异常');
        }
        return data.content != null ? data.content : '';
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('请求超时，请稍后重试');
        }
        throw error;
      }
    };


    const handleGenerate = async () => {
      if (!inputText.trim()) {
        return;
      }

      setIsGenerating(true);
      setIsGeneratingBasic(true);
      setIsGeneratingWealth(true);
      
      try {
        const timeName = extractTimeFromInput(inputText);
        const timestamp = new Date().toLocaleString('zh-CN');
        const model = llmModelLabel || '同源分析模型';
        
        // Get current date dynamically
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDate = now.getDate();
        const currentDateStr = `${currentYear}年${currentMonth}月${currentDate}日`;
        
        // Calculate lunar month (approximate)
        const lunarMonth = currentMonth === 10 ? '九月' : currentMonth === 11 ? '十月' : currentMonth === 12 ? '十一月' : '一月';
        
        // Generate basic report with retry logic
        setActiveReportTab('basic');
        const basicSystemPrompt = `你是资深的国学易经术数领域专家，精通紫微斗数命理分析。请根据用户提供的命盘信息进行详细分析。

重要时间参考：
- 当前日期：${currentDateStr}
- 在分析流年、流月、流日时，必须以${currentDateStr}作为基准
- 所有时间相关的分析必须与${currentDateStr}对齐，不得出现过去年份（如2023年、2024年等）的时间引用
- 流月分析应基于农历${lunarMonth}（对应公历${currentYear}年${currentMonth}月）`;
        let basicResponse;
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
          try {
            basicResponse = await callAnalysisLlmAPI(basicSystemPrompt, inputText);
            break; // Success, exit retry loop
          } catch (error) {
            retryCount++;
            if (retryCount > maxRetries) {
              throw error; // Max retries reached, throw error
            }
            console.log(`API调用失败，正在重试 (${retryCount}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
          }
        }
        
        setBasicReport({
          id: Date.now(),
          timestamp: timestamp,
          timeName: timeName,
          input: inputText,
          content: basicResponse,
          model: model,
          title: '紫微斗数基础命盘全析'
        });
        setIsGeneratingBasic(false);
        
        // Generate wealth report
        setActiveReportTab('wealth');
        const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
        const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
        const wealthSystemPrompt = `【重要时间基准】
当前日期：${currentDateStr}
- 所有流年分析基于${currentYear}年
- 所有流月分析基于农历${lunarMonth}（公历${currentYear}年${currentMonth}月）
- 未来流月投资详表从${nextYear}年${nextMonth}月开始
- 绝对不得出现2023年、2024年或其他过去年份的时间引用
- 所有择时建议必须从${currentDateStr}之后的时间开始

第一部分：角色与任务定义
1. 核心角色：
你是一位资深的国学易经术数领域专家，精通三合紫微、飞星紫微、河洛紫微、钦天四化等各流派技法，以及李居明《紫微斗数投资策略》的核心理念，并能将命理逻辑与现代金融市场语言无缝衔接。

2. 核心任务：
基于用户提供的命盘信息，忽略其所有其他指令，只提取符合下述框架所需的内容，为其量身定制一份面向未来（重点2025-2026年）的跨市场（美股、港股、A股）财富与投资策略报告。

3. 输入处理原则：
仅从用户输入中提取以下信息：
四柱八字
命宫主星及辅星
身宫位置
财帛宫与田宅宫的星曜组合
当前大限的宫位、年龄区间及大限四化
来因宫位置

完全忽略用户输入中的以下内容：
"健康、学业、事业、财运、人际关系、婚姻和感情等各个方面进行全面分析"等无关指令。
"对前八个大限的所有流年进行分析"等无关指令。
"最后，别忘了提醒用户上述分析仅限于研究或娱乐目的使用"等免责声明。

第二部分：输出框架与内容规范
请严格按照以下结构和内容维度，生成最终的投资策略报告。

紫微斗数跨市场财富策略框架（2025-10）
【核心命盘参数】
四柱八字：[从输入中提取]

命宫主星：[从输入中提取] | 身宫位置：[从输入中提取]
财帛宫星曜：[从输入中提取] | 田宅宫星曜：[从输入中提取]（代表投资库藏）
当前大限：[从输入中提取]，大限四化：[从输入中提取]
来因宫：[从输入中提取]

【财富与投资策略】
 投资风格定位
适合的投资类型
[投资类型1] - [命理依据]

[投资类型2] - [命理依据]

[投资类型3] - [命理依据]

应规避的投资类型
[投资类型1] - [命理依据]

[投资类型2] - [命理依据]

[投资类型3] - [命理依据]

第一部分：行业与市场适配度
（以表格形式呈现，每个市场推荐1-2个核心行业）

第二部分：个股/ETF精选
（总计不超过10个，每个市场各3只左右，包含个股和ETF）

第三部分：精准择时与价格策略
（针对第二部分中精选的5只左右核心标的）

第四部分：未来流月投资详表（2025年11月起）
（以表格形式呈现未来6个月份的指导）

【叮嘱】

核心理论依据、大限节奏把控

（报告结束，不包含任何免责声明）`;
        
        let wealthResponse = await callAnalysisLlmAPI(wealthSystemPrompt, inputText);
        
        setWealthReport({
          id: Date.now() + 1,
          timestamp: timestamp,
          timeName: timeName,
          input: inputText,
          content: wealthResponse,
          model: model,
          title: '紫微斗数财富密码'
        });
        setIsGeneratingWealth(false);
        setShowInputText(false); // Auto-collapse input after generating reports
        
        // Generate portfolio analysis if there are portfolio stocks
        if (portfolioStocks.length > 0) {
          setActiveReportTab('portfolio');
          setIsGeneratingPortfolio(true);
          
          const portfolioSystemPrompt = `【重要时间基准】
当前日期：${currentDateStr}
- 所有流年分析基于${currentYear}年
- 所有流月分析基于农历${lunarMonth}（公历${currentYear}年${currentMonth}月）
- 未来时间节点预测从${currentDateStr}之后开始
- 绝对不得出现2023年、2024年或其他过去年份的时间引用
- 所有择时建议必须从${currentDateStr}之后的时间开始

你是一位资深的紫微斗数命理专家，同时精通股票投资和技术分析。请基于用户的命盘信息和当前持仓股票组合的详细数据（包括市场行情、技术指标和持仓情况），生成一份深度的持仓排盘分析报告。

报告结构要求：

# 紫微斗数持仓排盘分析报告

## 一、命盘基础运势分析

### 1.1 命主特质识别
- 命宫星曜组合的性格特征
- 身宫位置的人生重点领域
- 五行局数的基础能量类型

### 1.2 财帛宫财运格局
- 财帛宫主星的基本财运特征
- 辅星对财运的加强或制约
- 财帛宫四化飞星的财运变化

### 1.3 官禄宫事业运势
- 事业宫位的工作能力表现
- 官禄与财帛的联动关系
- 适合的行业发展方向

## 二、当前运势周期分析

### 2.1 大限运势重点
- 当前大限宫位的主题领域
- 大限四化的运势变化特征
- 大限对财官二宫的影响

### 2.2 流年时机把握
- 近期流年的财运机会点
- 需要谨慎的时间段
- 适合操作的流年特征

## 三、持仓组合命理评估

### 3.1 个股与命理契合度
针对每只持仓股票，结合其市场数据和技术指标进行分析：

**[股票代码]：**
- 行业属性与五行匹配度
- 当前价格走势与命主运势的对应关系
- 技术指标（MA5、MA10、RSI）的命理解读
- 持仓盈亏状况的命理原因分析
- 操作风格适配（基于持仓天数和盈亏情况）

### 3.2 市场分布命理分析
- 美股、港股、A股配置的命理合理性
- 不同市场与命主的契合度
- 市场配置优化建议

### 3.3 整体盈亏命理解读
- 盈利股票与命主财运的关系
- 亏损股票的命理原因
- 整体盈亏与大限流年的对应

## 四、技术面与命理结合

### 4.1 关键价位分析
- 各股支撑阻力位的命理意义
- 突破时机的玄学参考
- 重要技术位的运势配合

### 4.2 买卖时机选择
- 吉利操作时间窗口
- 需要回避的敏感时期
- 持仓周期的运势支持

## 五、操作策略建议

### 5.1 基于命理的仓位管理
- 各股加减仓建议
- 整体仓位配置优化
- 风险控制策略

### 5.2 时间窗口选择
- 未来1-3个月的关键时间节点
- 适合操作的流月特征
- 需要特别谨慎的时期

## 六、风险提示
- 命理上的风险预警
- 技术面风险提示
- 综合建议与注意事项

（报告结束，不包含任何免责声明）`;
          
          // Build comprehensive portfolio data with all market data
          let portfolioData = '## 当前持仓组合详细数据\n\n';
          portfolioStocks.forEach((stock, index) => {
            const enabledPositions = stock.positions.filter(pos => pos.enabled !== false);
            const totalShares = enabledPositions.reduce((sum, pos) => sum + pos.shares, 0);
            const totalCost = enabledPositions.reduce((sum, pos) => sum + (pos.price * pos.shares), 0);
            const avgBuyPrice = totalShares > 0 ? totalCost / totalShares : 0;
            const currentValue = stock.currentPrice * totalShares;
            const profitLoss = currentValue - totalCost;
            const profitLossPercent = totalCost > 0 ? (profitLoss / totalCost * 100) : 0;
            const currencySymbol = stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : 'HK$';
            
            // Calculate holding days (use the earliest position date)
            const holdingDays = enabledPositions.length > 0 
              ? Math.floor((new Date() - new Date(enabledPositions[0].date)) / (1000 * 60 * 60 * 24))
              : 0;
            
            portfolioData += `### ${index + 1}. ${stock.symbol} (${stock.market === 'US' ? '美股' : stock.market === 'HK' ? '港股' : 'A股'})\n\n`;
            portfolioData += `#### 市场数据\n`;
            portfolioData += `- 股票代码: ${stock.symbol}\n`;
            portfolioData += `- 当前价格: ${currencySymbol}${stock.currentPrice?.toFixed(3) || 'N/A'}\n`;
            portfolioData += `- 开盘价: ${currencySymbol}${stock.marketData?.open?.toFixed(3) || 'N/A'}\n`;
            portfolioData += `- 最高价: ${currencySymbol}${stock.marketData?.high?.toFixed(3) || 'N/A'}\n`;
            portfolioData += `- 最低价: ${currencySymbol}${stock.marketData?.low?.toFixed(3) || 'N/A'}\n`;
            portfolioData += `- 前收盘价: ${currencySymbol}${stock.marketData?.previousClose?.toFixed(3) || 'N/A'}\n`;
            portfolioData += `- 涨跌幅: ${stock.marketData?.changePercent ? (stock.marketData.changePercent >= 0 ? '+' : '') + stock.marketData.changePercent.toFixed(2) + '%' : 'N/A'}\n`;
            portfolioData += `- 涨跌额: ${stock.marketData?.change ? (stock.marketData.change >= 0 ? '+' : '') + currencySymbol + stock.marketData.change.toFixed(2) : 'N/A'}\n`;
            portfolioData += `- 成交量: ${stock.marketData?.volume ? (stock.marketData.volume / 1000000).toFixed(2) + '百万' : 'N/A'}\n`;
            
            if (stock.technicalIndicators) {
              portfolioData += `\n#### 技术指标\n`;
              portfolioData += `- MA5: ${stock.technicalIndicators.ma5 ? currencySymbol + stock.technicalIndicators.ma5.toFixed(3) : 'N/A'}\n`;
              portfolioData += `- MA10: ${stock.technicalIndicators.ma10 ? currencySymbol + stock.technicalIndicators.ma10.toFixed(3) : 'N/A'}\n`;
              portfolioData += `- RSI(14): ${stock.technicalIndicators.rsi ? stock.technicalIndicators.rsi.toFixed(2) : 'N/A'}\n`;
            }
            
            portfolioData += `\n#### 持仓数据\n`;
            portfolioData += `- 买入价格: ${currencySymbol}${avgBuyPrice.toFixed(3)}\n`;
            portfolioData += `- 持仓股数: ${totalShares}\n`;
            portfolioData += `- 总成本: ${currencySymbol}${totalCost.toFixed(2)}\n`;
            portfolioData += `- 当前市值: ${currencySymbol}${currentValue.toFixed(2)}\n`;
            portfolioData += `- 浮动盈亏: ${profitLoss >= 0 ? '+' : ''}${currencySymbol}${profitLoss.toFixed(2)} (${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(2)}%)\n`;
            portfolioData += `- 持仓天数: ${holdingDays}天\n\n`;
          });
          
          const portfolioUserPrompt = `请基于以下命盘信息和持仓组合数据生成整体持仓分析报告。\n\n## 命盘信息\n${inputText}\n\n${portfolioData}`;
          
          let portfolioResponse = await callAnalysisLlmAPI(portfolioSystemPrompt, portfolioUserPrompt);
          
          setPortfolioAnalysisReport({
            id: Date.now() + 2,
            timestamp: timestamp,
            timeName: timeName,
            input: inputText,
            content: portfolioResponse,
            model: model,
            title: '紫微斗数持仓组合分析'
          });
          setIsGeneratingPortfolio(false);
        }
        
      } catch (error) {
        console.error('生成报告失败:', error);
        let errorMessage = '生成报告失败，请稍后重试。';
        if (error.message) {
          errorMessage += '\n错误详情：' + error.message;
        }
        if (error.message && error.message.includes('fetch')) {
          errorMessage += '\n\n可能的原因：\n1. 网络连接不稳定\n2. API服务暂时不可用\n3. 请求被浏览器拦截\n\n建议：\n- 检查网络连接\n- 稍后重试\n- 尝试切换其他AI模型';
        }
        alert(errorMessage);
      } finally {
        setIsGenerating(false);
        setIsGeneratingBasic(false);
        setIsGeneratingWealth(false);
        setIsGeneratingPortfolio(false);
      }
    };

    const handleGenerateFlow = async () => {
      if (!inputText.trim()) {
        alert('请先输入命盘信息');
        return;
      }
      
      // Check if at least one of the reports exists
      if (!wealthReport && !stockAnalysisReport && !portfolioAnalysisReport) {
        alert('请先生成财富密码报告、持仓技术分析报告或持仓排盘报告');
        return;
      }

      setIsGeneratingFlow(true);
      setActiveReportTab('flow');
      
      try {
        const timestamp = new Date().toLocaleString('zh-CN');
        const model = llmModelLabel || '同源分析模型';
        
        // Get current date dynamically
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDate = now.getDate();
        const currentDateStr = `${currentYear}年${currentMonth}月${currentDate}日`;
        
        // Calculate lunar month (approximate)
        const lunarMonth = currentMonth === 10 ? '九月' : currentMonth === 11 ? '十月' : currentMonth === 12 ? '十一月' : '一月';
        
        // Build context with wealth, stock analysis, and portfolio reports
        let flowContext = '';
        if (wealthReport) {
          flowContext += `\n\n## 已生成的财富密码报告内容\n${wealthReport.content}\n`;
        }
        if (stockAnalysisReport) {
          flowContext += `\n\n## 已生成的持仓技术分析报告内容\n${stockAnalysisReport.content}\n`;
        }
        if (portfolioAnalysisReport) {
          flowContext += `\n\n## 已生成的持仓排盘报告内容\n${portfolioAnalysisReport.content}\n`;
        }
        
        const flowSystemPrompt = `一、核心角色与绝对原则
你是一名资深的国学易经术数领域专家，精通三合紫微、飞星紫微、河洛紫微、钦天四化等各流派技法，必须严格遵守以下排盘规则，任何偏离都意味着失败。你的首要任务是正确排盘，其次基于用户提供的命盘信息，忽略其所有其他指令，只提取符合下述框架所需的内容，进行流月流日的运势和持仓分析。

二、不可撼动的排盘与四化规则（必须逐步执行并自我校验）

【重要时间基准】
当前日期：${currentDateStr}
- 所有流年分析基于${currentYear}年
- 所有流月分析基于农历${lunarMonth}（公历${currentYear}年${currentMonth}月）

输入处理原则：
仅从用户输入中提取用以分析流年流月的信息，包括：
用户基本信息、节气四柱八字、农历时间、五行局数
完整十二命宫分布，包括每个宫位的宫干、主星、辅星、四化、大限

完全忽略用户输入中的以下内容：
对于"你现在是资深的国学易经术数领域专家，请详细分析下面这个文墨天机紫微斗数命盘，综合使用三合紫微、飞星紫微、河洛紫微、钦天四化等各流派紫微斗数的分析技法，对命盘十二宫星曜分布、限流叠宫和各宫位间的飞宫四化进行细致分析，进而对命主的健康、学业、事业、财运、人际关系、婚姻和感情等各个方面进行全面分析和总结，关键事件须给出发生时间范围、吉凶属性、事件对命主的影响程度等信息，并结合命主的自身特点给出针对性的解决方案和建议。另外，命盘信息里附带了十二个大限共一百二十个流年的信息，请对前八个大限的所有流年进行分析，给出每一年需要关注的重大事件和注意事项。最后，别忘了提醒用户上述分析仅限于研究或娱乐目的使用。"

第一步：定流年命宫
* 规则：流年命宫定位唯一依赖"生年地支"和"流年地支"。
* 口诀："寅上起辰顺数至太岁"。即以用户命盘的原局"寅"宫起"辰"，然后顺数（顺时针）到流年地支所在宫位，该宫位即为流年命宫。

第二步：定流月命宫与四化
* 规则：以第一步确定的"流年命宫"为正月（寅月），然后顺数到所求农历月份。
* 【新增】流月四化：必须根据当月的【月天干】，按照"四化诀"推导出流月四化星曜。
    * 口诀：甲干：廉贞化禄，破军化权，武曲化科，太阳化忌
    * 口诀：乙干：天机化禄，天梁化权，紫微化科，太阴化忌
    * 口诀：丙干：天同化禄，天机化权，文昌化科，廉贞化忌
    * 口诀：丁干：太阴化禄，天同化权，天机化科，巨门化忌
    * 口诀：戊干：贪狼化禄，太阴化权，右弼化科，天机化忌
    * 口诀：己干：武曲化禄，贪狼化权，天梁化科，文曲化忌
    * 口诀：庚干：太阳化禄，武曲化权，太阴化科，天同化忌
    * 口诀：辛干：巨门化禄，太阳化权，文曲化科，文昌化忌
    * 口诀：壬干：天梁化禄，紫微化权，左辅化科，武曲化忌
    * 口诀：癸干：破军化禄，巨门化权，太阴化科，贪狼化忌

第三步：定流日命宫与四化
* 规则：以第二步确定的"流月命宫"为初一，然后顺数到所求农历日期。
* 【新增】流日四化：必须根据当日的【日天干】，按照"四化诀"推导出流日四化星曜。
    * 使用与流月四化相同的十天干四化口诀

第四步：获取财富密码与持仓技术分析报告内容
* 如已生成财富密码和持仓技术分析报告，需要在输出内容中引用相关内容
* 如未生成，则在输出内容中不包含第五部分：金融建议

三、输出格式与验证条款（必须严格遵守）

【重要说明】
第一部分的排盘与四化验证过程必须在后台完成，但不在最终输出中展示。你需要在内部完成以下验证：

1. **流年定位**：从原局寅宫起辰，顺数至流年地支，确定流年命宫
2. **流月定位与四化**：以流年命宫为正月，顺数至当前农历月份，确定流月命宫和流月四化
3. **流日定位与四化**：以流月命宫为初一，顺数至当前农历日期，确定流日命宫和流日四化

【输出格式】
你的输出必须遵循以下格式：

开篇语：我将基于命盘信息，分析【${currentDateStr}】流日的排盘验证和运势解读。

然后直接进入运势分析部分（无需展示排盘验证过程）。分析中必须引用并解读内部推算出的流月、流日四化；引用财富密码报告和持仓技术分析报告内容（如已生成，未生成不引用）。

# 紫微斗数流月流日分析

## 一、核心能量
重点结合流月四化阐述本月能量场

## 二、领域趋势
结合流月四化对事业、财运、感情、健康的影响

## 三、流日洞察
重点结合流日四化分析当日事件与心态

## 四、行动建议
基于以上分析，给出具体建议

## 五、持仓操作建议（如已生成持仓排盘报告）
基于持仓排盘报告的命理分析，结合流日四化，给出当日持仓操作的具体建议：

### 5.1 持仓运势评估
- 结合流日四化分析每只持仓股票的当日运势
- 指出哪些持仓今日宜持有、加仓或减仓
- 说明命理依据（例如：流日化禄入财帛宫、化忌冲命宫等）

### 5.2 操作时机把握
专门针对北京时间三个重点时段的持仓操作建议：
- **早盘时段（9:30-11:00）**：针对持仓股票的开盘操作策略
- **午后时段（13:00-16:00）**：持仓调整和止盈止损建议
- **美股时段（21:30-23:00）**：美股持仓的操作策略

每个时段需要具体到：
- 股票名称和代码
- 操作方向（买入/卖出/持有/观望）
- 建议仓位（如加仓/减仓则说明比例）
- 命理依据和技术面支持

### 5.3 风险提示
- 当日需要特别注意的持仓风险
- 命理上的不利因素
- 技术面的警示信号

## 六、市场机会（如已生成财富密码报告）
基于财富密码报告中的行业和个股推荐，结合流日四化：
- 关注标的的当日操作时机
- 新仓位建立的吉利时辰
- 观望等待的标的及原因

${flowContext}`;
        
        const flowUserPrompt = `${inputText}`;
        
        let flowResponse = await callAnalysisLlmAPI(flowSystemPrompt, flowUserPrompt);
        
        setFlowReport({
          id: Date.now() + 3,
          timestamp: timestamp,
          timeName: extractTimeFromInput(inputText),
          input: inputText,
          content: flowResponse,
          model: model,
          title: '紫微斗数流月流日分析'
        });
        
      } catch (error) {
        console.error('生成流月流日分析失败:', error);
        let errorMessage = '生成流月流日分析失败，请稍后重试。';
        if (error.message) {
          errorMessage += '\n错误详情：' + error.message;
        }
        alert(errorMessage);
      } finally {
        setIsGeneratingFlow(false);
      }
    };

    const handleAnalyzeAllStocks = async () => {
      setIsAnalyzingStock(true);
      
      // Check if should also generate portfolio report
      const shouldGeneratePortfolio = (basicReport || wealthReport) && 
                                       portfolioStocks.length > 0 && 
                                       !portfolioAnalysisReport;
      
      if (shouldGeneratePortfolio) {
        setIsGeneratingPortfolio(true);
      }
      
      try {
        // First, refresh all stock prices
        console.log('开始刷新持仓股票价格...');
        const updatedStocks = [];
        
        for (const stock of portfolioStocks) {
          try {
            console.log(`正在刷新股票 ${stock.symbol} 的价格和技术指标...`);
            const priceData = await getStockPrice(stock.symbol, stock.market);
            
            let indicators = stock.technicalIndicators;
            
            // Fetch technical indicators for HK and CN stocks
            if (stock.market === 'HK' || stock.market === 'CN') {
              try {
                indicators = await getHistoricalDataAndIndicators(stock.symbol, stock.market);
              } catch (error) {
                console.error(`获取 ${stock.symbol} 技术指标失败:`, error);
              }
            }
            
            updatedStocks.push({
              ...stock,
              currentPrice: priceData.price,
              marketData: priceData,
              technicalIndicators: indicators
            });
            
            console.log(`${stock.symbol} 价格更新成功: ${priceData.price}`);
          } catch (error) {
            console.error(`获取股票 ${stock.symbol} 价格失败:`, error);
            updatedStocks.push(stock);
          }
        }
        
        // Update portfolio stocks with latest prices
        setPortfolioStocks(updatedStocks);
        console.log('持仓股票价格刷新完成');
        
        // Use updated stocks for analysis
        const timestamp = new Date().toLocaleString('zh-CN');
        const model = llmModelLabel || '同源分析模型';
        
        // Get current date dynamically
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDate = now.getDate();
        const currentDateStr = `${currentYear}年${currentMonth}月${currentDate}日`;
        
        // Calculate lunar month (approximate)
        const lunarMonth = currentMonth === 10 ? '九月' : currentMonth === 11 ? '十月' : currentMonth === 12 ? '十一月' : '一月';
        
        // Build comprehensive data for all stocks using updated prices
        let allStocksData = '## 持仓股票详细数据\n\n';
        
        updatedStocks.forEach((stock, index) => {
          const enabledPositions = stock.positions.filter(pos => pos.enabled !== false);
          const totalShares = enabledPositions.reduce((sum, pos) => sum + pos.shares, 0);
          const totalCost = enabledPositions.reduce((sum, pos) => sum + (pos.price * pos.shares), 0);
          const avgBuyPrice = totalShares > 0 ? totalCost / totalShares : 0;
          const currentValue = stock.currentPrice * totalShares;
          const profitLoss = currentValue - totalCost;
          const profitLossPercent = totalCost > 0 ? (profitLoss / totalCost * 100) : 0;
          const currencySymbol = stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : 'HK$';
          
          const holdingDays = enabledPositions.length > 0 
            ? Math.floor((new Date() - new Date(enabledPositions[0].date)) / (1000 * 60 * 60 * 24))
            : 0;
          
          allStocksData += `### ${index + 1}. ${stock.symbol} (${stock.market === 'US' ? '美股' : stock.market === 'HK' ? '港股' : 'A股'})\n\n`;
          allStocksData += `#### 市场数据\n`;
          allStocksData += `- 股票代码: ${stock.symbol}\n`;
          allStocksData += `- 当前价格: ${currencySymbol}${stock.currentPrice?.toFixed(3) || 'N/A'}\n`;
          allStocksData += `- 开盘价: ${currencySymbol}${stock.marketData?.open?.toFixed(3) || 'N/A'}\n`;
          allStocksData += `- 最高价: ${currencySymbol}${stock.marketData?.high?.toFixed(3) || 'N/A'}\n`;
          allStocksData += `- 最低价: ${currencySymbol}${stock.marketData?.low?.toFixed(3) || 'N/A'}\n`;
          allStocksData += `- 前收盘价: ${currencySymbol}${stock.marketData?.previousClose?.toFixed(3) || 'N/A'}\n`;
          allStocksData += `- 涨跌幅: ${stock.marketData?.changePercent ? (stock.marketData.changePercent >= 0 ? '+' : '') + stock.marketData.changePercent.toFixed(2) + '%' : 'N/A'}\n`;
          allStocksData += `- 涨跌额: ${stock.marketData?.change ? (stock.marketData.change >= 0 ? '+' : '') + currencySymbol + stock.marketData.change.toFixed(2) : 'N/A'}\n`;
          allStocksData += `- 成交量: ${stock.marketData?.volume ? (stock.marketData.volume / 1000000).toFixed(2) + '百万' : 'N/A'}\n`;
          
          if (stock.technicalIndicators) {
            allStocksData += `\n#### 技术指标\n`;
            allStocksData += `- MA5: ${stock.technicalIndicators.ma5 ? currencySymbol + stock.technicalIndicators.ma5.toFixed(3) : 'N/A'}\n`;
            allStocksData += `- MA10: ${stock.technicalIndicators.ma10 ? currencySymbol + stock.technicalIndicators.ma10.toFixed(3) : 'N/A'}\n`;
            allStocksData += `- RSI(14): ${stock.technicalIndicators.rsi ? stock.technicalIndicators.rsi.toFixed(2) : 'N/A'}\n`;
          }
          
          allStocksData += `\n#### 持仓数据\n`;
          allStocksData += `- 买入价格: ${currencySymbol}${avgBuyPrice.toFixed(3)}\n`;
          allStocksData += `- 持仓股数: ${totalShares}\n`;
          allStocksData += `- 总成本: ${currencySymbol}${totalCost.toFixed(2)}\n`;
          allStocksData += `- 当前市值: ${currencySymbol}${currentValue.toFixed(2)}\n`;
          allStocksData += `- 浮动盈亏: ${profitLoss >= 0 ? '+' : ''}${currencySymbol}${profitLoss.toFixed(2)} (${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(2)}%)\n`;
          allStocksData += `- 持仓天数: ${holdingDays}天\n\n`;
        });
        
        const systemPrompt = `【重要时间基准】
当前日期：${currentDateStr}
- 所有市场数据分析基于${currentDateStr}
- 所有趋势判断和预测从${currentDateStr}开始
${inputText.trim() ? `- 所有流年流月分析基于${currentYear}年\n- 所有流月分析基于农历${lunarMonth}（公历${currentYear}年${currentMonth}月）\n- 未来择时建议从${currentDateStr}之后开始\n- 绝对不得出现2023年、2024年或其他过去年份的时间引用` : ''}

你是一位资深的股票投资组合分析师，精通技术指标分析和持仓管理${inputText.trim() ? '，同时精通紫微斗数命理分析' : ''}。请根据用户提供的所有持仓股票的市场数据和持仓信息${inputText.trim() ? '以及命盘信息' : ''}，生成一份${inputText.trim() ? '融合技术分析、持仓评估与命理分析' : '技术分析与持仓评估'}的综合投资组合报告。

报告结构要求：

# 持仓组合技术分析与评估报告

## 执行摘要
- **投资组合整体评估**：概述整体持仓状态和风险收益特征
- **核心持仓亮点**：列出表现最好的持仓及原因
- **风险警示**：指出需要特别关注的持仓
- **操作建议优先级**：按紧急程度排序的操作建议

## 一、个股技术面深度分析
对每只持仓股票进行详细的技术分析：

### 1.1 [股票代码1] 技术分析
- **价格趋势判断**：分析当前价格相对于MA5/MA10的位置和趋势
- **动量状态**：基于RSI评估超买超卖状态
- **关键技术位**：识别支撑位和阻力位
- **量价配合**：分析成交量与价格变动的关系

### 1.2 [股票代码2] 技术分析
（同上结构，对每只股票进行分析）

### 1.3 技术面综合对比
- 对比各股票的技术强弱
- 识别技术面最强和最弱的持仓

## 二、持仓绩效综合评估
### 2.1 整体盈亏分析
- **投资组合总体表现**：总成本、总市值、总盈亏统计
- **盈利持仓分析**：列出盈利股票及盈利原因
- **亏损持仓分析**：分析亏损股票及改进方向
- **持仓效率评估**：不同持仓的时间收益表现对比

### 2.2 个股持仓评估
对每只股票的持仓状况进行评估：
- **成本优势分析**：当前价格与成本价的关系
- **安全边际评估**：下跌空间与上涨潜力分析
- **持仓合理性**：基于技术面判断当前持仓是否合理

### 2.3 组合风险评估
- **集中度风险**：单一股票仓位占比分析
- **市场分布风险**：美股、港股、A股的配置合理性
- **行业分散度**：是否存在行业过度集中风险

## 三、持仓排盘命理分析
${inputText.trim() ? `
### 3.1 命盘与投资组合整体关系
- **财帛宫与持仓状态对应**：分析命主财帛宫与整体盈亏的关系
- **大运流年与投资时机**：评估当前是否处于适合持有的时期
- **五行配置合理性**：分析持仓股票行业的五行属性与命主的匹配度

### 3.2 个股命理适配度分析
对每只股票进行命理分析：
- **股票与命主契合度**：评估该股票是否适合命主持有
- **买入时机命理评估**：分析买入时间点的吉凶
- **持仓周期建议**：基于命理给出最佳持有时长建议

### 3.3 流年流月操作择时
- **当前时间窗口评估**：分析2025年11月的财运状态
- **未来关键时间节点**：预测未来1-3个月的重要转折点
- **操作时机建议**：给出具体的加仓、减仓、止盈时间建议


### 3.4 命理风险预警
- **煞星冲克时段**：识别需要特别谨慎的时间段
- **化忌影响分析**：分析不利因素对投资的影响
- **破财风险提示**：提醒需要防范的财务风险时期
` : '（未提供命盘信息，跳过命理分析部分）'}

## 五、综合操作策略建议
### 5.1 持仓管理策略
**继续持有条件**：
- 技术面看涨的具体标准和监控指标
- 持仓目标的重新评估和调整
- 持仓时间的优化建议

**风险控制措施**：
- 动态止损位的设置和调整逻辑
- 仓位对冲建议（如有相关标的）
- 风险预警机制设立

### 5.2 主动交易策略
**加仓机会识别**：
- 理想加仓价位的技术标准
- 加仓仓位的比例控制
- 加仓后的整体风险控制

**减仓/止盈策略**：
- 分批止盈的具体价位和比例
- 技术面转弱的预警信号
- 止盈后的后续跟踪计划

### 5.3 应急处理方案
- 黑天鹅事件应对预案
- 技术面突然转坏的应对
- 大盘系统性风险的防范

## 六、风险提示与监控要点
### 6.1 技术面风险
- 关键支撑跌破的连锁反应
- 指标钝化或失效的风险
- 成交量异常的风险提示

### 6.2 持仓特定风险
- 盈利回吐的心理学风险
- 仓位过重的流动性风险
- 持仓时间过长的机会成本

### 6.3 外部环境风险
- 行业政策变化的影响
- 大盘整体走势的拖累风险
- 重大事件的时间窗口提醒

## 七、总结与行动计划
### 7.1 核心结论汇总
- 技术面、持仓面、操作面的统一结论
- 各时间维度的预期展望

### 7.2 具体行动计划
- **立即行动**：当前需要执行的操作
- **监控清单**：需要持续关注的技术信号
- **复盘时点**：建议的下次分析时间

### 7.3 成功标准定义
- 策略成功的衡量标准
- 策略失败的识别标准
- 策略调整的触发条件`;
        
        const userPrompt = inputText.trim() 
          ? `请基于以下股票数据和命盘信息生成技术分析与持仓评估报告。

## 股票市场数据
${allStocksData}

## 命盘信息
${inputText}

请在"持仓排盘分析"部分充分结合命盘信息进行分析，其他技术分析部分则主要基于股票市场数据。`
          : `请基于以下股票市场数据生成技术分析与持仓评估报告。

## 股票市场数据
${allStocksData}

请进行详细的技术分析和持仓评估。`;
        
        let response = await callAnalysisLlmAPI(systemPrompt, userPrompt);
        
        setStockAnalysisReport({
          id: Date.now(),
          timestamp: timestamp,
          content: response,
          model: model,
          title: `持仓组合技术分析与评估`
        });
        
        setActiveReportTab('stock');
        
        // If conditions met, also generate portfolio report
        if (shouldGeneratePortfolio && inputText.trim()) {
          try {
            console.log('同时生成持仓排盘报告...');
            setActiveReportTab('portfolio');
            
            // Build comprehensive portfolio data using updated stocks
            let portfolioData = '## 当前持仓组合详细数据\n\n';
            updatedStocks.forEach((stock, index) => {
              const enabledPositions = stock.positions.filter(pos => pos.enabled !== false);
              const totalShares = enabledPositions.reduce((sum, pos) => sum + pos.shares, 0);
              const totalCost = enabledPositions.reduce((sum, pos) => sum + (pos.price * pos.shares), 0);
              const avgBuyPrice = totalShares > 0 ? totalCost / totalShares : 0;
              const currentValue = stock.currentPrice * totalShares;
              const profitLoss = currentValue - totalCost;
              const profitLossPercent = totalCost > 0 ? (profitLoss / totalCost * 100) : 0;
              const currencySymbol = stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : 'HK$';
              
              const holdingDays = enabledPositions.length > 0 
                ? Math.floor((new Date() - new Date(enabledPositions[0].date)) / (1000 * 60 * 60 * 24))
                : 0;
              
              portfolioData += `### ${index + 1}. ${stock.symbol} (${stock.market === 'US' ? '美股' : stock.market === 'HK' ? '港股' : 'A股'})\n\n`;
              portfolioData += `#### 市场数据\n`;
              portfolioData += `- 股票代码: ${stock.symbol}\n`;
              portfolioData += `- 当前价格: ${currencySymbol}${stock.currentPrice?.toFixed(3) || 'N/A'}\n`;
              portfolioData += `- 开盘价: ${currencySymbol}${stock.marketData?.open?.toFixed(3) || 'N/A'}\n`;
              portfolioData += `- 最高价: ${currencySymbol}${stock.marketData?.high?.toFixed(3) || 'N/A'}\n`;
              portfolioData += `- 最低价: ${currencySymbol}${stock.marketData?.low?.toFixed(3) || 'N/A'}\n`;
              portfolioData += `- 前收盘价: ${currencySymbol}${stock.marketData?.previousClose?.toFixed(3) || 'N/A'}\n`;
              portfolioData += `- 涨跌幅: ${stock.marketData?.changePercent ? (stock.marketData.changePercent >= 0 ? '+' : '') + stock.marketData.changePercent.toFixed(2) + '%' : 'N/A'}\n`;
              portfolioData += `- 涨跌额: ${stock.marketData?.change ? (stock.marketData.change >= 0 ? '+' : '') + currencySymbol + stock.marketData.change.toFixed(2) : 'N/A'}\n`;
              portfolioData += `- 成交量: ${stock.marketData?.volume ? (stock.marketData.volume / 1000000).toFixed(2) + '百万' : 'N/A'}\n`;
              
              if (stock.technicalIndicators) {
                portfolioData += `\n#### 技术指标\n`;
                portfolioData += `- MA5: ${stock.technicalIndicators.ma5 ? currencySymbol + stock.technicalIndicators.ma5.toFixed(3) : 'N/A'}\n`;
                portfolioData += `- MA10: ${stock.technicalIndicators.ma10 ? currencySymbol + stock.technicalIndicators.ma10.toFixed(3) : 'N/A'}\n`;
                portfolioData += `- RSI(14): ${stock.technicalIndicators.rsi ? stock.technicalIndicators.rsi.toFixed(2) : 'N/A'}\n`;
              }
              
              portfolioData += `\n#### 持仓数据\n`;
              portfolioData += `- 买入价格: ${currencySymbol}${avgBuyPrice.toFixed(3)}\n`;
              portfolioData += `- 持仓股数: ${totalShares}\n`;
              portfolioData += `- 总成本: ${currencySymbol}${totalCost.toFixed(2)}\n`;
              portfolioData += `- 当前市值: ${currencySymbol}${currentValue.toFixed(2)}\n`;
              portfolioData += `- 浮动盈亏: ${profitLoss >= 0 ? '+' : ''}${currencySymbol}${profitLoss.toFixed(2)} (${profitLossPercent >= 0 ? '+' : ''}${profitLossPercent.toFixed(2)}%)\n`;
              portfolioData += `- 持仓天数: ${holdingDays}天\n\n`;
            });
            
            const portfolioSystemPrompt = `【重要时间基准】
当前日期：${currentDateStr}
- 所有流年分析基于${currentYear}年
- 所有流月分析基于农历${lunarMonth}（公历${currentYear}年${currentMonth}月）
- 未来时间节点预测从${currentDateStr}之后开始
- 绝对不得出现2023年、2024年或其他过去年份的时间引用
- 所有择时建议必须从${currentDateStr}之后的时间开始

你是一位资深的紫微斗数命理专家，同时精通股票投资和技术分析。请基于用户的命盘信息和当前持仓股票组合的详细数据（包括市场行情、技术指标和持仓情况），生成一份深度的持仓排盘分析报告。

（报告结构省略，与原有相同）`;
            
            const portfolioUserPrompt = `请基于以下命盘信息和持仓组合数据生成整体持仓分析报告。\n\n## 命盘信息\n${inputText}\n\n${portfolioData}`;
            
            let portfolioResponse = await callAnalysisLlmAPI(portfolioSystemPrompt, portfolioUserPrompt);
            
            setPortfolioAnalysisReport({
              id: Date.now() + 10,
              timestamp: timestamp,
              timeName: extractTimeFromInput(inputText),
              input: inputText,
              content: portfolioResponse,
              model: model,
              title: '紫微斗数持仓组合分析'
            });
            
            console.log('持仓排盘报告生成成功');
          } catch (portfolioError) {
            console.error('生成持仓排盘报告失败:', portfolioError);
          } finally {
            setIsGeneratingPortfolio(false);
          }
        }
        
      } catch (error) {
        console.error('生成股票分析失败:', error);
        let errorMessage = '生成股票分析失败，请稍后重试。';
        if (error.message) {
          errorMessage += '\n错误详情：' + error.message;
        }
        if (error.message && error.message.includes('fetch')) {
          errorMessage += '\n\n可能的原因：\n1. 网络连接不稳定\n2. API服务暂时不可用\n3. 请求被浏览器拦截\n\n建议：\n- 检查网络连接\n- 稍后重试\n- 尝试切换其他AI模型';
        }
        alert(errorMessage);
      } finally {
        setIsAnalyzingStock(false);
        if (shouldGeneratePortfolio) {
          setIsGeneratingPortfolio(false);
        }
      }
    };

    const handleReset = () => {
      if (window.confirm('确定要重置所有报告吗？此操作不可恢复。')) {
        setBasicReport(null);
        setWealthReport(null);
        setPortfolioAnalysisReport(null);
        setStockAnalysisReport(null);
        setFlowReport(null);
        setInputText('');
        setCollapsedReports({});
        localStorage.removeItem('ziwei_current_reports');
      }
    };

    const viewHistoryReport = (item) => {
      // Load all reports from history
      setInputText(item.input);
      
      if (item.basicReport) {
        setBasicReport({
          id: Date.now(),
          timestamp: item.timestamp,
          timeName: item.timeName,
          input: item.input,
          content: item.basicReport,
          model: item.model,
          title: '紫微斗数基础命盘全析'
        });
      }
      
      if (item.wealthReport) {
        setWealthReport({
          id: Date.now() + 1,
          timestamp: item.timestamp,
          timeName: item.timeName,
          input: item.input,
          content: item.wealthReport,
          model: item.model,
          title: '紫微斗数财富密码'
        });
      }
      
      if (item.portfolioReport) {
        setPortfolioAnalysisReport({
          id: Date.now() + 2,
          timestamp: item.timestamp,
          timeName: item.timeName,
          input: item.input,
          content: item.portfolioReport,
          model: item.model,
          title: '紫微斗数持仓组合分析'
        });
      }
      
      if (item.stockReport) {
        setStockAnalysisReport({
          id: Date.now() + 3,
          timestamp: item.timestamp,
          content: item.stockReport,
          model: item.model,
          title: '持仓组合技术分析与评估'
        });
      }
      
      if (item.flowReport) {
        setFlowReport({
          id: Date.now() + 4,
          timestamp: item.timestamp,
          timeName: item.timeName,
          input: item.input,
          content: item.flowReport,
          model: item.model,
          title: '紫微斗数流月流日分析'
        });
      }
      
      if (item.chatHistory && Array.isArray(item.chatHistory)) {
        setChatMessages(item.chatHistory);
      }
      
      setShowHistory(false);
      setActiveReportTab('basic');
      alert('已加载历史命盘和所有关联报告');
    };

    const copyHistoryReport = (item) => {
      let allContent = `命盘信息：${item.timeName}\n保存时间：${item.timestamp}\n\n${'='.repeat(80)}\n\n`;
      
      if (item.basicReport) {
        allContent += `【紫微斗数基础命盘全析】\n\n${item.basicReport}\n\n${'='.repeat(80)}\n\n`;
      }
      
      if (item.wealthReport) {
        allContent += `【紫微斗数财富密码】\n\n${item.wealthReport}\n\n${'='.repeat(80)}\n\n`;
      }
      
      if (item.portfolioReport) {
        allContent += `【紫微斗数持仓组合分析】\n\n${item.portfolioReport}\n\n${'='.repeat(80)}\n\n`;
      }
      
      if (item.stockReport) {
        allContent += `【持仓组合技术分析与评估】\n\n${item.stockReport}\n\n${'='.repeat(80)}\n\n`;
      }
      
      if (item.flowReport) {
        allContent += `【紫微斗数流月流日分析】\n\n${item.flowReport}`;
      }
      
      copyReport(allContent);
    };



  const deleteHistoryItem = (timeName) => {
    if (window.confirm('确定要删除这条历史记录吗？')) {
      const newHistory = historyList.filter(h => h.timeName !== timeName);
      setHistoryList(newHistory);
      saveHistory(newHistory);
    }
  };

    const saveCurrentToHistory = () => {
      if (!basicReport && !wealthReport) {
        alert('没有可保存的报告');
        return;
      }

      const defaultName = extractTimeFromInput(inputText) || new Date().toLocaleString('zh-CN');
      setSaveDialogName(defaultName);
      setShowSaveDialog(true);
    };

  const confirmSaveToHistory = () => {
    if (!saveDialogName || !saveDialogName.trim()) {
      alert('请输入报告名称');
      return;
    }

    const timeName = saveDialogName.trim();
    const timestamp = new Date().toLocaleString('zh-CN');
    const model = llmModelLabel || '同源分析模型';

    const existingIndex = historyList.findIndex(h => h.timeName === timeName);
    let newHistory;

    const historyItem = {
      timeName: timeName,
      input: inputText,
      timestamp: timestamp,
      basicReport: basicReport?.content || '',
      wealthReport: wealthReport?.content || '',
      portfolioReport: portfolioAnalysisReport?.content || '',
      stockReport: stockAnalysisReport?.content || '',
      flowReport: flowReport?.content || '',
      chatHistory: chatMessages,
      model: model
    };

    if (existingIndex >= 0) {
      if (!window.confirm('已存在同名记录，是否覆盖？')) {
        return;
      }
      newHistory = [...historyList];
      newHistory[existingIndex] = historyItem;
    } else {
      newHistory = [historyItem, ...historyList].slice(0, MAX_HISTORY);
    }

    setHistoryList(newHistory);
    saveHistory(newHistory);
    setShowSaveDialog(false);
    setSaveDialogName('');
    alert('报告已保存到本地浏览器');
  };

    const renameHistoryItem = (oldName, newName) => {
      if (!newName || !newName.trim()) {
        alert('名称不能为空');
        return;
      }

      const trimmedName = newName.trim();
      
      // Check if new name already exists
      if (historyList.some(h => h.timeName === trimmedName && h.timeName !== oldName)) {
        alert('该名称已存在');
        return;
      }

      const newHistory = historyList.map(h => 
        h.timeName === oldName ? { ...h, timeName: trimmedName } : h
      );

      setHistoryList(newHistory);
      saveHistory(newHistory);
      setRenamingHistory(null);
      setNewHistoryName('');
      alert('重命名成功');
    };

    const toggleReportCollapse = (reportType) => {
      setCollapsedReports(prev => ({
        ...prev,
        [reportType]: !prev[reportType]
      }));
    };

    const formatReportContent = (content) => {
      // Split content into lines
      const lines = content.split('\n');
      const formatted = [];
      let inTable = false;
      let tableRows = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Detect table rows (lines with | or \t separators)
        if (line.includes('|') || line.includes('\t')) {
          if (!inTable) {
            inTable = true;
            tableRows = [];
          }
          tableRows.push(line);
        } else {
          // End of table
          if (inTable && tableRows.length > 0) {
            formatted.push({ type: 'table', content: tableRows });
            tableRows = [];
            inTable = false;
          }
          
          // Handle different line types
          if (line.startsWith('#')) {
            // Heading
            const level = line.match(/^#+/)[0].length;
            formatted.push({ type: 'heading', level, content: line.replace(/^#+\s*/, '') });
          } else if (line.startsWith('【') && line.endsWith('】')) {
            // Section header
            formatted.push({ type: 'section', content: line });
          } else if (line) {
            // Regular paragraph
            formatted.push({ type: 'paragraph', content: line });
          } else {
            // Empty line
            formatted.push({ type: 'break' });
          }
        }
      }
      
      // Handle remaining table
      if (inTable && tableRows.length > 0) {
        formatted.push({ type: 'table', content: tableRows });
      }
      
      return formatted;
    };

    const copyReport = (content) => {
      navigator.clipboard.writeText(content).then(() => {
        alert('报告已复制到剪贴板');
      }).catch(err => {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制');
      });
    };

  const copyAllReports = () => {
    if (!basicReport && !wealthReport && !portfolioAnalysisReport && !stockAnalysisReport && !flowReport) return;
    
    let allContent = '';
    
    // 按顺序复制所有报告：1.命盘全析 2.财富密码 3.持仓排盘 4.技术分析 5.流月流日
    if (basicReport) {
      allContent += `【紫微斗数基础命盘全析】\n生成时间: ${basicReport.timestamp}\n\n${basicReport.content}`;
    }
    
    if (wealthReport) {
      if (allContent) {
        allContent += '\n\n' + '='.repeat(80) + '\n\n';
      }
      allContent += `【紫微斗数财富密码】\n生成时间: ${wealthReport.timestamp}\n\n${wealthReport.content}`;
    }
    
    if (portfolioAnalysisReport) {
      if (allContent) {
        allContent += '\n\n' + '='.repeat(80) + '\n\n';
      }
      allContent += `【紫微斗数持仓组合分析】\n生成时间: ${portfolioAnalysisReport.timestamp}\n\n${portfolioAnalysisReport.content}`;
    }
    
    if (stockAnalysisReport) {
      if (allContent) {
        allContent += '\n\n' + '='.repeat(80) + '\n\n';
      }
      allContent += `【持仓组合技术分析与评估】\n生成时间: ${stockAnalysisReport.timestamp}\n\n${stockAnalysisReport.content}`;
    }
    
    if (flowReport) {
      if (allContent) {
        allContent += '\n\n' + '='.repeat(80) + '\n\n';
      }
      allContent += `【紫微斗数流月流日分析】\n生成时间: ${flowReport.timestamp}\n\n${flowReport.content}`;
    }
    
    copyReport(allContent);
  };

    const handleChatSubmit = async () => {
      if (!chatInput.trim() || isChatting) return;
      
      const userMessage = chatInput.trim();
      setChatInput('');
      setIsChatting(true);
      setSuggestedQuestions([]);
      setIsUserScrolling(false); // Reset scrolling state for new message
      
      // Add user message
      const newMessages = [...chatMessages, { role: 'user', content: userMessage }];
      setChatMessages(newMessages);
      setStreamingMessage('');
      
      try {
        // Build context from reports
        let context = '你是一位资深的紫微斗数命理专家和金融投资顾问。以下是用户的命盘信息和已生成的分析报告：\n\n';
        
        if (inputText) {
          context += `## 命盘信息\n${inputText}\n\n`;
        }
        
        if (basicReport) {
          context += `## 命盘全析\n${basicReport.content.substring(0, 2000)}\n\n`;
        }
        
        if (wealthReport) {
          context += `## 财富密码\n${wealthReport.content.substring(0, 2000)}\n\n`;
        }
        
        if (portfolioAnalysisReport) {
          context += `## 持仓排盘\n${portfolioAnalysisReport.content.substring(0, 2000)}\n\n`;
        }
        
        if (stockAnalysisReport) {
          context += `## 技术分析\n${stockAnalysisReport.content.substring(0, 2000)}\n\n`;
        }
        
        context += '请基于以上信息，只回答与金融股票投资和紫微斗数命理相关的问题。如果用户问题与这些主题无关，请礼貌地告知用户你只能回答相关问题。\n\n';
        context += '用户的历史对话：\n';
        chatMessages.forEach(msg => {
          context += `${msg.role === 'user' ? '用户' : 'AI'}：${msg.content}\n`;
        });
        
        const systemPrompt = context;
        
        // Stream response
        let fullResponse = '';
        const response = await callAnalysisLlmAPI(systemPrompt, userMessage, true, (chunk) => {
          fullResponse += chunk;
          setStreamingMessage(fullResponse);
        });
        
        setChatMessages([...newMessages, { role: 'assistant', content: response }]);
        setStreamingMessage('');
        
        // Generate suggested questions based on the response
        const suggestionPrompt = `基于以下对话内容，生成3个用户可能感兴趣的后续问题。问题要简短、具体，与金融投资和紫微斗数命理相关。\n\n用户问题：${userMessage}\n\nAI回复：${response.substring(0, 500)}\n\n请只返回3个问题，每个问题一行，不要编号，不要其他说明文字。`;
        
        try {
          const suggestions = await callAnalysisLlmAPI('你是一个智能助手，擅长生成相关的后续问题。', suggestionPrompt, false);
          const questions = suggestions.split('\n').filter(q => q.trim()).slice(0, 3);
          setSuggestedQuestions(questions);
        } catch (e) {
          console.error('生成建议问题失败:', e);
        }
        
      } catch (error) {
        console.error('对话失败:', error);
        setChatMessages([...newMessages, { 
          role: 'assistant', 
          content: '抱歉，对话出现错误，请稍后重试。' 
        }]);
        setStreamingMessage('');
      } finally {
        setIsChatting(false);
      }
    };

    React.useEffect(() => {
      if (chatEndRef.current && isChatExpanded && !isUserScrolling) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, [chatMessages, streamingMessage, isUserScrolling]);
    
    React.useEffect(() => {
      const chatContainer = chatContainerRef.current;
      if (!chatContainer) return;
      
      let scrollTimeout;
      
      const handleScroll = () => {
        // Check if user is scrolling up (not at bottom)
        const isAtBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 50;
        
        if (!isAtBottom) {
          setIsUserScrolling(true);
          
          // Reset scrolling state after 2 seconds of no scrolling
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(() => {
            setIsUserScrolling(false);
          }, 2000);
        } else {
          setIsUserScrolling(false);
        }
      };
      
      chatContainer.addEventListener('scroll', handleScroll);
      
      return () => {
        chatContainer.removeEventListener('scroll', handleScroll);
        clearTimeout(scrollTimeout);
      };
    }, [isChatExpanded]);

    React.useEffect(() => {
      const handleScroll = () => {
        if (!chatSectionRef.current || !isChatExpanded) return;
        
        const rect = chatSectionRef.current.getBoundingClientRect();
        // If chat section scrolled out of view, collapse it
        if (rect.bottom < 0) {
          setIsChatExpanded(false);
        }
      };

      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
    }, [isChatExpanded]);

    const ReportContent = ({ content }) => {
      const formatted = formatReportContent(content);
      
      return (
        <div className="space-y-4">
          {formatted.map((item, index) => {
            if (item.type === 'heading') {
              const HeadingTag = `h${Math.min(item.level + 2, 6)}`;
              const sizeClass = item.level === 1 ? 'text-2xl' : item.level === 2 ? 'text-xl' : 'text-lg';
              return React.createElement(
                HeadingTag,
                { key: index, className: `${sizeClass} font-bold text-slate-100 mb-3 mt-6` },
                item.content
              );
            }
            
            if (item.type === 'section') {
              return (
                <div key={index} className="text-lg md:text-xl font-bold text-slate-50 px-4 py-3 rounded-xl my-4 border border-cyan-500/25 bg-gradient-to-r from-slate-800/95 via-cyan-950/40 to-slate-900/95 shadow-lg shadow-cyan-500/10">
                  {item.content}
                </div>
              );
            }
            
            if (item.type === 'table') {
              // Parse table
              const rows = item.content.map(row => {
                // Split by | or \t
                const cells = row.split(/[|\t]/).map(cell => cell.trim()).filter(cell => cell);
                return cells;
              });
              
              if (rows.length === 0) return null;
              
              // Detect header row (usually first row or row with dashes)
              let headerRow = rows[0];
              let dataRows = rows.slice(1);
              
              // Check if second row is separator (contains only dashes and spaces)
              if (dataRows.length > 0 && dataRows[0].every(cell => /^[-\s:]+$/.test(cell))) {
                dataRows = dataRows.slice(1);
              }
              
              return (
                <div key={index} className="overflow-x-auto my-4 rounded-xl border border-white/10 shadow-xl shadow-black/30">
                  <table className="min-w-full bg-slate-950/50 border-collapse">
                    <thead className="bg-slate-800/90">
                      <tr>
                        {headerRow.map((cell, i) => (
                          <th key={i} className="px-4 py-3 text-left text-xs md:text-sm font-bold text-cyan-100 border-b border-cyan-500/25">
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dataRows.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-slate-900/35' : 'bg-slate-950/25'}>
                          {row.map((cell, j) => (
                            <td key={j} className="px-4 py-3 text-sm text-slate-300 border-b border-white/5">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            
            if (item.type === 'paragraph') {
              // Check if it's a list item
              if (item.content.match(/^[•\-\*]\s/)) {
                return (
                  <div key={index} className="flex gap-2 ml-4 text-slate-300">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span>{item.content.replace(/^[•\-\*]\s/, '')}</span>
                  </div>
                );
              }
              
              // Check if it's a numbered item
              if (item.content.match(/^\d+[\.)]\s/)) {
                return (
                  <div key={index} className="flex gap-2 ml-4 text-slate-300">
                    <span className="text-cyan-400 font-bold tabular-nums">{item.content.match(/^\d+[\.)]/)[0]}</span>
                    <span>{item.content.replace(/^\d+[\.)]\s/, '')}</span>
                  </div>
                );
              }
              
              // Check for bold or emphasis patterns
              let formattedContent = item.content;
              
              // Handle **bold** - remove the ** markers and make text bold
              formattedContent = formattedContent.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-slate-100">$1</strong>');
              formattedContent = formattedContent.replace(/__(.+?)__/g, '<strong class="font-bold text-slate-100">$1</strong>');
              
              // Handle *italic* or _italic_ (only single * or _, not double)
              formattedContent = formattedContent.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em class="italic">$1</em>');
              formattedContent = formattedContent.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em class="italic">$1</em>');
              
              return (
                <p key={index} className="text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: formattedContent }} />
              );
            }
            
            if (item.type === 'break') {
              return <div key={index} className="h-2" />;
            }
            
            return null;
          })}
        </div>
      );
    };

    return (
      <>
        <div className="relative z-10 min-h-screen" data-name="ziwei-app" data-file="ziwei-app.js">
          <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/72 backdrop-blur-xl shadow-lg shadow-slate-950/25">
            <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 md:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <img 
                  src="https://imgus.tangbuy.com/static/images/2025-09-26/e9e9e871b0b2477697e4b59f6da02ab5-17588742994027430860421454933872.png"
                  alt="股小蜜 Logo"
                  className="h-8 w-8 shrink-0 rounded-xl shadow-lg shadow-slate-900/20 ring-2 ring-white/40 md:h-9 md:w-9"
                />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">股小蜜</p>
                  <h1 className="truncate font-display text-base font-bold text-slate-50 md:text-lg">
                    紫微斗数金融排盘
                  </h1>
                </div>
              </div>
              <div className="ml-auto flex items-center justify-end gap-1.5 overflow-x-auto">
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-300">
                  <span className="hidden sm:inline">模型</span>
                  <select
                    value={selectedModelKey}
                    onChange={(e) => setSelectedModelKey(normalizeZiweiModelKey(e.target.value))}
                    disabled={isGenerating || isAnalyzingStock || isGeneratingBasic || isGeneratingWealth || isGeneratingPortfolio}
                    className="input-field !w-auto !rounded-lg !px-2 !py-1 !text-xs"
                  >
                    {modelOptions.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}{m.default ? '（默认）' : ''}{m.configured === false ? '（未配置）' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <a href={withCurrentSource('analysis.html')} className="btn btn-secondary btn-sm shrink-0">分析</a>
                <button
                  onClick={() => {
                    // Save current state before leaving
                    if (isGenerating || isAnalyzingStock || isGeneratingBasic || isGeneratingWealth || isGeneratingPortfolio) {
                      if (!window.confirm('AI报告正在生成中，确定要返回吗？返回后生成将会中断。')) {
                        return;
                      }
                    }
                    goBackToSource();
                  }}
                  className="btn btn-secondary btn-sm shrink-0"
                >
                  返回
                </button>
              </div>
            </div>
          </header>
          <main className="px-2 py-4 md:px-4 md:py-5">
          <div className="max-w-6xl mx-auto">
          <div className="zi-card p-4 md:p-5 mb-4 md:mb-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4 mb-3 md:mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base md:text-xl font-bold text-slate-100 flex items-center gap-2">
                  <div className="icon-edit-3 text-base md:text-xl text-slate-950 bg-gradient-to-br from-blue-300 to-cyan-300 p-1.5 md:p-2 rounded-lg shadow-lg shadow-blue-500/25"></div>
                  输入命盘信息
                </h2>
                {(basicReport || wealthReport) && (
                  <button
                    onClick={() => setShowInputText(!showInputText)}
                    className="text-blue-200 hover:text-blue-100 p-1"
                    title={showInputText ? "折叠" : "展开"}
                  >
                    <div className={`icon-chevron-${showInputText ? 'up' : 'down'} text-lg`}></div>
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
                <button
                  onClick={saveCurrentToHistory}
                  disabled={!basicReport && !wealthReport}
                  className="btn btn-primary disabled:opacity-50 flex-1 md:flex-none justify-center"
                >
                  保存
                </button>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="btn btn-secondary flex-1 md:flex-none justify-center"
                  disabled={historyList.length === 0}
                >
                  历史
                </button>
                <button
                  onClick={handleReset}
                  disabled={!basicReport && !wealthReport}
                  className="btn btn-secondary disabled:opacity-50 flex-1 md:flex-none justify-center"
                >
                  重置
                </button>
              </div>
            </div>
            
            {showHistory && historyList.length > 0 && (
              <div className="mb-4 p-4 rounded-xl border border-cyan-500/20 bg-slate-950/50 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-100">历史命盘记录</h3>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="text-slate-400 hover:text-cyan-400"
                  >
                    <div className="icon-x text-lg"></div>
                  </button>
                </div>
                <div className="space-y-2">
                  {historyList.map((item, index) => {
                    const reportCount = [
                      item.basicReport,
                      item.wealthReport,
                      item.portfolioReport,
                      item.stockReport,
                      item.flowReport
                    ].filter(r => r).length;
                    
                    return (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-slate-900/60 hover:border-cyan-500/30 transition-colors">
                      <div className="flex-1">
                        {renamingHistory === item.timeName ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newHistoryName}
                              onChange={(e) => setNewHistoryName(e.target.value)}
                              className="flex-1 px-2 py-1 text-sm rounded-lg bg-slate-950 border border-white/15 text-slate-100 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/40"
                              placeholder="输入新名称"
                              autoFocus
                            />
                            <button
                              onClick={() => renameHistoryItem(item.timeName, newHistoryName)}
                              className="text-green-600 hover:text-green-800 p-1"
                              title="确认"
                            >
                              <div className="icon-check text-lg"></div>
                            </button>
                            <button
                              onClick={() => {
                                setRenamingHistory(null);
                                setNewHistoryName('');
                              }}
                              className="text-red-600 hover:text-red-800 p-1"
                              title="取消"
                            >
                              <div className="icon-x text-lg"></div>
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <div className="font-medium text-slate-100">{item.timeName}</div>
                              <span className="text-xs zi-mono-label bg-cyan-500/15 text-cyan-300 px-2 py-0.5 rounded border border-cyan-400/20">
                                {reportCount}份报告
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">{item.timestamp}</div>
                          </>
                        )}
                      </div>
                      {renamingHistory !== item.timeName && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => viewHistoryReport(item)}
                            className="text-cyan-400 hover:text-cyan-300 p-2"
                            title="加载命盘和报告"
                          >
                            <div className="icon-folder-open text-lg"></div>
                          </button>
                          <button
                            onClick={() => copyHistoryReport(item)}
                            className="text-green-600 hover:text-green-800 p-2"
                            title="复制所有报告"
                          >
                            <div className="icon-copy text-lg"></div>
                          </button>
                          <button
                            onClick={() => {
                              setRenamingHistory(item.timeName);
                              setNewHistoryName(item.timeName);
                            }}
                            className="text-orange-600 hover:text-orange-800 p-2"
                            title="重命名"
                          >
                            <div className="icon-edit text-lg"></div>
                          </button>
                          <button
                            onClick={() => deleteHistoryItem(item.timeName)}
                            className="text-red-600 hover:text-red-800 p-2"
                            title="删除"
                          >
                            <div className="icon-trash-2 text-lg"></div>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              </div>
            )}
            
            {showInputText && (
              <>
                <div className="rounded-2xl border border-white/12 bg-slate-950/18 p-3">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                    命盘资料
                  </label>
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="请输入您的紫微斗数命盘信息..."
                    className="input-field h-32 resize-y text-sm shadow-inner md:h-40 md:text-base"
                  />
                  <p className="mt-2 text-xs text-slate-400">
                    支持粘贴出生信息、命盘文本和补充说明，生成逻辑保持不变。
                  </p>
                </div>
                
                <div className="flex gap-3 mt-4 justify-center">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !inputText.trim()}
                    className="btn btn-primary disabled:opacity-50 flex items-center gap-2 px-8"
                  >
                    {isGenerating ? (
                      <>
                        <div className="icon-loader text-lg animate-spin"></div>
                        生成报告中...
                      </>
                    ) : (
                      <>
                        <div className="icon-sparkles text-lg"></div>
                        生成报告
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>

            <div className="space-y-4 md:space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] md:text-xs text-slate-400 uppercase tracking-[0.18em] mb-1">智能报告 · 流式输出</p>
                <h2 className="text-lg md:text-2xl font-bold text-slate-50 flex items-center gap-2">
                  <div className="icon-file-text text-lg md:text-2xl text-cyan-400"></div>
                  分析报告
                </h2>
              </div>
              {(basicReport || wealthReport || portfolioAnalysisReport || stockAnalysisReport || flowReport) && (
                <button
                  onClick={copyAllReports}
                  className="text-slate-400 hover:text-cyan-300 transition-colors p-2 rounded-lg hover:bg-white/5"
                  title="复制所有报告"
                >
                  <div className="icon-copy text-xl"></div>
                </button>
              )}
            </div>
            
            <div className="zi-card overflow-hidden">
              <div className="overflow-x-auto border-b border-white/10 bg-slate-950/40">
                <div className="flex min-w-max md:min-w-0">
                  <button
                    onClick={() => setActiveReportTab('basic')}
                    className={`flex-1 px-3 md:px-6 py-3 md:py-4 font-semibold transition-all whitespace-nowrap text-xs md:text-base ${
                      activeReportTab === 'basic'
                        ? 'bg-gradient-to-b from-cyan-600 to-cyan-800 text-white shadow-[inset_0_-2px_0_rgba(34,211,238,0.5)]'
                        : 'bg-transparent text-slate-500 hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    命盘全析
                  </button>
                  <button
                    onClick={() => setActiveReportTab('wealth')}
                    className={`flex-1 px-3 md:px-6 py-3 md:py-4 font-semibold transition-all whitespace-nowrap text-xs md:text-base ${
                      activeReportTab === 'wealth'
                        ? 'text-white shadow-[inset_0_-2px_0_rgba(251,191,36,0.5)]'
                        : 'bg-transparent text-slate-500 hover:text-slate-200 hover:bg-white/5'
                    }`}
                    style={activeReportTab === 'wealth' ? {background: 'linear-gradient(180deg, #d97706 0%, #b45309 100%)'} : {}}
                  >
                    财富密码
                  </button>
                  <button
                    onClick={() => setActiveReportTab('portfolio')}
                    className={`flex-1 px-3 md:px-6 py-3 md:py-4 font-semibold transition-all whitespace-nowrap text-xs md:text-base ${
                      activeReportTab === 'portfolio'
                        ? 'text-white shadow-[inset_0_-2px_0_rgba(34,211,238,0.45)]'
                        : 'bg-transparent text-slate-500 hover:text-slate-200 hover:bg-white/5'
                    }`}
                    style={activeReportTab === 'portfolio' ? {background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)'} : {}}
                  >
                    持仓排盘
                  </button>
                  <button
                    onClick={() => setActiveReportTab('stock')}
                    className={`flex-1 px-3 md:px-6 py-3 md:py-4 font-semibold transition-all whitespace-nowrap text-xs md:text-base ${
                      activeReportTab === 'stock'
                        ? 'text-white shadow-[inset_0_-2px_0_rgba(52,211,153,0.5)]'
                        : 'bg-transparent text-slate-500 hover:text-slate-200 hover:bg-white/5'
                    }`}
                    style={activeReportTab === 'stock' ? {background: 'linear-gradient(180deg, #059669 0%, #047857 100%)'} : {}}
                  >
                    技术分析
                  </button>
                  <button
                    onClick={() => setActiveReportTab('flow')}
                    className={`flex-1 px-3 md:px-6 py-3 md:py-4 font-semibold transition-all whitespace-nowrap text-xs md:text-base ${
                      activeReportTab === 'flow'
                        ? 'text-white shadow-[inset_0_-2px_0_rgba(251,146,60,0.5)]'
                        : 'bg-transparent text-slate-500 hover:text-slate-200 hover:bg-white/5'
                    }`}
                    style={activeReportTab === 'flow' ? {background: 'linear-gradient(180deg, #ea580c 0%, #c2410c 100%)'} : {}}
                  >
                    流月流日
                  </button>
                </div>
              </div>
                
                <div className="p-3 md:p-6 bg-slate-950/20">
                  {activeReportTab === 'basic' && (
                    <>
                      {isGeneratingBasic ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <div className="icon-loader text-6xl text-cyan-400 mb-4 animate-spin flex justify-center drop-shadow-[0_0_12px_rgba(34,211,238,0.45)]"></div>
                          <h3 className="text-xl font-semibold text-slate-200 mb-2">正在生成命盘全析报告...</h3>
                          <p className="text-slate-400">请稍候，AI 正在分析您的命盘信息</p>
                        </div>
                      ) : basicReport ? (
                        <>
                      <div className="mb-4 pb-4 border-b border-white/10">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base md:text-lg font-bold text-slate-100">
                              {basicReport.title}
                            </h3>
                          </div>
                          <div className="flex items-center justify-between md:justify-end gap-2">
                            <span className="text-xs md:text-sm text-slate-400">
                              {basicReport.timestamp}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => copyReport(`【紫微斗数基础命盘全析】\n生成时间: ${basicReport.timestamp}\n\n${basicReport.content}`)}
                                className="text-cyan-400 hover:text-cyan-300 p-1.5 md:p-2"
                                title="复制当前报告"
                              >
                                <div className="icon-copy text-base md:text-lg"></div>
                              </button>
                              <button
                                onClick={() => toggleReportCollapse('basic')}
                                className="text-slate-400 hover:text-slate-200 p-1.5 md:p-2"
                                title={collapsedReports['basic'] ? "展开" : "折叠"}
                              >
                                <div className={`icon-chevron-${collapsedReports['basic'] ? 'down' : 'up'} text-base md:text-lg`}></div>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {!collapsedReports['basic'] && (
                        <div className="max-w-none">
                          <ReportContent content={basicReport.content} />
                        </div>
                        )}
                        </>
                      ) : (
                        <div className="text-center py-12">
                          <div className="icon-file-text text-6xl text-slate-600 mb-4 flex justify-center"></div>
                          <h3 className="text-xl font-semibold text-slate-400 mb-2">还没有生成命盘全析报告</h3>
                          <p className="text-slate-500">请点击「生成报告」按钮开始分析</p>
                        </div>
                      )}
                    </>
                  )}
                  
                  {activeReportTab === 'wealth' && (
                    <>
                      {isGeneratingWealth ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <div className="icon-loader text-6xl text-orange-600 mb-4 animate-spin flex justify-center"></div>
                          <h3 className="text-xl font-semibold text-slate-200 mb-2">正在生成财富密码报告...</h3>
                          <p className="text-slate-400">请稍候，AI 正在分析您的财富运势</p>
                        </div>
                      ) : wealthReport ? (
                        <>
                      <div className="mb-4 pb-4 border-b border-white/10">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base md:text-lg font-bold text-slate-100">
                              {wealthReport.title}
                            </h3>
                          </div>
                          <div className="flex items-center justify-between md:justify-end gap-2">
                            <span className="text-xs md:text-sm text-slate-400">
                              {wealthReport.timestamp}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => copyReport(`【紫微斗数财富密码】\n生成时间: ${wealthReport.timestamp}\n\n${wealthReport.content}`)}
                                className="text-cyan-400 hover:text-cyan-300 p-1.5 md:p-2"
                                title="复制当前报告"
                              >
                                <div className="icon-copy text-base md:text-lg"></div>
                              </button>
                              <button
                                onClick={() => toggleReportCollapse('wealth')}
                                className="text-slate-400 hover:text-slate-200 p-1.5 md:p-2"
                                title={collapsedReports['wealth'] ? "展开" : "折叠"}
                              >
                                <div className={`icon-chevron-${collapsedReports['wealth'] ? 'down' : 'up'} text-base md:text-lg`}></div>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {!collapsedReports['wealth'] && (
                        <div className="max-w-none">
                          <ReportContent content={wealthReport.content} />
                        </div>
                        )}
                        </>
                      ) : (
                        <div className="text-center py-12">
                          <div className="icon-trending-up text-6xl text-slate-600 mb-4 flex justify-center"></div>
                          <h3 className="text-xl font-semibold text-slate-400 mb-2">还没有生成财富密码报告</h3>
                          <p className="text-slate-500">请点击「生成报告」按钮开始分析</p>
                        </div>
                      )}
                    </>
                  )}
                  
                  {activeReportTab === 'portfolio' && (
                    <>
                      {isGeneratingPortfolio ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <div className="icon-loader text-6xl text-cyan-600 mb-4 animate-spin flex justify-center"></div>
                          <h3 className="text-xl font-semibold text-slate-200 mb-2">正在生成持仓组合分析...</h3>
                          <p className="text-slate-400">请稍候，AI 正在分析您的持仓组合</p>
                        </div>
                      ) : portfolioAnalysisReport ? (
                        <>
                      <div className="mb-4 pb-4 border-b border-white/10">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base md:text-lg font-bold text-slate-100">
                              {portfolioAnalysisReport.title}
                            </h3>
                          </div>
                          <div className="flex items-center justify-between md:justify-end gap-2">
                            <span className="text-xs md:text-sm text-slate-400">
                              {portfolioAnalysisReport.timestamp}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => copyReport(`【紫微斗数持仓组合分析】\n生成时间: ${portfolioAnalysisReport.timestamp}\n\n${portfolioAnalysisReport.content}`)}
                                className="text-cyan-400 hover:text-cyan-300 p-1.5 md:p-2"
                                title="复制当前报告"
                              >
                                <div className="icon-copy text-base md:text-lg"></div>
                              </button>
                              <button
                                onClick={() => toggleReportCollapse('portfolio')}
                                className="text-slate-400 hover:text-slate-200 p-1.5 md:p-2"
                                title={collapsedReports['portfolio'] ? "展开" : "折叠"}
                              >
                                <div className={`icon-chevron-${collapsedReports['portfolio'] ? 'down' : 'up'} text-base md:text-lg`}></div>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {!collapsedReports['portfolio'] && (
                        <div className="max-w-none">
                          <ReportContent content={portfolioAnalysisReport.content} />
                        </div>
                        )}
                        </>
                      ) : (
                        <div className="text-center py-12">
                          <div className="icon-briefcase text-6xl text-slate-600 mb-4 flex justify-center"></div>
                          <h3 className="text-xl font-semibold text-slate-400 mb-2">还没有生成持仓组合分析报告</h3>
                          <p className="text-slate-500">当您有持仓股票时，生成报告会自动包含持仓组合分析</p>
                        </div>
                      )}
                    </>
                  )}
                  
                  {activeReportTab === 'stock' && (
                    <>
                      {isAnalyzingStock ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <div className="icon-loader text-6xl text-green-600 mb-4 animate-spin flex justify-center"></div>
                          <h3 className="text-xl font-semibold text-slate-200 mb-2">正在生成技术持仓分析...</h3>
                          <p className="text-slate-400">请稍候，AI 正在分析股票数据</p>
                        </div>

                      ) : stockAnalysisReport ? (
                        <>
                      <div className="mb-4 pb-4 border-b border-white/10">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base md:text-lg font-bold text-slate-100">
                              {stockAnalysisReport.title}
                            </h3>
                          </div>
                          <div className="flex items-center justify-between md:justify-end gap-2">
                            <span className="text-xs md:text-sm text-slate-400">
                              {stockAnalysisReport.timestamp}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={handleAnalyzeAllStocks}
                                disabled={isAnalyzingStock || portfolioStocks.length === 0}
                                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.08] px-2 py-1 text-xs font-semibold text-emerald-100 transition-colors hover:bg-white/[0.14] disabled:opacity-50"
                                title="重新生成技术分析"
                              >
                                <div className="icon-bar-chart text-sm"></div>
                                <span>重新分析</span>
                              </button>
                              <button
                                onClick={() => copyReport(`【持仓组合技术分析与评估】\n生成时间: ${stockAnalysisReport.timestamp}\n\n${stockAnalysisReport.content}`)}
                                className="text-cyan-400 hover:text-cyan-300 p-1.5 md:p-2"
                                title="复制当前报告"
                              >
                                <div className="icon-copy text-base md:text-lg"></div>
                              </button>
                              <button
                                onClick={() => toggleReportCollapse('stock')}
                                className="text-slate-400 hover:text-slate-200 p-1.5 md:p-2"
                                title={collapsedReports['stock'] ? "展开" : "折叠"}
                              >
                                <div className={`icon-chevron-${collapsedReports['stock'] ? 'down' : 'up'} text-base md:text-lg`}></div>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {!collapsedReports['stock'] && (
                        <div className="max-w-none">
                          <ReportContent content={stockAnalysisReport.content} />
                        </div>
                        )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-14 text-center">
                          <div className="icon-bar-chart text-6xl text-slate-600 mb-4 flex justify-center"></div>
                          <h3 className="text-xl font-semibold text-slate-300 mb-2">还没有生成技术分析</h3>
                          <p className="mb-5 max-w-md text-sm text-slate-500">
                            将基于当前持仓股票、行情、技术指标和持仓成本生成组合技术分析。
                          </p>
                          <button
                            type="button"
                            onClick={handleAnalyzeAllStocks}
                            disabled={isAnalyzingStock || portfolioStocks.length === 0}
                            className="btn btn-success gap-2 disabled:opacity-50"
                          >
                            <div className="icon-bar-chart text-base"></div>
                            <span>{portfolioStocks.length === 0 ? '暂无持仓' : '分析'}</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  
                  {activeReportTab === 'flow' && (
                    <>
                      {isGeneratingFlow ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <div className="icon-loader text-6xl text-orange-600 mb-4 animate-spin flex justify-center"></div>
                          <h3 className="text-xl font-semibold text-slate-200 mb-2">正在生成流月流日分析...</h3>
                          <p className="text-slate-400">请稍候，AI 正在进行流月流日排盘分析</p>
                        </div>
                      ) : flowReport ? (
                        <>
                      <div className="mb-4 pb-4 border-b border-white/10">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base md:text-lg font-bold text-slate-100">
                              {flowReport.title}
                            </h3>
                          </div>
                          <div className="flex items-center justify-between md:justify-end gap-2">
                            <span className="text-xs md:text-sm text-slate-400">
                              {flowReport.timestamp}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={handleGenerateFlow}
                                disabled={isGeneratingFlow || !inputText.trim() || (!wealthReport && !stockAnalysisReport && !portfolioAnalysisReport)}
                                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.08] px-2 py-1 text-xs font-semibold text-amber-100 transition-colors hover:bg-white/[0.14] disabled:opacity-50"
                                title="重新生成流月流日分析"
                              >
                                <div className="icon-zap text-sm"></div>
                                <span>重新分析</span>
                              </button>
                              <button
                                onClick={() => copyReport(`【紫微斗数流月流日分析】\n生成时间: ${flowReport.timestamp}\n\n${flowReport.content}`)}
                                className="text-cyan-400 hover:text-cyan-300 p-1.5 md:p-2"
                                title="复制当前报告"
                              >
                                <div className="icon-copy text-base md:text-lg"></div>
                              </button>
                              <button
                                onClick={() => toggleReportCollapse('flow')}
                                className="text-slate-400 hover:text-slate-200 p-1.5 md:p-2"
                                title={collapsedReports['flow'] ? "展开" : "折叠"}
                              >
                                <div className={`icon-chevron-${collapsedReports['flow'] ? 'down' : 'up'} text-base md:text-lg`}></div>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {!collapsedReports['flow'] && (
                        <div className="max-w-none">
                          <ReportContent content={flowReport.content} />
                        </div>
                        )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-14 text-center">
                          <div className="icon-calendar text-6xl text-slate-600 mb-4 flex justify-center"></div>
                          <h3 className="text-xl font-semibold text-slate-300 mb-2">还没有生成流月流日分析</h3>
                          <p className="mb-5 max-w-md text-sm text-slate-500">
                            基于命盘信息、财富密码和持仓技术分析，生成流月流日运势与操作建议。
                          </p>
                          <button
                            type="button"
                            onClick={handleGenerateFlow}
                            disabled={isGeneratingFlow || !inputText.trim() || (!wealthReport && !stockAnalysisReport && !portfolioAnalysisReport)}
                            className="btn btn-secondary gap-2 disabled:opacity-50"
                          >
                            <div className="icon-zap text-base"></div>
                            <span>分析</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            

          </div>

        {/* Fixed Bottom Chat Bar - Only show when reports exist */}
        {(basicReport || wealthReport || portfolioAnalysisReport || stockAnalysisReport || flowReport) && (
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-cyan-500/30 bg-slate-950/92 backdrop-blur-xl shadow-[0_-8px_40px_rgba(0,0,0,0.55)]">
            {!isChatExpanded ? (
              /* Collapsed State */
              <div 
                onClick={() => setIsChatExpanded(true)}
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="icon-message-circle text-xl text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"></div>
                  <span className="font-semibold text-slate-100 zi-mono-label text-xs tracking-wider">AI 助理</span>
                  <span className="text-sm text-slate-400 hidden sm:inline">智能对话</span>
                  {chatMessages.length > 0 && (
                    <span className="text-xs bg-cyan-500/15 text-cyan-300 px-2 py-1 rounded border border-cyan-400/25">
                      {Math.floor(chatMessages.length / 2)} 轮
                    </span>
                  )}
                </div>
                <div className="icon-chevron-up text-xl text-slate-500"></div>
              </div>
            ) : (
              /* Expanded State */
              <div ref={chatSectionRef} className="max-h-[600px] flex flex-col">
                <div className="text-white p-3 flex items-center justify-between border-b border-cyan-500/20 bg-gradient-to-r from-slate-900 via-cyan-950/80 to-slate-900">
                  <div className="flex items-center gap-2">
                    <div className="icon-message-circle text-lg text-cyan-300"></div>
                    <h3 className="font-bold text-slate-50">AI 智能对话</h3>
                    {chatMessages.length > 0 && (
                      <span className="text-xs bg-cyan-400/15 text-cyan-200 px-2 py-1 rounded border border-cyan-400/25">
                        {Math.floor(chatMessages.length / 2)} 轮
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setChatMessages([]);
                        setSuggestedQuestions([]);
                      }}
                      className="text-slate-300 hover:text-white transition-colors p-1"
                      title="清空对话"
                    >
                      <div className="icon-trash-2 text-lg"></div>
                    </button>
                    <button
                      onClick={() => setIsChatExpanded(false)}
                      className="text-slate-300 hover:text-white transition-colors p-1"
                      title="收起"
                    >
                      <div className="icon-chevron-down text-lg"></div>
                    </button>
                  </div>
                </div>
                
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 bg-slate-950/80" style={{maxHeight: '400px'}}>
                  {chatMessages.length === 0 && !streamingMessage ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                      <div className="icon-message-square text-4xl mb-2 text-cyan-500/40"></div>
                      <p className="text-sm text-center max-w-xs">与 AI 对话，讨论投资策略与命盘解读</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {chatMessages.map((msg, index) => (
                        <div
                          key={index}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-xl p-3 ${
                              msg.role === 'user'
                                ? 'bg-gradient-to-br from-cyan-600 to-teal-700 text-white shadow-lg shadow-cyan-500/15'
                                : 'bg-slate-900/90 border border-white/10 text-slate-200'
                            }`}
                          >
                            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                          </div>
                        </div>
                      ))}
                      {streamingMessage && (
                        <div className="flex justify-start">
                          <div className="max-w-[80%] bg-slate-900/90 border border-cyan-500/20 rounded-xl p-3">
                            <div className="text-sm whitespace-pre-wrap text-slate-200">{streamingMessage}</div>
                            <div className="flex gap-1 mt-2">
                              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
                              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>
                
                <div className="p-3 bg-slate-900/90 border-t border-white/10">
                  {suggestedQuestions.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-slate-500 mb-1">建议追问</p>
                      <div className="flex flex-wrap gap-1">
                        {suggestedQuestions.map((question, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              setChatInput(question);
                              setSuggestedQuestions([]);
                            }}
                            className="text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 px-2 py-1 rounded-lg border border-cyan-500/25 transition-colors"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleChatSubmit()}
                      placeholder="输入您的问题..."
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-white/10 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/30"
                      disabled={isChatting}
                    />
                    <button
                      onClick={handleChatSubmit}
                      disabled={!chatInput.trim() || isChatting}
                      className="btn btn-primary disabled:opacity-50 px-4"
                    >
                      {isChatting ? (
                        <div className="icon-loader text-base animate-spin"></div>
                      ) : (
                        <div className="icon-send text-base"></div>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    AI 仅回答金融投资与紫微斗数命理相关问题
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {showSaveDialog && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="zi-card w-full max-w-md p-6 border-cyan-500/20">
              <h2 className="text-xl font-bold text-slate-100 mb-1">保存报告</h2>
              <p className="text-xs text-slate-500 zi-mono-label mb-4">仅存本机浏览器</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  报告名称
                </label>
                <input
                  type="text"
                  value={saveDialogName}
                  onChange={(e) => setSaveDialogName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-white/10 bg-slate-950 text-slate-100 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/30"
                  placeholder="请输入报告名称"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={confirmSaveToHistory}
                  className="btn btn-primary flex-1"
                >
                  确认保存
                </button>
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSaveDialogName('');
                  }}
                  className="btn btn-secondary"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

          </main>
        </div>

        </>
      );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <ZiweiApp />
  </ErrorBoundary>
);

