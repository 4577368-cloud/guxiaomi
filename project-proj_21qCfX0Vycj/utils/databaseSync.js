// Database synchronization utilities for Trickle Database

// Save portfolio to cloud database
async function savePortfolioDB(portfolio) {
  try {
    console.log('保存投资组合到云端数据库...');
    
    const existingStocks = await trickleListObjects('portfolio_stock', 100, true);
    const existingMap = new Map();
    for (const item of existingStocks.items) {
      const data = item.objectData;
      const key = `${data.market}_${data.symbol}`;
      existingMap.set(key, item.objectId);
    }
    
    const updatedCount = { created: 0, updated: 0, deleted: 0 };
    
    const stockKeys = new Set();
    for (const stock of portfolio) {
      const key = `${stock.market}_${stock.symbol}`;
      stockKeys.add(key);
      
      const data = {
        symbol: stock.symbol,
        market: stock.market,
        brokerChannel: stock.brokerChannel,
        currentPrice: stock.currentPrice || 0,
        marketData: JSON.stringify(stock.marketData || {}),
        technicalIndicators: JSON.stringify(stock.technicalIndicators || {}),
        positions: JSON.stringify(stock.positions || [])
      };
      
      if (existingMap.has(key)) {
        await trickleUpdateObject('portfolio_stock', existingMap.get(key), data);
        updatedCount.updated++;
      } else {
        await trickleCreateObject('portfolio_stock', data);
        updatedCount.created++;
      }
    }
    
    for (const [key, objectId] of existingMap) {
      if (!stockKeys.has(key)) {
        await trickleDeleteObject('portfolio_stock', objectId);
        updatedCount.deleted++;
      }
    }
    
    console.log(`投资组合已保存到云端: 创建${updatedCount.created}条，更新${updatedCount.updated}条，删除${updatedCount.deleted}条`);
    return true;
  } catch (error) {
    console.warn('保存投资组合到云端失败，数据已保存到本地:', error.message);
    return false;
  }
}

// Load portfolio from cloud database
async function loadPortfolioDB() {
  try {
    console.log('从云端数据库加载投资组合...');
    
    const result = await trickleListObjects('portfolio_stock', 100, true);
    
    // Validate response
    if (!result || !result.items || !Array.isArray(result.items)) {
      console.warn('云端数据格式无效或为空');
      return null;
    }
    
    const portfolio = result.items.map(item => {
      try {
        return {
          id: item.objectId,
          symbol: item.objectData.symbol,
          market: item.objectData.market,
          brokerChannel: item.objectData.brokerChannel,
          currentPrice: item.objectData.currentPrice,
          marketData: JSON.parse(item.objectData.marketData || '{}'),
          technicalIndicators: JSON.parse(item.objectData.technicalIndicators || '{}'),
          positions: JSON.parse(item.objectData.positions || '[]')
        };
      } catch (parseError) {
        console.error('解析单个股票数据失败:', parseError);
        return null;
      }
    }).filter(item => item !== null);
    
    console.log(`从云端加载了 ${portfolio.length} 只股票`);
    return portfolio;
  } catch (error) {
    console.warn('从云端加载投资组合失败，将使用本地数据:', error.message);
    return null;
  }
}

// Save ziwei report to cloud database
async function saveZiweiReportDB(reportName, reportData) {
  try {
    console.log(`保存紫微报告到云端: ${reportName}`);
    
    // Check if report with same name exists
    const existing = await trickleListObjects('ziwei_report', 100, true);
    const existingReport = existing.items.find(
      item => item.objectData.reportName === reportName
    );
    
    const data = {
      reportName: reportName,
      inputText: reportData.inputText || '',
      basicReport: reportData.basicReport || '',
      wealthReport: reportData.wealthReport || '',
      portfolioReport: reportData.portfolioReport || '',
      stockReport: reportData.stockReport || '',
      model: reportData.model || '同源分析模型'
    };
    
    if (existingReport) {
      await trickleUpdateObject('ziwei_report', existingReport.objectId, data);
    } else {
      await trickleCreateObject('ziwei_report', data);
    }
    
    console.log('紫微报告已保存到云端');
    return true;
  } catch (error) {
    console.error('保存紫微报告到云端失败:', error);
    return false;
  }
}

// Load ziwei reports from cloud database
async function loadZiweiReportsDB() {
  try {
    console.log('从云端数据库加载紫微报告...');
    
    const result = await trickleListObjects('ziwei_report', 100, true);
    
    // Validate response
    if (!result || !result.items || !Array.isArray(result.items)) {
      console.warn('云端紫微报告数据格式无效或为空');
      return null;
    }
    
    const reports = result.items.map(item => ({
      timeName: item.objectData.reportName,
      input: item.objectData.inputText,
      timestamp: item.createdAt,
      basicReport: item.objectData.basicReport,
      wealthReport: item.objectData.wealthReport,
      portfolioReport: item.objectData.portfolioReport,
      stockReport: item.objectData.stockReport,
      model: item.objectData.model
    }));
    
    console.log(`从云端加载了 ${reports.length} 份报告`);
    return reports;
  } catch (error) {
    console.error('从云端加载紫微报告失败:', error);
    return null;
  }
}

// Delete ziwei report from cloud database
async function deleteZiweiReportDB(reportName) {
  try {
    console.log(`从云端删除紫微报告: ${reportName}`);
    
    const existing = await trickleListObjects('ziwei_report', 100, true);
    const report = existing.items.find(
      item => item.objectData.reportName === reportName
    );
    
    if (report) {
      await trickleDeleteObject('ziwei_report', report.objectId);
      console.log('报告已从云端删除');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('从云端删除紫微报告失败:', error);
    return false;
  }
}

// Export all data
async function exportAllData() {
  try {
    const portfolio = await loadPortfolioDB();
    const reports = await loadZiweiReportsDB();
    
    const exportData = {
      exportTime: new Date().toISOString(),
      version: '1.0',
      portfolio: portfolio || [],
      ziweiReports: reports || []
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `guxiaomi_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    console.log('数据导出成功');
    return true;
  } catch (error) {
    console.error('数据导出失败:', error);
    return false;
  }
}