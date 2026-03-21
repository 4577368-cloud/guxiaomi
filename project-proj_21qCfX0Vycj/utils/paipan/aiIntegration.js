// AI集成模块
function generateAIPrompt(chartData, birthInfo) {
    const prompt = `请作为一位资深的紫微斗数大师，为以下命盘提供深度分析：

出生信息：${birthInfo.year}年${birthInfo.month}月${birthInfo.day}日${birthInfo.hour}时
性别：${birthInfo.gender === 'male' ? '男' : '女'}
命宫：${chartData.basicInfo.mingGong}
五行局：${chartData.basicInfo.wuxingJu}

请从以下方面进行分析：
1. 各宫位的详细解读
2. 生年四化的影响
3. 大限运势的起伏

请用专业但易懂的语言进行分析。`;
    
    return prompt;
}

async function callDeepSeekAI(apiKey, prompt) {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: '你是一位精通紫微斗数的命理大师' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7
        })
    });
    
    const data = await response.json();
    
    // 解析返回结果
    return parseAIResponse(data.choices[0].message.content);
}

function parseAIResponse(content) {
    return {
        palaces: {
            '命宫': { content: content.substring(0, 200) }
        },
        siHua: [
            { title: '禄', content: '分析中...', desc: '详细解读...' }
        ],
        daXian: [
            { range: '10-19', palace: '命宫', note: '运势分析...' }
        ]
    };
}