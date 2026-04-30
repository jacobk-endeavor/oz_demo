import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../AuthContext';

interface GmailStatusResponse {
  connected: boolean;
  account_email: string | null;
  requires_reauth: boolean;
}

interface GmailAuthUrlResponse {
  auth_url: string;
}

function roleLabel(role: string | null): string {
  if (!role) return 'Unknown';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function normalizeOauthError(error: string): string {
  return decodeURIComponent(error).replaceAll('_', ' ');
}

export default function SettingsPage() {
  const { user, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [statusLoading, setStatusLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [requiresReauth, setRequiresReauth] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const connectedParam = params.get('gmail');
    const errorParam = params.get('gmail_error');

    if (connectedParam === 'connected') {
      setError(null);
      setSuccess('Gmail connected successfully.');
      setRequiresReauth(false);
    }

    if (errorParam) {
      setSuccess(null);
      setError(`Gmail connect failed: ${normalizeOauthError(errorParam)}`);
    }

    if (connectedParam || errorParam) {
      navigate('/settings', { replace: true });
    }
  }, [location.search, navigate]);

  useEffect(() => {
    setStatusLoading(true);
    api
      .get<GmailStatusResponse>('/api/gmail/status')
      .then((res) => {
        setConnected(res.data.connected);
        setAccountEmail(res.data.account_email);
        setRequiresReauth(res.data.requires_reauth);
      })
      .catch(() => {
        setConnected(false);
        setAccountEmail(null);
        setError((prev) => prev ?? 'Failed to load Gmail connection status.');
      })
      .finally(() => setStatusLoading(false));
  }, [location.key]);

  const onConnectGmail = async () => {
    setConnectLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.get<GmailAuthUrlResponse>('/api/gmail/auth-url');
      window.location.href = res.data.auth_url;
    } catch {
      setError('Unable to start Gmail connect flow.');
      setConnectLoading(false);
    }
  };

  const onDisconnectGmail = async () => {
    setDisconnectLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await api.delete('/api/gmail/disconnect');
      setConnected(false);
      setRequiresReauth(false);
      setAccountEmail(null);
      setSuccess('Gmail disconnected.');
    } catch {
      setError('Failed to disconnect Gmail.');
    } finally {
      setDisconnectLoading(false);
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-zinc-900">Settings</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Manage your account preferences and review your access level.
      </p>

      <section className="max-w-2xl rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Account
        </h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <dt className="text-zinc-500">Email</dt>
            <dd className="font-medium text-zinc-900">{user || 'Not available'}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-zinc-500">Role</dt>
            <dd className="font-medium text-zinc-900">{roleLabel(role)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 max-w-2xl rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Gmail Integration
        </h2>

        {statusLoading ? (
          <p className="mt-4 text-sm text-zinc-500">Checking Gmail connection...</p>
        ) : connected ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-700">
              Connected as <span className="font-medium text-zinc-900">{accountEmail || 'Unknown account'}</span>
            </p>
            <button
              type="button"
              onClick={onDisconnectGmail}
              disabled={disconnectLoading}
              className="w-fit rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {disconnectLoading ? 'Disconnecting...' : 'Disconnect Gmail'}
            </button>
          </div>
        ) : (
          <div className="mt-4">
            {requiresReauth ? (
              <>
                <p className="text-sm font-medium text-amber-700">
                  Your Gmail session has expired or been revoked.
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  Please reconnect your Gmail account to continue using email features.
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-700">
                Gmail is not connected to your account yet.
              </p>
            )}
            <button
              type="button"
              onClick={onConnectGmail}
              disabled={connectLoading}
              className="mt-4 rounded-md border border-zinc-200 bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {connectLoading ? 'Redirecting to Google...' : requiresReauth ? 'Reconnect Gmail' : 'Connect Gmail'}
            </button>
          </div>
        )}
      </section>

      {success && <p className="mt-4 text-sm text-green-600">{success}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
