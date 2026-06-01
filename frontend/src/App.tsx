import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';

const LoginPage           = lazy(() => import('./pages/LoginPage'));
const DashboardPage       = lazy(() => import('./pages/DashboardPage'));
const OfferListPage       = lazy(() => import('./pages/OfferListPage'));
const OfferDraftPage      = lazy(() => import('./pages/OfferDraftPage'));
const ApprovalQueuePage   = lazy(() => import('./pages/ApprovalQueuePage'));
const AdminPage           = lazy(() => import('./pages/AdminPage'));
const CandidateLoginPage       = lazy(() => import('./pages/CandidateLoginPage'));
const CandidatePortalPage      = lazy(() => import('./pages/CandidatePortalPage'));
const RequisitionListPage      = lazy(() => import('./pages/RequisitionListPage'));
const NewRequisitionPage       = lazy(() => import('./pages/NewRequisitionPage'));
const RequisitionDetailPage    = lazy(() => import('./pages/RequisitionDetailPage'));
const PipelinePage             = lazy(() => import('./pages/PipelinePage'));
const AnalyticsPage            = lazy(() => import('./pages/AnalyticsPage'));
const CareersPage              = lazy(() => import('./pages/CareersPage'));

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-700" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Spinner />}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/candidate/login" element={<CandidateLoginPage />} />
            <Route path="/candidate/portal/:caseId" element={<CandidatePortalPage />} />
            <Route path="/candidate/portal" element={<CandidatePortalPage />} />

            {/* Protected staff routes */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/offers" element={<ProtectedRoute><OfferListPage /></ProtectedRoute>} />
            <Route path="/offers/:id" element={<ProtectedRoute><OfferDraftPage /></ProtectedRoute>} />
            <Route path="/requisitions" element={<ProtectedRoute><RequisitionListPage /></ProtectedRoute>} />
            <Route path="/requisitions/new" element={<ProtectedRoute><NewRequisitionPage /></ProtectedRoute>} />
            <Route path="/requisitions/:id" element={<ProtectedRoute><RequisitionDetailPage /></ProtectedRoute>} />
            <Route path="/requisitions/:id/pipeline" element={<ProtectedRoute><PipelinePage /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />

            {/* Public — no auth */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/approvals"
              element={
                <ProtectedRoute roles={['TA_MANAGER', 'HOD', 'HR_HEAD', 'ADMIN', 'SUPER_ADMIN']}>
                  <ApprovalQueuePage />
                </ProtectedRoute>
              }
            />

            <Route path="/careers" element={<CareersPage />} />

            {/* Default */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
