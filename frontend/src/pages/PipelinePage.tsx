// Kanban pipeline view for a single requisition — full Sprint 2-5 build
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Layout from '../components/common/Layout';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, Plus, X, UserPlus, ChevronRight, Mail, Phone,
  Calendar, Video, MessageSquare, Send, Star, FileText,
} from 'lucide-react';

// ── Stage config ─────────────────────────────────────────────────────────────

const STAGES = [
  { key: 'APPLIED',          label: 'Applied',          color: 'border-gray-300 bg-gray-50' },
  { key: 'SCREENING',        label: 'Screening',        color: 'border-blue-300 bg-blue-50' },
  { key: 'RECRUITER_CALL',   label: 'Recruiter Call',   color: 'border-indigo-300 bg-indigo-50' },
  { key: 'HM_REVIEW',        label: 'HM Review',        color: 'border-purple-300 bg-purple-50' },
  { key: 'INTERVIEW',        label: 'Interview',        color: 'border-yellow-300 bg-yellow-50' },
  { key: 'DEBRIEF',          label: 'Debrief',          color: 'border-orange-300 bg-orange-50' },
  { key: 'OFFER_DISCUSSION', label: 'Offer Discussion', color: 'border-rose-300 bg-rose-50' },
  { key: 'OFFER',            label: 'Offer',            color: 'border-green-300 bg-green-50' },
];

const STAGE_BADGE: Record<string, string> = {
  APPLIED: 'bg-gray-100 text-gray-600', SCREENING: 'bg-blue-100 text-blue-700',
  RECRUITER_CALL: 'bg-indigo-100 text-indigo-700', HM_REVIEW: 'bg-purple-100 text-purple-700',
  INTERVIEW: 'bg-yellow-100 text-yellow-800', DEBRIEF: 'bg-orange-100 text-orange-700',
  OFFER_DISCUSSION: 'bg-rose-100 text-rose-700', OFFER: 'bg-green-100 text-green-700',
  JOINED: 'bg-emerald-100 text-emerald-700', REJECTED: 'bg-red-100 text-red-500',
};

type PanelTab = 'overview' | 'interview' | 'email' | 'feedback';

// ── Main component ────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { id: reqId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('overview');

  const { data: req } = useQuery<any>({
    queryKey: ['requisition', reqId],
    queryFn: () => api.get(`/requisitions/${reqId}`).then((r) => r.data),
  });

  const { data: applications = [], isLoading } = useQuery<any[]>({
    queryKey: ['applications', reqId],
    queryFn: () => api.get('/applications', { params: { requisitionId: reqId } }).then((r) => r.data),
    refetchInterval: 30000,
  });

  // Refresh selected app from the list whenever it updates
  const refreshedSelectedApp = selectedApp
    ? applications.find((a: any) => a.id === selectedApp.id) ?? selectedApp
    : null;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['applications', reqId] });

  const moveMutation = useMutation({
    mutationFn: ({ appId, stage }: { appId: string; stage: string }) =>
      api.post(`/applications/${appId}/move`, { stage }).then((r) => r.data),
    onSuccess: (updated) => {
      invalidate();
      if (selectedApp?.id === updated.id) setSelectedApp(updated);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ appId, reason }: { appId: string; reason?: string }) =>
      api.post(`/applications/${appId}/reject`, { reason }).then((r) => r.data),
    onSuccess: () => { invalidate(); setSelectedApp(null); },
  });

  const createOfferMutation = useMutation({
    mutationFn: (appId: string) => api.post(`/applications/${appId}/create-offer`).then((r) => r.data),
    onSuccess: (data) => navigate(`/offers/${data.offerCaseId}`),
  });

  const appsByStage = (stage: string) => applications.filter((a: any) => a.stage === stage);

  return (
    <Layout>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center gap-4 shrink-0">
          <button onClick={() => navigate(`/requisitions/${reqId}`)} className="btn-secondary py-1.5 px-3">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-gray-900 text-lg">
              {req?.title ?? 'Pipeline'}
              {req && <span className="ml-2 text-xs text-gray-400 font-mono">REQ-{String(req.reqNumber).padStart(4, '0')}</span>}
            </h1>
            <p className="text-xs text-gray-500">{applications.length} candidates · {applications.filter((a: any) => a.stage !== 'REJECTED').length} active</p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <UserPlus size={15} /> Add Candidate
          </button>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 p-4 h-full" style={{ minWidth: `${STAGES.length * 210}px` }}>
            {STAGES.map((stage) => {
              const cards = appsByStage(stage.key);
              return (
                <div key={stage.key} className={`flex flex-col rounded-xl border-2 ${stage.color} w-52 shrink-0`}>
                  <div className="px-3 py-2 border-b border-current border-opacity-20 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">{stage.label}</span>
                    <span className="text-xs bg-white rounded-full px-1.5 py-0.5 font-bold text-gray-500 border border-gray-200">{cards.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
                    {isLoading && <div className="text-xs text-gray-400 text-center py-3">…</div>}
                    {cards.map((app: any) => (
                      <AppCard
                        key={app.id}
                        app={app}
                        stageKey={stage.key}
                        stages={STAGES}
                        onMove={(s) => moveMutation.mutate({ appId: app.id, stage: s })}
                        onSelect={() => { setSelectedApp(app); setPanelTab('overview'); }}
                        isSelected={selectedApp?.id === app.id}
                        moving={moveMutation.isPending}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Candidate Modal */}
      {showAddModal && (
        <AddCandidateModal reqId={reqId!} onClose={() => setShowAddModal(false)} onAdded={() => { invalidate(); setShowAddModal(false); }} />
      )}

      {/* Application detail panel */}
      {refreshedSelectedApp && (
        <AppPanel
          app={refreshedSelectedApp}
          stages={STAGES}
          tab={panelTab}
          onTabChange={setPanelTab}
          onClose={() => setSelectedApp(null)}
          onMove={(s) => moveMutation.mutate({ appId: refreshedSelectedApp.id, stage: s })}
          onReject={(r) => rejectMutation.mutate({ appId: refreshedSelectedApp.id, reason: r })}
          onCreateOffer={() => createOfferMutation.mutate(refreshedSelectedApp.id)}
          creatingOffer={createOfferMutation.isPending}
          userRole={user?.role ?? ''}
          onRefresh={invalidate}
        />
      )}
    </Layout>
  );
}

// ── App card ──────────────────────────────────────────────────────────────────

function AppCard({ app, stageKey, stages, onMove, onSelect, isSelected, moving }: any) {
  const stageIdx = stages.findIndex((s: any) => s.key === stageKey);
  const next = stages[stageIdx + 1];
  const hasInterview = app.interviewPlan?.rounds?.length > 0;

  return (
    <div
      onClick={onSelect}
      className={`bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-all cursor-pointer ${isSelected ? 'border-brand-500 ring-1 ring-brand-300' : 'border-gray-200'}`}
    >
      <div className="font-medium text-gray-900 text-sm truncate">{app.candidate?.fullName}</div>
      <div className="text-xs text-gray-400 truncate">{app.candidate?.email}</div>
      <div className="flex items-center gap-2 mt-1.5">
        {hasInterview && <span className="text-xs text-yellow-600">📅 {app.interviewPlan.rounds.length}R</span>}
        {app.recruiterScreen?.outcome && <span className="text-xs text-green-600">✓ Screened</span>}
      </div>
      {next && (
        <button
          onClick={(e) => { e.stopPropagation(); onMove(next.key); }}
          disabled={moving}
          className="mt-2 w-full text-xs flex items-center justify-center gap-1 text-brand-600 hover:text-brand-800 hover:bg-brand-50 rounded py-1 transition-colors"
        >
          → {next.label}
        </button>
      )}
    </div>
  );
}

// ── Application panel ─────────────────────────────────────────────────────────

function AppPanel({ app, stages, tab, onTabChange, onClose, onMove, onReject, onCreateOffer, creatingOffer, userRole, onRefresh }: any) {
  const stageIdx = stages.findIndex((s: any) => s.key === app.stage);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const canCreateOffer = ['RECRUITER', 'TA_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);

  return (
    <div className="fixed inset-0 z-40 flex justify-end pointer-events-none">
      <div className="absolute inset-0 bg-black/20 pointer-events-auto" onClick={onClose} />
      <div className="relative bg-white w-[480px] shadow-2xl overflow-hidden flex flex-col pointer-events-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-gray-900 text-base">{app.candidate?.fullName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_BADGE[app.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                  {stages.find((s: any) => s.key === app.stage)?.label ?? app.stage}
                </span>
                {app.source && app.source !== 'MANUAL' && (
                  <span className="text-xs text-gray-400">{app.source}</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mt-3 -mb-px">
            {([
              { id: 'overview', label: 'Overview', icon: FileText },
              { id: 'interview', label: 'Interviews', icon: Calendar },
              { id: 'email', label: 'Email', icon: Mail },
              { id: 'feedback', label: 'Feedback', icon: Star },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                  tab === id ? 'border-brand-700 text-brand-700 bg-brand-50' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={12} />{label}
              </button>
            ))}
          </div>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'overview' && (
            <OverviewTab
              app={app} stages={stages} stageIdx={stageIdx}
              onMove={onMove} onReject={onReject}
              showReject={showReject} setShowReject={setShowReject}
              rejectReason={rejectReason} setRejectReason={setRejectReason}
              onCreateOffer={onCreateOffer} creatingOffer={creatingOffer} canCreateOffer={canCreateOffer}
            />
          )}
          {tab === 'interview' && <InterviewTab app={app} onRefresh={onRefresh} />}
          {tab === 'email' && <EmailTab app={app} />}
          {tab === 'feedback' && <FeedbackTab app={app} />}
        </div>
      </div>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ app, stages, stageIdx, onMove, onReject, showReject, setShowReject, rejectReason, setRejectReason, onCreateOffer, creatingOffer, canCreateOffer }: any) {
  const qc = useQueryClient();
  const [screenForm, setScreenForm] = useState<any>(app.recruiterScreen ?? {});
  const [hmForm, setHmForm] = useState<any>(app.hmReview ?? {});
  const [savingScreen, setSavingScreen] = useState(false);
  const [savingHM, setSavingHM] = useState(false);

  const saveScreen = async () => {
    setSavingScreen(true);
    await api.put(`/applications/${app.id}/recruiter-screen`, screenForm).catch(() => {});
    setSavingScreen(false);
    qc.invalidateQueries({ queryKey: ['applications'] });
  };

  const saveHM = async () => {
    setSavingHM(true);
    await api.put(`/applications/${app.id}/hm-review`, hmForm).catch(() => {});
    setSavingHM(false);
    qc.invalidateQueries({ queryKey: ['applications'] });
  };

  return (
    <div className="p-5 space-y-5">
      {/* Contact */}
      <div className="space-y-1.5">
        {app.candidate?.email && (
          <a href={`mailto:${app.candidate.email}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-brand-700">
            <Mail size={14} className="text-gray-400" />{app.candidate.email}
          </a>
        )}
        {app.candidate?.phone && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Phone size={14} className="text-gray-400" />{app.candidate.phone}
          </div>
        )}
      </div>

      {/* Stage navigation */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Stage</p>
        <div className="grid grid-cols-4 gap-1.5">
          {stages.map((s: any, i: number) => (
            <button
              key={s.key}
              onClick={() => onMove(s.key)}
              disabled={s.key === app.stage}
              className={`text-xs px-1.5 py-1.5 rounded-lg border text-center transition-colors ${
                s.key === app.stage ? 'bg-brand-700 text-white border-brand-700 font-semibold' :
                i < stageIdx ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' :
                'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Offer bridge */}
      {canCreateOffer && (app.stage === 'OFFER_DISCUSSION' || app.stage === 'OFFER') && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4">
          <p className="text-sm font-medium text-green-800 mb-2">Ready to issue an offer?</p>
          <button
            onClick={onCreateOffer}
            disabled={creatingOffer}
            className="btn-primary bg-green-600 hover:bg-green-700 text-sm"
          >
            <FileText size={14} /> {creatingOffer ? 'Creating…' : 'Create Offer Case'}
          </button>
        </div>
      )}

      {/* Recruiter screen */}
      <div className="rounded-lg border border-gray-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase">Recruiter Screen</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label text-xs">Expected CTC (₹)</label>
            <input type="number" className="input text-sm py-1.5" value={screenForm.salaryExpectation ?? ''} onChange={(e) => setScreenForm({ ...screenForm, salaryExpectation: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label text-xs">Notice Period (days)</label>
            <input type="number" className="input text-sm py-1.5" value={screenForm.noticePeriodDays ?? ''} onChange={(e) => setScreenForm({ ...screenForm, noticePeriodDays: Number(e.target.value) })} />
          </div>
          <div className="col-span-2">
            <label className="label text-xs">Outcome</label>
            <select className="input text-sm py-1.5" value={screenForm.outcome ?? ''} onChange={(e) => setScreenForm({ ...screenForm, outcome: e.target.value })}>
              <option value="">—</option>
              <option value="PROCEED">✓ Proceed</option>
              <option value="ON_HOLD">⏸ On Hold</option>
              <option value="REJECT">✗ Reject</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="label text-xs">Notes</label>
            <textarea rows={2} className="input text-sm" value={screenForm.notes ?? ''} onChange={(e) => setScreenForm({ ...screenForm, notes: e.target.value })} />
          </div>
        </div>
        <button onClick={saveScreen} disabled={savingScreen} className="btn-secondary text-xs py-1.5">{savingScreen ? 'Saving…' : 'Save Screen'}</button>
      </div>

      {/* HM Review */}
      <div className="rounded-lg border border-gray-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase">HM Review</p>
        <div>
          <label className="label text-xs">Outcome</label>
          <select className="input text-sm py-1.5" value={hmForm.outcome ?? ''} onChange={(e) => setHmForm({ ...hmForm, outcome: e.target.value })}>
            <option value="">—</option>
            <option value="SHORTLIST">✓ Shortlist</option>
            <option value="ON_HOLD">⏸ On Hold</option>
            <option value="REJECT">✗ Reject</option>
          </select>
        </div>
        <div>
          <label className="label text-xs">Feedback</label>
          <textarea rows={2} className="input text-sm" value={hmForm.feedback ?? ''} onChange={(e) => setHmForm({ ...hmForm, feedback: e.target.value })} />
        </div>
        <button onClick={saveHM} disabled={savingHM} className="btn-secondary text-xs py-1.5">{savingHM ? 'Saving…' : 'Save Review'}</button>
      </div>

      {/* Stage history */}
      {app.stageHistory?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">History</p>
          <div className="space-y-1.5">
            {app.stageHistory.slice(0, 6).map((h: any) => (
              <div key={h.id} className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-300 shrink-0" />
                <span>{h.fromStage ? `${h.fromStage} → ` : ''}<span className="font-medium text-gray-700">{h.toStage}</span> · {h.changedBy?.firstName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reject */}
      {app.stage !== 'REJECTED' && app.stage !== 'JOINED' && (
        <div className="pt-2 border-t border-gray-100">
          {!showReject ? (
            <button onClick={() => setShowReject(true)} className="text-xs text-red-500 hover:text-red-700 underline">Reject candidate</button>
          ) : (
            <div className="space-y-2">
              <textarea rows={2} className="input text-sm" placeholder="Reason for rejection (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => onReject(rejectReason || undefined)} className="btn-secondary text-red-600 text-xs py-1.5">Confirm Reject</button>
                <button onClick={() => setShowReject(false)} className="btn-secondary text-xs py-1.5">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Interview tab ─────────────────────────────────────────────────────────────

function InterviewTab({ app, onRefresh }: { app: any; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', scheduledAt: '', durationMins: 60, mode: 'VIDEO', meetLink: '' });
  const [saving, setSaving] = useState(false);

  const rounds = app.interviewPlan?.rounds ?? [];
  const nextRound = rounds.length + 1;

  const schedule = async () => {
    setSaving(true);
    try {
      await api.post(`/applications/${app.id}/schedule-round`, {
        roundNumber: nextRound,
        title: form.title || `Round ${nextRound}`,
        scheduledAt: form.scheduledAt || undefined,
        durationMins: form.durationMins,
        mode: form.mode,
        meetLink: form.meetLink || undefined,
      });
      setShowForm(false);
      setForm({ title: '', scheduledAt: '', durationMins: 60, mode: 'VIDEO', meetLink: '' });
      onRefresh();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const markDone = async (roundId: string) => {
    await api.patch(`/applications/rounds/${roundId}`, { status: 'COMPLETED', conductedAt: new Date().toISOString() });
    onRefresh();
  };

  return (
    <div className="p-5 space-y-4">
      {rounds.length === 0 && !showForm && (
        <div className="text-center py-8 text-gray-400 text-sm">No interview rounds scheduled yet.</div>
      )}

      {rounds.map((round: any) => (
        <div key={round.id} className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-sm text-gray-800">{round.title ?? `Round ${round.roundNumber}`}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              round.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
              round.status === 'CANCELLED' ? 'bg-red-100 text-red-500' :
              'bg-yellow-100 text-yellow-700'
            }`}>{round.status}</span>
          </div>
          <div className="text-xs text-gray-500 space-y-1">
            {round.scheduledAt && (
              <div className="flex items-center gap-1.5">
                <Calendar size={11} />
                {new Date(round.scheduledAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Video size={11} />
              {round.mode} · {round.durationMins}min
            </div>
            {round.meetLink && (
              <a href={round.meetLink} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline flex items-center gap-1">
                <Video size={11} /> Join Meet
              </a>
            )}
          </div>
          {round.status === 'SCHEDULED' && (
            <button onClick={() => markDone(round.id)} className="mt-2 text-xs text-green-600 hover:underline">Mark Completed</button>
          )}
          {/* Feedback summary */}
          {round.feedback?.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              {round.feedback.map((fb: any) => (
                <div key={fb.id} className="text-xs text-gray-500 flex items-center gap-2">
                  <Star size={10} className="text-yellow-500" />
                  Rating: {fb.overallRating}/5 · {fb.outcome}
                  {fb.concerns && <span className="text-red-500"> ⚠ {fb.concerns.slice(0, 40)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {showForm ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-brand-800">Schedule Round {nextRound}</p>
          <div>
            <label className="label text-xs">Round Title</label>
            <input className="input text-sm py-1.5" placeholder={`Round ${nextRound}`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Date & Time</label>
              <input type="datetime-local" className="input text-sm py-1.5" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
            </div>
            <div>
              <label className="label text-xs">Duration (mins)</label>
              <input type="number" className="input text-sm py-1.5" value={form.durationMins} onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Mode</label>
              <select className="input text-sm py-1.5" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="VIDEO">Video</option>
                <option value="IN_PERSON">In Person</option>
                <option value="PHONE">Phone</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Meet Link (optional)</label>
              <input className="input text-sm py-1.5" value={form.meetLink} onChange={(e) => setForm({ ...form, meetLink: e.target.value })} placeholder="https://meet.google.com/…" />
            </div>
          </div>
          <p className="text-xs text-gray-400">An invite will be emailed to the candidate. If Google Calendar is configured, an event will be auto-created.</p>
          <div className="flex gap-2">
            <button onClick={schedule} disabled={saving} className="btn-primary text-xs py-1.5">{saving ? 'Scheduling…' : 'Schedule Round'}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary text-xs py-1.5">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 hover:border-brand-300 hover:text-brand-600 transition-colors flex items-center justify-center gap-2">
          <Plus size={16} /> Add Interview Round
        </button>
      )}
    </div>
  );
}

// ── Email tab ─────────────────────────────────────────────────────────────────

function EmailTab({ app }: { app: any }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ subject: '', body: '', type: 'CUSTOM' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const { data: comms = [] } = useQuery<any[]>({
    queryKey: ['app-comms', app.id],
    queryFn: () => api.get(`/applications/${app.id}/communications`).then((r) => r.data),
  });

  const TEMPLATES = [
    { label: 'Moving to next stage', subject: `Update on your application — ${app.requisition?.title}`, body: `Hi ${app.candidate?.fullName},\n\nThank you for your time and patience. We are pleased to inform you that your application has been shortlisted for the next round of the selection process.\n\nOur team will be in touch with further details shortly.` },
    { label: 'Interview scheduled', subject: `Interview Scheduled — ${app.requisition?.title}`, body: `Hi ${app.candidate?.fullName},\n\nWe have scheduled your interview. Please watch out for a calendar invite with all the details.\n\nLooking forward to speaking with you!` },
    { label: 'Regret letter', subject: `Regarding your application — ${app.requisition?.title}`, body: `Hi ${app.candidate?.fullName},\n\nThank you for your interest in the ${app.requisition?.title} role and for the time you invested in the interview process.\n\nAfter careful consideration, we have decided to move forward with another candidate whose profile more closely matches our current requirements.\n\nWe appreciate your interest in DotPe and wish you the very best in your career endeavours.` },
  ];

  const send = async () => {
    if (!form.subject || !form.body) return;
    setSending(true);
    try {
      await api.post(`/applications/${app.id}/send-email`, form);
      setSent(true);
      setForm({ subject: '', body: '', type: 'CUSTOM' });
      qc.invalidateQueries({ queryKey: ['app-comms', app.id] });
      setTimeout(() => setSent(false), 3000);
    } catch { /* ignore */ }
    setSending(false);
  };

  return (
    <div className="p-5 space-y-4">
      {/* Templates */}
      <div>
        <label className="label text-xs">Quick Templates</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {TEMPLATES.map((t) => (
            <button key={t.label} onClick={() => setForm({ ...form, subject: t.subject, body: t.body })}
              className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-brand-50 hover:text-brand-700 rounded-full text-gray-600 transition-colors">
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label text-xs">To</label>
        <div className="input text-sm py-2 bg-gray-50 text-gray-500">{app.candidate?.email}</div>
      </div>
      <div>
        <label className="label text-xs">Subject</label>
        <input className="input text-sm" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
      </div>
      <div>
        <label className="label text-xs">Message</label>
        <textarea rows={5} className="input text-sm" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </div>

      {sent && <p className="text-xs text-green-600">✓ Email sent successfully</p>}

      <button onClick={send} disabled={sending || !form.subject || !form.body} className="btn-primary text-sm w-full">
        <Send size={14} /> {sending ? 'Sending…' : 'Send Email'}
      </button>

      {/* Log */}
      {comms.length > 0 && (
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Communication Log</p>
          <div className="space-y-2">
            {comms.map((c: any) => (
              <div key={c.id} className={`rounded-lg p-3 text-xs ${c.direction === 'INBOUND' ? 'bg-gray-50' : 'bg-brand-50'}`}>
                <div className="flex justify-between text-gray-500 mb-1">
                  <span className="font-medium text-gray-700">{c.subject}</span>
                  <span>{new Date(c.createdAt).toLocaleDateString('en-IN')}</span>
                </div>
                <p className="text-gray-600 line-clamp-2">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Feedback tab ──────────────────────────────────────────────────────────────

function FeedbackTab({ app }: { app: any }) {
  const qc = useQueryClient();
  const rounds = app.interviewPlan?.rounds ?? [];
  const [selected, setSelected] = useState<any>(rounds[0]);
  const [form, setForm] = useState({ overallRating: 3, outcome: 'YES', technicalSkills: 3, communication: 3, cultureFit: 3, problemSolving: 3, strengths: '', concerns: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/applications/rounds/${selected.id}/feedback`, form);
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['applications'] });
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (rounds.length === 0) {
    return <div className="p-5 text-sm text-gray-400 text-center py-10">No interview rounds yet. Schedule an interview first.</div>;
  }

  const myFeedback = selected?.feedback?.find((f: any) => f.isSubmitted);
  const allFeedback = selected?.feedback ?? [];

  return (
    <div className="p-5 space-y-4">
      {/* Round selector */}
      <div>
        <label className="label text-xs">Interview Round</label>
        <select className="input text-sm" value={selected?.id ?? ''} onChange={(e) => setSelected(rounds.find((r: any) => r.id === e.target.value))}>
          {rounds.map((r: any) => <option key={r.id} value={r.id}>{r.title ?? `Round ${r.roundNumber}`} — {r.status}</option>)}
        </select>
      </div>

      {/* Existing feedback */}
      {allFeedback.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Submitted Feedback ({allFeedback.length})</p>
          {allFeedback.map((fb: any) => (
            <div key={fb.id} className="rounded-lg bg-gray-50 p-3 text-xs space-y-1 mb-2">
              <div className="flex justify-between">
                <span className="font-medium">Rating: {'★'.repeat(fb.overallRating)}{'☆'.repeat(5 - fb.overallRating)}</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${fb.outcome === 'STRONG_YES' || fb.outcome === 'YES' ? 'bg-green-100 text-green-700' : fb.outcome === 'NO' || fb.outcome === 'STRONG_NO' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>{fb.outcome}</span>
              </div>
              {fb.strengths && <p className="text-green-700">+ {fb.strengths}</p>}
              {fb.concerns && <p className="text-red-600">⚠ {fb.concerns}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Submit form */}
      <div className="rounded-lg border border-gray-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase">Submit Your Feedback</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'overallRating', label: 'Overall Rating' },
            { key: 'technicalSkills', label: 'Technical Skills' },
            { key: 'communication', label: 'Communication' },
            { key: 'cultureFit', label: 'Culture Fit' },
            { key: 'problemSolving', label: 'Problem Solving' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="label text-xs">{label} (1-5)</label>
              <input type="range" min={1} max={5} className="w-full" value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />
              <div className="text-xs text-gray-500 text-right">{'★'.repeat((form as any)[key])}</div>
            </div>
          ))}
          <div>
            <label className="label text-xs">Recommendation</label>
            <select className="input text-sm py-1.5" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
              <option value="STRONG_YES">Strong Yes</option>
              <option value="YES">Yes</option>
              <option value="NEUTRAL">Neutral</option>
              <option value="NO">No</option>
              <option value="STRONG_NO">Strong No</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label text-xs">Strengths</label>
          <textarea rows={2} className="input text-sm" value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} placeholder="What impressed you?" />
        </div>
        <div>
          <label className="label text-xs">Concerns</label>
          <textarea rows={2} className="input text-sm" value={form.concerns} onChange={(e) => setForm({ ...form, concerns: e.target.value })} placeholder="Any red flags or gaps?" />
        </div>
        <div>
          <label className="label text-xs">Notes</label>
          <textarea rows={2} className="input text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional observations…" />
        </div>
        {saved && <p className="text-xs text-green-600">✓ Feedback submitted</p>}
        <button onClick={submit} disabled={saving} className="btn-primary text-sm w-full">{saving ? 'Submitting…' : 'Submit Feedback'}</button>
      </div>
    </div>
  );
}

// ── Add Candidate Modal ───────────────────────────────────────────────────────

function AddCandidateModal({ reqId, onClose, onAdded }: { reqId: string; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', source: 'MANUAL' });
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const submit = async () => {
    if (!form.fullName || !form.email) { setError('Name and email are required'); return; }
    setAdding(true); setError('');
    try {
      await api.post('/applications', { requisitionId: reqId, source: form.source, newCandidate: { fullName: form.fullName, email: form.email, phone: form.phone } });
      onAdded();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Failed to add candidate');
    }
    setAdding(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Add Candidate</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div><label className="label">Full Name *</label><input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
          <div><label className="label">Email *</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div>
            <label className="label">Source</label>
            <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              <option value="MANUAL">Manual</option>
              <option value="REFERRAL">Referral</option>
              <option value="PORTAL">Careers Page</option>
              <option value="LINKEDIN">LinkedIn</option>
              <option value="NAUKRI">Naukri</option>
              <option value="INDEED">Indeed</option>
            </select>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={submit} disabled={adding} className="btn-primary flex-1"><Plus size={15} />{adding ? 'Adding…' : 'Add to Pipeline'}</button>
        </div>
      </div>
    </div>
  );
}
