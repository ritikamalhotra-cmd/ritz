import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Layout from '../components/common/Layout';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, RotateCcw, Clock, Star, ChevronDown, ChevronUp, Link2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

const ROLE_LABELS: Record<string, string> = {
  TA_MANAGER: 'TA Manager', HOD: 'BU Head', HR_HEAD: 'HR Head',
};

const OUTCOME_BADGE: Record<string, string> = {
  STRONG_HIRE:    'bg-green-100 text-green-700 border-green-200',
  HIRE:           'bg-emerald-100 text-emerald-700 border-emerald-200',
  MIXED:          'bg-yellow-100 text-yellow-700 border-yellow-200',
  NO_HIRE:        'bg-red-100 text-red-600 border-red-200',
  STRONG_NO_HIRE: 'bg-red-200 text-red-800 border-red-300',
  NO_FEEDBACK:    'bg-gray-100 text-gray-500 border-gray-200',
};

const RECOMMENDATION_LABEL: Record<string, string> = {
  STRONG_HIRE: '✅ Strong Hire', HIRE: '✅ Hire', MIXED: '⚠️ Mixed', NO_HIRE: '❌ No Hire',
  STRONG_NO_HIRE: '❌ Strong No Hire', NO_FEEDBACK: '— No feedback yet',
};

const STAR_RATING = (n: number) => '★'.repeat(n ?? 0) + '☆'.repeat(5 - (n ?? 0));

export default function ApprovalQueuePage() {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['approval-queue'],
    queryFn: () => api.get('/approvals/queue').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const steps: any[] = data?.steps ?? [];

  const act = useMutation({
    mutationFn: ({ workflowId, action, cmt }: { workflowId: string; action: string; cmt?: string }) =>
      api.post(`/approvals/workflows/${workflowId}/action`, { action, comment: cmt }),
    onSuccess: () => {
      toast.success('Action recorded');
      setActiveStep(null);
      setComment('');
      qc.invalidateQueries({ queryKey: ['approval-queue'] });
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Failed';
      toast.error(msg);
    },
  });

  return (
    <Layout>
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">{steps.length} pending</p>
        </div>

        {isLoading && <div className="text-sm text-gray-400">Loading…</div>}
        {!isLoading && steps.length === 0 && (
          <div className="card p-10 text-center text-gray-400 text-sm">No pending approvals. 🎉</div>
        )}

        <div className="space-y-5">
          {steps.map((step) => {
            const offer = step.workflow.offerCase;
            const comp = offer.compensationProposal;
            const summary: any = offer.interviewSummary;
            const slaBreach = step.isSlaBreached || (step.slaDeadline && new Date(step.slaDeadline) < new Date());
            const isExpanded = expandedSummary === step.id;

            return (
              <div key={step.id} className="card overflow-hidden">
                {/* Approval progress trail */}
                <div className="px-6 pt-5 pb-3 flex items-center gap-0">
                  {step.workflow.steps.sort((a: any, b: any) => a.stepOrder - b.stepOrder).map((s: any, i: number, arr: any[]) => {
                    const isActive = s.stepOrder === step.workflow.currentStep;
                    const isDone = s.status === 'APPROVED';
                    return (
                      <div key={s.id} className="flex items-center">
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                          isDone ? 'bg-green-100 text-green-700' : isActive ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {isDone && <CheckCircle size={11} />}
                          {ROLE_LABELS[s.approverRole] ?? s.approverRole}
                        </div>
                        {i < arr.length - 1 && <div className={`w-8 h-px mx-0.5 ${isDone ? 'bg-green-300' : 'bg-gray-200'}`} />}
                      </div>
                    );
                  })}
                </div>

                <div className="px-6 pb-4 space-y-4">
                  {/* Candidate + offer overview */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-gray-900">{offer.candidate.fullName}</span>
                        {offer.sourceApplicationId && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1">
                            <Link2 size={10} /> From ATS
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 mt-0.5">{offer.roleTitle} · {offer.department}</div>
                      <div className="text-sm text-gray-700 mt-1 font-medium">
                        Fixed: ₹{comp ? (comp.proposedFixed / 100000).toFixed(1) : '—'}L &nbsp;|&nbsp;
                        Total CTC: ₹{comp ? (comp.proposedTotalCTC / 100000).toFixed(1) : '—'}L
                        {comp?.joiningBonus > 0 && <span className="text-gray-500 font-normal"> + ₹{(comp.joiningBonus / 100000).toFixed(1)}L joining bonus</span>}
                      </div>
                      {offer.noticePeriodDays != null && (
                        <div className="text-xs text-gray-400 mt-0.5">Notice: {offer.noticePeriodDays} days</div>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-1.5">
                      <div className="text-xs font-medium text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full inline-block">
                        Pending: {ROLE_LABELS[step.approverRole] ?? step.approverRole}
                      </div>
                      {step.slaDeadline && (
                        <div className={`flex items-center justify-end gap-1 text-xs ${slaBreach ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                          <Clock size={11} /> SLA {slaBreach ? 'breached' : new Date(step.slaDeadline).toLocaleDateString('en-IN')}
                        </div>
                      )}
                      <Link to={`/offers/${offer.id}`} className="text-xs text-brand-600 hover:underline block">View offer →</Link>
                    </div>
                  </div>

                  {/* Interview summary toggle */}
                  {summary && (
                    <div>
                      <button
                        onClick={() => setExpandedSummary(isExpanded ? null : step.id)}
                        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-brand-700 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        Interview Summary
                        {summary.overallRecommendation && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${OUTCOME_BADGE[summary.overallRecommendation] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {RECOMMENDATION_LABEL[summary.overallRecommendation] ?? summary.overallRecommendation}
                          </span>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="mt-3 space-y-3 rounded-xl bg-gray-50 border border-gray-200 p-4">
                          {/* Recruiter screen */}
                          {summary.recruiterScreen && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Recruiter Screen</p>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                {summary.recruiterScreen.salaryExpectation && (
                                  <div><span className="text-gray-400">Expected CTC</span><div className="font-medium">₹{(summary.recruiterScreen.salaryExpectation / 100000).toFixed(1)}L</div></div>
                                )}
                                {summary.recruiterScreen.noticePeriodDays != null && (
                                  <div><span className="text-gray-400">Notice Period</span><div className="font-medium">{summary.recruiterScreen.noticePeriodDays} days</div></div>
                                )}
                                {summary.recruiterScreen.outcome && (
                                  <div><span className="text-gray-400">Outcome</span><div className={`font-medium ${summary.recruiterScreen.outcome === 'PROCEED' ? 'text-green-600' : 'text-red-500'}`}>{summary.recruiterScreen.outcome}</div></div>
                                )}
                              </div>
                              {summary.recruiterScreen.notes && <p className="text-xs text-gray-500 mt-1">{summary.recruiterScreen.notes}</p>}
                            </div>
                          )}

                          {/* HM Review */}
                          {summary.hmReview && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">HM Review</p>
                              <div className="flex items-center gap-3 text-xs">
                                {summary.hmReview.outcome && (
                                  <span className={`px-2 py-0.5 rounded-full font-medium border ${summary.hmReview.outcome === 'SHORTLIST' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                    {summary.hmReview.outcome}
                                  </span>
                                )}
                                {summary.hmReview.feedback && <span className="text-gray-600">{summary.hmReview.feedback}</span>}
                              </div>
                            </div>
                          )}

                          {/* Interview rounds */}
                          {summary.rounds?.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Interview Rounds ({summary.rounds.length})</p>
                              <div className="space-y-3">
                                {summary.rounds.map((round: any, ri: number) => (
                                  <div key={ri} className="bg-white rounded-lg border border-gray-200 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-gray-700">{round.title ?? `Round ${round.roundNumber}`}</span>
                                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${round.status === 'COMPLETED' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>{round.status}</span>
                                    </div>
                                    {round.feedback?.length > 0 ? (
                                      <div className="space-y-2">
                                        {round.feedback.map((fb: any, fi: number) => (
                                          <div key={fi} className="text-xs space-y-1 border-t border-gray-100 pt-2 first:border-0 first:pt-0">
                                            <div className="flex items-center justify-between">
                                              <span className="font-medium text-gray-700">{fb.interviewer}</span>
                                              <div className="flex items-center gap-2">
                                                <span className="text-yellow-500">{STAR_RATING(fb.overallRating)}</span>
                                                <span className={`px-1.5 py-0.5 rounded font-medium border ${
                                                  fb.outcome?.includes('YES') ? 'bg-green-50 text-green-700 border-green-200' :
                                                  fb.outcome?.includes('NO') ? 'bg-red-50 text-red-600 border-red-200' :
                                                  'bg-gray-50 text-gray-600 border-gray-200'
                                                }`}>{fb.outcome}</span>
                                              </div>
                                            </div>
                                            <div className="grid grid-cols-4 gap-1 text-gray-400">
                                              {fb.technicalSkills && <span>Tech: {fb.technicalSkills}/5</span>}
                                              {fb.communication && <span>Comm: {fb.communication}/5</span>}
                                              {fb.cultureFit && <span>Culture: {fb.cultureFit}/5</span>}
                                              {fb.problemSolving && <span>PS: {fb.problemSolving}/5</span>}
                                            </div>
                                            {fb.strengths && <p className="text-green-700">✓ {fb.strengths}</p>}
                                            {fb.concerns && <p className="text-red-500">⚠ {fb.concerns}</p>}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-gray-400 italic">No feedback submitted for this round</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Comment box */}
                  {activeStep === step.id && (
                    <div>
                      <label className="label">Comment (optional)</label>
                      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="input" placeholder="Add a note for this decision…" />
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    {activeStep !== step.id && (
                      <button onClick={() => setActiveStep(step.id)} className="btn-secondary text-xs">+ Add comment</button>
                    )}
                    <button onClick={() => act.mutate({ workflowId: step.workflowId, action: 'APPROVE', cmt: comment })} className="btn-primary text-xs" disabled={act.isPending}>
                      <CheckCircle size={13} /> Approve
                    </button>
                    <button onClick={() => act.mutate({ workflowId: step.workflowId, action: 'SEND_BACK', cmt: comment })} className="btn-secondary text-xs" disabled={act.isPending}>
                      <RotateCcw size={13} /> Send Back
                    </button>
                    <button onClick={() => act.mutate({ workflowId: step.workflowId, action: 'REJECT', cmt: comment })} className="btn-danger text-xs" disabled={act.isPending}>
                      <XCircle size={13} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
