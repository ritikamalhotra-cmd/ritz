import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import Layout from '../components/common/Layout';
import { ArrowLeft, Send } from 'lucide-react';

const DEPARTMENTS = [
  'Engineering', 'Product', 'Design', 'Data Science', 'Sales', 'Marketing',
  'Operations', 'Finance', 'HR', 'Legal', 'Customer Success', 'Other',
];

const GRADES = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'VP', 'SVP', 'EVP'];

export default function NewRequisitionPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    department: '',
    subDepartment: '',
    grade: '',
    level: '',
    location: '',
    workMode: 'ONSITE',
    employmentType: 'PERMANENT',
    headcount: 1,
    isReplacement: false,
    replacementFor: '',
    hiringReason: '',
    budgetedCTCMin: '',
    budgetedCTCMax: '',
    jdText: '',
    responsibilities: '',
    requirements: '',
    priority: 'MEDIUM',
    targetClosureDate: '',
    hiringManagerId: '',
    hodId: '',
    recruiterId: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch users for dropdown assignment
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['users-for-req'],
    queryFn: () => api.get('/admin/users').then((r) => r.data.users ?? r.data),
  });

  const hiringManagers = users.filter((u: any) => ['HIRING_MANAGER', 'HOD', 'ADMIN', 'SUPER_ADMIN'].includes(u.role));
  const hods = users.filter((u: any) => ['HOD', 'ADMIN', 'SUPER_ADMIN'].includes(u.role));
  const recruiters = users.filter((u: any) => ['RECRUITER', 'TA_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(u.role));

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/requisitions', data).then((r) => r.data),
    onSuccess: (data) => navigate(`/requisitions/${data.id}`),
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const created = await api.post('/requisitions', data).then((r) => r.data);
      return api.post(`/requisitions/${created.id}/submit`).then((r) => r.data);
    },
    onSuccess: (data) => navigate(`/requisitions/${data.id}`),
  });

  const set = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Required';
    if (!form.department) e.department = 'Required';
    if (!form.hiringManagerId) e.hiringManagerId = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const payload = () => ({
    ...form,
    headcount: Number(form.headcount),
    budgetedCTCMin: form.budgetedCTCMin ? Number(form.budgetedCTCMin) : undefined,
    budgetedCTCMax: form.budgetedCTCMax ? Number(form.budgetedCTCMax) : undefined,
    hiringManagerId: form.hiringManagerId || undefined,
    hodId: form.hodId || undefined,
    recruiterId: form.recruiterId || undefined,
    targetClosureDate: form.targetClosureDate || undefined,
    replacementFor: form.replacementFor || undefined,
    subDepartment: form.subDepartment || undefined,
  });

  const handleSaveDraft = () => {
    if (!validate()) return;
    createMutation.mutate(payload());
  };

  const handleSubmitForApproval = () => {
    if (!validate()) return;
    submitMutation.mutate(payload());
  };

  const isBusy = createMutation.isPending || submitMutation.isPending;

  return (
    <Layout>
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/requisitions')} className="btn-secondary py-1.5 px-3">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">New Requisition</h1>
            <p className="text-sm text-gray-500 mt-0.5">Fill in the job details and submit for approval</p>
          </div>
        </div>

        {/* ── Section: Basic Info ────────────────────────────────── */}
        <section className="card p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-3">Basic Information</h2>

          <div className="grid grid-cols-2 gap-5">
            <div className="col-span-2">
              <label className="label">Job Title *</label>
              <input
                className={`input ${errors.title ? 'border-red-400' : ''}`}
                placeholder="e.g., Senior Software Engineer"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
              {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
            </div>

            <div>
              <label className="label">Department *</label>
              <select
                className={`input ${errors.department ? 'border-red-400' : ''}`}
                value={form.department}
                onChange={(e) => set('department', e.target.value)}
              >
                <option value="">Select department</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              {errors.department && <p className="text-xs text-red-500 mt-1">{errors.department}</p>}
            </div>

            <div>
              <label className="label">Sub-department / Team</label>
              <input
                className="input"
                placeholder="e.g., Backend Platform"
                value={form.subDepartment}
                onChange={(e) => set('subDepartment', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Grade</label>
              <select className="input" value={form.grade} onChange={(e) => set('grade', e.target.value)}>
                <option value="">Select grade</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">L6+ or budget ≥50L triggers CEO approval</p>
            </div>

            <div>
              <label className="label">Level</label>
              <input
                className="input"
                placeholder="e.g., Senior, Staff, Principal"
                value={form.level}
                onChange={(e) => set('level', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Location</label>
              <input
                className="input"
                placeholder="e.g., Gurugram, Remote"
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
              />
            </div>

            <div>
              <label className="label">Work Mode</label>
              <select className="input" value={form.workMode} onChange={(e) => set('workMode', e.target.value)}>
                <option value="ONSITE">Onsite</option>
                <option value="HYBRID">Hybrid</option>
                <option value="REMOTE">Remote</option>
              </select>
            </div>

            <div>
              <label className="label">Employment Type</label>
              <select className="input" value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
                <option value="PERMANENT">Permanent</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
              </select>
            </div>

            <div>
              <label className="label">Headcount</label>
              <input
                type="number"
                min={1}
                className="input"
                value={form.headcount}
                onChange={(e) => set('headcount', e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isReplacement"
              className="rounded"
              checked={form.isReplacement}
              onChange={(e) => set('isReplacement', e.target.checked)}
            />
            <label htmlFor="isReplacement" className="text-sm text-gray-700">This is a backfill (replacement hire)</label>
          </div>
          {form.isReplacement && (
            <div>
              <label className="label">Replacing</label>
              <input
                className="input"
                placeholder="Employee name being replaced"
                value={form.replacementFor}
                onChange={(e) => set('replacementFor', e.target.value)}
              />
            </div>
          )}
        </section>

        {/* ── Section: Budget & Priority ─────────────────────────── */}
        <section className="card p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-3">Budget & Priority</h2>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="label">Budget Min (Annual CTC ₹)</label>
              <input
                type="number"
                className="input"
                placeholder="e.g., 1200000"
                value={form.budgetedCTCMin}
                onChange={(e) => set('budgetedCTCMin', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Budget Max (Annual CTC ₹)</label>
              <input
                type="number"
                className="input"
                placeholder="e.g., 2000000"
                value={form.budgetedCTCMax}
                onChange={(e) => set('budgetedCTCMax', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                <option value="CRITICAL">🔴 Critical</option>
                <option value="HIGH">🟠 High</option>
                <option value="MEDIUM">🟡 Medium</option>
                <option value="LOW">⚪ Low</option>
              </select>
            </div>
            <div>
              <label className="label">Target Closure Date</label>
              <input
                type="date"
                className="input"
                value={form.targetClosureDate}
                onChange={(e) => set('targetClosureDate', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Hiring Reason / Business Case</label>
            <textarea
              rows={3}
              className="input"
              placeholder="Why is this role needed? What business problem does it solve?"
              value={form.hiringReason}
              onChange={(e) => set('hiringReason', e.target.value)}
            />
          </div>
        </section>

        {/* ── Section: JD ───────────────────────────────────────── */}
        <section className="card p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-3">Job Description</h2>
          <div>
            <label className="label">About the Role</label>
            <textarea
              rows={4}
              className="input"
              placeholder="Brief description of the role…"
              value={form.jdText}
              onChange={(e) => set('jdText', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Key Responsibilities</label>
            <textarea
              rows={4}
              className="input"
              placeholder="• Lead the backend team…&#10;• Own system design for…"
              value={form.responsibilities}
              onChange={(e) => set('responsibilities', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Requirements / Must-haves</label>
            <textarea
              rows={4}
              className="input"
              placeholder="• 3+ years of Go/Node experience&#10;• Strong problem-solving…"
              value={form.requirements}
              onChange={(e) => set('requirements', e.target.value)}
            />
          </div>
        </section>

        {/* ── Section: Team ─────────────────────────────────────── */}
        <section className="card p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-3">Team Assignment</h2>
          <div className="grid grid-cols-3 gap-5">
            <div>
              <label className="label">Hiring Manager *</label>
              <select
                className={`input ${errors.hiringManagerId ? 'border-red-400' : ''}`}
                value={form.hiringManagerId}
                onChange={(e) => set('hiringManagerId', e.target.value)}
              >
                <option value="">Select HM</option>
                {hiringManagers.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
              {errors.hiringManagerId && <p className="text-xs text-red-500 mt-1">{errors.hiringManagerId}</p>}
            </div>
            <div>
              <label className="label">HOD</label>
              <select
                className="input"
                value={form.hodId}
                onChange={(e) => set('hodId', e.target.value)}
              >
                <option value="">Select HOD</option>
                {hods.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Recruiter</label>
              <select
                className="input"
                value={form.recruiterId}
                onChange={(e) => set('recruiterId', e.target.value)}
              >
                <option value="">Assign recruiter</option>
                {recruiters.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Actions */}
        {(createMutation.isError || submitMutation.isError) && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {(createMutation.error as any)?.response?.data?.error ?? (submitMutation.error as any)?.response?.data?.error ?? 'Something went wrong'}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button onClick={() => navigate('/requisitions')} className="btn-secondary" disabled={isBusy}>
            Cancel
          </button>
          <button onClick={handleSaveDraft} className="btn-secondary" disabled={isBusy}>
            Save as Draft
          </button>
          <button onClick={handleSubmitForApproval} className="btn-primary" disabled={isBusy}>
            <Send size={16} /> Submit for Approval
          </button>
        </div>
      </div>
    </Layout>
  );
}
