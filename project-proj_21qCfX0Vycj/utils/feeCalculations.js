// Fee calculation utilities for different brokers and markets

function getBrokerFeeStructure(brokerChannel, market) {
  const structures = {
    futu: {
      HK: {
        '经纪佣金': '0.03%',
        '最低收费': 'HK$3/笔',
        '平台使用费': 'HK$15/笔',
        '联交所交易费': '0.00565%',
        '交易征费': '0.0027%',
        '过户费': '股数÷1000向上取整×HK$1.50',
        '印花税': '0.1% (仅卖出)'
      },
      US: {
        '经纪佣金': '$0 (免佣金)',
        '平台使用费': '$0.005/股，最低$1，最高0.99%*交易金额',
        '交易活动费': '$0.000166/股，最低$0.01，最高$8.3 (仅卖出)',
        '交收费': '$0.003/股，最高交易额7%',
        '审计跟踪费': '$0.000046/股，最低$0.01'
      }
    },
    longbridge: {
      HK: {
        '平台使用费': 'HK$15/笔',
        '印花税': '0.1%，不足1港元按1港元计费，向上取整',
        '交易费': '0.00565%，最低0.01HKD',
        '交易征费': '0.0027%，最低0.01HKD',
        '财局交易征费': '0.00015%，最低0.01HKD',
        '交收费': '0.0042%'
      },
      US: {
        '平台使用费': '$0.005/股，最低$1，最高0.99%*交易金额',
        '交易活动费': '$0.000166/股，最低$0.01，最高$8.3 (仅卖出)',
        '交收费': '$0.003/股，最高7%*交易金额',
        '审计跟踪费': '$0.000046/股，最低$0.01'
      }
    },
    boc: {
      HK: {
        '经纪佣金': '0.03%',
        '印花税': '0.1%，不足1港元按1港元计费，向上取整',
        '交易费': '0.00565%',
        '交易征费': '0.0027%',
        '财局交易征费': '0.00015%，最低0.01HKD',
        '交收费': '0.0042%'
      },
      US: {
        '经纪佣金': '$0.02/股，最低$5/笔'
      }
    }
  };
  
  return structures[brokerChannel]?.[market] || {};
}

function calculateBuyFees(brokerChannel, market, price, shares) {
  const amount = price * shares;
  let fees = {};
  
  if (brokerChannel === 'futu') {
    if (market === 'HK') {
      fees.commission = Math.max(amount * 0.0003, 3);
      fees.platformFee = 15;
      fees.exchangeFee = amount * 0.0000565;
      fees.tradingLevy = amount * 0.000027;
      fees.transferFee = Math.ceil(shares / 1000) * 1.5;
    } else {
      // 美股买入：平台费、审计跟踪费、交收费
      // 平台费: $0.005/股，最低$1，最高0.99%*交易金额
      fees.platformFee = Math.min(Math.max(shares * 0.005, 1), amount * 0.0099);
      // 审计跟踪费: $0.000046/股，最低$0.01
      fees.auditTrailFee = Math.max(shares * 0.000046, 0.01);
      // 交收费: $0.003/股，最高交易额7%
      fees.settlementFee = Math.min(shares * 0.003, amount * 0.07);
    }
    } else if (brokerChannel === 'longbridge') {
    if (market === 'HK') {
      // 长桥港股买入：印花税+平台费+审计跟踪费+交收费+交易活动费 (用户描述有误，港股无交易活动费和审计跟踪费)
      // 实际应为：印花税+交易费+交易征费+财局交易征费+平台费+交收费
      fees.platformFee = 15;
      // 印花税：0.1%，不足1港元按1港元计费，向上取整
      const stampDutyRaw = amount * 0.001;
      fees.stampDuty = stampDutyRaw < 1 ? 1 : Math.ceil(stampDutyRaw);
      // 交易费：0.00565%，最低0.01HKD
      fees.exchangeFee = Math.max(amount * 0.0000565, 0.01);
      // 交易征费：0.0027%，最低0.01HKD
      fees.tradingLevy = Math.max(amount * 0.000027, 0.01);
      // 财局交易征费：0.00015%，最低0.01HKD
      fees.sfcLevy = Math.max(amount * 0.0000015, 0.01);
      // 交收费：0.0042%
      fees.settlementFee = amount * 0.000042;
    } else {
      // 美股买入：平台费+审计跟踪费+交收费
      fees.platformFee = Math.min(Math.max(shares * 0.005, 1), amount * 0.0099);
      fees.auditTrailFee = Math.max(shares * 0.000046, 0.01);
      fees.settlementFee = Math.min(shares * 0.003, amount * 0.07);
    }
  } else if (brokerChannel === 'boc') {
    if (market === 'HK') {
      // 中银港股买入：佣金+印花税+交易费+交易征费+财局交易征费+交收费
      fees.commission = amount * 0.0003; // 佣金：0.03%
      // 印花税：0.1%，不足1港元按1港元计费，向上取整
      const stampDutyRaw = amount * 0.001;
      fees.stampDuty = stampDutyRaw < 1 ? 1 : Math.ceil(stampDutyRaw);
      // 交易费：0.00565%
      fees.tradingFee = amount * 0.0000565;
      // 交易征费：0.0027%
      fees.tradingLevy = amount * 0.000027;
      // 财局交易征费：0.00015%，最低0.01HKD
      fees.sfcLevy = Math.max(amount * 0.0000015, 0.01);
      // 交收费：0.0042%
      fees.settlementFee = amount * 0.000042;
    } else {
      // 中银美股买入：佣金$0.02/股，最低$5/笔
      fees.commission = Math.max(shares * 0.02, 5);
    }
  }
  
  return fees;
}

function calculateSellFees(brokerChannel, market, price, shares) {
  const amount = price * shares;
  let fees = {};
  
  if (brokerChannel === 'futu') {
    if (market === 'HK') {
      // 港股卖出：印花税+财局交易征费+交易费+交易征费+平台费
      fees.platformFee = 15;
      // 印花税：0.1%，不足1港元按1港元计费，向上取整
      const stampDutyRaw = amount * 0.001;
      fees.stampDuty = stampDutyRaw < 1 ? 1 : Math.ceil(stampDutyRaw);
      // 交易费：0.00565%，最低0.01HKD
      fees.exchangeFee = Math.max(amount * 0.0000565, 0.01);
      // 交易征费：0.0027%，最低0.01HKD
      fees.tradingLevy = Math.max(amount * 0.000027, 0.01);
      // 财局交易征费：0.00015%，最低0.01HKD
      fees.sfcLevy = Math.max(amount * 0.0000015, 0.01);
    } else {
      // 美股卖出：平台费+审计跟踪费+交收费+交易活动费
      fees.platformFee = Math.min(Math.max(shares * 0.005, 1), amount * 0.0099);
      fees.auditTrailFee = Math.max(shares * 0.000046, 0.01);
      fees.settlementFee = Math.min(shares * 0.003, amount * 0.07);
      fees.tradingActivityFee = Math.min(Math.max(shares * 0.000166, 0.01), 8.3);
    }
  } else if (brokerChannel === 'longbridge') {
    if (market === 'HK') {
      fees.commission = 0; // 经纪佣金改为0%
      fees.platformFee = 15;
      fees.exchangeFee = amount * 0.0000565;
      fees.tradingLevy = amount * 0.000027;
      fees.sfcLevy = amount * 0.0000015; // 财局交易征费0.00015%
      fees.transferFee = Math.ceil(shares / 1000) * 1.5;
      fees.stampDuty = Math.ceil(amount * 0.001); // 印花税0.1%，向上取整
      fees.settlementFee = Math.min(Math.max(amount * 0.000042, 2), 400); // 交收费0.0042%，最低$2，最高$400
    } else {
      fees.platformFee = Math.max(shares * 0.0049, 0.99);
      fees.secFee = Math.max(amount * 0.0000051, 0.01);
      fees.finraFee = Math.min(Math.max(shares * 0.000145, 0.01), 7.27);
    }
  } else if (brokerChannel === 'boc') {
    if (market === 'HK') {
      // 中银港股卖出：佣金+印花税+交易费+交易征费+财局交易征费+交收费
      fees.commission = amount * 0.0003; // 佣金：0.03%
      // 印花税：0.1%，不足1港元按1港元计费，向上取整
      const stampDutyRaw = amount * 0.001;
      fees.stampDuty = stampDutyRaw < 1 ? 1 : Math.ceil(stampDutyRaw);
      // 交易费：0.00565%
      fees.tradingFee = amount * 0.0000565;
      // 交易征费：0.0027%
      fees.tradingLevy = amount * 0.000027;
      // 财局交易征费：0.00015%，最低0.01HKD
      fees.sfcLevy = Math.max(amount * 0.0000015, 0.01);
      // 交收费：0.0042%
      fees.settlementFee = amount * 0.000042;
    } else {
      // 中银美股卖出：佣金$0.02/股，最低$5/笔
      fees.commission = Math.max(shares * 0.02, 5);
    }
  }
  
  return fees;
}