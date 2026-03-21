function calculateStars(birthInfo, palaces) {
    const stars = {
        '主星': [],
        '辅星': [],
        '煞星': [],
        '吉星': []
    };
    
    const majorStars = calculateMajorStars(birthInfo);
    const supportStars = calculateSupportStars(birthInfo);
    const maleficStars = calculateMaleficStars(birthInfo);
    const luckyStars = calculateLuckyStars(birthInfo);
    
    stars['主星'] = majorStars;
    stars['辅星'] = supportStars;
    stars['煞星'] = maleficStars;
    stars['吉星'] = luckyStars;
    
    distributeStarsToPalaces(stars, palaces);
    
    return stars;
}

function calculateMajorStars(birthInfo) {
    return [
        { name: '紫微', palace: '命宫' },
        { name: '天机', palace: '兄弟' },
        { name: '太阳', palace: '夫妻' }
    ];
}

function calculateSupportStars(birthInfo) {
    return [
        { name: '文昌', palace: '命宫' },
        { name: '文曲', palace: '财帛' }
    ];
}

function calculateMaleficStars(birthInfo) {
    return [
        { name: '擎羊', palace: '疾厄' },
        { name: '陀罗', palace: '迁移' }
    ];
}

function calculateLuckyStars(birthInfo) {
    return [
        { name: '左辅', palace: '官禄' },
        { name: '右弼', palace: '田宅' }
    ];
}

function distributeStarsToPalaces(stars, palaces) {
    Object.values(stars).flat().forEach(star => {
        const palace = Object.values(palaces).find(p => p.name === star.palace);
        if (palace) {
            palace.stars.push(star.name);
        }
    });
}