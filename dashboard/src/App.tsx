import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import KanbanPage from './pages/KanbanPage';
import GeoPage from './pages/GeoPage';
import CronPage from './pages/CronPage';
import SkillsPage from './pages/SkillsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/board" element={<KanbanPage />} />
        <Route path="/geo" element={<GeoPage />} />
        <Route path="/cron" element={<CronPage />} />
        <Route path="/skills" element={<SkillsPage />} />
      </Route>
    </Routes>
  );
}
