import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../services/authService';
import './AdminLogin.css';

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();

  // If already authenticated, redirect to admin
  useEffect(() => {
    if (authService.isAuthenticated()) {
      navigate('/admin');
    }
  }, [navigate]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    // Validate email
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      await authService.login(email);
      setSuccessMessage('Login successful! Redirecting...');
      
      // Redirect after short delay
      setTimeout(() => {
        navigate('/admin');
      }, 1000);
    } catch (err: any) {
      console.error('[AdminLogin] Login error:', err);
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setError('');
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-wrapper">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">🔐</div>
            <h1>Admin Portal</h1>
            <p className="login-subtitle">Auction Management System</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Admin Email Address
              </label>
              <div className="input-wrapper">
                <span className="input-icon">✉️</span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={handleInputChange}
                  placeholder="admin@example.com"
                  className="form-input"
                  disabled={loading}
                  autoFocus
                />
              </div>
              <p className="input-hint">
                Enter your registered admin email to access the portal
              </p>
            </div>

            {error && (
              <div className="alert alert-error">
                <span className="alert-icon">❌</span>
                <span className="alert-message">{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="alert alert-success">
                <span className="alert-icon">✅</span>
                <span className="alert-message">{successMessage}</span>
              </div>
            )}

            <button
              type="submit"
              className={`login-button ${loading ? 'loading' : ''}`}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Authenticating...
                </>
              ) : (
                <>
                  <span>🚀</span>
                  Access Admin Panel
                </>
              )}
            </button>
          </form>

          <div className="login-footer">
            <p className="footer-text">
              This is a restricted area for authorized administrators only.
            </p>
            <div className="security-info">
              <span className="security-icon">🔒</span>
              <span className="security-text">Secured with email verification</span>
            </div>
          </div>
        </div>

        <div className="login-sidebar">
          <div className="sidebar-content">
            <h3>Admin Features</h3>
            <ul className="features-list">
              <li>
                <span className="check-icon">✓</span>
                Customize auction details
              </li>
              <li>
                <span className="check-icon">✓</span>
                Manage teams & players
              </li>
              <li>
                <span className="check-icon">✓</span>
                Control app features
              </li>
              <li>
                <span className="check-icon">✓</span>
                Export auction data
              </li>
              <li>
                <span className="check-icon">✓</span>
                Theme customization
              </li>
              <li>
                <span className="check-icon">✓</span>
                Reset & manage data
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="login-background">
        <div className="background-shape shape-1"></div>
        <div className="background-shape shape-2"></div>
        <div className="background-shape shape-3"></div>
      </div>
    </div>
  );
};

export default AdminLogin;
