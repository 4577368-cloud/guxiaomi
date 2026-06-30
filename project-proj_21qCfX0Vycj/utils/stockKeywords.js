// 新闻关键词生成器：股票加入持仓/关注时默认生成 3-5 个新闻检索关键词。
const STOCK_KEYWORD_PRESETS = {
  US_NVDA: ['英伟达', 'NVIDIA', 'GPU', 'AI芯片', '数据中心'],
  US_AAPL: ['苹果', 'Apple', 'iPhone', 'iOS', '消费电子'],
  US_MSFT: ['微软', 'Microsoft', 'Azure', 'OpenAI', '云计算'],
  US_GOOGL: ['谷歌', 'Google', 'Alphabet', 'AI', '广告业务'],
  US_GOOG: ['谷歌', 'Google', 'Alphabet', 'AI', '广告业务'],
  US_AMZN: ['亚马逊', 'Amazon', 'AWS', '电商', '云计算'],
  US_TSLA: ['特斯拉', 'Tesla', '电动车', '马斯克', '自动驾驶'],
  US_META: ['Meta', 'Facebook', 'Instagram', 'AI', '元宇宙'],
  US_AMD: ['AMD', '超微半导体', 'GPU', 'AI芯片', '半导体'],
  US_INTC: ['英特尔', 'Intel', '芯片', '半导体', '晶圆代工'],

  HK_03690: ['美团', '外卖', '本地生活', '到店酒旅', '即时零售'],
  HK_3690: ['美团', '外卖', '本地生活', '到店酒旅', '即时零售'],
  HK_00700: ['腾讯', '微信', '游戏', '云服务', '广告'],
  HK_700: ['腾讯', '微信', '游戏', '云服务', '广告'],
  HK_09988: ['阿里巴巴', '淘宝', '天猫', '阿里云', '电商'],
  HK_9988: ['阿里巴巴', '淘宝', '天猫', '阿里云', '电商'],
  HK_01810: ['小米', '手机', '小米汽车', 'IoT', '消费电子'],
  HK_1810: ['小米', '手机', '小米汽车', 'IoT', '消费电子'],
  HK_09618: ['京东', '电商', '物流', '京东零售', '京东健康'],
  HK_9618: ['京东', '电商', '物流', '京东零售', '京东健康'],
  HK_09888: ['百度', 'AI', '自动驾驶', '搜索', '文心一言'],
  HK_9888: ['百度', 'AI', '自动驾驶', '搜索', '文心一言'],

  CN_002594: ['比亚迪', '新能源汽车', '电池', '插混', '出口'],
  CN_300750: ['宁德时代', '动力电池', '储能', '新能源车', '锂电'],
  CN_600519: ['贵州茅台', '茅台', '白酒', '飞天茅台', '消费'],
  CN_000333: ['美的', '美的集团', '家电', '机器人', '智能制造'],
  CN_600036: ['招商银行', '招行', '银行', '零售金融', '财富管理'],
};

function normalizeKeywordSymbol(symbol, market) {
  const raw = String(symbol || '').trim().toUpperCase().replace(/\.HK$/i, '');
  const m = String(market || '').trim().toUpperCase();
  if ((m === 'HK' || m.indexOf('港') >= 0) && /^\d+$/.test(raw)) {
    return raw.padStart(5, '0');
  }
  if ((m === 'CN' || m.indexOf('A') >= 0) && /^\d+$/.test(raw)) {
    return raw.padStart(6, '0');
  }
  return raw;
}

function marketKeywordPrefix(market) {
  const m = String(market || '').trim().toUpperCase();
  if (m === 'US' || m.indexOf('美') >= 0) return 'US';
  if (m === 'HK' || m.indexOf('港') >= 0) return 'HK';
  if (m === 'CN' || m.indexOf('A') >= 0) return 'CN';
  return m || 'UNKNOWN';
}

function cleanCompanyNameForKeyword(name) {
  return String(name || '')
    .replace(/公司|集团|控股|股份|有限|有限公司|科技|Corporation|Inc\.?|Class|A类股|C类股/gi, '')
    .replace(/[-－—_].*$/g, '')
    .trim();
}

function generateDefaultStockKeywords(stockLike) {
  const stock = stockLike || {};
  const marketPrefix = marketKeywordPrefix(stock.market);
  const symbol = normalizeKeywordSymbol(stock.symbol, stock.market);
  const preset = STOCK_KEYWORD_PRESETS[`${marketPrefix}_${symbol}`] || STOCK_KEYWORD_PRESETS[`${marketPrefix}_${String(Number(symbol))}`];
  const out = [];

  function add(value) {
    const v = String(value || '').trim();
    if (!v) return;
    if (!out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }

  (preset || []).forEach(add);
  add(stock.nameCn);
  add(cleanCompanyNameForKeyword(stock.name));
  add(cleanCompanyNameForKeyword(stock.companyName));

  if (!out.length && symbol) add(symbol);
  return out.slice(0, 5);
}

function ensureStockKeywords(stockLike) {
  const stock = stockLike || {};
  const existing = Array.isArray(stock.keywords)
    ? stock.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];
  if (existing.length > 0) return existing.slice(0, 8);
  return generateDefaultStockKeywords(stock);
}

window.generateDefaultStockKeywords = generateDefaultStockKeywords;
window.ensureStockKeywords = ensureStockKeywords;
