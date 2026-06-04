import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SignIn } from './pages/SignIn';
import { SignUp } from './pages/SignUp';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { Unlearning } from './pages/Unlearning';
import { Settings } from './pages/Settings';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { Jobs } from './pages/Jobs';
import { JobDetail } from './pages/JobDetail';
import { EvidenceDetail } from './pages/EvidenceDetail';
import { Verify } from './pages/Verify';
import { Pipelines } from './pages/Pipelines';

function App() {
  return (
    <Router>
      <WorkspaceProvider>
        <Layout>
          <Routes>
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/jobs" element={<Jobs />} />
            <Route path="/dashboard/jobs/:jobId" element={<JobDetail />} />
            <Route path="/dashboard/evidence/:evidenceId" element={<EvidenceDetail />} />
            <Route path="/dashboard/verify" element={<Verify />} />
            <Route path="/dashboard/pipelines" element={<Pipelines />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/verify/:evidenceId" element={<Verify />} />
            <Route path="/unlearning" element={<Unlearning />} />
            <Route path="/black-box" element={<Unlearning mode="blackBox" />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout>
      </WorkspaceProvider>
    </Router>
  );
}

export default App;
