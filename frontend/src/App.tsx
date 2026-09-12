import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { IntakeProvider } from './context/IntakeContext';
import { SidebarLayout } from './layouts/SidebarLayout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Intake } from './pages/Intake';
import { NegotiationWorkspace } from './pages/NegotiationWorkspace';
import { Sandbox } from './pages/Sandbox';
import { Reports } from './pages/Reports';
import { Governance } from './pages/Governance';
import { AgentPipeline } from './pages/AgentPipeline';
import { PrivateRoom } from './pages/PrivateRoom';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <IntakeProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Pages */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />

            {/* Authenticated Routes Wrapped in Persistent Sidebar Shell */}
            <Route element={<SidebarLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/intake" element={<Intake />} />
              <Route path="/pipeline/:id" element={<AgentPipeline />} />
              <Route path="/negotiations" element={<Navigate to="/negotiations/2025-INT-809" replace />} />
              <Route path="/negotiations/:id" element={<NegotiationWorkspace />} />
              <Route path="/private-room" element={<PrivateRoom />} />
              <Route path="/private-room/:roomId" element={<PrivateRoom />} />
              <Route path="/sandbox" element={<Sandbox />} />
              <Route path="/reports/:id" element={<Reports />} />
              <Route path="/governance" element={<Governance />} />
              <Route path="/governance/:id" element={<Governance />} />
              <Route path="/team" element={<Navigate to="/governance?tab=team" replace />} />
              <Route path="/analytics" element={<Navigate to="/dashboard" replace />} />
              <Route path="/settings" element={<Navigate to="/governance" replace />} />
            </Route>

            {/* Fallback Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </IntakeProvider>
    </AuthProvider>
  );
};

export default App;

