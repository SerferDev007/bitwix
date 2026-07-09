import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { MarketingPage } from "./pages/MarketingPage";
import { AdminLayout } from "./admin/AdminLayout";
import { ProjectsPage } from "./admin/ProjectsPage";
import { ProjectDetailPage } from "./admin/ProjectDetailPage";
import { EmployeesPage } from "./admin/EmployeesPage";
import { FinancialPage } from "./admin/FinancialPage";
import { ClientsPage } from "./admin/ClientsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MarketingPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="projects" replace />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="financial" element={<FinancialPage />} />
          <Route path="clients" element={<ClientsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
