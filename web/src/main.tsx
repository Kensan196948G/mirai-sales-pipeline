import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './auth.tsx';
import { ROUTE_META, useHashRoute } from './router.tsx';
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

function Shell() {
  const { user, loading } = useAuth();
  const route = useHashRoute();

  if (loading) return <div className="empty">読み込み中…</div>;

  if (!user) {
    return <LoginPage />;
  }

  const meta = ROUTE_META[route.key] ?? ROUTE_META['/']!;
  const screen = (() => {
    switch (route.key) {
      case '/':
        return <DashboardPage />;
      case '/opportunities':
        return <OpportunitiesPage />;
      case '/opportunities/detail':
        return <OpportunityDetailPage code={route.code ?? ''} />;
      case '/opportunities/new':
        return <OpportunityFormPage code={undefined} isEdit={false} />;
      case '/opportunities/edit':
        return <OpportunityFormPage code={route.code} isEdit={true} />;
      case '/health':
        return <HealthPage />;
      case '/plans':
        return <PlansPage />;
      case '/snapshots':
        return <SnapshotsPage />;
      case '/masters':
        return <AdminPage tab="masters" />;
      case '/users':
        return <AdminPage tab="users" />;
      case '/audit':
        return <AdminPage tab="audit" />;
      case '/settings':
        return <AdminPage tab="settings" />;
      default:
        return <DashboardPage />;
    }
  })();

  return (
    <Layout navKey={meta.nav} crumb={meta.crumb} title={meta.title}>
      {screen}
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
