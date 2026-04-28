import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell
} from 'recharts';
import { getAnalyticsOverview, getSalesTrends } from '../api/analytics';
import { listPendingReorders } from '../api/reorders';
import { AnalyticsOverview, SalesTrends, ReorderRecommendationDTO } from '../api/types';

export default function OwnerDashboard() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [trends, setTrends] = useState<SalesTrends | null>(null);
  const [pending, setPending] = useState<ReorderRecommendationDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAnalyticsOverview(), getSalesTrends(), listPendingReorders()])
      .then(([o, t, p]) => { setOverview(o); setTrends(t); setPending(p); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>;
  if (!overview || !trends) return null;

  const reorderItems = overview.inventory.filter((i) => i.reorderRecommendations[0]?.reorderNeeded);
  const overstockItems = overview.inventory.filter((i) => i.reorderRecommendations[0]?.isOverstock);
  const lowStockItems = overview.inventory.filter(
    (i) => i.currentQuantity <= i.reorderThreshold + i.safetyStock
  );

  const daysRemainingData = overview.inventory.map((item) => {
    const rec = item.reorderRecommendations[0];
    return {
      name: item.name.replace(' ', '\n'),
      days: rec ? Math.min(rec.daysRemaining, 30) : 30,
      critical: rec ? rec.reorderNeeded : false,
    };
  });

  const salesByDrink = Object.entries(trends.byDrink).map(([name, qty]) => ({ name, qty }));

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Owner Dashboard</div>
        <div className="page-subtitle">Analytics overview for the last 7 days</div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Low Stock Items</div>
          <div className={`stat-value ${lowStockItems.length > 0 ? 'danger' : ''}`}>{lowStockItems.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Reorders</div>
          <div className={`stat-value ${pending.length > 0 ? 'warning' : ''}`}>{pending.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Overstock Alerts</div>
          <div className="stat-value">{overstockItems.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Ingredients</div>
          <div className="stat-value">{overview.inventory.length}</div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="alert alert-warning section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <strong>⚠️ {pending.length} pending reorder{pending.length === 1 ? '' : 's'} need your review.</strong>
            <span style={{ marginLeft: 8 }}>
              {pending.slice(0, 3).map((p) => p.ingredientName).join(', ')}
              {pending.length > 3 ? `, +${pending.length - 3} more` : ''}
            </span>
          </div>
          <Link to="/owner/reorders" className="btn btn-primary btn-sm">
            Review Reorders
          </Link>
        </div>
      )}

      {reorderItems.length > 0 && (
        <div className="card section">
          <div className="card-header">
            <span className="card-title">⚠️ Reorder Recommendations</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Current Stock</th>
                  <th>Avg Daily Use</th>
                  <th>Days Remaining</th>
                  <th>Recommended Order</th>
                </tr>
              </thead>
              <tbody>
                {reorderItems.map((item) => {
                  const rec = item.reorderRecommendations[0];
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 500 }}>{item.name}</td>
                      <td>
                        <span className="badge badge-danger">{item.currentQuantity} {item.unit}</span>
                      </td>
                      <td>{rec.avgDailyUsage.toFixed(1)} {item.unit}/day</td>
                      <td style={{ color: rec.daysRemaining < 3 ? 'var(--danger)' : 'var(--warning)' }}>
                        {rec.daysRemaining >= 999 ? '—' : `${rec.daysRemaining.toFixed(1)} days`}
                      </td>
                      <td><strong>{rec.recommendedQty.toFixed(0)} {item.unit}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid-2 section">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Estimated Days Remaining</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>capped at 30</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={daysRemainingData} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)} days`, 'Days Remaining']} />
              <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                {daysRemainingData.map((entry, i) => (
                  <Cell key={i} fill={entry.critical ? '#9b3320' : '#c4a882'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Sales Last 7 Days</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={salesByDrink} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [v, 'Units Sold']} />
              <Bar dataKey="qty" fill="#a07858" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2 section">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Full Inventory</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Stock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.inventory.map((item) => {
                  const rec = item.reorderRecommendations[0];
                  const isLow = item.currentQuantity <= item.reorderThreshold + item.safetyStock;
                  return (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.currentQuantity} {item.unit}</td>
                      <td>
                        {rec?.isOverstock ? (
                          <span className="badge badge-primary">Overstock</span>
                        ) : isLow ? (
                          <span className="badge badge-danger">Low</span>
                        ) : (
                          <span className="badge badge-success">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Waste & Adjustments</span>
          </div>
          {overview.recentAdjustments.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No adjustments in the last 7 days.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>Delta</th>
                    <th>Type</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentAdjustments.map((adj) => (
                    <tr key={adj.id}>
                      <td>{adj.inventoryItem.name}</td>
                      <td style={{ color: adj.delta < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {adj.delta > 0 ? '+' : ''}{adj.delta} {adj.inventoryItem.unit}
                      </td>
                      <td>
                        <span className={`badge ${adj.type === 'waste' ? 'badge-warning' : 'badge-neutral'}`}>
                          {adj.type}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{adj.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
