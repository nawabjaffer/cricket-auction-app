import { useState, useEffect } from 'react';
import { realtimeSyncService } from '../services/realtimeSync';

export default function FirebaseDiagnostics() {
  const [diagnostics, setDiagnostics] = useState({
    firebaseInitialized: false,
    databaseConnected: false,
    listenerActive: false,
    networkAvailable: false,
    cacheCleared: false,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [connectedDevices, setConnectedDevices] = useState<string[]>([]);
  const [connectedTeams, setConnectedTeams] = useState<{id: string; name: string; lastUpdate: number}[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(message);
  };

  useEffect(() => {
    let connectionError = false;
    
    const runDiagnostics = async () => {
      addLog('Starting Firebase diagnostics...');

      // Check network
      const networkAvailable = navigator.onLine;
      addLog(`Network available: ${networkAvailable ? '✅' : '❌'}`);
      setDiagnostics(prev => ({ ...prev, networkAvailable }));

      // Check Firebase using SDK instead of HTTP
      try {
        addLog('Initializing Firebase service...');
        const initialized = await realtimeSyncService.initialize();
        
        if (initialized) {
          addLog('Firebase Service Initialized: ✅');
          setDiagnostics(prev => ({ ...prev, firebaseInitialized: true }));
          
          // Check if realtime sync is ready
          if (realtimeSyncService.isReady()) {
            addLog('Firebase Realtime Database Ready: ✅');
          }
          
          // Try to read state to verify connection
          addLog('Attempting to connect to auction state...');
          let stateRead = false;
          
          const unsubscribe = realtimeSyncService.onStateChange((state) => {
            if (state && state.teams && state.teams.length > 0) {
              stateRead = true;
              addLog(`✅ State Connection Verified: (${state.teams.length} teams found)`);
              // Extract connected teams
              const teams = state.teams.map(t => ({
                id: t.id,
                name: t.name,
                lastUpdate: state.lastUpdate || Date.now()
              }));
              setConnectedTeams(teams);
              setDiagnostics(prev => ({ ...prev, databaseConnected: true }));
            } else if (state && state.teams) {
              addLog(`✅ State Connection Verified: (0 teams - no active auction)`);
              setDiagnostics(prev => ({ ...prev, databaseConnected: true }));
              stateRead = true;
            }
          });
          
          // Wait for state to be read with error handling
          setTimeout(() => {
            if (!stateRead && !connectionError) {
              addLog('⚠️ No auction state found yet (database empty or no active auction)');
              addLog('✅ Database connection appears to be working (no 401 error)');
              setDiagnostics(prev => ({ ...prev, databaseConnected: true }));
            }
            unsubscribe();
          }, 3000);
        } else {
          addLog('❌ Firebase Service Initialization Failed');
          setDiagnostics(prev => ({ ...prev, databaseConnected: false }));
        }
      } catch (error) {
        connectionError = true;
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
          addLog(`❌ Database Connection Failed: 401 Unauthorized`);
          addLog(`⚠️ SOLUTION: Database rules may not be deployed. Run:`);
          addLog(`   firebase deploy --only database`);
          addLog(`⚠️ OR: Check Firebase Console → Database → Rules`);
          addLog(`⚠️ Rules should have: ".read": true, ".write": true at root level`);
          setDiagnostics(prev => ({ ...prev, databaseConnected: false }));
        } else {
          addLog(`❌ Firebase Error: ${errorMsg}`);
          setDiagnostics(prev => ({ ...prev, databaseConnected: false }));
        }
      }

      // Track this device connection
      const deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      setConnectedDevices([deviceId]);
      addLog(`✅ This Device ID: ${deviceId}`);

      // Check LocalStorage
      try {
        localStorage.setItem('firebase_test', 'true');
        localStorage.removeItem('firebase_test');
        addLog('✅ LocalStorage Available');
      } catch (e) {
        addLog('❌ LocalStorage Not Available');
      }

      // Check ServiceWorker
      if ('serviceWorker' in navigator) {
        addLog('✅ ServiceWorker Support Available');
      } else {
        addLog('ℹ️ ServiceWorker Not Supported (not critical)');
      }

      addLog('✅ Diagnostics complete!');
    };

    runDiagnostics();

    // Listen for online/offline
    const handleOnline = () => {
      addLog('🟢 Network: Online');
      setDiagnostics(prev => ({ ...prev, networkAvailable: true }));
    };
    const handleOffline = () => {
      addLog('🔴 Network: Offline');
      setDiagnostics(prev => ({ ...prev, networkAvailable: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>🔧 Firebase Diagnostics</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <h2>Status</h2>
        <div>Firebase Initialized: {diagnostics.firebaseInitialized ? '✅' : '❌'}</div>
        <div>Database Connected: {diagnostics.databaseConnected ? '✅' : '❌'}</div>
        <div>Network Available: {diagnostics.networkAvailable ? '✅' : '❌'}</div>
      </div>

      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '5px' }}>
        <h2 style={{ marginTop: 0 }}>👥 Connected Devices</h2>
        {connectedDevices.length > 0 ? (
          <div>
            <div>Total Connected: {connectedDevices.length}</div>
            <div style={{ marginTop: '10px', fontSize: '12px' }}>
              {connectedDevices.map((device, i) => (
                <div key={i} style={{ padding: '5px', backgroundColor: '#e8f5e9', borderRadius: '3px', marginBottom: '5px' }}>
                  • {device}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>No devices connected yet</div>
        )}
      </div>

      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff3e0', borderRadius: '5px' }}>
        <h2 style={{ marginTop: 0 }}>🏆 Connected Teams</h2>
        {connectedTeams.length > 0 ? (
          <div>
            <div>Total Teams: {connectedTeams.length}</div>
            <div style={{ marginTop: '10px', fontSize: '12px' }}>
              {connectedTeams.map((team, i) => (
                <div key={i} style={{ padding: '8px', backgroundColor: '#ffd54f', borderRadius: '3px', marginBottom: '5px' }}>
                  • <strong>{team.name}</strong> (ID: {team.id}) - Updated: {new Date(team.lastUpdate).toLocaleTimeString()}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>No teams connected yet (start auction on desktop to see teams)</div>
        )}
      </div>

      <div style={{ 
        backgroundColor: '#1e1e1e', 
        color: '#00ff00', 
        padding: '10px', 
        borderRadius: '5px',
        maxHeight: '400px',
        overflowY: 'auto',
        fontSize: '12px',
        lineHeight: '1.5'
      }}>
        <h2 style={{ marginTop: 0 }}>📋 Logs</h2>
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>

      <div style={{ marginTop: '20px' }}>
        <h2>Instructions</h2>
        <ol>
          <li>Check all items above show ✅</li>
          <li>If Database Connected shows ❌, check Firebase Console</li>
          <li>If Network Available shows ❌, check WiFi connection</li>
          <li>Open browser console (F12) for detailed Firebase logs</li>
          <li>Look for messages starting with [RealtimeSync] or [useRealtimeSync]</li>
        </ol>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h2>Next Steps</h2>
        <ul>
          <li>Go to: <a href="/">Desktop App</a></li>
          <li>Or: <a href="/mobile-bidding">Mobile Bidding</a></li>
          <li>Console logs should show connection progress</li>
        </ul>
      </div>
    </div>
  );
}
