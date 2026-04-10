import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/app-layout";
import { QuickstartPage } from "./pages/quickstart";
import { AgentsListPage } from "./pages/agents-list";
import { AgentDetailPage } from "./pages/agent-detail";
import { SessionsListPage } from "./pages/sessions-list";
import { SessionDetailPage } from "./pages/session-detail";
import { EnvironmentsListPage } from "./pages/environments-list";
import { EnvironmentDetailPage } from "./pages/environment-detail";
import { VaultsListPage } from "./pages/vaults-list";
import { VaultDetailPage } from "./pages/vault-detail";
import { SettingsPage } from "./pages/settings";
import { UsagePage } from "./pages/usage";
import { LoginPage } from "./pages/login";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/quickstart" replace />} />
        <Route path="/quickstart" element={<QuickstartPage />} />
        <Route path="/agents" element={<AgentsListPage />} />
        <Route path="/agents/:agentId" element={<AgentDetailPage />} />
        <Route path="/sessions" element={<SessionsListPage />} />
        <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
        <Route path="/environments" element={<EnvironmentsListPage />} />
        <Route path="/environments/:environmentId" element={<EnvironmentDetailPage />} />
        <Route path="/vaults" element={<VaultsListPage />} />
        <Route path="/vaults/:vaultId" element={<VaultDetailPage />} />
        <Route path="/usage" element={<UsagePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
