function PositionForm({ stock, position, onAdd, onClose }) {
  const [formData, setFormData] = React.useState({
    price: position?.price || '',
    shares: position?.shares || '',
    date: position?.date || new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.price || !formData.shares) return;

    onAdd({
      price: parseFloat(formData.price),
      shares: parseInt(formData.shares),
      date: formData.date,
      enabled: true
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {position ? '编辑持仓记录' : '添加持仓记录'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <div className="icon-x text-xl"></div>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              买入价格 ({stock.market === 'US' ? 'USD' : 'HKD'})
            </label>
            <input
              type="number"
              step="0.001"
              value={formData.price}
              onChange={(e) => setFormData(prev => ({...prev, price: e.target.value}))}
              className="input-field"
              placeholder="例如: 150.50"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              买入股数
            </label>
            <input
              type="number"
              value={formData.shares}
              onChange={(e) => setFormData(prev => ({...prev, shares: e.target.value}))}
              className="input-field"
              placeholder="例如: 100"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              买入日期
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({...prev, date: e.target.value}))}
              className="input-field"
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={!formData.price || !formData.shares}
            >
              {position ? '更新记录' : '添加记录'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}