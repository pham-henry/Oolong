import { useEffect, useState } from 'react';
import { getAuditLogs } from '../api/audit';
import { AuditLog } from '../api/types';

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'badge-neutral',
  INVENTORY_EDIT: 'badge-primary',
  WASTE_ADJUSTMENT: 'badge-warning',
  SALES_SUBMISSION: 'badge-success',
  ASSISTANT_QUERY: 'badge-primary',
  THRESHOLD_UPDATE: 'badge-neutral',
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    getAuditLogs(200).then(setLogs).finally(() => setLoading(false));
  }, []);

  const filtered = filter
    ? logs.filter(
        (l) =>
          l.action.toLowerCase().includes(filter.toLowerCase()) ||
          l.user.username.toLowerCase().includes(filter.toLowerCase()) ||
          (l.details || '').toLowerCase().includes(filter.toLowerCase())
      )
    : logs;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Audit Log</div>
        <div className="page-subtitle">System-wide activity log. All important actions are recorded here.</div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Activity ({filtered.length} entries)</span>
          <input
            type="text"
            placeholder="Filter by action, user, or details..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 280, marginLeft: 'auto' }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No entries found.</td></tr>
                ) : (
                  filtered.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 500 }}>{log.user.username}</td>
                      <td>
                        <span className={`badge ${log.user.role === 'owner' ? 'badge-primary' : 'badge-neutral'}`}>
                          {log.user.role}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${ACTION_COLORS[log.action] || 'badge-neutral'}`}>
                          {log.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 400 }}>
                        {log.details || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
