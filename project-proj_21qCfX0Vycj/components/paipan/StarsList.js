function StarsList({ stars }) {
    return (
        <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">星曜详情</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(stars).map(([category, starList]) => (
                    <div key={category}>
                        <h3 className="font-medium mb-2">{category}</h3>
                        <div className="space-y-1">
                            {starList.map((star, i) => (
                                <div key={i} className="text-sm text-gray-600">
                                    {star.name} - {star.palace}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}