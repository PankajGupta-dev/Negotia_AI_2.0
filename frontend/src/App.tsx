import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SidebarLayout } from './layouts/SidebarLayout';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { Intake } from './pages/Intake';
import { NegotiationWorkspace } from './pages/NegotiationWorkspace';
import { Sandbox } from './pages/Sandbox';
import { Reports } from './pages/Reports';
import { Analytics } from './pages/Analytics';
import { Team } from './pages/Team';
import { Settings } from './pages/Settings';
import { Governance } from './pages/Governance';

import { AgentPipeline } from './pages/AgentPipeline';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Standalone Landing Page */}
        <Route path="/" element={<Landing />} />

        {/* Authenticated Routes Wrapped in Persistent Sidebar Shell */}
        <Route element={<SidebarLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/intake" element={<Intake />} />
          <Route path="/pipeline/:id" element={<AgentPipeline />} />
          <Route path="/negotiations/:id" element={<NegotiationWorkspace />} />
          <Route path="/sandbox" element={<Sandbox />} />
          <Route path="/reports/:id" element={<Reports />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/team" element={<Team />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/governance" element={<Governance />} />
          <Route path="/governance/:id" element={<Governance />} />
        </Route>

        {/* Fallback Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
