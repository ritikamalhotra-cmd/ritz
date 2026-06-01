import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/common/Layout';
import { OFFER_STATUS_LABELS, OFFER_STATUS_BADGE } from '../constants/statuses';
import { FileText, CheckSquare, ClipboardList, Users, TrendingUp, ArrowRight } from 'lucide-react';

function StatCard({
  label, value, icon: Icon, color, to,
}: {
  label: string; value: number | string; icon: React.ElementType; color: string; to?: string;
}) {
  const inner = (
    <div className="card p-6 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="flex-1">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
      {to && <ArrowRight size={16} className="text-gray-300" />}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: offerData } = useQuery({
    queryKey: ['offers', 'dashboard'],
    queryFn: () => api.get('/offers', { params: { limit: 5 } }).then((r) => r.data),
  });

  const { data: requisitions = [] } = useQuery<any[]>({
    queryKey: ['requisitions', 'dashboard'],
    queryFn: () => api.get('/requisitions').then((r) => r.data),
  });

  const { data: approvalQueue = [] } = useQuery<any[]>({
    queryKey: ['req-approval-queue', 'dashboard'],
    queryFn: () => api.get('/requisitions/approval-queue').then((r) => r.data),
  });

  const offers = offerData?.offers ?? [];
  const totalOffers = offerData?.pagination?.total ?? 0;
  const openReqs = requisitions.filter((r: any) => ['OPEN', 'APPROVED'].includes(r.status)).length;
  const pendingApprovals = approvalQueue.length;
  const acceptedOffers = offers.filter((o: any) => o.status === 'ACCEPTED').length;

  return (
    <Layout>
      <div className="p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Good {getGreeting()}, {user?.firstName}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Here's what's happening across your talent pipeline.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Open Requisitions" value={openReqs} icon={ClipboardList} color="bg-indigo-500" to="/requisitions" />
          <StatCard label="Pending Approvals" value={pendingApprovals} icon={CheckSquare} color="bg-yellow-500" to="/approvals" />
          <StatCard label="Total Offers" value={totalOffers} icon={FileText} color="bg-brand-700" to="/offers" />
          <StatCard label="Active Pipelines" value={requisitions.filter((r: any) => r.applications?.length > 0 || r.status === 'OPEN').length} icon={TrendingUp} color="bg-green-500" />
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Recent Requisitions */}
          <div className="card">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Recent Requisitions</h2>
              <Link to="/requisitions" className="text-xs text-brand-700 hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-gray-100">
              {requisitions.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-gray-400">No requisitions yet.</div>
              ) : (
                requisitions.slice(0, 5).map((req: any) => (
                  <Link key={req.id} to={`/requisitions/${req.id}`} className="px-6 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors block">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{req.title}</div>
                      <div className="text-xs text-gray-400">{req.department}{req.location ? ` · ${req.location}` : ''}</div>
                    </div>
                    <div className="text-right">
                      <StatusDot status={req.status} />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Recent Offers */}
          <div className="card">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Recent Offers</h2>
              <Link to="/offers" className="text-xs text-brand-700 hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-gray-100">
              {offers.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-gray-400">No offers yet.</div>
              ) : (
                offers.map((o: Record<string, unknown>) => {
                  const candidate = o.candidate as { fullName: string; email: string } | undefined;
                  const status = o.status as string;
                  return (
                    <Link key={o.id as string} to={`/offers/${o.id as string}`} className="px-6 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors block">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{candidate?.fullName}</div>
                        <div className="text-xs text-gray-400">{o.roleTitle as string} · {o.department as string}</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${OFFER_STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {OFFER_STATUS_LABELS[status] ?? status}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'bg-gray-300',
    PENDING_HIRING_MANAGER_APPROVAL: 'bg-yellow-400',
    PENDING_HOD_APPROVAL: 'bg-yellow-400',
    PENDING_HR_HEAD_APPROVAL: 'bg-orange-400',
    PENDING_CEO_APPROVAL: 'bg-red-400',
    APPROVED: 'bg-green-400',
    OPEN: 'bg-blue-400',
    FILLED: 'bg-purple-400',
    CANCELLED: 'bg-red-300',
  };
  const labels: Record<string, string> = {
    DRAFT: 'Draft', APPROVED: 'Approved', OPEN: 'Open', FILLED: 'Filled', CANCELLED: 'Cancelled',
    PENDING_HIRING_MANAGER_APPROVAL: 'Pending HM',
    PENDING_HOD_APPROVAL: 'Pending HOD',
    PENDING_HR_HEAD_APPROVAL: 'Pending HR Head',
    PENDING_CEO_APPROVAL: 'Pending CEO',
  };
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-500">
      <span className={`w-2 h-2 rounded-full ${map[status] ?? 'bg-gray-300'}`} />
      {labels[status] ?? status}
    </span>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
