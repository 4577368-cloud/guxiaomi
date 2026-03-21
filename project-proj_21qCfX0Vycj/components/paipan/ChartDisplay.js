function ChartDisplay({ chartData }) {
    return (
        <div className="space-y-6">
            <BasicInfo data={chartData.basicInfo} />
            <PalaceGrid palaces={chartData.palaces} />
            <StarsList stars={chartData.stars} />
        </div>
    );
}