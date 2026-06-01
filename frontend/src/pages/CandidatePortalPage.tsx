import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { candidateApi } from '../services/candidateApi';
import toast from 'react-hot-toast';
import { FileText, CheckCircle, XCircle, Download } from 'lucide-react';

export default function CandidatePortalPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const [signatureName, setSignatureName] = useState('');
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['candidate-offer', caseId],
    queryFn: () => candidateApi.get(`/offer-letters/candidate/${caseId}`).then((r) => r.data),
    retry: false,
  });

  const signMutation = useMutation({
    mutationFn: () => candidateApi.post(`/offer-letters/candidate/${caseId}/sign`, { signatureName }),
    onSuccess: () => {
      toast.success('Offer accepted! Welcome to Dotpe.');
      navigate('/candidate/accepted');
    },
    onError: () => toast.error('Failed to sign. Please try again.'),
  });

  const declineMutation = useMutation({
    mutationFn: () => candidateApi.post(`/offer-letters/candidate/${caseId}/decline`),
    onSuccess: () => {
      toast('Offer declined.');
      navigate('/candidate/declined');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-700" />
      </div>
    );
  }

  if (error || !data?.offerLetter) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Offer not found</h2>
          <p className="text-gray-500 text-sm">The offer link may have expired or is invalid.</p>
        </div>
      </div>
    );
  }

  const letter = data.offerLetter;
  const isSigned = letter.status === 'SIGNED';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-brand-700 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <span className="font-bold text-lg">dotpe</span>
          <span className="text-brand-300 text-sm ml-2">Offer of Employment</span>
        </div>
        <a
          href={`/api/offer-letters/pdf/${caseId}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Download size={14} /> Download PDF
        </a>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {isSigned && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
            <CheckCircle size={20} className="text-green-600 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-green-800">Offer Accepted</div>
              <div className="text-xs text-green-600">
                Signed as "{letter.signatureName}" on{' '}
                {new Date(letter.candidateSignedAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}
              </div>
            </div>
          </div>
        )}

        {/* Offer letter content placeholder — real content comes from rendered PDF */}
        <div className="card p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileText size={20} className="text-brand-700" />
            <h2 className="text-lg font-semibold text-gray-900">Offer Letter</h2>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Please download the PDF to read the full offer letter. Once you've reviewed it, you can accept or decline below.
          </p>
          <a
            href={`/api/offer-letters/pdf/${caseId}`}
            target="_blank"
            rel="noreferrer"
            className="btn-primary"
          >
            <Download size={16} /> Open Offer Letter PDF
          </a>
        </div>

        {/* Sign / Decline */}
        {!isSigned && letter.status === 'RELEASED' && (
          <div className="card p-8 space-y-6">
            <h3 className="text-base font-semibold text-gray-900">Your Response</h3>

            {confirming ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  By signing below, you confirm acceptance of all terms in the offer letter.
                </p>
                <div>
                  <label className="label">Type your full name to sign</label>
                  <input
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    placeholder="Your full legal name"
                    className="input"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => signMutation.mutate()}
                    disabled={!signatureName.trim() || signMutation.isPending}
                    className="btn-primary flex-1 justify-center"
                  >
                    <CheckCircle size={16} />
                    {signMutation.isPending ? 'Signing…' : 'Confirm & Accept'}
                  </button>
                  <button onClick={() => setConfirming(false)} className="btn-secondary">
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button onClick={() => setConfirming(true)} className="btn-primary flex-1 justify-center">
                  <CheckCircle size={16} /> Accept Offer
                </button>
                <button
                  onClick={() => declineMutation.mutate()}
                  disabled={declineMutation.isPending}
                  className="btn-danger"
                >
                  <XCircle size={16} /> Decline
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
