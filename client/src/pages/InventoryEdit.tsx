import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getInventory, adjustInventory, updateThresholds } from '../api/inventory';
import { InventoryItem } from '../api/types';

export default function InventoryEdit() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [adjType, setAdjType] = useState<'manual' | 'waste'>('manual');
  const [thresholdEditing, setThresholdEditing] = useState<number | null>(null);
  const [newThreshold, setNewThreshold] = useState('');
  const [newSafety, setNewSafety] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getInventory().then(setInventory).finally(() => setLoading(false));
  }, []);

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleAdjust(item: InventoryItem) {
    const d = parseFloat(delta);
    if (isNaN(d) || d === 0) { showMsg('error', 'Enter a non-zero quantity.'); return; }
    if (!reason.trim()) { showMsg('error', 'Reason is required.'); return; }

    setSaving(true);
    try {
      const result = await adjustInventory(item.id, d, reason.trim(), adjType);
      setInventory((prev) => prev.map((i) => i.id === item.id ? { ...i, currentQuantity: result.item.currentQuantity } : i));
      setEditingId(null);
      setDelta('');
      setReason('');
      showMsg('success', `${item.name} updated to ${result.item.currentQuantity} ${item.unit}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showMsg('error', msg || 'Failed to update inventory.');
    } finally {
      setSaving(false);
    }
  }

  async function handleThresholdUpdate(item: InventoryItem) {
    const t = parseFloat(newThreshold);
    const s = parseFloat(newSafety);
    if (isNaN(t) || isNaN(s) || t < 0 || s < 0) { showMsg('error', 'Enter valid non-negative numbers.'); return; }

    setSaving(true);
    try {
      const updated = await updateThresholds(item.id, t, s);
      setInventory((prev) => prev.map((i) => i.id === item.id ? { ...i, reorderThreshold: updated.reorderThreshold, safetyStock: updated.safetyStock } : i));
      setThresholdEditing(null);
      showMsg('success', `Thresholds updated for ${item.name}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showMsg('error', msg || 'Failed to update thresholds.');
    } finally {
      setSaving(false);
    }
  }

  const isLow = (item: InventoryItem) => item.currentQuantity <= item.reorderThreshold + item.safetyStock;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Inventory</div>
        <div className="page-subtitle">Adjust quantities, log waste, or update reorder thresholds.</div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>{message.text}</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Current Stock</th>
                  <th>Reorder Threshold</th>
                  <th>Safety Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => (
                  <>
                    <tr key={item.id}>
                      <td style={{ fontWeight: 500 }}>{item.name}</td>
                      <td>
                        <strong>{item.currentQuantity}</strong> {item.unit}
                      </td>
                      <td>{item.reorderThreshold} {item.unit}</td>
                      <td>{item.safetyStock} {item.unit}</td>
                      <td>
                        {isLow(item) ? (
                          <span className="badge badge-danger">Low Stock</span>
                        ) : (
                          <span className="badge badge-success">OK</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setEditingId(editingId === item.id ? null : item.id);
                              setThresholdEditing(null);
                              setDelta('');
                              setReason('');
                            }}
                          >
                            Adjust
                          </button>
                          {user?.role === 'owner' && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => {
                                setThresholdEditing(thresholdEditing === item.id ? null : item.id);
                                setEditingId(null);
                                setNewThreshold(String(item.reorderThreshold));
                                setNewSafety(String(item.safetyStock));
                              }}
                            >
                              Thresholds
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {editingId === item.id && (
                      <tr key={`edit-${item.id}`}>
                        <td colSpan={6} style={{ background: 'var(--surface-2)', padding: 16 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px auto', gap: 12, alignItems: 'end' }}>
                            <div>
                              <label>Delta (+ or −)</label>
                              <input
                                type="number"
                                value={delta}
                                onChange={(e) => setDelta(e.target.value)}
                                placeholder="e.g. -5 or 20"
                              />
                            </div>
                            <div>
                              <label>Reason</label>
                              <input
                                type="text"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="e.g. Delivery received, Spilled..."
                              />
                            </div>
                            <div>
                              <label>Type</label>
                              <select value={adjType} onChange={(e) => setAdjType(e.target.value as 'manual' | 'waste')}>
                                <option value="manual">Manual</option>
                                <option value="waste">Waste</option>
                              </select>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => handleAdjust(item)} disabled={saving}>
                                {saving ? <span className="spinner" /> : 'Save'}
                              </button>
                              <button className="btn btn-outline btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {thresholdEditing === item.id && (
                      <tr key={`thresh-${item.id}`}>
                        <td colSpan={6} style={{ background: 'var(--surface-2)', padding: 16 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '180px 180px auto', gap: 12, alignItems: 'end' }}>
                            <div>
                              <label>Reorder Threshold ({item.unit})</label>
                              <input type="number" min={0} value={newThreshold} onChange={(e) => setNewThreshold(e.target.value)} />
                            </div>
                            <div>
                              <label>Safety Stock ({item.unit})</label>
                              <input type="number" min={0} value={newSafety} onChange={(e) => setNewSafety(e.target.value)} />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => handleThresholdUpdate(item)} disabled={saving}>
                                {saving ? <span className="spinner" /> : 'Save'}
                              </button>
                              <button className="btn btn-outline btn-sm" onClick={() => setThresholdEditing(null)}>Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
