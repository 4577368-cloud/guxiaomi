function BirthInfoForm({ birthInfo, setBirthInfo, onSubmit, loading }) {
    const handleChange = (field, value) => {
        setBirthInfo(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">出生信息</h2>
            
            <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">出生年份</label>
                        <input
                            type="number"
                            value={birthInfo.year}
                            onChange={(e) => handleChange('year', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                            placeholder="例如: 1990"
                            required
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium mb-1">出生月份</label>
                        <input
                            type="number"
                            value={birthInfo.month}
                            onChange={(e) => handleChange('month', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                            placeholder="1-12"
                            min="1"
                            max="12"
                            required
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium mb-1">出生日期</label>
                        <input
                            type="number"
                            value={birthInfo.day}
                            onChange={(e) => handleChange('day', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                            placeholder="1-31"
                            min="1"
                            max="31"
                            required
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium mb-1">出生时辰</label>
                        <select
                            value={birthInfo.hour}
                            onChange={(e) => handleChange('hour', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                            required
                        >
                            <option value="">请选择</option>
                            {getHourOptions().map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <label className="flex items-center">
                        <input
                            type="radio"
                            checked={birthInfo.gender === 'male'}
                            onChange={() => handleChange('gender', 'male')}
                            className="mr-2"
                        />
                        男
                    </label>
                    <label className="flex items-center">
                        <input
                            type="radio"
                            checked={birthInfo.gender === 'female'}
                            onChange={() => handleChange('gender', 'female')}
                            className="mr-2"
                        />
                        女
                    </label>
                </div>

                <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                    {loading ? '计算中...' : '开始排盘'}
                </button>
            </form>
        </div>
    );
}