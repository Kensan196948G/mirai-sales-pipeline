import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './auth.tsx';
import { useHashRoute } from './router.tsx';
import { Layout } from './pages/Layout.tsx';
import { LoginPage } from './pages/Login.tsx';
import { DashboardPage } from './pages/Dashboard.tsx';
import { OpportunitiesPage } from './pages/Opportunities.tsx';
import { OpportunityDetailPage } from './pages/OpportunityDetail.tsx';
import { OpportunityFormPage } from './pages/OpportunityForm.tsx';
import { PlansPage } from './pages/Plans.tsx';
import { HealthPage } from './pages/Health.tsx';
import { SnapshotsPage } from './pages/Snapshots.tsx';
import { AdminPage } from './pages/Admin.tsx';
import './styles.css';

const ROUTES = [
  { pattern: /^\/$/, page: DashboardPage },
  { pattern: /^\/opportunities\/new$/, page: OpportunityFormPage },
  { pattern: /^\/opportunities\/(?<oppCode>[^/]+)\/edit$/, page: OpportunityFormPage },
  { pattern: /^\/opportunities\/(?<oppCode>[^/]+)$/, page: OpportunityDetailPage },
  { pattern: /^\/opportunities$/, page: OpportunitiesPage },
  { pattern: /^\/plans$/, page: PlansPage },
  { pattern: /^\/health$/, page: HealthPage },
  { pattern: /^\/snapshots$/, page: SnapshotsPage },
  { pattern: /^\/masters$/, page: () => <AdminPage tab="masters" /> },
  { pattern: /^\/users$/, page: () => <AdminPage tab="users" /> },
  { pattern: /^\/audit$/, page: () => <AdminPage tab="audit" /> },
  { pattern: /^\/settings$/, page: () => <AdminPage tab="settings" /> },
];

function Shell() {
  const { user, loading } = useAuth();
  const route = useHashRoute(ROUTES);

  if (loading) return <div className="empty">読み込み中…</div>;

  if (!user) {
    return <LoginPage />;
  }

  if (!route) {
    window.location.hash = '#/';
    return null;
  }
  const Page = route.page;
  return (
    <Layout>
      <Page params={route.params} />
    </Layout>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Shell />
    </AuthProvider>
  </StrictMode>,
);
