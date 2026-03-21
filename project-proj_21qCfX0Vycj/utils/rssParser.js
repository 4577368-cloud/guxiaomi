// RSS feed parser utility

async function fetchRSSFeeds(feedUrls, keywords, maxPerSource = 20, limitAll = false, hoursAgo = 24) {
  const allNews = [];
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
  
  console.log('fetchRSSFeeds 开始，RSS源数量:', feedUrls.length, '每个来源最多:', maxPerSource, '条，近', hoursAgo, '小时');
  
  // Fetch all feeds in parallel with timeout
  const feedPromises = feedUrls.map(feedUrl => {
    console.log('准备获取RSS源:', feedUrl);
    return Promise.race([
      parseFeed(feedUrl, keywords, cutoffDate),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 8000)
      )
    ]).catch(error => {
      console.warn(`跳过RSS源 ${feedUrl}: ${error.message}`);
      return [];
    });
  });
  
  const results = await Promise.all(feedPromises);
  
  console.log('所有RSS源获取完成，结果数量:', results.length);
  
  // Group news by source
  const newsBySource = {};
  results.forEach(newsArray => {
    newsArray.forEach(news => {
      if (!newsBySource[news.sourceName]) {
        newsBySource[news.sourceName] = [];
      }
      newsBySource[news.sourceName].push(news);
    });
  });
  
  // Sort and limit per source
  Object.keys(newsBySource).forEach(source => {
    let sourceNews = newsBySource[source];
    
    // Sort by date
    sourceNews.sort((a, b) => {
      if (!a.pubDate || !b.pubDate) return 0;
      return new Date(b.pubDate) - new Date(a.pubDate);
    });
    
    // Apply per-source limit
    newsBySource[source] = sourceNews.slice(0, maxPerSource);
  });
  
  console.log('每个来源的新闻数:', Object.entries(newsBySource).map(([source, news]) => `${source}: ${news.length}条`));
  
  // Combine all news from all sources
  Object.values(newsBySource).forEach(newsArray => {
    allNews.push(...newsArray);
  });
  
  console.log('合并后总新闻数:', allNews.length);
  
  // If limitAll is true (fetching all sources), limit total to 100
  if (limitAll && allNews.length > 100) {
    allNews.sort((a, b) => {
      if (!a.pubDate || !b.pubDate) return 0;
      return new Date(b.pubDate) - new Date(a.pubDate);
    });
    return allNews.slice(0, 100);
  }
  
  // Sort: keyword-matched first, then by date (newest first)
  const hasKeywords = keywords && keywords.length > 0;
  allNews.sort((a, b) => {
    if (hasKeywords) {
      const aMatch = (a.matchedKeywords && a.matchedKeywords.length > 0) ? 1 : 0;
      const bMatch = (b.matchedKeywords && b.matchedKeywords.length > 0) ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch; // 匹配的在前
    }
    if (!a.pubDate || !b.pubDate) return 0;
    return new Date(b.pubDate) - new Date(a.pubDate);
  });
  
  // 单次最多返回 300 条，保证预览页既有足够数量又不卡顿
  const maxTotal = 300;
  if (allNews.length > maxTotal) return allNews.slice(0, maxTotal);
  return allNews;
}

async function parseFeed(feedUrl, keywords, cutoffDate) {
  try {
    console.log(`parseFeed 开始: ${feedUrl}`);
    const proxyUrl = `https://proxy-api.trickle-app.host/?url=${encodeURIComponent(feedUrl)}`;
    
    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout
    
    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const text = await response.text();
    console.log(`${feedUrl} 响应长度: ${text.length}`);
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');
    
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      console.error(`${feedUrl} XML解析错误:`, parserError.textContent);
      throw new Error('XML解析失败');
    }
    
    let items = xmlDoc.querySelectorAll('item');
    let isAtomFeed = false;
    
    if (items.length === 0) {
      items = xmlDoc.querySelectorAll('entry');
      isAtomFeed = true;
      console.log(`${feedUrl} 检测到Atom格式`);
    }
    
    console.log(`${feedUrl} 找到 ${items.length} 个条目`);
    const news = [];
    
    // Map feed URL to source name
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
      'plink.anyfeeder.com/people/world': '人民日报',
      'plink.anyfeeder.com/weixin/wallstreetcn': '华尔街见闻',
      'plink.anyfeeder.com/tmtpost': '钛媒体',
      'plink.anyfeeder.com/qq': '腾讯新闻',
      'plink.anyfeeder.com/weixin/CBNweekly2008': '第一财经周刊',
      'plink.anyfeeder.com/thepaper': '澎湃新闻',
      'plink.anyfeeder.com/abc': 'ABC新闻',
      'plink.anyfeeder.com/nytimes': '纽约时报',
      'plink.anyfeeder.com/jiemian': '界面新闻',
      'plink.anyfeeder.com/weixin/eeo-com-cn': '经济观察报',
      'plink.anyfeeder.com/weixin/runliu-pub': '润米咨询',
      'plink.anyfeeder.com/weixin/iceo-com-cn': '中国企业家',
      'plink.anyfeeder.com/weixin/LinkedIn-China': 'LinkedIn中国',
      'plink.anyfeeder.com/jingjiribao': '经济日报',
      'plink.anyfeeder.com/chinadaily': '中国日报',
      'plink.anyfeeder.com/weixin/thepapernews': '澎湃新闻',
      'plink.anyfeeder.com/weixin/jjbd21': '经济报道',
      'plink.anyfeeder.com/weixin/meigushe': '美股社',
      'plink.anyfeeder.com/weixin/cctvyscj': '央视财经',
      'plink.anyfeeder.com/sbs/chinese': 'SBS中文',
      'plink.anyfeeder.com/weixin/hqsbwx': '环球时报',
      'cn.wsj.com': '华尔街日报',
      'plink.anyfeeder.com/weixin/caixinwang': '财新网',
      'sellercentral.amazon.com': 'Amazon卖家中心',
      'www.shopify.com/blog': 'Shopify博客',
      'www.reddit.com/r/ecommerce': 'Reddit电商版块'
    };
    
    let sourceName = new URL(feedUrl).hostname;
    for (const [key, value] of Object.entries(sourceMapping)) {
      if (feedUrl.includes(key)) {
        sourceName = value;
        break;
      }
    }
    
    items.forEach(item => {
      let title, description, link, pubDate;
      
      if (isAtomFeed) {
        // Atom feed format
        title = item.querySelector('title')?.textContent || '';
        // Try content first, then summary for description
        description = item.querySelector('content')?.textContent || 
                     item.querySelector('summary')?.textContent || '';
        // Atom link can be in href attribute
        const linkElement = item.querySelector('link');
        link = linkElement?.getAttribute('href') || linkElement?.textContent || '';
        // Atom uses updated or published
        pubDate = item.querySelector('updated')?.textContent || 
                 item.querySelector('published')?.textContent || '';
      } else {
        // RSS 2.0 format
        title = item.querySelector('title')?.textContent || '';
        description = item.querySelector('description')?.textContent || 
                     item.querySelector('content\\:encoded')?.textContent || '';
        link = item.querySelector('link')?.textContent || '';
        pubDate = item.querySelector('pubDate')?.textContent || '';
      }
      
      // Filter by cutoff date (e.g. 48 hours)
      if (pubDate) {
        const newsDate = new Date(pubDate);
        if (newsDate < cutoffDate) {
          return; // Skip items older than cutoff
        }
      }
      
      const cleanDescription = description.replace(/<[^>]*>/g, '').trim();
      
      const matchedKeywords = (keywords && keywords.length > 0) ? keywords.filter(keyword => {
        const lowerKeyword = keyword.toLowerCase();
        const lowerTitle = title.toLowerCase();
        const lowerDesc = cleanDescription.toLowerCase();
        return lowerTitle.includes(lowerKeyword) || lowerDesc.includes(lowerKeyword);
      }) : [];
      
      // 不再只显示匹配项：时间范围内的都显示，匹配的排前面
      news.push({
        title,
        description: cleanDescription.substring(0, 200) + (cleanDescription.length > 200 ? '...' : ''),
        link,
        pubDate,
        source: new URL(feedUrl).hostname,
        sourceName: sourceName,
        matchedKeywords
      });
    });
    
    console.log(`${feedUrl} 解析完成: ${news.length}条匹配新闻，来源名称: ${sourceName}`);
    return news;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`解析RSS源超时 ${feedUrl}`);
    } else if (error.message.includes('Failed to fetch')) {
      console.error(`网络连接失败 ${feedUrl}: 可能是CORS问题或网络不稳定`);
    } else {
      console.error(`解析RSS源失败 ${feedUrl}:`, error);
    }
    return [];
  }
}
