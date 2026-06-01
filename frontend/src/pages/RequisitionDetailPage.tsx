import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Layout from '../components/common/Layout';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, CheckCircle, XCircle, RotateCcw, Clock, Send, KanbanSquare,
  Briefcase, Users, MapPin, Calendar, DollarSign, User,
} from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_HM_APPROVAL: 'Pending HM Approval',
  PENDING_HOD_APPROVAL: 'Pending HOD Approval',
  PENDING_HR_HEAD_APPROVAL: 'Pending HR Head Approval',
  PENDING_CEO_APPROVAL: 'Pending CEO Approval',
  APPROVED: 'Approved',
  OPEN: 'Open',
  ON_HOLD: 'On Hold',
  FILLED: 'Filled',
  CANCELLED: 'Cancelled',
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  PENDING_HM_APPROVAL: 'bg-yellow-100 text-yellow-800',
  PENDING_HOD_APPROVAL: 'bg-yellow-100 text-yellow-800',
  PENDING_HR_HEAD_APPROVAL: 'bg-orange-100 text-orange-800',
  PENDING_CEO_APPROVAL: 'bg-red-100 text-red-800',
  APPROVED: 'bg-green-100 text-green-800',
  OPEN: 'bg-blue-100 text-blue-800',
  FILLED: 'bg-purple-100 text-purple-800',
  CANCELLED: 'bg-red-50 text-red-500',
};

const APPROVER_LABELS: Record<string, string> = {
  HM: 'Hiring Manager',
  HOD: 'Head of Department',
  HR_HEAD: 'HR Head',
  CEO: 'CEO',
};

// Which status means this role is the active approver
const ROLE_TO_PENDING: Record<string, string[]> = {
  HIRING_MANAGER: ['PENDING_HM_APPROVAL'],
  HOD:            ['PENDING_HOD_APPROVAL'],
  HR_HEAD:        ['PENDING_HR_HEAD_APPROVAL'],
  SUPER_ADMIN:    ['PENDING_HM_APPROVAL', 'PENDING_HOD_APPROVAL', 'PENDING_HR_HEAD_APPROVAL', 'PENDING_CEO_APPROVAL'],
  ADMIN:          ['PENDING_HM_APPROVAL', 'PENDING_HOD_APPROVAL', 'PENDING_HR_HEAD_APPROVAL', 'PENDING_CEO_APPROVAL'],
};

export default function RequisitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [showCommentFor, setShowCommentFor] = useState<'approve' | 'reject' | 'send_back' | null>(null);

  const { data: req, isLoading } = useQuery<any>({
    queryKey: ['requisition', id],
    queryFn: () => api.get(`/requisitions/${id}`).then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['requisition', id] });
    qc.invalidateQueries({ queryKey: ['requisitions'] });
  };

  const submitMutation = useMutation({
    mutationFn: () => api.post(`/requisitions/${id}/submit`).then((r) => r.data),
    onSuccess: invalidate,
  });

  const approveMutation = useMutation({
    mutationFn: (comment?: string) => api.post(`/requisitions/${id}/approve`, { comment }).then((r) => r.data),
    onSuccess: () => { invalidate(); setShowCommentFor(null); setComment(''); },
  });

  const rejectMutation = useMutation({
    mutationFn: (comment?: string) => api.post(`/requisitions/${id}/reject`, { comment }).then((r) => r.data),
    onSuccess: () => { invalidate(); setShowCommentFor(null); setComment(''); },
  });

  const sendBackMutation = useMutation({
    mutationFn: (comment?: string) => api.post(`/requisitions/${id}/send-back`, { comment }).then((r) => r.data),
    onSuccess: () => { invalidate(); setShowCommentFor(null); setComment(''); },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="p-8 text-center text-gray-400">Loading…</div>
      </Layout>
    );
  }

  if (!req) {
    return (
      <Layout>
        <div className="p-8 text-center text-gray-500">Requisition not found.</div>
      </Layout>
    );
  }

  const pendingStatuses = ROLE_TO_PENDING[user?.role ?? ''] ?? [];
  const canAct = pendingStatuses.includes(req.status);
  const canSubmit = req.status === 'DRAFT' &&
    ['RECRUITER', 'TA_MANAGER', 'HIRING_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '');

  const isBusy = approveMutation.isPending || rejectMutation.isPending || sendBackMutation.isPending || submitMutation.isPending;

  const fmt = (n?: number) => n ? `₹${(n / 100000).toFixed(1)}L` : '—';
  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <Layout>
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <button onClick={() => navigate('/requisitions')} className="btn-secondary py-1.5 px-3 mt-1">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs text-gray-400 font-mono">REQ-{String(req.reqNumber).padStart(4, '0')}</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[req.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[req.status] ?? req.status}
              </span>
              {req.priority && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                  {req.priority}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{req.title}</h1>
            {req.status !== 'CANCELLED' && (
              <Link
                to={`/requisitions/${id}/pipeline`}
                className="btn-secondary py-1.5 px-3 text-sm inline-flex items-center gap-1.5"
              >
                <KanbanSquare size={15} /> View Pipeline
              </Link>
            )}
          </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {req.department}{req.subDepartment ? ` › ${req.subDepartment}` : ''}
              {' · '}Created {fmtDate(req.createdAt)} by {req.createdBy?.firstName} {req.createdBy?.lastName}
            </p>
          </div>
        </div>

        {/* Approval trail */}
        {req.approvalSteps?.length > 0 && (
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Approval Progress</h3>
            <div className="flex items-center gap-2 flex-wrap">
              {req.approvalSteps.map((step: any, i: number) => {
                const isDone = step.status === 'APPROVED';
                const isPending = step.status === 'PENDING';
                const isRejected = step.status === 'REJECTED';
                const isSentBack = step.status === 'SENT_BACK';
                return (
                  <div key={step.id} className="flex items-center gap-2">
                    {i > 0 && <div className="w-6 h-px bg-gray-300" />}
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                      isDone ? 'bg-green-100 text-green-700' :
                      isPending ? 'bg-brand-700 text-white' :
                      isRejected ? 'bg-red-100 text-red-700' :
                      isSentBack ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {isDone && <CheckCircle size={11} />}
                      {isPending && <Clock size={11} />}
                      {isRejected && <XCircle size={11} />}
                      {isSentBack && <RotateCcw size={11} />}
                      {APPROVER_LABELS[step.approverRole] ?? step.approverRole}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Comments from steps */}
            {req.approvalSteps.filter((s: any) => s.comment).map((step: any) => (
              <div key={step.id + '_comment'} className="mt-3 text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
                <span className="font-medium">{APPROVER_LABELS[step.approverRole]}</span>: {step.comment}
              </div>
            ))}
          </div>
        )}

        {/* Approval actions */}
        {canSubmit && (
          <div className="card p-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">This requisition is in draft. Submit it to start the approval process.</p>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={isBusy}
              className="btn-primary"
            >
              <Send size={15} /> Submit for Approval
            </button>
          </div>
        )}

        {canAct && !showCommentFor && (
          <div className="card p-4 bg-brand-50 border border-brand-200">
            <p className="text-sm font-medium text-brand-800 mb-3">This requisition requires your approval.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCommentFor('approve')}
                disabled={isBusy}
                className="btn-primary"
              >
                <CheckCircle size={15} /> Approve
              </button>
              <button
                onClick={() => setShowCommentFor('send_back')}
                disabled={isBusy}
                className="btn-secondary"
              >
                <RotateCcw size={15} /> Send Back
              </button>
              <button
                onClick={() => setShowCommentFor('reject')}
                disabled={isBusy}
                className="btn-secondary text-red-600 hover:bg-red-50"
              >
                <XCircle size={15} /> Reject
              </button>
            </div>
          </div>
        )}

        {showCommentFor && (
          <div className="card p-4 space-y-3">
            <p className="text-sm font-medium text-gray-800 capitalize">{showCommentFor.replace('_', ' ')} — add a comment (optional)</p>
            <textarea
              rows={3}
              className="input"
              placeholder="Comments or reasons…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                disabled={isBusy}
                className={showCommentFor === 'approve' ? 'btn-primary' : showCommentFor === 'reject' ? 'btn-secondary text-red-600' : 'btn-secondary'}
                onClick={() => {
                  if (showCommentFor === 'approve') approveMutation.mutate(comment || undefined);
                  else if (showCommentFor === 'reject') rejectMutation.mutate(comment || undefined);
                  else sendBackMutation.mutate(comment || undefined);
                }}
              >
                {isBusy ? 'Processing…' : `Confirm ${showCommentFor.replace('_', ' ')}`}
              </button>
              <button onClick={() => { setShowCommentFor(null); setComment(''); }} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* Left: Details */}
          <div className="col-span-2 space-y-5">
            {/* Role details */}
            <div className="card p-5 space-y-4">
              <h2 className="font-semibold text-gray-800">Role Details</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Detail icon={<Briefcase size={14} />} label="Employment Type" value={req.employmentType} />
                <Detail icon={<MapPin size={14} />} label="Location" value={req.location || '—'} />
                <Detail icon={<Users size={14} />} label="Headcount" value={req.headcount} />
                <Detail icon={<Briefcase size={14} />} label="Work Mode" value={req.workMode} />
                {req.grade && <Detail label="Grade" value={req.grade} />}
                {req.level && <Detail label="Level" value={req.level} />}
                {req.targetClosureDate && (
                  <Detail icon={<Calendar size={14} />} label="Target Closure" value={fmtDate(req.targetClosureDate)} />
                )}
                {req.isReplacement && (
                  <Detail label="Backfill for" value={req.replacementFor || 'Yes'} />
                )}
              </div>
            </div>

            {/* JD */}
            {(req.jdText || req.responsibilities || req.requirements) && (
              <div className="card p-5 space-y-4">
                <h2 className="font-semibold text-gray-800">Job Description</h2>
                {req.jdText && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">About the Role</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.jdText}</p>
                  </div>
                )}
                {req.responsibilities && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Responsibilities</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.responsibilities}</p>
                  </div>
                )}
                {req.requirements && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Requirements</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.requirements}</p>
                  </div>
                )}
              </div>
            )}

            {req.hiringReason && (
              <div className="card p-5">
                <h2 className="font-semibold text-gray-800 mb-3">Business Case</h2>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.hiringReason}</p>
              </div>
            )}
          </div>

          {/* Right: Sidebar */}
          <div className="space-y-5">
            {/* Budget */}
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Budget</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Min</span>
                  <span className="font-medium">{fmt(req.budgetedCTCMin)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Max</span>
                  <span className="font-medium text-gray-900">{fmt(req.budgetedCTCMax)}</span>
                </div>
              </div>
            </div>

            {/* Team */}
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Team</h3>
              <div className="space-y-3">
                <PersonChip label="Hiring Manager" person={req.hiringManager} />
                <PersonChip label="HOD" person={req.hod} />
                <PersonChip label="Recruiter" person={req.recruiter} />
              </div>
            </div>

            {/* Applications */}
            {req.applications?.length > 0 && (
              <div className="card p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">
                  Applications ({req.applications.length})
                </h3>
                <div className="space-y-2">
                  {req.applications.slice(0, 5).map((app: any) => (
                    <div key={app.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{app.candidate?.fullName}</span>
                      <span className="text-xs text-gray-400">{app.stage}</span>
                    </div>
                  ))}
                  {req.applications.length > 5 && (
                    <p className="text-xs text-gray-400">+{req.applications.length - 5} more</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function Detail({ label, value, icon }: { label: string; value: any; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-400 flex items-center gap-1 mb-0.5">{icon}{label}</div>
      <div className="font-medium text-gray-800">{value ?? '—'}</div>
    </div>
  );
}

function PersonChip({ label, person }: { label: string; person?: any }) {
  if (!person) return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-sm text-gray-400 italic">Not assigned</div>
    </div>
  );
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="flex items-center gap-2 mt-0.5">
        <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold">
          {person.firstName?.[0]}{person.lastName?.[0]}
        </div>
        <span className="text-sm font-medium text-gray-800">{person.firstName} {person.lastName}</span>
      </div>
    </div>
  );
}
