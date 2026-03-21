function PalaceGrid({ palaces }) {
    const palaceOrder = [
        'si', 'wu', 'wei', 'shen',
        'mao', null, null, 'you',
        'yin', null, null, 'xu',
        'chou', 'zi', 'hai', 'xu'
    ];

    return (
        <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">命盘十二宫</h2>
            <div className="grid grid-cols-4 gap-2">
                {palaceOrder.map((palace, index) => (
                    <PalaceCell key={index} palace={palace} data={palaces[palace]} />
                ))}
            </div>
        </div>
    );
}