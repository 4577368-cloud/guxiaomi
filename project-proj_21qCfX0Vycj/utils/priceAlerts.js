// 价格提醒工具
const ALERT_STORAGE_KEY = 'stock_price_alerts';

const PRICE_ALERT_DEFAULTS = {
  enabled: false,
  riseThreshold: 5,      // 上涨超过5%提醒
  fallThreshold: 5,       // 下跌超过5%提醒
  absoluteRise: 0,         // 上涨绝对值
  absoluteFall: 0,        // 下跌绝对值
  lastNotified: null      // 上次通知时间
};

// 加载提醒配置
function loadPriceAlerts() {
  try {
    const saved = localStorage.getItem(ALERT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 确保每个股票都有完整的配置
      const alerts = {};
      for (const [symbol, config] of Object.entries(parsed)) {
        alerts[symbol] = { ...PRICE_ALERT_DEFAULTS, ...config };
      }
      return alerts;
    }
  } catch (error) {
    console.error('加载价格提醒失败:', error);
  }
  return {};
}

// 保存提醒配置
function savePriceAlerts(alerts) {
  try {
    localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(alerts));
    console.log('价格提醒配置已保存');
  } catch (error) {
    console.error('保存价格提醒失败:', error);
  }
}

// 更新单个股票提醒配置
function updateStockAlert(symbol, config) {
  const alerts = loadPriceAlerts();
  alerts[symbol] = { ...(alerts[symbol] || PRICE_ALERT_DEFAULTS), ...config };
  savePriceAlerts(alerts);
  return alerts[symbol];
}

// 删除股票提醒
function deleteStockAlert(symbol) {
  const alerts = loadPriceAlerts();
  delete alerts[symbol];
  savePriceAlerts(alerts);
}

// 检查是否应该发送通知
function checkPriceAlert(stock, newPrice, oldPrice) {
  const alerts = loadPriceAlerts();
  const alertConfig = alerts[stock.symbol];

  if (!alertConfig || !alertConfig.enabled) {
    return null;
  }

  const change = newPrice - oldPrice;
  const changePercent = oldPrice > 0 ? (change / oldPrice) * 100 : 0;

  let alertType = null;
  let alertMessage = null;

  // 检查绝对值变化
  if (alertConfig.absoluteRise > 0 && change >= alertConfig.absoluteRise) {
    alertType = 'absolute_rise';
    alertMessage = `${stock.symbol} 上涨 ¥${change.toFixed(2)} (${changePercent.toFixed(2)}%)，达到 ¥${newPrice.toFixed(2)}`;
  }

  if (alertConfig.absoluteFall > 0 && change <= -alertConfig.absoluteFall) {
    alertType = 'absolute_fall';
    alertMessage = `${stock.symbol} 下跌 ¥${Math.abs(change).toFixed(2)} (${changePercent.toFixed(2)}%)，达到 ¥${newPrice.toFixed(2)}`;
  }

  // 检查百分比变化
  if (alertConfig.riseThreshold > 0 && changePercent >= alertConfig.riseThreshold) {
    alertType = 'rise';
    alertMessage = `${stock.symbol} 上涨 ${changePercent.toFixed(2)}%，达到 ¥${newPrice.toFixed(2)}`;
  }

  if (alertConfig.fallThreshold > 0 && changePercent <= -alertConfig.fallThreshold) {
    alertType = 'fall';
    alertMessage = `${stock.symbol} 下跌 ${Math.abs(changePercent).toFixed(2)}%，达到 ¥${newPrice.toFixed(2)}`;
  }

  if (alertType) {
    // 防抖：同一股票5分钟内不重复通知
    const lastNotified = alertConfig.lastNotified;
    if (lastNotified && Date.now() - lastNotified < 5 * 60 * 1000) {
      return null;
    }

    // 更新通知时间
    updateStockAlert(stock.symbol, { lastNotified: Date.now() });

    return {
      type: alertType,
      message: alertMessage,
      symbol: stock.symbol,
      price: newPrice,
      change: change,
      changePercent: changePercent
    };
  }

  return null;
}

// 发送浏览器通知
function sendPriceNotification(alert) {
  if (!('Notification' in window)) {
    console.warn('浏览器不支持通知');
    return false;
  }

  if (Notification.permission === 'granted') {
    const notification = new Notification('股小蜜价格提醒', {
      body: alert.message,
      icon: 'https://app.trickle.so/storage/app/46bdde6b-ce0a-436d-9861-f705820c2391.png',
      tag: `stock-alert-${alert.symbol}`,
      requireInteraction: false,
      silent: false
    });

    notification.onclick = function() {
      window.focus();
      notification.close();
    };

    setTimeout(() => notification.close(), 10000);
    return true;
  } else if (Notification.permission !== 'denied') {
    // 请求权限
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        sendPriceNotification(alert);
      }
    });
  }

  return false;
}

// 请求通知权限
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('浏览器不支持通知');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

// 导出全局函数
window.loadPriceAlerts = loadPriceAlerts;
window.savePriceAlerts = savePriceAlerts;
window.updateStockAlert = updateStockAlert;
window.deleteStockAlert = deleteStockAlert;
window.checkPriceAlert = checkPriceAlert;
window.sendPriceNotification = sendPriceNotification;
window.requestNotificationPermission = requestNotificationPermission;
