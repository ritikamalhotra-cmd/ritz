import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { candidateApi } from '../services/candidateApi';
import toast from 'react-hot-toast';

const emailSchema = z.object({ email: z.string().email('Valid email required') });
const otpSchema = z.object({ otp: z.string().length(6, 'Enter 6-digit OTP') });

export default function CandidateLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const emailForm = useForm<{ email: string }>({ resolver: zodResolver(emailSchema) });
  const otpForm = useForm<{ otp: string }>({ resolver: zodResolver(otpSchema) });

  const requestOtp = async (data: { email: string }) => {
    setLoading(true);
    try {
      await candidateApi.post('/candidate/portal/request-otp', { email: data.email });
      setEmail(data.email);
      setStep('otp');
      toast.success('OTP sent to your email');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (data: { otp: string }) => {
    setLoading(true);
    try {
      const res = await candidateApi.post('/candidate/portal/verify-otp', { email, otp: data.otp });
      sessionStorage.setItem('portal_token', res.data.portalToken);
      sessionStorage.setItem('candidate_id', res.data.candidateId);
      navigate('/candidate/portal');
    } catch {
      toast.error('Invalid or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-700 rounded-xl mb-4">
            <span className="text-white text-lg font-bold">D</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">View Your Offer</h1>
          <p className="text-gray-500 text-sm mt-1">
            {step === 'email' ? 'Enter your email to receive a one-time code' : `We've sent a 6-digit code to ${email}`}
          </p>
        </div>

        <div className="card p-8">
          {step === 'email' ? (
            <form onSubmit={emailForm.handleSubmit(requestOtp)} className="space-y-5">
              <div>
                <label className="label">Email address</label>
                <input {...emailForm.register('email')} type="email" placeholder="you@example.com" className="input" />
                {emailForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-red-600">{emailForm.formState.errors.email.message}</p>
                )}
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                {loading ? 'Sending…' : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={otpForm.handleSubmit(verifyOtp)} className="space-y-5">
              <div>
                <label className="label">One-time code</label>
                <input
                  {...otpForm.register('otp')}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  className="input text-center text-2xl tracking-widest"
                />
                {otpForm.formState.errors.otp && (
                  <p className="mt-1 text-xs text-red-600">{otpForm.formState.errors.otp.message}</p>
                )}
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                {loading ? 'Verifying…' : 'Verify & View Offer'}
              </button>
              <button type="button" onClick={() => setStep('email')} className="btn-secondary w-full justify-center">
                Back
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
