function getHourOptions() {
    return [
        { value: '0', label: '子时 (23:00-01:00)' },
        { value: '1', label: '丑时 (01:00-03:00)' },
        { value: '2', label: '寅时 (03:00-05:00)' },
        { value: '3', label: '卯时 (05:00-07:00)' },
        { value: '4', label: '辰时 (07:00-09:00)' },
        { value: '5', label: '巳时 (09:00-11:00)' },
        { value: '6', label: '午时 (11:00-13:00)' },
        { value: '7', label: '未时 (13:00-15:00)' },
        { value: '8', label: '申时 (15:00-17:00)' },
        { value: '9', label: '酉时 (17:00-19:00)' },
        { value: '10', label: '戌时 (19:00-21:00)' },
        { value: '11', label: '亥时 (21:00-23:00)' }
    ];
}

function getHourIndex(hour) {
    return parseInt(hour);
}

function formatDate(year, month, day) {
    return `${year}年${month}月${day}日`;
}

function validateBirthInfo(birthInfo) {
    const { year, month, day, hour } = birthInfo;
    
    if (!year || !month || !day || hour === '') {
        return { valid: false, message: '请填写完整的出生信息' };
    }
    
    if (year < 1900 || year > 2100) {
        return { valid: false, message: '年份范围: 1900-2100' };
    }
    
    if (month < 1 || month > 12) {
        return { valid: false, message: '月份范围: 1-12' };
    }
    
    if (day < 1 || day > 31) {
        return { valid: false, message: '日期范围: 1-31' };
    }
    
    return { valid: true };
}