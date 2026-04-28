import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import WorkerDashboard from './pages/WorkerDashboard';
import SalesEntry from './pages/SalesEntry';
import InventoryEdit from './pages/InventoryEdit';
import OwnerDashboard from './pages/OwnerDashboard';
import Assistant from './pages/Assistant';
import AuditLog from './pages/AuditLog';
import Reorders from './pages/Reorders';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/worker/dashboard" element={<WorkerDashboard />} />
            <Route path="/worker/sales" element={<SalesEntry />} />
            <Route path="/worker/inventory" element={<InventoryEdit />} />
          </Route>

          <Route element={<ProtectedRoute requiredRole="owner" />}>
            <Route path="/owner/dashboard" element={<OwnerDashboard />} />
            <Route path="/owner/reorders" element={<Reorders />} />
            <Route path="/owner/assistant" element={<Assistant />} />
            <Route path="/owner/audit" element={<AuditLog />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
