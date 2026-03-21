function CapitalPoolCard({ capitalPool, onUpdate }) {
  try {
    const [showEdit, setShowEdit] = React.useState(false);
    const [editData, setEditData] = React.useState({
      usd: capitalPool?.usd || 0,
      hkd: capitalPool?.hkd || 0,
      cny: capitalPool?.cny || 0
    });

    const handleSave = () => {
      onUpdate(editData);
      setShowEdit(false);
    };

    const handleCancel = () => {
      setEditData({
        usd: capitalPool?.usd || 0,
        hkd: capitalPool?.hkd || 0,
        cny: capitalPool?.cny || 0
      });
      setShowEdit(false);
    };

    return (
      <div className="bg-white rounded-lg md:rounded-xl shadow-md border border-gray-300 p-3 md:p-6 mb-4 md:mb-6" data-name="capital-pool-card" data-file="components/CapitalPoolCard.js">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h2 className="text-base md:text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <div className="icon-wallet text-base md:text-lg text-[var(--primary-color)]"></div>
            我的资金池
          </h2>
          <button
            onClick={() => setShowEdit(!showEdit)}
            className="btn btn-sm btn-secondary"
          >
            <div className="icon-edit text-xs"></div>
          </button>
        </div>

        {showEdit ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">美元 (USD)</label>
              <input
                type="number"
                step="0.01"
                value={editData.usd}
                onChange={(e) => setEditData({ ...editData, usd: parseFloat(e.target.value) || 0 })}
                className="input-field"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">港币 (HKD)</label>
              <input
                type="number"
                step="0.01"
                value={editData.hkd}
                onChange={(e) => setEditData({ ...editData, hkd: parseFloat(e.target.value) || 0 })}
                className="input-field"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">人民币 (CNY)</label>
              <input
                type="number"
                step="0.01"
                value={editData.cny}
                onChange={(e) => setEditData({ ...editData, cny: parseFloat(e.target.value) || 0 })}
                className="input-field"
                placeholder="0.00"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} className="btn btn-primary flex-1">保存</button>
              <button onClick={handleCancel} className="btn btn-secondary flex-1">取消</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="text-center p-3 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
              <span className="text-xs text-gray-600 block mb-1">美元</span>
              <p className="text-base md:text-lg font-bold text-green-800">${(capitalPool?.usd || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>
            <div className="text-center p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
              <span className="text-xs text-gray-600 block mb-1">港币</span>
              <p className="text-base md:text-lg font-bold text-blue-800">HK${(capitalPool?.hkd || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>
            <div className="text-center p-3 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg border border-orange-200">
              <span className="text-xs text-gray-600 block mb-1">人民币</span>
              <p className="text-base md:text-lg font-bold text-orange-800">¥{(capitalPool?.cny || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('CapitalPoolCard component error:', error);
    return null;
  }
}