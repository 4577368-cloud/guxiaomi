// 星曜计算函数
function calculateFullChart(birthInfo) {
    const { year, month, day, hour, gender } = birthInfo;
    
    // 计算命宫
    const mingGongZhi = calculateMingGongZhi(month, hour);
    const mingGongGan = calculateMingGongGan(year, mingGongZhi);
    
    // 计算身宫
    const shenGongZhi = calculateShenGongZhi(month, hour);
    
    // 计算五行局
    const wuxingJu = calculateWuXingJu(mingGongGan, mingGongZhi);
    
    // 计算纳音
    const nayin = calculateNaYin(year);
    
    // 生成宫位
    const palaces = generatePalaces(mingGongZhi, mingGongGan, year, month, day, hour, gender, wuxingJu);
    
    // 计算年干
    const yearGan = TIAN_GAN[(year - 4) % 10];
    
    return {
        basicInfo: {
            name: '命盘',
            mingGong: DI_ZHI[mingGongZhi],
            shenGong: DI_ZHI[shenGongZhi],
            wuxingJu: Object.keys(WU_XING_JU).find(k => WU_XING_JU[k] === wuxingJu) || '水二局',
            nayin: nayin
        },
        palaces: palaces,
        yearGan: yearGan
    };
}

function calculateMingGongZhi(month, hour) {
    const monthZhi = parseInt(month) - 1;
    const hourZhi = Math.floor((parseInt(hour) + 1) / 2) % 12;
    return (14 - monthZhi - hourZhi + 12) % 12;
}

function calculateShenGongZhi(month, hour) {
    const monthZhi = parseInt(month) - 1;
    const hourZhi = Math.floor((parseInt(hour) + 1) / 2) % 12;
    return (2 + monthZhi + hourZhi) % 12;
}

function calculateMingGongGan(year, zhiIndex) {
    const yearGanIndex = (year - 4) % 10;
    const ganIndex = (yearGanIndex * 2 + zhiIndex) % 10;
    return ganIndex;
}

function calculateWuXingJu(ganIndex, zhiIndex) {
    const juTable = [
        [2,5,5,5,5,5,5,5,5,2,2,2],
        [2,5,5,5,5,5,5,5,5,2,2,2],
        [6,3,3,3,3,6,6,6,6,6,6,3],
        [6,3,3,3,3,6,6,6,6,6,6,3],
        [5,4,4,4,4,4,4,4,4,5,5,5],
        [5,4,4,4,4,4,4,4,4,5,5,5],
        [5,4,4,4,4,4,4,4,4,5,5,5],
        [5,4,4,4,4,4,4,4,4,5,5,5],
        [2,5,5,5,5,5,5,5,5,2,2,2],
        [2,5,5,5,5,5,5,5,5,2,2,2]
    ];
    return juTable[ganIndex][zhiIndex];
}

function calculateNaYin(year) {
    return NA_YIN[(year - 4) % 60 % 30];
}