import { config } from '../config.js';

const baseOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.nodeEnv === 'production',
  path: '/'
};

export function setAuthCookies(res, session) {
  if (!session) return;
  const maxAge = session.expires_in ? session.expires_in * 1000 : undefined;
  res.cookie('voygo_access_token', session.access_token, { ...baseOptions, maxAge });
  if (session.refresh_token) {
    res.cookie('voygo_refresh_token', session.refresh_token, { ...baseOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
  }
}

export function clearAuthCookies(res) {
  res.clearCookie('voygo_access_token', { path: '/' });
  res.clearCookie('voygo_refresh_token', { path: '/' });
}
