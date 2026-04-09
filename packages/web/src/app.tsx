import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/app-layout";
import { QuickstartPage } from "./pages/quickstart";
import { AgentsListPage } from "./pages/agents-list";
import { AgentDetailPage } from "./pages/agent-detail";
import { SessionsListPage } from "./pages/sessions-list";
import { SessionDetailPage } from "./pages/session-detail";
import { EnvironmentsListPage } from "./pages/environments-list";
import { VaultsListPage } from "./pages/vaults-list";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/quickstart" replace />} />
        <Route path="/quickstart" element={<QuickstartPage />} />
        <Route path="/agents" element={<AgentsListPage />} />
        <Route path="/agents/:agentId" element={<AgentDetailPage />} />
        <Route path="/sessions" element={<SessionsListPage />} />
        <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
        <Route path="/environments" element={<EnvironmentsListPage />} />
        <Route path="/vaults" element={<VaultsListPage />} />
      </Route>
    </Routes>
  );
}
