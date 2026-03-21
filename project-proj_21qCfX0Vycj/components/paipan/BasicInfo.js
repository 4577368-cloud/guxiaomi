function BasicInfo({ data }) {
    return (
        <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">基本信息</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                    <div className="text-sm text-gray-500">命宫</div>
                    <div className="font-medium">{data.mingGong}</div>
                </div>
                <div>
                    <div className="text-sm text-gray-500">身宫</div>
                    <div className="font-medium">{data.shenGong}</div>
                </div>
                <div>
                    <div className="text-sm text-gray-500">五行局</div>
                    <div className="font-medium">{data.wuxingJu}</div>
                </div>
                <div>
                    <div className="text-sm text-gray-500">纳音</div>
                    <div className="font-medium">{data.nayin}</div>
                </div>
            </div>
        </div>
    );
}