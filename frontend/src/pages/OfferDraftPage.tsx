import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '../services/api';
import Layout from '../components/common/Layout';
import toast from 'react-hot-toast';
import { Save, Send, ChevronDown, ChevronUp, FileText, ExternalLink } from 'lucide-react';

interface SalaryRow { label: string; key: string; }
const SALARY_ROWS: SalaryRow[] = [
  { label: 'Basic Salary', key: 'basic' },
  { label: 'HRA', key: 'hra' },
  { label: 'Special Allowance', key: 'specialAllowance' },
  { label: 'Medical Allowance', key: 'medical' },
  { label: 'Telephone Allowance', key: 'telephone' },
  { label: 'Meal Allowance', key: 'meal' },
  { label: 'Books & Periodicals', key: 'books' },
  { label: 'Attire Allowance', key: 'attire' },
  { label: 'Car Perquisite', key: 'carPerq' },
];

function formatINR(n: number) {
  if (!n) return '—';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export default function OfferDraftPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [salaryOpen, setSalaryOpen] = useState(true);
  const [salary, setSalary] = useState<Record<string, number>>({});
  const [pfOptIn, setPfOptIn] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['offer', id],
    queryFn: () => api.get(`/offers/${id}`).then(r => r.data.offer),
    onSuccess: (offer: Record<string, unknown>) => {
      const comp = offer.compensationProposal as Record<string, unknown> | undefined;
      if (comp?.salaryBreakupJson) {
        try { setSalary(JSON.parse(comp.salaryBreakupJson as string)); } catch { /* ignore */ }
      }
      setPfOptIn((offer.pfOptIn as boolean) ?? true);
    },
  });

  const { register, handleSubmit, formState: { isDirty } } = useForm({
    values: data ? {
      roleTitle: data.roleTitle,
      department: data.department,
      jobFamily: data.jobFamily || '',
      level: data.level || '',
      grade: data.grade || '',
      location: data.location || '',
      noticePeriodDays: data.noticePeriodDays || '',
      preferredDOJ: data.preferredDOJ ? data.preferredDOJ.split('T')[0] : '',
      proposedFixed: data.compensationProposal?.proposedFixed || '',
      proposedVariable: data.compensationProposal?.proposedVariable || 0,
      joiningBonus: data.compensationProposal?.joiningBonus || 0,
      currentTotalCTC: data.currentTotalCTC || '',
    } : {},
  });

  const saveMutation = useMutation({
    mutationFn: (formData: Record<string, unknown>) =>
      api.patch(`/offers/${id}/draft`, formData),
    onSuccess: () => {
      toast.success('Draft saved');
      qc.invalidateQueries({ queryKey: ['offer', id] });
    },
    onError: () => toast.error('Failed to save'),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post(`/approvals/submit/${id}`),
    onSuccess: () => {
      toast.success('Sent for approval!');
      navigate('/offers');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed';
      toast.error(msg);
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post(`/offer-letters/generate/${id}`),
    onSuccess: () => {
      toast.success('Offer letter generated!');
      qc.invalidateQueries({ queryKey: ['offer', id] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed';
      toast.error(`Generate failed: ${msg}`);
    },
  });

  const releaseMutation = useMutation({
    mutationFn: () => api.post(`/offer-letters/release/${id}`),
    onSuccess: () => {
      toast.success('Offer released to candidate!');
      qc.invalidateQueries({ queryKey: ['offer', id] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed';
      toast.error(`Release failed: ${msg}`);
    },
  });

  const onSave = handleSubmit((formData) => {
    saveMutation.mutate({
      ...formData,
      pfOptIn,
      salaryBreakup: salary,
    });
  });

  // Compute totals from salary inputs
  const pfEmployer = pfOptIn ? Math.round(Math.min(salary.basic || 0, 15000) * 0.12) : 0;
  const grossMonthly = Object.values(salary).reduce((s, v) => s + (v || 0), 0);
  const ctcMonthly = grossMonthly + pfEmployer;
  const ctcAnnual = ctcMonthly * 12;

  if (isLoading) return <Layout><div className="p-8 text-gray-400">Loading…</div></Layout>;

  const offer = data;
  const candidate = offer?.candidate;
  const isDraft = offer?.status === 'DRAFT' || offer?.status?.startsWith('SENT_BACK');
  const isApproved = offer?.status === 'APPROVED';
  const hasLetter = !!offer?.offerLetter;
  const letterIsReleased = offer?.offerLetter?.status === 'RELEASED' || offer?.offerLetter?.status === 'SIGNED';
  const isReleased = offer?.status === 'OFFER_RELEASED' || offer?.status === 'ACCEPTED' || offer?.status === 'DECLINED';

  return (
    <Layout>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{candidate?.fullName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{offer?.roleTitle} · {offer?.department}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isDraft && (
              <>
                <button onClick={onSave} disabled={saveMutation.isPending} className="btn-secondary">
                  <Save size={15} /> {saveMutation.isPending ? 'Saving…' : 'Save Draft'}
                </button>
                <button
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending}
                  className="btn-primary"
                >
                  <Send size={15} /> {submitMutation.isPending ? 'Submitting…' : 'Send for Approval'}
                </button>
              </>
            )}
            {isApproved && !hasLetter && (
              <button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="btn-primary"
              >
                <FileText size={15} /> {generateMutation.isPending ? 'Generating…' : 'Generate Offer Letter'}
              </button>
            )}
            {isApproved && hasLetter && !letterIsReleased && (
              <>
                <a
                  href={`/api/offer-letters/pdf/${id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  <ExternalLink size={15} /> Preview PDF
                </a>
                <button
                  onClick={() => releaseMutation.mutate()}
                  disabled={releaseMutation.isPending}
                  className="btn-primary"
                >
                  <Send size={15} /> {releaseMutation.isPending ? 'Releasing…' : 'Release to Candidate'}
                </button>
              </>
            )}
            {isReleased && (
              <a
                href={`/api/offer-letters/pdf/${id}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                <ExternalLink size={15} /> View Offer Letter
              </a>
            )}
            {!isDraft && !isApproved && !isReleased && (
              <span className="text-sm text-gray-400 py-2">
                {offer?.status?.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>

        {/* Candidate info (read-only) */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Candidate Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-400">Email</span><p className="font-medium">{candidate?.email}</p></div>
            <div><span className="text-gray-400">Phone</span><p className="font-medium">{candidate?.phone || '—'}</p></div>
          </div>
        </div>

        {/* Offer details form */}
        <div className="card p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Offer Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Role / Designation</label>
              <input {...register('roleTitle')} className="input" />
            </div>
            <div>
              <label className="label">Department</label>
              <input {...register('department')} className="input" />
            </div>
            <div>
              <label className="label">Sub-department / Job Family</label>
              <input {...register('jobFamily')} className="input" />
            </div>
            <div>
              <label className="label">Level</label>
              <input {...register('level')} className="input" placeholder="L1, L2…" />
            </div>
            <div>
              <label className="label">Grade</label>
              <input {...register('grade')} className="input" placeholder="SDE1, PM2…" />
            </div>
            <div>
              <label className="label">Location</label>
              <input {...register('location')} className="input" placeholder="Gurugram" />
            </div>
            <div>
              <label className="label">Notice Period (days)</label>
              <input {...register('noticePeriodDays')} type="number" className="input" />
            </div>
            <div>
              <label className="label">Date of Joining</label>
              <input {...register('preferredDOJ')} type="date" className="input" />
            </div>
          </div>
        </div>

        {/* Compensation */}
        <div className="card p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Compensation</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Current CTC (Annual ₹)</label>
              <input {...register('currentTotalCTC')} type="number" className="input" />
            </div>
            <div>
              <label className="label">Offered Fixed CTC (Annual ₹)</label>
              <input {...register('proposedFixed')} type="number" className="input" />
            </div>
            <div>
              <label className="label">Variable (Annual ₹)</label>
              <input {...register('proposedVariable')} type="number" className="input" />
            </div>
            <div>
              <label className="label">Joining Bonus (₹)</label>
              <input {...register('joiningBonus')} type="number" className="input" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="pfOptIn"
              checked={pfOptIn}
              onChange={e => setPfOptIn(e.target.checked)}
              className="rounded border-gray-300 text-brand-700"
            />
            <label htmlFor="pfOptIn" className="text-sm text-gray-700">PF opt-in (employer contributes 12% of Basic, capped at ₹15,000)</label>
          </div>
        </div>

        {/* Salary Breakup — manual entry */}
        <div className="card overflow-hidden">
          <button
            onClick={() => setSalaryOpen(o => !o)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <span>Salary Breakup (Monthly)</span>
            {salaryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {salaryOpen && (
            <div className="border-t border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Component</th>
                    <th className="px-6 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Monthly (₹)</th>
                    <th className="px-6 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Annual (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {SALARY_ROWS.map(({ label, key }, idx) => (
                    <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-2 text-gray-700">{label}</td>
                      <td className="px-4 py-1.5">
                        <input
                          type="number"
                          value={salary[key] || ''}
                          onChange={e => setSalary(s => ({ ...s, [key]: parseFloat(e.target.value) || 0 }))}
                          className="input text-right w-36 ml-auto py-1"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-6 py-2 text-right text-gray-600">
                        {salary[key] ? formatINR(salary[key] * 12) : '—'}
                      </td>
                    </tr>
                  ))}

                  {/* PF employer row (auto-computed) */}
                  <tr className="bg-gray-50">
                    <td className="px-6 py-2 text-gray-500 italic">Employer PF (auto)</td>
                    <td className="px-6 py-2 text-right text-gray-500">{formatINR(pfEmployer)}</td>
                    <td className="px-6 py-2 text-right text-gray-500">{formatINR(pfEmployer * 12)}</td>
                  </tr>

                  {/* Totals */}
                  <tr className="bg-gray-100 font-semibold">
                    <td className="px-6 py-3 text-gray-800">Gross Monthly</td>
                    <td className="px-6 py-3 text-right text-gray-800">{formatINR(grossMonthly)}</td>
                    <td className="px-6 py-3 text-right text-gray-800">{formatINR(grossMonthly * 12)}</td>
                  </tr>
                  <tr className="bg-brand-700 text-white font-bold">
                    <td className="px-6 py-3">Total CTC</td>
                    <td className="px-6 py-3 text-right">{formatINR(ctcMonthly)}</td>
                    <td className="px-6 py-3 text-right">{formatINR(ctcAnnual)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ATS Interview Summary (if sourced from ATS) */}
        {offer?.interviewSummary && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Interview Summary</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">From ATS</span>
              {offer.interviewSummary.overallRecommendation && (
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                  offer.interviewSummary.overallRecommendation.includes('HIRE') && !offer.interviewSummary.overallRecommendation.includes('NO')
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : offer.interviewSummary.overallRecommendation.includes('NO')
                    ? 'bg-red-50 text-red-600 border-red-200'
                    : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                }`}>
                  {offer.interviewSummary.overallRecommendation.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            <div className="space-y-4 text-sm">
              {offer.interviewSummary.recruiterScreen && (
                <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-lg p-3">
                  <div><div className="text-xs text-gray-400">Expected CTC</div><div className="font-medium">₹{((offer.interviewSummary.recruiterScreen.salaryExpectation ?? 0) / 100000).toFixed(1)}L</div></div>
                  <div><div className="text-xs text-gray-400">Notice Period</div><div className="font-medium">{offer.interviewSummary.recruiterScreen.noticePeriodDays ?? '—'} days</div></div>
                  <div><div className="text-xs text-gray-400">Screen Outcome</div><div className={`font-medium ${offer.interviewSummary.recruiterScreen.outcome === 'PROCEED' ? 'text-green-600' : 'text-red-500'}`}>{offer.interviewSummary.recruiterScreen.outcome ?? '—'}</div></div>
                </div>
              )}
              {(offer.interviewSummary.rounds ?? []).map((round: any) => (
                <div key={round.roundNumber} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800">{round.title ?? `Round ${round.roundNumber}`}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${round.status === 'COMPLETED' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>{round.status}</span>
                  </div>
                  {round.feedback?.length > 0 ? round.feedback.map((fb: any, fi: number) => (
                    <div key={fi} className="text-xs border-t border-gray-100 pt-2 mt-2 first:border-0 first:pt-0 first:mt-0">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{fb.interviewer}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-500">{'★'.repeat(fb.overallRating ?? 0)}{'☆'.repeat(5 - (fb.overallRating ?? 0))}</span>
                          <span className={`font-medium ${fb.outcome?.includes('YES') ? 'text-green-600' : fb.outcome?.includes('NO') ? 'text-red-500' : 'text-gray-500'}`}>{fb.outcome}</span>
                        </div>
                      </div>
                      {fb.strengths && <p className="text-green-700 mt-0.5">✓ {fb.strengths}</p>}
                      {fb.concerns && <p className="text-red-500 mt-0.5">⚠ {fb.concerns}</p>}
                    </div>
                  )) : <p className="text-xs text-gray-400 italic mt-1">No feedback for this round</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Approval history / rejection reason */}
        {offer?.statusHistory?.length > 0 && (
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">History</h2>
            <div className="space-y-3">
              {offer.statusHistory.map((h: Record<string, unknown>, i: number) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-brand-700 mt-1.5 shrink-0" />
                  <div>
                    <span className="font-medium">{h.toStatus as string}</span>
                    {h.reason && <span className="text-red-600 ml-2">— {h.reason as string}</span>}
                    <span className="text-gray-400 ml-2 text-xs">
                      {new Date(h.createdAt as string).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
