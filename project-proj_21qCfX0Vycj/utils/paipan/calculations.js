async function calculateChart(birthInfo) {
    const { year, month, day, hour, gender } = birthInfo;
    
    const mingGong = calculateMingGong(month, hour);
    const shenGong = calculateShenGong(mingGong);
    const wuxingJu = calculateWuxingJu(year, mingGong);
    const nayin = calculateNayin(year);
    
    const palaces = generatePalaces(mingGong, birthInfo);
    const stars = calculateStars(birthInfo, palaces);
    
    return {
        basicInfo: {
            mingGong,
            shenGong,
            wuxingJu,
            nayin
        },
        palaces,
        stars
    };
}

function calculateMingGong(month, hour) {
    const earthlyBranches = ['zi', 'chou', 'yin', 'mao', 'chen', 'si', 
                            'wu', 'wei', 'shen', 'you', 'xu', 'hai'];
    const monthIndex = parseInt(month) - 1;
    const hourIndex = getHourIndex(hour);
    const index = (14 - monthIndex - hourIndex) % 12;
    return earthlyBranches[index];
}

function calculateShenGong(mingGong) {
    const branches = ['zi', 'chou', 'yin', 'mao', 'chen', 'si',
                     'wu', 'wei', 'shen', 'you', 'xu', 'hai'];
    const index = branches.indexOf(mingGong);
    return branches[(index + 1) % 12];
}

function calculateWuxingJu(year, mingGong) {
    const wuxing = ['水二局', '木三局', '金四局', '土五局', '火六局'];
    return wuxing[year % 5];
}

function calculateNayin(year) {
    const nayin = ['海中金', '炉中火', '大林木', '路旁土', '剑锋金'];
    return nayin[year % 5];
}