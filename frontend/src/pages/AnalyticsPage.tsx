import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import Layout from '../components/common/Layout';
import { useAuth } from '../context/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { TrendingUp, Users, Briefcase, Clock, CheckCircle, FileText } from 'lucide-react';

const COLORS = ['#e31837', '#1d4ed8', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

const STAGE_LABELS: Record<string, string> = {
  APPLIED: 'Applied', SCREENING: 'Screening', RECRUITER_CALL: 'Recruiter Call',
  HM_REVIEW: 'HM Review', INTERVIEW: 'Interview', DEBRIEF: 'Debrief',
  OFFER_DISCUSSION: 'Offer Discussion', OFFER: 'Offer',
  JOINED: 'Joined', REJECTED: 'Rejected',
};

const REQ_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', APPROVED: 'Approved', OPEN: 'Open', FILLED: 'Filled',
  CANCELLED: 'Cancelled', PENDING_HOD_APPROVAL: 'Pending HOD',
  PENDING_HR_HEAD_APPROVAL: 'Pending HR Head', PENDING_CEO_APPROVAL: 'Pending CEO',
  PENDING_HIRING_MANAGER_APPROVAL: 'Pending HM',
};

export default function AnalyticsPage() {
  const { user } = useAuth();

  const { data: overview, isLoading } = useQuery<any>({
    queryKey: ['analytics-overview'],
    queryFn: () => api.get('/analytics/overview').then((r) => r.data),
  });

  const { data: recruiterData } = useQuery<any>({
    queryKey: ['analytics-recruiter'],
    queryFn: () => api.get('/analytics/recruiter').then((r) => r.data),
    enabled: ['RECRUITER', 'TA_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? ''),
  });

  if (isLoading) {
    return <Layout><div className="p-8 text-center text-gray-400">Loading analytics…</div></Layout>;
  }

  const pipelineData = (overview?.pipeline?.byStage ?? [])
    .map((s: any) => ({ name: STAGE_LABELS[s.stage] ?? s.stage, count: s._count.id }))
    .sort((a: any, b: any) => {
      const order = Object.keys(STAGE_LABELS);
      return order.indexOf(Object.entries(STAGE_LABELS).find(([, v]) => v === a.name)?.[0] ?? '') -
             order.indexOf(Object.entries(STAGE_LABELS).find(([, v]) => v === b.name)?.[0] ?? '');
    });

  const reqStatusData = (overview?.requisitions?.byStatus ?? [])
    .map((s: any) => ({ name: REQ_STATUS_LABELS[s.status] ?? s.status, value: s._count.id }));

  const reqDeptData = (overview?.requisitions?.byDept ?? [])
    .map((s: any) => ({ name: s.department, count: s._count.id }));

  const offerStatusData = (overview?.offers?.byStatus ?? [])
    .map((s: any) => ({ name: s.status.replace(/_/g, ' '), value: s._count.id }));

  const metrics = [
    { label: 'Open Requisitions', value: overview?.requisitions?.byStatus?.find((s: any) => s.status === 'OPEN')?._count?.id ?? 0, icon: Briefcase, color: 'bg-blue-500' },
    { label: 'Active Candidates', value: overview?.pipeline?.total ?? 0, icon: Users, color: 'bg-indigo-500' },
    { label: 'Offers Created', value: overview?.offers?.total ?? 0, icon: FileText, color: 'bg-brand-700' },
    { label: 'Accepted This Cycle', value: overview?.offers?.acceptanceRate ? `${overview.offers.acceptanceRate}%` : '—', icon: CheckCircle, color: 'bg-green-500' },
    { label: 'Avg Days to Offer', value: overview?.timeToHire?.avgDaysToOffer ?? '—', icon: Clock, color: 'bg-yellow-500' },
    { label: 'Offers This Month', value: overview?.offers?.thisMonth ?? 0, icon: TrendingUp, color: 'bg-purple-500' },
  ];

  return (
    <Layout>
      <div className="p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Talent pipeline & offer metrics</p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="card p-4">
              <div className={`w-8 h-8 rounded-lg ${m.color} flex items-center justify-center mb-3`}>
                <m.icon size={16} className="text-white" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{m.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-2 gap-6">
          {/* Pipeline funnel */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Candidate Pipeline Funnel</h2>
            {pipelineData.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No pipeline data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={pipelineData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#e31837" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Requisition status pie */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Requisitions by Status</h2>
            {reqStatusData.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No requisition data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={reqStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {reqStatusData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-2 gap-6">
          {/* Reqs by department */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Hiring by Department</h2>
            {reqDeptData.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={reqDeptData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Offer status pie */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Offer Status Breakdown</h2>
            {offerStatusData.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No offer data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={offerStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                    {offerStatusData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recruiter view */}
        {recruiterData && (
          <div className="grid grid-cols-2 gap-6">
            <div className="card p-5">
              <h2 className="font-semibold text-gray-800 mb-4">My Requisitions</h2>
              {recruiterData.myReqs?.length === 0 ? (
                <div className="text-sm text-gray-400 py-4 text-center">No requisitions assigned</div>
              ) : (
                <div className="space-y-3">
                  {recruiterData.myReqs?.slice(0, 8).map((req: any) => (
                    <div key={req.id} className="flex items-center justify-between text-sm">
                      <div>
                        <div className="font-medium text-gray-800">{req.title}</div>
                        <div className="text-xs text-gray-400">{req.department}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-brand-700">{req.applications?.length ?? 0}</div>
                        <div className="text-xs text-gray-400">candidates</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="card p-5">
              <h2 className="font-semibold text-gray-800 mb-4">My Pipeline</h2>
              {recruiterData.myApps?.length === 0 ? (
                <div className="text-sm text-gray-400 py-4 text-center">No candidates assigned</div>
              ) : (
                <div className="space-y-2">
                  {recruiterData.myApps?.slice(0, 8).map((app: any) => (
                    <div key={app.id} className="flex items-center justify-between text-sm">
                      <div>
                        <div className="font-medium text-gray-800">{app.candidate?.fullName}</div>
                        <div className="text-xs text-gray-400">{app.requisition?.title}</div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-medium">
                        {STAGE_LABELS[app.stage] ?? app.stage}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent activity */}
        {overview?.pipeline?.recentActivity?.length > 0 && (
          <div className="card p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Recent Pipeline Activity</h2>
            <div className="space-y-2">
              {overview.pipeline.recentActivity.slice(0, 10).map((h: any) => (
                <div key={h.id} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-brand-700 shrink-0" />
                  <span className="text-gray-700 font-medium">{h.application?.candidate?.fullName}</span>
                  <span className="text-gray-400">moved to</span>
                  <span className="font-medium text-gray-800">{STAGE_LABELS[h.toStage] ?? h.toStage}</span>
                  <span className="text-gray-400">in</span>
                  <span className="text-gray-600">{h.application?.requisition?.title}</span>
                  <span className="text-gray-400 ml-auto text-xs">
                    by {h.changedBy?.firstName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
