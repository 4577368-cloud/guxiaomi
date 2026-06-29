// 股票搜索数据库 - 包含常见股票代码和名称
const STOCK_DATABASE = {
  // 美股
  US: [
    { symbol: 'AAPL', name: '苹果公司', nameCn: '苹果' },
    { symbol: 'MSFT', name: '微软公司', nameCn: '微软' },
    { symbol: 'GOOGL', name: 'Alphabet A类股', nameCn: '谷歌' },
    { symbol: 'GOOG', name: 'Alphabet C类股', nameCn: '谷歌' },
    { symbol: 'AMZN', name: '亚马逊', nameCn: '亚马逊' },
    { symbol: 'NVDA', name: '英伟达', nameCn: '英伟达' },
    { symbol: 'META', name: 'Meta Platforms', nameCn: 'Meta' },
    { symbol: 'TSLA', name: '特斯拉', nameCn: '特斯拉' },
    { symbol: 'BRK.B', name: '伯克希尔哈撒韦B类', nameCn: '伯克希尔' },
    { symbol: 'JPM', name: '摩根大通', nameCn: '摩根大通' },
    { symbol: 'V', name: '维萨', nameCn: 'Visa' },
    { symbol: 'JNJ', name: '强生', nameCn: '强生' },
    { symbol: 'WMT', name: '沃尔玛', nameCn: '沃尔玛' },
    { symbol: 'PG', name: '宝洁', nameCn: '宝洁' },
    { symbol: 'MA', name: '万事达', nameCn: '万事达' },
    { symbol: 'HD', name: '家得宝', nameCn: '家得宝' },
    { symbol: 'DIS', name: '迪士尼', nameCn: '迪士尼' },
    { symbol: 'BAC', name: '美国银行', nameCn: '美国银行' },
    { symbol: 'ADBE', name: 'Adobe', nameCn: 'Adobe' },
    { symbol: 'CRM', name: 'Salesforce', nameCn: 'Salesforce' },
    { symbol: 'NFLX', name: '奈飞', nameCn: '奈飞' },
    { symbol: 'XOM', name: '埃克森美孚', nameCn: '埃克森' },
    { symbol: 'KO', name: '可口可乐', nameCn: '可口可乐' },
    { symbol: 'PEP', name: '百事可乐', nameCn: '百事' },
    { symbol: 'COST', name: '好市多', nameCn: '好市多' },
    { symbol: 'MRK', name: '默沙东', nameCn: '默沙东' },
    { symbol: 'ABT', name: '雅培', nameCn: '雅培' },
    { symbol: 'TMO', name: '赛默飞世尔', nameCn: '赛默飞' },
    { symbol: 'CSCO', name: '思科', nameCn: '思科' },
    { symbol: 'ABBV', name: '艾伯维', nameCn: '艾伯维' },
    { symbol: 'ACN', name: '埃森哲', nameCn: '埃森哲' },
    { symbol: 'NKE', name: '耐克', nameCn: '耐克' },
    { symbol: 'AVGO', name: '博通', nameCn: '博通' },
    { symbol: 'ORCL', name: '甲骨文', nameCn: '甲骨文' },
    { symbol: 'TXN', name: '德州仪器', nameCn: '德州仪器' },
    { symbol: 'QCOM', name: '高通', nameCn: '高通' },
    { symbol: 'PM', name: '菲利普莫里斯', nameCn: '菲莫' },
    { symbol: 'LIN', name: '林德', nameCn: '林德' },
    { symbol: 'UNH', name: '联合健康', nameCn: '联合健康' },
    { symbol: 'AMD', name: '超微半导体', nameCn: 'AMD' },
    { symbol: 'INTC', name: '英特尔', nameCn: '英特尔' },
    { symbol: 'UBER', name: '优步', nameCn: '优步' },
    { symbol: 'PYPL', name: 'PayPal', nameCn: 'PayPal' },
    { symbol: 'SHOP', name: 'Shopify', nameCn: 'Shopify' },
    { symbol: 'SQ', name: 'Block', nameCn: 'Block' },
    { symbol: 'COIN', name: 'Coinbase', nameCn: 'Coinbase' },
    { symbol: 'RIVN', name: 'Rivian', nameCn: 'Rivian' },
    { symbol: 'LCID', name: 'Lucid', nameCn: 'Lucid' }
  ],

  // 港股
  HK: [
    { symbol: '03690', name: '美团-W', nameCn: '美团' },
    { symbol: '00700', name: '腾讯控股', nameCn: '腾讯' },
    { symbol: '09988', name: '阿里巴巴-SW', nameCn: '阿里巴巴' },
    { symbol: '09999', name: '网易-S', nameCn: '网易' },
    { symbol: '09888', name: '百度集团-SW', nameCn: '百度' },
    { symbol: '01810', name: '小米集团-W', nameCn: '小米' },
    { symbol: '09618', name: '京东集团-SW', nameCn: '京东' },
    { symbol: '09633', name: '农夫山泉', nameCn: '农夫山泉' },
    { symbol: '00728', name: '中国电信', nameCn: '中国电信' },
    { symbol: '00772', name: '阅文集团', nameCn: '阅文' },
    { symbol: '03636', name: '火币科技', nameCn: '火币' },
    { symbol: '02382', name: '舜宇光学科技', nameCn: '舜宇' },
    { symbol: '06160', name: '百济神州', nameCn: '百济神州' },
    { symbol: '06618', name: '京东健康', nameCn: '京东健康' },
    { symbol: '02689', name: '绿城管理控股', nameCn: '绿城' },
    { symbol: '00992', name: '联想集团', nameCn: '联想' },
    { symbol: '00270', name: '粤海投资', nameCn: '粤海' },
    { symbol: '00388', name: '香港交易所', nameCn: '港交所' },
    { symbol: '00688', name: '中海外发展', nameCn: '中海' },
    { symbol: '00883', name: '中国海洋石油', nameCn: '中海油' },
    { symbol: '00941', name: '中国移动', nameCn: '移动' },
    { symbol: '00939', name: '建设银行', nameCn: '建行' },
    { symbol: '00998', name: '中信银行', nameCn: '中信' },
    { symbol: '01088', name: '中滔健康', nameCn: '中滔' },
    { symbol: '01109', name: '华润置地', nameCn: '华润置地' },
    { symbol: '01299', name: '友邦保险', nameCn: '友邦' },
    { symbol: '01398', name: '工商银行', nameCn: '工行' },
    { symbol: '01658', name: '邮储银行', nameCn: '邮储' },
    { symbol: '01898', name: '华润燃气', nameCn: '润燃' },
    { symbol: '01928', name: '金沙中国', nameCn: '金沙' },
    { symbol: '02007', name: '碧桂园', nameCn: '碧桂园' },
    { symbol: '02020', name: '安踏体育', nameCn: '安踏' },
    { symbol: '02196', name: '复星医药', nameCn: '复星' },
    { symbol: '02269', name: '药明生物', nameCn: '药明' },
    { symbol: '02313', name: '申洲国际', nameCn: '申洲' },
    { symbol: '02318', name: '中国平安', nameCn: '平安' },
    { symbol: '02319', name: '蒙牛乳业', nameCn: '蒙牛' },
    { symbol: '02328', name: '中国财险', nameCn: '中财险' },
    { symbol: '02382', name: '舜宇光学科技', nameCn: '舜宇' },
    { symbol: '02601', name: '中国太保', nameCn: '太保' },
    { symbol: '02628', name: '中国人寿', nameCn: '人寿' },
    { symbol: '03328', name: '交通银行', nameCn: '交行' },
    { symbol: '03690', name: '美团-W', nameCn: '美团' },
    { symbol: '03888', name: '金山软件', nameCn: '金山' },
    { symbol: '03968', name: '招商银行', nameCn: '招行' },
    { symbol: '03988', name: '中国银行', nameCn: '中行' },
    { symbol: '06655', name: '微博-SW', nameCn: '微博' },
    { symbol: '06690', name: '海尔智家', nameCn: '海尔' },
    { symbol: '06808', name: '高鑫零售', nameCn: '高鑫' },
    { symbol: '06888', name: '海底捞', nameCn: '海底捞' },
    { symbol: '09961', name: '携程集团-S', nameCn: '携程' },
    { symbol: '09987', name: '百胜中国', nameCn: '百胜' }
  ],

  // A股
  CN: [
    { symbol: '600036', name: '招商银行', nameCn: '招商银行' },
    { symbol: '600519', name: '贵州茅台', nameCn: '茅台' },
    { symbol: '601318', name: '中国平安', nameCn: '平安' },
    { symbol: '600276', name: '恒瑞医药', nameCn: '恒瑞' },
    { symbol: '600887', name: '伊利股份', nameCn: '伊利' },
    { symbol: '600030', name: '中信证券', nameCn: '中信证券' },
    { symbol: '601012', name: '隆基绿能', nameCn: '隆基' },
    { symbol: '600585', name: '海螺水泥', nameCn: '海螺' },
    { symbol: '601398', name: '工商银行', nameCn: '工行' },
    { symbol: '601939', name: '建设银行', nameCn: '建行' },
    { symbol: '601288', name: '农业银行', nameCn: '农行' },
    { symbol: '601988', name: '中国银行', nameCn: '中行' },
    { symbol: '601328', name: '交通银行', nameCn: '交行' },
    { symbol: '600000', name: '浦发银行', nameCn: '浦发' },
    { symbol: '600016', name: '民生银行', nameCn: '民生' },
    { symbol: '600050', name: '中国联通', nameCn: '联通' },
    { symbol: '600104', name: '上汽集团', nameCn: '上汽' },
    { symbol: '600309', name: '万华化学', nameCn: '万华' },
    { symbol: '600406', name: '国电南瑞', nameCn: '国电南瑞' },
    { symbol: '600585', name: '海螺水泥', nameCn: '海螺' },
    { symbol: '600690', name: '海尔智家', nameCn: '海尔' },
    { symbol: '600703', name: '三安光电', nameCn: '三安' },
    { symbol: '600760', name: '中航沈飞', nameCn: '沈飞' },
    { symbol: '600837', name: '海通证券', nameCn: '海通' },
    { symbol: '600887', name: '伊利股份', nameCn: '伊利' },
    { symbol: '600900', name: '长江电力', nameCn: '长电' },
    { symbol: '600941', name: '中国移动', nameCn: '移动' },
    { symbol: '601006', name: '大秦铁路', nameCn: '大秦' },
    { symbol: '601066', name: '中信建投', nameCn: '中信建投' },
    { symbol: '601088', name: '中国神华', nameCn: '神华' },
    { symbol: '601138', name: '工业富联', nameCn: '工业富联' },
    { symbol: '601166', name: '兴业银行', nameCn: '兴业' },
    { symbol: '601169', name: '北京银行', nameCn: '北银' },
    { symbol: '601186', name: '中国铁建', nameCn: '铁建' },
    { symbol: '601211', name: '国泰君安', nameCn: '国君' },
    { symbol: '601236', name: '红塔证券', nameCn: '红塔' },
    { symbol: '601288', name: '农业银行', nameCn: '农行' },
    { symbol: '601318', name: '中国平安', nameCn: '平安' },
    { symbol: '601336', name: '新华保险', nameCn: '新华' },
    { symbol: '601390', name: '中国中铁', nameCn: '中铁' },
    { symbol: '601398', name: '工商银行', nameCn: '工行' },
    { symbol: '601601', name: '中国太保', nameCn: '太保' },
    { symbol: '601628', name: '中国人寿', nameCn: '人寿' },
    { symbol: '601668', name: '中国建筑', nameCn: '中建' },
    { symbol: '601688', name: '华泰证券', nameCn: '华泰' },
    { symbol: '601699', name: '潞安环能', nameCn: '潞安' },
    { symbol: '601766', name: '中国中车', nameCn: '中车' },
    { symbol: '601800', name: '中国交建', nameCn: '中交' },
    { symbol: '601816', name: '京沪高铁', nameCn: '京沪高铁' },
    { symbol: '601857', name: '中国石油', nameCn: '中石油' },
    { symbol: '601888', name: '中国中免', nameCn: '中免' },
    { symbol: '601985', name: '中国核电', nameCn: '中核' },
    { symbol: '601988', name: '中国银行', nameCn: '中行' },
    { symbol: '601989', name: '中国重工', nameCn: '重工' },
    { symbol: '601995', name: '中金公司', nameCn: '中金' },
    { symbol: '603259', name: '药明康德', nameCn: '药明康德' },
    { symbol: '603288', name: '海天味业', nameCn: '海天' },
    { symbol: '603501', name: '韦尔股份', nameCn: '韦尔' },
    { symbol: '603799', name: '华友钴业', nameCn: '华友' },
    { symbol: '603986', name: '兆易创新', nameCn: '兆易' },
    { symbol: '688041', name: '海光信息', nameCn: '海光' },
    { symbol: '688111', name: '金山办公', nameCn: '金山办公' },
    { symbol: '688981', name: '中芯国际', nameCn: '中芯' },
    { symbol: '000001', name: '平安银行', nameCn: '平安银行' },
    { symbol: '000002', name: '万科A', nameCn: '万科' },
    { symbol: '000063', name: '中兴通讯', nameCn: '中兴' },
    { symbol: '000066', name: '中国长城', nameCn: '长城' },
    { symbol: '000100', name: 'TCL科技', nameCn: 'TCL' },
    { symbol: '000333', name: '美的集团', nameCn: '美的' },
    { symbol: '000338', name: '潍柴动力', nameCn: '潍柴' },
    { symbol: '000425', name: '徐工机械', nameCn: '徐工' },
    { symbol: '000538', name: '云南白药', nameCn: '云白' },
    { symbol: '000568', name: '泸州老窖', nameCn: '泸州' },
    { symbol: '000596', name: '古井贡酒', nameCn: '古井' },
    { symbol: '000651', name: '格力电器', nameCn: '格力' },
    { symbol: '000661', name: '长春高新', nameCn: '长春' },
    { symbol: '000725', name: '京东方A', nameCn: '京东方' },
    { symbol: '000768', name: '中航西飞', nameCn: '西飞' },
    { symbol: '000858', name: '五粮液', nameCn: '五粮液' },
    { symbol: '000876', name: '新希望', nameCn: '新希望' },
    { symbol: '000895', name: '双汇发展', nameCn: '双汇' },
    { symbol: '000938', name: '紫光股份', nameCn: '紫光' },
    { symbol: '000961', name: '中南建设', nameCn: '中南' },
    { symbol: '000963', name: '华东医药', nameCn: '华东' },
    { symbol: '000977', name: '浪潮信息', nameCn: '浪潮' },
    { symbol: '000983', name: '山西焦煤', nameCn: '焦煤' },
    { symbol: '001979', name: '招商蛇口', nameCn: '招商蛇口' },
    { symbol: '002001', name: '新和成', nameCn: '新和成' },
    { symbol: '002027', name: '分众传媒', nameCn: '分众' },
    { symbol: '002044', name: '美年健康', nameCn: '美年' },
    { symbol: '002049', name: '紫光国微', nameCn: '紫光国微' },
    { symbol: '002142', name: '宁波银行', nameCn: '宁波银行' },
    { symbol: '002230', name: '科大讯飞', nameCn: '科大讯飞' },
    { symbol: '002236', name: '大华股份', nameCn: '大华' },
    { symbol: '002252', name: '上海莱士', nameCn: '莱士' },
    { symbol: '002271', name: '东方雨虹', nameCn: '雨虹' },
    { symbol: '002304', name: '洋河股份', nameCn: '洋河' },
    { symbol: '002311', name: '海大集团', nameCn: '海大' },
    { symbol: '002352', name: '顺丰控股', nameCn: '顺丰' },
    { symbol: '002371', name: '北方华创', nameCn: '北方华创' },
    { symbol: '002415', name: '海康威视', nameCn: '海康' },
    { symbol: '002460', name: '赣锋锂业', nameCn: '赣锋' },
    { symbol: '002475', name: '立讯精密', nameCn: '立讯' },
    { symbol: '002493', name: '荣盛石化', nameCn: '荣盛' },
    { symbol: '002594', name: '比亚迪', nameCn: '比亚迪' },
    { symbol: '002601', name: '龙佰集团', nameCn: '龙佰' },
    { symbol: '002607', name: '亚玛顿', nameCn: '亚玛顿' },
    { symbol: '002624', name: '完美世界', nameCn: '完美' },
    { symbol: '002672', name: '东江环保', nameCn: '东江' },
    { symbol: '002714', name: '牧原股份', nameCn: '牧原' },
    { symbol: '002736', name: '国信证券', nameCn: '国信' },
    { symbol: '002812', name: '恩捷股份', nameCn: '恩捷' },
    { symbol: '002821', name: '凯莱英', nameCn: '凯莱英' },
    { symbol: '002841', name: '视源股份', nameCn: '视源' },
    { symbol: '002916', name: '华大九天', nameCn: '华大九天' },
    { symbol: '002920', name: '鸿霈科技', nameCn: '鸿霈' },
    { symbol: '300001', name: '特锐德', nameCn: '特锐德' },
    { symbol: '300015', name: '爱尔眼科', nameCn: '爱尔' },
    { symbol: '300033', name: '同花顺', nameCn: '同花顺' },
    { symbol: '300059', name: '东方财富', nameCn: '东财' },
    { symbol: '300122', name: '智飞生物', nameCn: '智飞' },
    { symbol: '300124', name: '汇川技术', nameCn: '汇川' },
    { symbol: '300142', name: '沃森生物', nameCn: '沃森' },
    { symbol: '300223', name: '北京君正', nameCn: '君正' },
    { symbol: '300274', name: '阳光电源', nameCn: '阳光' },
    { symbol: '300347', name: '泰格医药', nameCn: '泰格' },
    { symbol: '300364', name: '中文在线', nameCn: '中文' },
    { symbol: '300408', name: '三环集团', nameCn: '三环' },
    { symbol: '300450', name: '先导智能', nameCn: '先导' },
    { symbol: '300496', name: '中科创达', nameCn: '创达' },
    { symbol: '300529', name: '健帆生物', nameCn: '健帆' },
    { symbol: '300567', name: '精测电子', nameCn: '精测' },
    { symbol: '300598', name: '诚迈科技', nameCn: '诚迈' },
    { symbol: '300750', name: '宁德时代', nameCn: '宁德' },
    { symbol: '300759', name: '康龙化成', nameCn: '康龙' },
    { symbol: '300896', name: '爱美客', nameCn: '爱美客' },
    { symbol: '300896', name: '爱尔眼科', nameCn: '爱尔' }
  ]
};

// 搜索函数
function searchStocks(query, market = 'ALL') {
  if (!query || query.trim().length < 1) {
    return [];
  }

  const q = query.trim().toLowerCase();

  let markets = ['US', 'HK', 'CN'];
  if (market !== 'ALL') {
    markets = [market];
  }

  const results = [];

  for (const m of markets) {
    const stocks = STOCK_DATABASE[m] || [];
    for (const stock of stocks) {
      // 匹配逻辑：代码、英文名、中文名
      if (
        stock.symbol.toLowerCase().includes(q) ||
        stock.name.toLowerCase().includes(q) ||
        (stock.nameCn && stock.nameCn.toLowerCase().includes(q))
      ) {
        results.push({
          ...stock,
          market: m,
          marketName: m === 'US' ? '美股' : m === 'HK' ? '港股' : 'A股',
          displayText: `${stock.symbol} - ${stock.nameCn || stock.name}`
        });
      }
    }
  }

  // 按市场排序，然后按匹配程度
  return results.slice(0, 20);
}

// 获取热门股票
function getHotStocks(market = 'ALL', limit = 6) {
  const hotSymbols = {
    US: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA'],
    HK: ['03690', '00700', '09988', '01810', '09618', '00941'],
    CN: ['600036', '600519', '601318', '000858', '000333', '002594']
  };

  let markets = ['US', 'HK', 'CN'];
  if (market !== 'ALL') {
    markets = [market];
  }

  const results = [];

  for (const m of markets) {
    const symbols = hotSymbols[m] || [];
    const stocks = STOCK_DATABASE[m] || [];

    for (const sym of symbols.slice(0, limit)) {
      const stock = stocks.find(s => s.symbol === sym);
      if (stock) {
        results.push({
          ...stock,
          market: m,
          marketName: m === 'US' ? '美股' : m === 'HK' ? '港股' : 'A股',
          displayText: `${stock.symbol} - ${stock.nameCn || stock.name}`
        });
      }
    }
  }

  return results.slice(0, limit);
}

// 导出为全局函数
window.searchStocks = searchStocks;
window.getHotStocks = getHotStocks;
window.STOCK_DATABASE = STOCK_DATABASE;
