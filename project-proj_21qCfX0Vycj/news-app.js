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
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">出现错误</h1>
            <button onClick={() => window.location.reload()} className="btn btn-primary">
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

(function () {
  var q = new URLSearchParams(window.location.search);
  var api = q.get('apiPort') || q.get('api') || '';
  if (!api || window.ANALYSIS_API_BASE) return;
  if (/^https?:\/\//i.test(api)) {
    window.ANALYSIS_API_BASE = api;
    return;
  }
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') {
    window.ANALYSIS_API_BASE = 'http://localhost:' + api;
  }
})();
var _h = typeof location !== 'undefined' ? location.hostname : '';
const API_BASE =
  window.ANALYSIS_API_BASE ||
  (_h === 'localhost' || _h === '127.0.0.1'
    ? 'http://localhost:8123'
    : typeof location !== 'undefined' && location.origin
      ? location.origin
      : '');

var CLIENT_RSS_FEEDS = [
  'https://plink.anyfeeder.com/zaobao/realtime/china',
  'https://plink.anyfeeder.com/zaobao/realtime/world',
  'https://plink.anyfeeder.com/bbc/cn',
  'https://plink.anyfeeder.com/fortunechina',
  'https://plink.anyfeeder.com/weixin/cctvnewscenter',
  'https://plink.anyfeeder.com/guangmingribao',
  'https://plink.anyfeeder.com/people-daily',
  'https://plink.anyfeeder.com/weixin/wallstreetcn',
  'https://plink.anyfeeder.com/tmtpost',
  'https://plink.anyfeeder.com/jiemian/finance',
  'https://plink.anyfeeder.com/jiemian/business',
  'https://plink.anyfeeder.com/jingjiribao',
  'https://plink.anyfeeder.com/chinadaily/world',
  'https://plink.anyfeeder.com/weixin/caixinwang',
  'https://cn.wsj.com/zh-hans/rss',
  'https://plink.anyfeeder.com/weixin/thepapernews',
  'https://plink.anyfeeder.com/weixin/cctvyscj',
  'https://plink.anyfeeder.com/weixin/hqsbwx'
];

function parseNewsUrlParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    code: q.get('code') || '',
    market: q.get('market') || 'A 股',
    name: q.get('name') || '',
    keywords: (q.get('keywords') || '').split(',').map(k => k.trim()).filter(Boolean),
    from: q.get('from') || ''
  };
}

function getReturnTarget(fallback) {
  const q = new URLSearchParams(window.location.search);
  const from = q.get('from') || '';
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
  const target = getReturnTarget('index.html');
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

function NewsApp() {
  const [newsList, setNewsList] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isCopying, setIsCopying] = React.useState(false);
  const [urlParams] = React.useState(parseNewsUrlParams());
  const [keywordInput, setKeywordInput] = React.useState('');

  const fetchNewsFromClient = React.useCallback(async (overrideKeyword) => {
    setIsLoading(true);
    try {
      var keywords = [];
      if (overrideKeyword !== undefined) {
        var one = overrideKeyword ? String(overrideKeyword).trim() : '';
        keywords = one ? [one] : [];
      } else {
        if (urlParams.name) keywords.push(urlParams.name);
        if (urlParams.code) keywords.push(urlParams.code);
        keywords = keywords.concat(urlParams.keywords || []);
        keywords = keywords.filter(Boolean);
      }
      if (typeof fetchRSSFeeds !== 'function') {
        throw new Error('RSS 脚本未加载，请刷新页面');
      }
      var raw = await fetchRSSFeeds(CLIENT_RSS_FEEDS, keywords, 30, false, 72);
      var items = (raw || []).map(function (it) {
        return {
          title: it.title || '',
          description: it.description || '',
          sourceName: it.sourceName || it.source || '',
          link: it.link || '',
          pub_date: it.pubDate || '',
          matchedKeywords: it.matchedKeywords || []
        };
      });
      setNewsList(items);
    } catch (e) {
      console.error('获取新闻失败:', e);
      alert('获取新闻失败：' + (e.message || '请检查网络或稍后重试'));
    } finally {
      setIsLoading(false);
    }
  }, [urlParams.code, urlParams.name, urlParams.keywords]);

  const fetchNewsFromAPI = fetchNewsFromClient;

  React.useEffect(() => {
    if (urlParams.code || urlParams.name) {
      fetchNewsFromAPI(undefined);
    }
  }, []);

  React.useEffect(function () {
    if (!window.GuxiaomiChat) return;
    var query = [urlParams.name, urlParams.code]
      .concat(urlParams.keywords || [])
      .filter(Boolean)
      .join(' ');
    window.GuxiaomiChat.setContext({
      page: 'news',
      scopeKey: (urlParams.code || 'all') + '|news',
      title: urlParams.code
        ? (urlParams.name || urlParams.code) + ' · 新闻'
        : '新闻订阅',
      news: {
        query: query,
        stockCode: urlParams.code || '',
        headlines: (newsList || []).slice(0, 8).map(function (n) {
          return n && n.title;
        }).filter(Boolean),
      },
    });
  }, [urlParams, newsList]);

  const copyNews = async () => {
    if (newsList.length === 0) {
      alert('没有新闻可以复制');
      return;
    }
    setIsCopying(true);
    try {
      let content = `📰 新闻 (${newsList.length}条，近72小时)\n`;
      content += `生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
      content += '='.repeat(80) + '\n\n';
      newsList.forEach((news, index) => {
        const cleanTitle = (news.title || '').replace(/<[^>]*>/g, '').trim();
        const cleanDesc = (news.description || '').replace(/<[^>]*>/g, '').trim();
        content += `${index + 1}. ${cleanTitle}\n`;
        content += `   来源: ${news.sourceName || ''}\n`;
        content += `   简介: ${cleanDesc}\n`;
        content += `   链接: ${news.link || ''}\n`;
        content += `\n${'='.repeat(80)}\n\n`;
      });
      await navigator.clipboard.writeText(content);
      alert('✅ 新闻内容已复制到剪贴板');
    } catch (error) {
      console.error('复制失败:', error);
      alert('❌ 复制失败，请稍后重试');
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white shadow-lg">
            <div className="p-3 md:p-6">
              <NewsPreview 
                newsList={newsList}
                isLoading={isLoading}
                isCopying={isCopying}
                urlParams={urlParams}
                keywordInput={keywordInput}
                setKeywordInput={setKeywordInput}
                onFetchNews={() => fetchNewsFromAPI(undefined)}
                onFetchByKeyword={() => fetchNewsFromAPI(keywordInput)}
                onCopyNews={copyNews}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function NewsPreview({ newsList, isLoading, isCopying, urlParams, keywordInput, setKeywordInput, onFetchNews, onFetchByKeyword, onCopyNews }) {
  const [selectedSource, setSelectedSource] = React.useState(null);
  const keywordResults = React.useMemo(() =>
    newsList.filter(function (n) { return (n.matchedKeywords || []).length > 0; }),
    [newsList]
  );
  const regularResults = React.useMemo(() =>
    newsList.filter(function (n) { return (n.matchedKeywords || []).length === 0; }),
    [newsList]
  );
  const sources = React.useMemo(function () {
    var set = {};
    newsList.forEach(function (n) { if (n.sourceName) set[n.sourceName] = true; });
    return Object.keys(set).sort();
  }, [newsList]);
  const filterBySource = function (list) {
    return selectedSource ? list.filter(function (n) { return n.sourceName === selectedSource; }) : list;
  };
  const keywordFiltered = filterBySource(keywordResults);
  const regularFiltered = filterBySource(regularResults);

  return (
    <div className="flex flex-col min-h-[50vh] md:h-auto">
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-sm md:text-lg font-bold flex items-center gap-1.5">
            新闻预览
            {(urlParams.code || urlParams.name) && (
              <span className="text-xs font-normal text-gray-500">
                {urlParams.code}{urlParams.name ? ` ${urlParams.name}` : ''} · 近72小时 · 每源最多30条
              </span>
            )}
          </h2>
          <div className="flex flex-wrap gap-1.5 items-center">
            <button onClick={onFetchNews} disabled={isLoading} className="btn btn-primary btn-sm disabled:opacity-50">
              {isLoading ? '获取中' : '获取'}
            </button>
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onFetchByKeyword(); }}
              placeholder="按关键词获取"
              className="w-28 px-2 py-1 text-sm border border-gray-300 rounded"
            />
            <button type="button" onClick={onFetchByKeyword} disabled={isLoading} className="btn btn-secondary btn-sm disabled:opacity-50">
              按关键词获取
            </button>
            <button onClick={onCopyNews} disabled={newsList.length === 0 || isCopying} className="btn btn-secondary btn-sm disabled:opacity-50">
              {isCopying ? '复制中' : '复制'}
            </button>
            <button type="button" onClick={goBackToSource} className="btn btn-secondary btn-sm">
              返回
            </button>
          </div>
        </div>
      </div>

      {newsList.length > 0 && !isLoading && sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span className="text-xs text-gray-500 self-center mr-1">来源：</span>
          <button
            type="button"
            onClick={() => setSelectedSource(null)}
            className={`px-2.5 py-1 text-xs rounded-full border ${selectedSource === null ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
          >
            全部
          </button>
          {sources.map(function (s) {
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedSource(s)}
                className={`px-2.5 py-1 text-xs rounded-full border ${selectedSource === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}

      {newsList.length === 0 && !isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <p className="text-sm text-gray-600 mb-2">
              {(urlParams.code || urlParams.name)
                ? '暂无新闻或加载失败。请点击「获取」重试。'
                : '从股票卡片点击「新闻」进入，或输入关键词后点击「按关键词获取」'}
            </p>
            {(urlParams.code || urlParams.name) && (
              <p className="text-xs text-gray-400">
                新闻由浏览器通过代理拉取 RSS，与修改前一致。若始终无内容请检查网络或稍后重试。
              </p>
            )}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="icon-loader text-4xl text-[var(--primary-color)] animate-spin"></div>
        </div>
      )}

      {!isLoading && newsList.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 mb-3 pb-2 border-b border-gray-200">关键词结果</h3>
            {keywordFiltered.length === 0 ? (
              <p className="text-sm text-gray-500">暂无匹配关键词的新闻</p>
            ) : (
              <div className="space-y-3">
                {keywordFiltered.map(function (news, index) { return <NewsItem key={'kw-' + index} news={news} />; })}
              </div>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 mb-3 pb-2 border-b border-gray-200">常规新闻</h3>
            {regularFiltered.length === 0 ? (
              <p className="text-sm text-gray-500">暂无常规新闻</p>
            ) : (
              <div className="space-y-3">
                {regularFiltered.map(function (news, index) { return <NewsItem key={'reg-' + index} news={news} />; })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NewsItem({ news }) {
  const cleanText = (text) => {
    return text.replace(/<[^>]*>/g, '').trim();
  };

  return (
    <div className="p-4 border border-gray-200 rounded-xl bg-white hover:shadow-lg transition-shadow">
      <h3 className="font-bold text-base md:text-lg text-gray-900 mb-3 leading-snug">
        {cleanText(news.title)}
      </h3>
      <p className="text-sm text-gray-600 mb-3 leading-relaxed line-clamp-3">
        {cleanText(news.description)}
      </p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded border border-green-200 font-medium">
            {news.sourceName}
          </span>
          {(news.matchedKeywords || []).map((keyword, i) => (
            <span 
              key={i} 
              className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200"
            >
              {keyword}
            </span>
          ))}
        </div>
        <a
          href={news.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 whitespace-nowrap flex-shrink-0 font-medium"
        >
          详情
          <div className="icon-external-link text-sm"></div>
        </a>
      </div>
    </div>
  );
}

function _NewsConfigUnused({ config, setConfig, onSave }) {
  const [newRssFeed, setNewRssFeed] = React.useState('');
  const [newKeyword, setNewKeyword] = React.useState('');
  const [newRecipient, setNewRecipient] = React.useState('');
  const [testingFeed, setTestingFeed] = React.useState(false);
  const [testResult, setTestResult] = React.useState(null);

  const testRssFeed = async (feedUrl) => {
    if (!feedUrl.trim()) {
      alert('请先输入RSS订阅源地址');
      return;
    }

    setTestingFeed(true);
    setTestResult(null);

    try {
      const proxyUrl = `https://proxy-api.trickle-app.host/?url=${encodeURIComponent(feedUrl)}`;
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
      
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMsg = '';
        if (response.status === 404) {
          errorMsg = 'RSS源不存在或地址错误 (404)';
        } else if (response.status === 503) {
          errorMsg = 'RSS源暂时不可用，请稍后重试 (503)';
        } else if (response.status === 403) {
          errorMsg = 'RSS源拒绝访问 (403)';
        } else if (response.status === 500) {
          errorMsg = 'RSS源服务器错误 (500)';
        } else {
          errorMsg = `HTTP错误 ${response.status}`;
        }
        throw new Error(errorMsg);
      }

      const text = await response.text();
      
      if (!text || text.trim().length === 0) {
        throw new Error('RSS源返回空内容');
      }
      
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');

      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        throw new Error('RSS源格式无效，无法解析XML');
      }

      let items = xmlDoc.querySelectorAll('item');
      if (items.length === 0) {
        items = xmlDoc.querySelectorAll('entry');
      }

      if (items.length === 0) {
        throw new Error('RSS源中未找到任何新闻条目');
      }

      setTestResult({
        success: true,
        message: `✅ 测试成功！找到 ${items.length} 条新闻`,
        itemCount: items.length
      });
    } catch (error) {
      console.error('RSS测试失败:', error);
      
      let errorMessage = error.message;
      if (error.name === 'AbortError') {
        errorMessage = '请求超时，RSS源响应太慢';
      }
      
      setTestResult({
        success: false,
        message: `❌ 测试失败: ${errorMessage}`
      });
    } finally {
      setTestingFeed(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <div className="icon-settings text-lg text-blue-600"></div>
        订阅配置
      </h2>

      <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
        <RSSFeedsSection 
          feeds={config.rssFeeds}
          newFeed={newRssFeed}
          setNewFeed={setNewRssFeed}
          onUpdate={(feeds) => setConfig({ ...config, rssFeeds: feeds })}
          testingFeed={testingFeed}
          testResult={testResult}
          onTestFeed={() => testRssFeed(newRssFeed)}
        />

        <KeywordsSection
          keywords={config.keywords}
          newKeyword={newKeyword}
          setNewKeyword={setNewKeyword}
          onUpdate={(keywords) => setConfig({ ...config, keywords })}
        />

        <div>
          <label className="block text-sm font-medium mb-2">收件邮箱</label>
          <div className="space-y-2">
            {config.recipientEmails.map((email, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="flex-1 px-3 py-2 text-sm border rounded-lg bg-gray-50"
                />
                <button
                  onClick={() => {
                    const newEmails = config.recipientEmails.filter((_, i) => i !== index);
                    setConfig({ ...config, recipientEmails: newEmails });
                  }}
                  className="btn btn-danger"
                >
                  <div className="icon-trash-2 text-sm"></div>
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                type="email"
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                placeholder="添加收件邮箱"
                className="flex-1 px-3 py-2 text-sm border rounded-lg"
              />
              <button
                onClick={() => {
                  if (newRecipient.trim()) {
                    setConfig({ 
                      ...config, 
                      recipientEmails: [...config.recipientEmails, newRecipient.trim()] 
                    });
                    setNewRecipient('');
                  }
                }}
                className="btn btn-success"
              >
                <div className="icon-plus text-sm"></div>
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">自动获取并发送时间</label>
          <input
            type="time"
            value={config.scheduleTime}
            onChange={(e) => setConfig({ ...config, scheduleTime: e.target.value })}
            className="w-full px-3 py-2 text-sm border rounded-lg"
          />
          <p className="text-xs text-gray-500 mt-1">
            系统将在设定时间自动获取新闻并发送邮件
          </p>
        </div>

        <button onClick={onSave} className="w-full btn btn-primary">
          保存配置
        </button>
      </div>
    </div>
  );
}

function RSSFeedsSection({ feeds, newFeed, setNewFeed, onUpdate, testingFeed, testResult, onTestFeed }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  const getSourceNameFromUrl = (feedUrl) => {
    const sourceMapping = {
      'plink.anyfeeder.com/zaobao': '联合早报',
      'rsshub.app/zaobao': '联合早报',
      'plink.anyfeeder.com/voa': 'VOA',
      'plink.anyfeeder.com/fortunechina': '财富中文网',
      'plink.anyfeeder.com/reuters': '路透社',
      'plink.anyfeeder.com/bbc': 'BBC',
      'plink.anyfeeder.com/weixin/cctvnewscenter': '央视新闻',
      'plink.anyfeeder.com/guangmingribao': '光明日报',
      'plink.anyfeeder.com/people-daily': '人民日报',
      'plink.anyfeeder.com/weixin/wallstreetcn': '华尔街见闻',
      'plink.anyfeeder.com/tmtpost': '钛媒体',
      'plink.anyfeeder.com/qq': '腾讯新闻',
      'plink.anyfeeder.com/weixin/CBNweekly2008': '第一财经周刊',
      'plink.anyfeeder.com/thepaper': '澎湃新闻',
      'plink.anyfeeder.com/abc': 'ABC新闻',
      'plink.anyfeeder.com/nytimes': '纽约时报',
      'www.reddit.com/r/ecommerce': 'Reddit电商版块'
    };
    
    for (const [key, value] of Object.entries(sourceMapping)) {
      if (feedUrl.includes(key)) {
        return value;
      }
    }
    
    return new URL(feedUrl).hostname;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium">RSS订阅源 ({feeds.length})</label>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          {isExpanded ? (
            <>
              <span>收起</span>
              <div className="icon-chevron-up text-xs"></div>
            </>
          ) : (
            <>
              <span>展开</span>
              <div className="icon-chevron-down text-xs"></div>
            </>
          )}
        </button>
      </div>
      
      {isExpanded && (
        <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
          {feeds.map((feed, index) => (
          <div key={index} className="flex items-center gap-3 p-2 border rounded-lg bg-gray-50">
            <div className="flex-shrink-0 min-w-[100px]">
              <span className="text-sm font-semibold text-gray-900">{getSourceNameFromUrl(feed)}</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <a 
                href={feed}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate block"
                title={feed}
              >
                {feed}
              </a>
            </div>
            <button
              onClick={() => onUpdate(feeds.filter((_, i) => i !== index))}
              className="btn btn-danger btn-sm flex-shrink-0"
            >
              删除
            </button>
          </div>
        ))}
        </div>
      )}
      
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={newFeed}
            onChange={(e) => setNewFeed(e.target.value)}
            placeholder="添加RSS订阅源"
            className="flex-1 px-3 py-2 text-sm border rounded-lg"
          />
          <button
            onClick={onTestFeed}
            disabled={testingFeed || !newFeed.trim()}
            className="btn btn-secondary disabled:opacity-50 flex items-center gap-1"
            title="测试RSS源"
          >
            {testingFeed ? (
              <>
                <div className="icon-loader text-sm animate-spin"></div>
                <span className="hidden sm:inline">测试中</span>
              </>
            ) : (
              <>
                <div className="icon-check-circle text-sm"></div>
                <span className="hidden sm:inline">测试</span>
              </>
            )}
          </button>
          <button
            onClick={() => {
              if (newFeed.trim()) {
                onUpdate([...feeds, newFeed.trim()]);
                setNewFeed('');
              }
            }}
            className="btn btn-success"
          >
            <div className="icon-plus text-sm"></div>
          </button>
        </div>
        {testResult && (
          <div className={`p-2 rounded text-sm ${
            testResult.success 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  );
}

function KeywordsSection({ keywords, newKeyword, setNewKeyword, onUpdate }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">关键词</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {keywords.map((keyword, index) => (
          <span key={index} className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm flex items-center gap-2">
            {keyword}
            <button
              onClick={() => onUpdate(keywords.filter((_, i) => i !== index))}
              className="text-blue-600 hover:text-blue-800"
            >
              <div className="icon-x text-xs"></div>
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          placeholder="添加关键词"
          className="flex-1 px-3 py-2 text-sm border rounded-lg"
        />
        <button
          onClick={() => {
            if (newKeyword.trim()) {
              onUpdate([...keywords, newKeyword.trim()]);
              setNewKeyword('');
            }
          }}
          className="btn btn-success"
        >
          <div className="icon-plus text-sm"></div>
        </button>
      </div>
    </div>
  );
}



const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <NewsApp />
  </ErrorBoundary>
);