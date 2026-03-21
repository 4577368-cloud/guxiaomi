// 七维分析引擎
function getDeepAnalysis(palace, allPalaces, yearGan, daXianAnalysis) {
    const dimensions = {
        '性格特质': analyzePersonality(palace),
        '事业发展': analyzeCareer(palace, allPalaces),
        '财富状况': analyzeWealth(palace, allPalaces),
        '感情婚姻': analyzeLove(palace, allPalaces),
        '健康状况': analyzeHealth(palace),
        '人际关系': analyzeSocial(palace),
        '运势趋向': analyzeTrend(palace, daXianAnalysis)
    };
    
    const summary = generateSummary(palace, dimensions);
    
    return { summary, dimensions };
}

function analyzePersonality(palace) {
    const items = [];
    const majorStars = palace.stars.major.map(s => s.name);
    
    if (majorStars.includes('紫微')) {
        items.push('具有<strong>领导气质</strong>，天生的领袖风范');
    }
    if (majorStars.includes('天机')) {
        items.push('聪明机智，善于<strong>谋略策划</strong>');
    }
    
    return items.length > 0 ? items : ['性格特质分析中...'];
}

function analyzeCareer(palace, allPalaces) {
    return ['事业运势分析中...'];
}

function analyzeWealth(palace, allPalaces) {
    return ['财运分析中...'];
}

function analyzeLove(palace, allPalaces) {
    return ['感情运势分析中...'];
}

function analyzeHealth(palace) {
    return ['健康状况分析中...'];
}

function analyzeSocial(palace) {
    return ['人际关系分析中...'];
}

function analyzeTrend(palace, daXianAnalysis) {
    return ['运势趋向分析中...'];
}

function generateSummary(palace, dimensions) {
    return `<strong>${palace.name}</strong>综合分析：此宫位显示出独特的命理特征...`;
}

function calculateDaXianAnalysis(palaces, virtualAge, gender) {
    const currentDaXianIndex = Math.floor((virtualAge - 1) / 10);
    const currentDaXian = palaces[currentDaXianIndex % 12];
    
    return {
        currentDaXian: {
            palace: currentDaXian,
            range: `${10 + currentDaXianIndex * 10}-${19 + currentDaXianIndex * 10}`
        },
        daXianAnalysis: palaces.map((p, i) => ({
            palace: p.name,
            range: `${10 + i * 10}-${19 + i * 10}`,
            keyFeatures: ['运势特点分析中...'],
            suggestions: ['趋吉避凶建议...']
        }))
    };
}

function getPalaceTransformations(palace) {
    return [];
}

function getSiHuaStyle(type) {
    const styles = {
        '禄': { bg: 'bg-green-500', text: 'text-green-700', border: 'border-green-200' },
        '权': { bg: 'bg-red-500', text: 'text-red-700', border: 'border-red-200' },
        '科': { bg: 'bg-blue-500', text: 'text-blue-700', border: 'border-blue-200' },
        '忌': { bg: 'bg-gray-800', text: 'text-gray-700', border: 'border-gray-200' }
    };
    return styles[type] || styles['禄'];
}

function getBrightnessColor(brightness) {
    const colors = {
        '庙': 'bg-purple-600',
        '旺': 'bg-indigo-600',
        '得': 'bg-blue-500',
        '利': 'bg-green-500',
        '平': 'bg-gray-400',
        '不': 'bg-orange-500',
        '陷': 'bg-red-600'
    };
    return colors[brightness] || 'bg-gray-400';
}

function distributeMinorStars(palaces, year, month, day, hour, gender) {
    // 简化版辅星安放
}

function distributeSiHua(palaces, year) {
    // 简化版四化安放
}