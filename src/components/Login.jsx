import React, { useState } from 'react';
import axios from 'axios';
import { useDarkMode } from '../App';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { isDark } = useDarkMode();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const trimUser = username.trim();

    if (!trimUser || !password) {
      setError('Please enter both username and password.');
      setLoading(false);
      return;
    }

    try {
      const res = await axios.post('/api/login', {
        username: trimUser,
        password: password
      });

      if (res.data.success) {
        // Support both 'username' and 'Username' column names (MSSQL is case-insensitive but JS is not)
        const loggedInUser =
          res.data.user.username ||
          res.data.user.Username ||
          trimUser;
        onLogin(loggedInUser);
      } else {
        // Show the exact error message from the server if available
        setError(res.data.error || 'Invalid username or password.');
      }
    } catch (err) {
      console.error('Login error:', err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else if (err.code === 'ERR_NETWORK' || err.code === 'ERR_CONNECTION_REFUSED') {
        setError('Cannot connect to server. Please ensure the backend is running.');
      } else {
        setError('Server error. Please try again.');
      }
    }

    setLoading(false);
  };

  return (
    <div
      className="d-flex align-items-center justify-content-center min-vh-100 py-5"
      style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
    >
      <div
        className={`glass-card p-5 shadow-xl ${isDark ? 'dark-glass' : ''}`}
        style={{ maxWidth: '440px', width: '100%' }}
      >
        {/* Header */}
        <div className="text-center mb-5">
          <div className="mb-3">
            <img
              src="/invoice-pro-logo.png"
              alt="InvoicePro Logo"
              style={{
                width: 110,
                height: 110,
                objectFit: 'cover',
                borderRadius: 24,
                boxShadow: '0 4px 18px rgba(0,0,0,0.13)',
              }}
            />
          </div>
          <h1 className="fw-bold fs-2 mb-1">InvoicePro</h1>
          <p className="text-muted mb-0 small">
            Sign in to continue to your account
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>

          {/* Username */}
          <div className="mb-3">
            <label className="form-label fw-semibold small">Username</label>
            <div className="input-group">
              <span className="input-group-text bg-transparent">
                <i className="bi bi-person text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control form-control-lg border-start-0"
                placeholder="Enter username"
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                  setError('');
                }}
                required
                disabled={loading}
                autoComplete="username"
                autoFocus
              />
            </div>
          </div>

          {/* Password */}
          <div className="mb-4">
            <label className="form-label fw-semibold small">Password</label>
            <div className="input-group">
              <span className="input-group-text bg-transparent">
                <i className="bi bi-lock text-muted"></i>
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control form-control-lg border-start-0 border-end-0"
                placeholder="Enter password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setError('');
                }}
                required
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="input-group-text bg-transparent border-start-0"
                onClick={() => setShowPassword(p => !p)}
                tabIndex={-1}
              >
                <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'} text-muted`}></i>
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="alert alert-danger d-flex align-items-center gap-2 py-2 mb-4 small">
              <i className="bi bi-exclamation-triangle-fill"></i>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="g-btn g-btn-primary g-btn-block mb-3"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Signing in...
              </>
            ) : (
              <>
                <i className="bi bi-box-arrow-in-right me-2"></i>
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="text-center">
          <small className="text-muted">
            Login using your registered account
          </small>
        </div>

        <hr className="my-4 opacity-25" />

        <div className="text-center">
          <small className="text-muted">
            <i className="bi bi-shield-lock me-1"></i>
            Secured by <span className="fw-bold text-primary">DIGICODE PRO</span>
          </small>
        </div>
      </div>
    </div>
  );
};

export default Login;