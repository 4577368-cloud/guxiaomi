function PositionForm({ stock, position, onAdd, onClose }) {
  var s = stock && typeof stock === "object" ? stock : {};
  var market = s.market === "US" ? "US" : s.market === "CN" ? "CN" : "HK";
  const [formData, setFormData] = React.useState({
    price: position?.price || '',
    shares: position?.shares || '',
    date: position?.date || new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.price || !formData.shares) return;

    var pr = parseFloat(formData.price);
    var sh = parseInt(formData.shares, 10);
    if (!Number.isFinite(pr) || pr < 0 || !Number.isFinite(sh) || sh <= 0) return;

    onAdd({
      price: pr,
      shares: sh,
      date: formData.date,
      enabled: true
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-panel mx-auto max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-slate-900">
            {position ? '编辑持仓记录' : '添加持仓记录'}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/60 hover:text-slate-600">
            <div className="icon-x text-xl"></div>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              买入价格 ({market === "US" ? "USD" : market === "CN" ? "CNY" : "HKD"})
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