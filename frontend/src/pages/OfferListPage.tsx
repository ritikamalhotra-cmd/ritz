import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import Layout from '../components/common/Layout';
import { OFFER_STATUS_LABELS, OFFER_STATUS_BADGE } from '../constants/statuses';
import { canCreateOffer } from '../utils/roles';
import { useAuth } from '../context/AuthContext';
import { Plus, Search } from 'lucide-react';

export default function OfferListPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['offers', page, search, status],
    queryFn: () =>
      api.get('/offers', { params: { page, limit: 20, search: search || undefined, status: status || undefined } })
        .then((r) => r.data),
  });

  const offers = data?.offers ?? [];
  const pagination = data?.pagination;

  return (
    <Layout>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Offers</h1>
            <p className="text-sm text-gray-500 mt-0.5">{pagination?.total ?? '…'} total offers</p>
          </div>
          {canCreateOffer(user?.role ?? '') && (
            <Link to="/offers/new" className="btn-primary">
              <Plus size={16} /> New Offer
            </Link>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search candidate or role…"
              className="input pl-9"
            />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="input w-48">
            <option value="">All statuses</option>
            {Object.entries(OFFER_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Candidate', 'Role', 'Department', 'CTC', 'Status', 'Created'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              )}
              {!isLoading && offers.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No offers found.</td></tr>
              )}
              {offers.map((o: Record<string, unknown>) => {
                const candidate = o.candidate as { fullName: string } | undefined;
                const comp = o.compensationProposal as { proposedTotalCTC?: number } | undefined;
                const status = o.status as string;
                return (
                  <tr key={o.id as string} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/offers/${o.id as string}`} className="font-medium text-brand-700 hover:underline">
                        {candidate?.fullName ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{o.roleTitle as string}</td>
                    <td className="px-4 py-3 text-gray-500">{o.department as string}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {comp?.proposedTotalCTC
                        ? `₹${(comp.proposedTotalCTC / 100000).toFixed(1)}L`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={OFFER_STATUS_BADGE[status] ?? 'badge-gray'}>
                        {OFFER_STATUS_LABELS[status] ?? status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(o.createdAt as string).toLocaleDateString('en-IN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Page {pagination.page} of {pagination.pages}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary py-1 px-3 text-xs">Prev</button>
                <button onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.pages} className="btn-secondary py-1 px-3 text-xs">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
