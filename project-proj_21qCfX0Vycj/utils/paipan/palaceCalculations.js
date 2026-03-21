// 宫位计算和星曜安放
function generatePalaces(mingZhi, mingGan, year, month, day, hour, gender, wuxingJu) {
    const palaces = [];
    const palaceNames = ['命宫', '父母', '福德', '田宅', '官禄', '奴仆', '迁移', '疾厄', '财帛', '子女', '夫妻', '兄弟'];
    
    for (let i = 0; i < 12; i++) {
        const zhiIndex = (mingZhi + i) % 12;
        const ganIndex = (mingGan + Math.floor((mingZhi + i) / 2.4)) % 10;
        
        palaces.push({
            name: palaceNames[i],
            stem: TIAN_GAN[ganIndex],
            zhi: DI_ZHI[zhiIndex],
            zhiIndex: zhiIndex,
            stars: { major: [], minor: [] },
            changSheng: CHANG_SHENG[(zhiIndex + wuxingJu) % 12],
            boShi: BO_SHI[(parseInt(month) - 1 + zhiIndex) % 12],
            suiQian: SUI_QIAN[zhiIndex],
            daXian: `${10 + i * 10}-${19 + i * 10}`
        });
    }
    
    // 安放主星
    distributeMajorStars(palaces, mingZhi, month, day);
    
    // 安放辅星煞星
    distributeMinorStars(palaces, year, month, day, hour, gender);
    
    // 安放四化
    distributeSiHua(palaces, year);
    
    return palaces;
}

function distributeMajorStars(palaces, mingZhi, month, day) {
    // 紫微星系安放
    const ziWeiPos = Math.floor((parseInt(day) - 1) / 2.5) % 12;
    const ziWeiPalaceIndex = palaces.findIndex(p => p.zhiIndex === ziWeiPos);
    if (ziWeiPalaceIndex >= 0) {
        palaces[ziWeiPalaceIndex].stars.major.push({ name: '紫微', type: 'ziwei', brightness: '庙' });
        
        // 天机星（紫微系）
        const tianJiPos = (ziWeiPos + 1) % 12;
        const tianJiIndex = palaces.findIndex(p => p.zhiIndex === tianJiPos);
        if (tianJiIndex >= 0) {
            palaces[tianJiIndex].stars.major.push({ name: '天机', type: 'major', brightness: '旺' });
        }
    }
    
    // 天府星系安放
    const tianFuPos = (ziWeiPos + 6) % 12;
    const tianFuPalaceIndex = palaces.findIndex(p => p.zhiIndex === tianFuPos);
    if (tianFuPalaceIndex >= 0) {
        palaces[tianFuPalaceIndex].stars.major.push({ name: '天府', type: 'tianfu', brightness: '庙' });
        
        // 太阴星（天府系）
        const taiYinPos = (tianFuPos + 1) % 12;
        const taiYinIndex = palaces.findIndex(p => p.zhiIndex === taiYinPos);
        if (taiYinIndex >= 0) {
            palaces[taiYinIndex].stars.major.push({ name: '太阴', type: 'major', brightness: '旺' });
        }
    }
}

function distributeMinorStars(palaces, year, month, day, hour, gender) {
    // 简化版辅星安放
    const monthZhi = parseInt(month) - 1;
    palaces.forEach((palace, idx) => {
        if (idx % 3 === 0) {
            palace.stars.minor.push({ name: '文昌', type: 'minor' });
        }
        if (idx % 4 === 1) {
            palace.stars.minor.push({ name: '文曲', type: 'minor' });
        }
    });
}

function distributeSiHua(palaces, year) {
    // 简化版四化安放
    const yearGanIndex = (year - 4) % 10;
    const siHuaMap = {
        0: ['廉贞', '破军', '武曲', '太阳'],
        1: ['天机', '天梁', '紫微', '太阴']
    };
    
    const transforms = siHuaMap[yearGanIndex % 2] || siHuaMap[0];
    palaces.forEach(palace => {
        palace.stars.major.forEach(star => {
            if (transforms.includes(star.name)) {
                const idx = transforms.indexOf(star.name);
                star.sihua = ['禄', '权', '科', '忌'][idx];
            }
        });
    });
}

function getBrightnessColor(brightness) {
    const colors = {
        '庙': 'bg-yellow-500',
        '旺': 'bg-green-500',
        '得': 'bg-blue-500',
        '利': 'bg-teal-500',
        '平': 'bg-gray-400',
        '陷': 'bg-red-500'
    };
    return colors[brightness] || 'bg-gray-300';
}

function getSiHuaStyle(type) {
    const styles = {
        '禄': { bg: 'bg-green-600' },
        '权': { bg: 'bg-blue-600' },
        '科': { bg: 'bg-yellow-600' },
        '忌': { bg: 'bg-red-600' }
    };
    return styles[type] || { bg: 'bg-gray-500' };
}

function getPalaceTransformations(palace) {
    const transformations = [];
    palace.stars.major.forEach(star => {
        if (star.sihua) {
            transformations.push({ name: star.name, type: star.sihua });
        }
    });
    return transformations;
}
