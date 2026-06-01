import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import Layout from '../components/common/Layout';
import { useAuth } from '../context/AuthContext';
import { Plus, Briefcase, Clock, CheckCircle, XCircle } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_HM_APPROVAL: 'Pending HM',
  PENDING_HOD_APPROVAL: 'Pending HOD',
  PENDING_HR_HEAD_APPROVAL: 'Pending HR Head',
  PENDING_CEO_APPROVAL: 'Pending CEO',
  APPROVED: 'Approved',
  OPEN: 'Open',
  ON_HOLD: 'On Hold',
  FILLED: 'Filled',
  CANCELLED: 'Cancelled',
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  PENDING_HM_APPROVAL: 'bg-yellow-100 text-yellow-700',
  PENDING_HOD_APPROVAL: 'bg-yellow-100 text-yellow-700',
  PENDING_HR_HEAD_APPROVAL: 'bg-orange-100 text-orange-700',
  PENDING_CEO_APPROVAL: 'bg-red-100 text-red-700',
  APPROVED: 'bg-green-100 text-green-700',
  OPEN: 'bg-blue-100 text-blue-700',
  ON_HOLD: 'bg-gray-100 text-gray-500',
  FILLED: 'bg-purple-100 text-purple-700',
  CANCELLED: 'bg-red-100 text-red-500',
};

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700 border border-red-200',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-gray-100 text-gray-500',
};

export default function RequisitionListPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');

  const { data: requisitions = [], isLoading } = useQuery<any[]>({
    queryKey: ['requisitions', statusFilter],
    queryFn: () =>
      api.get('/requisitions', { params: { status: statusFilter || undefined } })
        .then((r) => r.data),
  });

  const canCreate = ['RECRUITER', 'TA_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'HIRING_MANAGER'].includes(user?.role ?? '');

  return (
    <Layout>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Requisitions</h1>
            <p className="text-sm text-gray-500 mt-0.5">{requisitions.length} total</p>
          </div>
          {canCreate && (
            <Link to="/requisitions/new" className="btn-primary">
              <Plus size={16} /> New Requisition
            </Link>
          )}
        </div>

        {/* Filter */}
        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-52"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* Cards grid */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : requisitions.length === 0 ? (
          <div className="card p-16 text-center">
            <Briefcase size={40} className="mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 font-medium">No requisitions yet</p>
            {canCreate && (
              <Link to="/requisitions/new" className="btn-primary mt-4 inline-flex">
                <Plus size={16} /> Create your first requisition
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {requisitions.map((req: any) => (
              <Link
                key={req.id}
                to={`/requisitions/${req.id}`}
                className="card p-5 hover:shadow-md transition-shadow block"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs text-gray-400 font-mono">REQ-{String(req.reqNumber).padStart(4, '0')}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[req.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[req.status] ?? req.status}
                      </span>
                      {req.priority && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[req.priority] ?? ''}`}>
                          {req.priority}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 text-base">{req.title}</h3>
                    <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-500">
                      <span>{req.department}{req.subDepartment ? ` › ${req.subDepartment}` : ''}</span>
                      {req.location && <span>📍 {req.location}</span>}
                      {req.headcount > 1 && <span>👥 {req.headcount} seats</span>}
                      {req.grade && <span>Grade: {req.grade}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {req.budgetedCTCMax && (
                      <div className="text-sm font-medium text-gray-700">
                        Up to ₹{(req.budgetedCTCMax / 100000).toFixed(1)}L
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {req.hiringManager
                        ? `HM: ${req.hiringManager.firstName} ${req.hiringManager.lastName}`
                        : 'No HM assigned'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(req.createdAt).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                </div>

                {/* Approval trail */}
                {req.approvalSteps?.length > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    {req.approvalSteps.map((step: any) => {
                      const isDone = step.status === 'APPROVED';
                      const isPending = step.status === 'PENDING';
                      const isRejected = step.status === 'REJECTED';
                      return (
                        <span
                          key={step.id}
                          className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium ${
                            isDone ? 'bg-green-100 text-green-700' :
                            isPending ? 'bg-brand-700 text-white' :
                            isRejected ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {isDone ? <CheckCircle size={10} /> : isPending ? <Clock size={10} /> : isRejected ? <XCircle size={10} /> : null}
                          {APPROVER_LABELS[step.approverRole] ?? step.approverRole}
                        </span>
                      );
                    })}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

const APPROVER_LABELS: Record<string, string> = {
  HM:       'HM',
  HOD:      'HOD',
  HR_HEAD:  'HR Head',
  CEO:      'CEO',
};
