import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminPlayersOverrides, useInitialData } from '../hooks';
import { AdminPanel } from '../components/AdminPanel/AdminPanel';
import './AdminPage.css';

const AdminPageContent: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, session, logout, extendSession } = useAdminAuth();
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  // Load data for admin views (teams/players)
  useInitialData();

  // Apply admin-edited player overrides
  useAdminPlayersOverrides();

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isAuthenticated) {
      navigate('/admin/login');
      return;
    }

    // Set up session extension on user activity
    const handleActivity = () => {
      extendSession();
    };

    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);

    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [isAuthenticated, navigate, extendSession]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/admin/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleBackToAuction = () => {
    navigate('/');
  };

  if (!isAuthenticated) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div className="admin-header-content">
          <div className="admin-page-title">
            <h1>Auction Admin Panel</h1>
            <p className="admin-page-subtitle">Manage settings, teams, exports, and features</p>
          </div>
          <div className="admin-page-actions">
            <button onClick={handleBackToAuction} className="admin-page-action-btn">
              ← Back to Auction
            </button>
            <button
              onClick={() => navigate('/camera')}
              className="admin-page-action-btn admin-page-action-secondary"
            >
              Open Camera
            </button>
            <button
              onClick={() => setIsPanelOpen(prev => !prev)}
              className="admin-page-action-btn admin-page-action-secondary"
            >
              {isPanelOpen ? 'Hide Panel' : 'Open Panel'}
            </button>
            <div className="admin-user-info">
              <span className="admin-user-email">{session?.email}</span>
              <button onClick={handleLogout} className="admin-page-logout-btn">
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-content">
        {isPanelOpen ? (
          <AdminPanel isOpen={true} onClose={() => setIsPanelOpen(false)} mode="page" />
        ) : (
          <div className="admin-page-empty">
            <h2>Admin panel is hidden</h2>
            <p>Use the “Open Panel” button to access admin settings.</p>
            <button
              onClick={() => setIsPanelOpen(true)}
              className="admin-page-action-btn admin-page-action-primary"
            >
              Open Admin Panel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const AdminPage: React.FC = () => {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <AdminPageContent />
    </QueryClientProvider>
  );
};

export default AdminPage;
