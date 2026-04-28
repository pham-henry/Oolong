import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from './Layout';

interface Props {
  requiredRole?: 'owner' | 'worker';
}

export default function ProtectedRoute({ requiredRole }: Props) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={user.role === 'owner' ? '/owner/dashboard' : '/worker/dashboard'} replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
