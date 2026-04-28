import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getInventory } from '../api/inventory';
import { getRecentSales } from '../api/sales';
import { InventoryItem, DailySales } from '../api/types';

export default function WorkerDashboard() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<DailySales[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getInventory(), getRecentSales()])
      .then(([inv, s]) => { setInventory(inv); setSales(s); })
      .finally(() => setLoading(false));
  }, []);

  const lowStockCount = inventory.filter(
    (i) => i.currentQuantity <= i.reorderThreshold + i.safetyStock
  ).length;

  const todaysSales = sales[0];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Welcome back, {user?.username}</div>
        <div className="page-subtitle">Today's overview</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Inventory Items</div>
              <div className="stat-value">{inventory.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Low Stock Alerts</div>
              <div className={`stat-value ${lowStockCount > 0 ? 'danger' : ''}`}>{lowStockCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Sales Logs (7 days)</div>
              <div className="stat-value">{sales.length}</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <span className="card-title">Quick Actions</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Link to="/worker/sales" className="btn btn-primary">☕ Log Today's Sales</Link>
                <Link to="/worker/inventory" className="btn btn-outline">📦 Adjust Inventory</Link>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Low Stock Warnings</span>
              </div>
              {lowStockCount === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>All items are sufficiently stocked.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <tbody>
                      {inventory
                        .filter((i) => i.currentQuantity <= i.reorderThreshold + i.safetyStock)
                        .map((item) => (
                          <tr key={item.id}>
                            <td>{item.name}</td>
                            <td>
                              <span className="badge badge-danger">
                                {item.currentQuantity} {item.unit}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {todaysSales && (
            <div className="card" style={{ marginTop: 24 }}>
              <div className="card-header">
                <span className="card-title">Most Recent Sales Entry</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(todaysSales.date).toLocaleDateString()}
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Drink</th>
                      <th>Qty Sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todaysSales.items.map((si) => (
                      <tr key={si.id}>
                        <td>{si.recipe.drinkName}</td>
                        <td>{si.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
