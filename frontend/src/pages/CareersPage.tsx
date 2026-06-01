// Public careers page — no auth required
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { MapPin, Briefcase, Clock, ChevronRight, Search, X } from 'lucide-react';

const WORK_MODE_LABELS: Record<string, string> = {
  ONSITE: 'On-site', HYBRID: 'Hybrid', REMOTE: 'Remote',
};
const EMP_TYPE_LABELS: Record<string, string> = {
  PERMANENT: 'Full-time', CONTRACT: 'Contract', INTERN: 'Internship',
};

export default function CareersPage() {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [showApply, setShowApply] = useState(false);

  const { data: jobs = [], isLoading } = useQuery<any[]>({
    queryKey: ['careers-jobs'],
    queryFn: () => api.get('/careers/jobs').then((r) => r.data),
  });

  const departments = [...new Set(jobs.map((j: any) => j.department))].sort();

  const filtered = jobs.filter((j: any) => {
    const matchSearch = !search || j.title.toLowerCase().includes(search.toLowerCase()) || j.department.toLowerCase().includes(search.toLowerCase());
    const matchDept = !deptFilter || j.department === deptFilter;
    return matchSearch && matchDept;
  });

  const grouped = filtered.reduce<Record<string, any[]>>((acc, j) => {
    (acc[j.department] = acc[j.department] || []).push(j);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">d</span>
            </div>
            <div>
              <span className="font-bold text-gray-900 text-lg">DotPe</span>
              <span className="text-gray-400 text-sm ml-2">Careers</span>
            </div>
          </div>
          <a href="https://dotpe.in" className="text-sm text-gray-500 hover:text-gray-700">← Back to dotpe.in</a>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-red-600 to-red-800 text-white py-16 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">Join the DotPe Team</h1>
          <p className="text-red-100 text-lg max-w-2xl mx-auto">
            Help us build India's most powerful commerce infrastructure. We're looking for ambitious people who want to make a dent.
          </p>
          <div className="mt-8 max-w-xl mx-auto flex gap-3">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roles…"
                className="w-full pl-10 pr-4 py-3 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-4 py-3 rounded-xl text-gray-900 text-sm focus:outline-none bg-white"
            >
              <option value="">All Teams</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Jobs */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading open positions…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">No open positions match your search.</p>
            {(search || deptFilter) && (
              <button onClick={() => { setSearch(''); setDeptFilter(''); }} className="mt-3 text-red-600 hover:underline text-sm">Clear filters</button>
            )}
          </div>
        ) : (
          Object.entries(grouped).map(([dept, deptJobs]) => (
            <div key={dept} className="mb-10">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{dept}</h2>
              <div className="space-y-3">
                {deptJobs.map((job: any) => (
                  <div
                    key={job.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => { setSelectedJob(job); setShowApply(false); }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 text-base">{job.title}</h3>
                        <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-500">
                          {job.location && (
                            <span className="flex items-center gap-1"><MapPin size={13} />{job.location}</span>
                          )}
                          <span className="flex items-center gap-1"><Briefcase size={13} />{EMP_TYPE_LABELS[job.employmentType] ?? job.employmentType}</span>
                          <span className="flex items-center gap-1"><Clock size={13} />{WORK_MODE_LABELS[job.workMode] ?? job.workMode}</span>
                          {job.level && <span>{job.level}</span>}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedJob(job); setShowApply(true); }}
                        className="ml-4 bg-red-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {/* Stats */}
        <div className="mt-16 grid grid-cols-3 gap-6 text-center border-t border-gray-200 pt-12">
          <div><div className="text-3xl font-bold text-gray-900">{jobs.length}</div><div className="text-gray-500 mt-1">Open Positions</div></div>
          <div><div className="text-3xl font-bold text-gray-900">{departments.length}</div><div className="text-gray-500 mt-1">Teams Hiring</div></div>
          <div><div className="text-3xl font-bold text-gray-900">🚀</div><div className="text-gray-500 mt-1">Fast-growing startup</div></div>
        </div>
      </div>

      {/* Job detail + apply side sheet */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedJob(null)} />
          <div className="relative bg-white w-full max-w-xl shadow-2xl overflow-y-auto flex flex-col">
            <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between sticky top-0 bg-white">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedJob.title}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                  {selectedJob.location && <span>{selectedJob.location}</span>}
                  <span>{EMP_TYPE_LABELS[selectedJob.employmentType]}</span>
                  <span>{WORK_MODE_LABELS[selectedJob.workMode]}</span>
                </div>
              </div>
              <button onClick={() => setSelectedJob(null)} className="p-1 hover:bg-gray-100 rounded mt-1"><X size={20} /></button>
            </div>

            {!showApply ? (
              <div className="flex-1 p-6 space-y-6">
                {selectedJob.jdText && (
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">About the Role</h3>
                    <p className="text-gray-600 text-sm whitespace-pre-wrap">{selectedJob.jdText}</p>
                  </div>
                )}
                {selectedJob.responsibilities && (
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Responsibilities</h3>
                    <p className="text-gray-600 text-sm whitespace-pre-wrap">{selectedJob.responsibilities}</p>
                  </div>
                )}
                {selectedJob.requirements && (
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Requirements</h3>
                    <p className="text-gray-600 text-sm whitespace-pre-wrap">{selectedJob.requirements}</p>
                  </div>
                )}
                <button
                  onClick={() => setShowApply(true)}
                  className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
                >
                  Apply for this Role
                </button>
              </div>
            ) : (
              <ApplyForm job={selectedJob} onBack={() => setShowApply(false)} onSuccess={() => setSelectedJob(null)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Apply form ───────────────────────────────────────────────────────────────

function ApplyForm({ job, onBack, onSuccess }: { job: any; onBack: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', linkedIn: '', coverNote: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.fullName || !form.email) { setError('Name and email are required'); return; }
    setStatus('submitting');
    setError('');
    try {
      await api.post(`/careers/apply/${job.id}`, form);
      setStatus('success');
      setTimeout(onSuccess, 2500);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h3 className="text-xl font-bold text-gray-900">Application Submitted!</h3>
        <p className="text-gray-500 mt-2">Thank you for applying for <strong>{job.title}</strong>. We'll be in touch soon.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-4">
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
        ← Back to job details
      </button>
      <h3 className="font-semibold text-gray-900">Apply for {job.title}</h3>

      <div>
        <label className="label">Full Name *</label>
        <input className="input" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Your full name" />
      </div>
      <div>
        <label className="label">Email *</label>
        <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
      </div>
      <div>
        <label className="label">Phone</label>
        <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" />
      </div>
      <div>
        <label className="label">LinkedIn Profile</label>
        <input className="input" value={form.linkedIn} onChange={(e) => set('linkedIn', e.target.value)} placeholder="https://linkedin.com/in/yourname" />
      </div>
      <div>
        <label className="label">Cover Note</label>
        <textarea
          rows={4}
          className="input"
          value={form.coverNote}
          onChange={(e) => set('coverNote', e.target.value)}
          placeholder="Tell us why you'd be a great fit…"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={status === 'submitting'}
        className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
      >
        {status === 'submitting' ? 'Submitting…' : 'Submit Application'}
      </button>
    </div>
  );
}
