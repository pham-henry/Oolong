import { useEffect, useState } from 'react';
import {
  listReorders,
  runReorderCheck,
  approveReorder,
  dismissReorder,
  completeReorder,
} from '../api/reorders';
import { ReorderRecommendationDTO, RecommendationStatus } from '../api/types';

const STATUS_BADGE: Record<RecommendationStatus, string> = {
  pending: 'badge-warning',
  approved: 'badge-primary',
  dismissed: 'badge-neutral',
  completed: 'badge-success',
  resolved: 'badge-success',
};

const STATUS_LABEL: Record<RecommendationStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  dismissed: 'Dismissed',
  completed: 'Completed',
  resolved: 'Resolved',
};

type Filter = 'all' | 'pending' | 'actioned';

export default function Reorders() {
  const [items, setItems] = useState<ReorderRecommendationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [filter, setFilter] = useState<Filter>('pending');

  async function refresh() {
    setError('');
    try {
      const data = await listReorders();
      setItems(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to load reorder recommendations.');
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function handleRunCheck() {
    setRunning(true);
    setError('');
    setInfo('');
    try {
      const summary = await runReorderCheck();
      setInfo(
        `Checked ${summary.itemsChecked} items — ${summary.newPending.length} new pending, ${summary.resolved.length} resolved.`
      );
      await refresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Run-check failed.');
    } finally {
      setRunning(false);
    }
  }

  async function withAction(id: number, fn: () => Promise<unknown>, label: string) {
    setBusyId(id);
    setError('');
    setInfo('');
    try {
      await fn();
      setInfo(`Recommendation ${label}.`);
      await refresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || `Failed to ${label} recommendation.`);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <span className="spinner" />
      </div>
    );
  }

  const filtered = items.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return r.status === 'pending';
    return r.status !== 'pending';
  });

  const pendingCount = items.filter((r) => r.status === 'pending').length;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Reorder Recommendations</div>
        <div className="page-subtitle">
          Review and act on inventory reorder prompts. Recommendations are auto-generated when stock is low or projected to run out.
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {info && <div className="alert alert-success">{info}</div>}

      <div className="card section">
        <div className="card-header">
          <span className="card-title">
            {pendingCount > 0
              ? `⚠️ ${pendingCount} pending recommendation${pendingCount === 1 ? '' : 's'}`
              : 'All recommendations actioned'}
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleRunCheck}
            disabled={running}
          >
            {running ? 'Running…' : 'Run Check'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['pending', 'actioned', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'pending' ? 'Pending' : f === 'actioned' ? 'Actioned' : 'All'}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14, padding: '16px 4px' }}>
            No recommendations in this view.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Current Stock</th>
                  <th>Days Remaining</th>
                  <th>Recommended Order</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th style={{ width: 220 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isPending = r.status === 'pending';
                  const isApproved = r.status === 'approved';
                  const canDismiss = isPending || isApproved;
                  const canComplete = isPending || isApproved;
                  const busy = busyId === r.id;
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.ingredientName}</td>
                      <td>
                        <span className="badge badge-danger">
                          {r.currentQuantity} {r.unit}
                        </span>
                      </td>
                      <td>
                        {r.daysRemaining >= 999
                          ? '—'
                          : `${r.daysRemaining.toFixed(1)} days`}
                      </td>
                      <td>
                        <strong>
                          {r.recommendedQty.toFixed(0)} {r.unit}
                        </strong>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 260 }}>
                        {r.reason ?? '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() =>
                              withAction(r.id, () => approveReorder(r.id), 'approved')
                            }
                            disabled={busy || !isPending}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() =>
                              withAction(r.id, () => dismissReorder(r.id), 'dismissed')
                            }
                            disabled={busy || !canDismiss}
                          >
                            Dismiss
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() =>
                              withAction(r.id, () => completeReorder(r.id), 'completed')
                            }
                            disabled={busy || !canComplete}
                          >
                            Complete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
