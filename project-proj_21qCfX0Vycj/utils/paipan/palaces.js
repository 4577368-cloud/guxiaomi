function generatePalaces(mingGong, birthInfo) {
    const palaces = {};
    const branchNames = ['zi', 'chou', 'yin', 'mao', 'chen', 'si',
                        'wu', 'wei', 'shen', 'you', 'xu', 'hai'];
    const palaceNames = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄',
                        '迁移', '奴仆', '官禄', '田宅', '福德', '父母'];
    
    const startIndex = branchNames.indexOf(mingGong);
    
    branchNames.forEach((branch, i) => {
        const palaceIndex = (i - startIndex + 12) % 12;
        palaces[branch] = {
            name: palaceNames[palaceIndex],
            branch: branch,
            stars: []
        };
    });
    
    return palaces;
}

function getPalaceName(branch) {
    const names = {
        'zi': '子', 'chou': '丑', 'yin': '寅', 'mao': '卯',
        'chen': '辰', 'si': '巳', 'wu': '午', 'wei': '未',
        'shen': '申', 'you': '酉', 'xu': '戌', 'hai': '亥'
    };
    return names[branch] || branch;
}