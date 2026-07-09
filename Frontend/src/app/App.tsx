import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { CurrencyProvider } from "./lib/currency";
import { MarketingPage } from "./pages/MarketingPage";
import { AdminLayout } from "./admin/AdminLayout";
import { ProjectsPage } from "./admin/ProjectsPage";
import { ProjectDetailPage } from "./admin/ProjectDetailPage";
import { EmployeesPage } from "./admin/EmployeesPage";
import { FinancialPage } from "./admin/FinancialPage";
import { ClientsPage } from "./admin/ClientsPage";
import { LoginPage } from "./admin/LoginPage";
import { RequireAuth } from "./admin/RequireAuth";

export default function App() {
  return (
    <CurrencyProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MarketingPage />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={<Navigate to="projects" replace />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="financial" element={<FinancialPage />} />
          <Route path="clients" element={<ClientsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </CurrencyProvider>
  );
}
