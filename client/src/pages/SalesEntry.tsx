import { useEffect, useState, FormEvent } from 'react';
import { getRecipes, submitSales } from '../api/sales';
import { Recipe } from '../api/types';

export default function SalesEntry() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getRecipes().then((r) => {
      setRecipes(r);
      const init: Record<number, number> = {};
      r.forEach((recipe) => { init[recipe.id] = 0; });
      setQuantities(init);
    }).finally(() => setLoading(false));
  }, []);

  function setQty(recipeId: number, val: number) {
    setQuantities((prev) => ({ ...prev, [recipeId]: Math.max(0, val) }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const items = Object.entries(quantities).map(([id, qty]) => ({
      recipeId: parseInt(id),
      quantity: qty,
    }));

    setSubmitting(true);
    try {
      await submitSales(items);
      setSuccess('Sales submitted and inventory updated successfully!');
      const reset: Record<number, number> = {};
      recipes.forEach((r) => { reset[r.id] = 0; });
      setQuantities(reset);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to submit sales. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const totalDrinks = Object.values(quantities).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Log Daily Sales</div>
        <div className="page-subtitle">Enter drink counts for today. Inventory will be deducted automatically.</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : (
        <form onSubmit={handleSubmit}>
          {success && <div className="alert alert-success">{success}</div>}
          {error && <div className="alert alert-error">{error}</div>}

          <div className="card">
            <div className="card-header">
              <span className="card-title">Drink Quantities</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total: {totalDrinks} drinks</span>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Drink</th>
                  <th>Ingredients Used per Drink</th>
                  <th style={{ width: 160 }}>Quantity Sold</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => (
                  <tr key={recipe.id}>
                    <td style={{ fontWeight: 500 }}>{recipe.drinkName}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {recipe.ingredients.map((i) => `${i.inventoryItem.name} ×${i.quantity}`).join(', ')}
                    </td>
                    <td>
                      <div className="qty-input-group">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setQty(recipe.id, (quantities[recipe.id] || 0) - 1)}
                          style={{ padding: '4px 10px' }}
                        >−</button>
                        <input
                          type="number"
                          min={0}
                          value={quantities[recipe.id] || 0}
                          onChange={(e) => setQty(recipe.id, parseInt(e.target.value) || 0)}
                        />
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setQty(recipe.id, (quantities[recipe.id] || 0) + 1)}
                          style={{ padding: '4px 10px' }}
                        >+</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={submitting || totalDrinks === 0}>
              {submitting ? <><span className="spinner" /> Submitting...</> : '✓ Submit Sales'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
