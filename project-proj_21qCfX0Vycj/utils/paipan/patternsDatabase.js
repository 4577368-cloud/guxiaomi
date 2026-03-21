// 格局数据库
const PATTERNS = [
    {
        name: '紫府同宫',
        type: '吉',
        check: (ming, sanfang) => {
            const stars = ming.stars.major.map(s => s.name);
            return stars.includes('紫微') && stars.includes('天府');
        },
        desc: '帝王之格，主权贵富足，一生平顺。',
        poem: '紫府同宫帝座临，一生富贵福禄深'
    },
    {
        name: '府相朝垣',
        type: '吉',
        check: (ming, sanfang) => {
            const mingStars = ming.stars.major.map(s => s.name);
            const allStars = sanfang.flatMap(p => p.stars.major.map(s => s.name));
            return (mingStars.includes('天府') || mingStars.includes('天相')) && 
                   (allStars.includes('天府') || allStars.includes('天相'));
        },
        desc: '财官双美，主富贵双全，事业有成。',
        poem: '府相朝垣格最良，财官双美福禄昌'
    },
    {
        name: '机月同梁',
        type: '中',
        check: (ming, sanfang) => {
            const stars = ming.stars.major.map(s => s.name);
            const hasTwo = ['天机', '太阴', '天同', '天梁'].filter(s => stars.includes(s)).length >= 2;
            return hasTwo;
        },
        desc: '清贵之格，主聪明才智，适合文职。',
        poem: '机月同梁作吏人，清贵之格显才能'
    },
    {
        name: '杀破狼',
        type: '中',
        check: (ming, sanfang) => {
            const allStars = [ming, ...sanfang].flatMap(p => p.stars.major.map(s => s.name));
            return allStars.includes('七杀') && allStars.includes('破军') && allStars.includes('贪狼');
        },
        desc: '变动开创之格，主大起大落，利创业。',
        poem: '杀破狼来会命宫，一生多变动荡中'
    },
    {
        name: '巨门火铃',
        type: '凶',
        check: (ming, sanfang) => {
            const mingStars = ming.stars.major.map(s => s.name);
            const mingMinor = ming.stars.minor.map(s => s.name);
            return mingStars.includes('巨门') && (mingMinor.includes('火星') || mingMinor.includes('铃星'));
        },
        desc: '是非口舌多，易有纠纷争执。',
        poem: '巨门火铃同宫会，口舌是非难回避'
    }
];