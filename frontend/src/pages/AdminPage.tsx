import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '../services/api';
import Layout from '../components/common/Layout';
import { ROLE_LABELS } from '../utils/roles';
import toast from 'react-hot-toast';
import { Plus, RefreshCw, UserX, Pencil, X } from 'lucide-react';

const ASSIGNABLE_ROLES = [
  'ADMIN', 'TA_MANAGER', 'HOD', 'HR_HEAD', 'RECRUITER',
  'HRBP', 'COMP_FINANCE', 'ONBOARDING_SPOC', 'VIEWER',
];

interface User {
  id: string; email: string; firstName: string; lastName: string;
  role: string; department: string; isActive: boolean; lastLoginAt: string;
}

export default function AdminPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then(r => r.data.users),
  });

  const users: User[] = data ?? [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    email: string; password: string; firstName: string; lastName: string;
    role: string; department: string;
  }>();

  const createMutation = useMutation({
    mutationFn: (d: Record<string, string>) => api.post('/admin/users', d),
    onSuccess: () => {
      toast.success('User created');
      reset();
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed';
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/admin/users/${id}`, data),
    onSuccess: () => {
      toast.success('User updated');
      setEditUser(null);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: () => {
      toast.success('User deactivated');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const syncSheet = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/admin/sync-ats-sheet');
      const r = res.data.result;
      if (r.errors?.length) {
        toast.error(`ATS sync: ${r.errors[0]}`, { duration: 8000 });
      } else {
        toast.success(`ATS sync done — ${r.created} applications created, ${r.skipped} skipped`);
      }
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['requisitions'] });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Unknown error');
      toast.error(`Sync failed: ${msg}`, { duration: 8000 });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Layout>
      <div className="p-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
          <div className="flex gap-2">
            <button onClick={syncSheet} disabled={syncing} className="btn-secondary">
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync ATS Sheet'}
            </button>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus size={15} /> New User
            </button>
          </div>
        </div>

        {/* Create user modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="card p-6 w-full max-w-md space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Create User</h2>
                <button onClick={() => setShowCreate(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit(d => createMutation.mutate(d as Record<string, string>))} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">First Name</label>
                    <input {...register('firstName', { required: true })} className="input" />
                  </div>
                  <div>
                    <label className="label">Last Name</label>
                    <input {...register('lastName', { required: true })} className="input" />
                  </div>
                </div>
                <div>
                  <label className="label">Email</label>
                  <input {...register('email', { required: true })} type="email" className="input" placeholder="name@dotpe.in" />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input {...register('password', { required: true, minLength: 8 })} type="password" className="input" />
                  {errors.password && <p className="text-xs text-red-500 mt-1">Min 8 characters</p>}
                </div>
                <div>
                  <label className="label">Role</label>
                  <select {...register('role', { required: true })} className="input">
                    {ASSIGNABLE_ROLES.map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Department (optional)</label>
                  <input {...register('department')} className="input" placeholder="Engineering, Product…" />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1 justify-center">
                    {createMutation.isPending ? 'Creating…' : 'Create User'}
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit role modal */}
        {editUser && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="card p-6 w-full max-w-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Edit {editUser.firstName}</h2>
                <button onClick={() => setEditUser(null)}><X size={18} /></button>
              </div>
              <div>
                <label className="label">Role</label>
                <select
                  defaultValue={editUser.role}
                  onChange={e => setEditUser({ ...editUser, role: e.target.value })}
                  className="input"
                >
                  {ASSIGNABLE_ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => updateMutation.mutate({ id: editUser.id, data: { role: editUser.role } })}
                  className="btn-primary flex-1 justify-center"
                >
                  Save
                </button>
                <button onClick={() => setEditUser(null)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Users table */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Users ({users.length})</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'Email', 'Role', 'Department', 'Last Login', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>}
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{u.firstName} {u.lastName}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="badge-blue">{ROLE_LABELS[u.role] ?? u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{u.department || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-IN') : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={u.isActive ? 'badge-green' : 'badge-gray'}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setEditUser(u)} className="p-1.5 text-gray-400 hover:text-brand-700 rounded">
                        <Pencil size={14} />
                      </button>
                      {u.isActive && (
                        <button
                          onClick={() => deactivateMutation.mutate(u.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                        >
                          <UserX size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
