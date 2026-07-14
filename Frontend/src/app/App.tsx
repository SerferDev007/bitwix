import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { CurrencyProvider } from "./lib/currency";
import { MarketingPage } from "./pages/MarketingPage";
import { AdminLayout } from "./admin/AdminLayout";
import { ProjectsPage } from "./admin/ProjectsPage";
import { ProjectDetailPage } from "./admin/ProjectDetailPage";
import { EmployeesPage } from "./admin/EmployeesPage";
import { FinancialPage } from "./admin/FinancialPage";
import { ClientsPage } from "./admin/ClientsPage";
import { FmsLedgerPage } from "./admin/FmsLedgerPage";
import { FmsReportsPage } from "./admin/FmsReportsPage";
import { LoginPage } from "./admin/LoginPage";
import { RequireAuth } from "./admin/RequireAuth";
import { CrmLoginPage } from "./crm/CrmLoginPage";
import { CrmRequireAuth } from "./crm/CrmRequireAuth";
import { CrmLayout } from "./crm/CrmLayout";
import { AccountsPage } from "./crm/AccountsPage";
import { AccountDetailPage } from "./crm/AccountDetailPage";
import { PipelinePage } from "./crm/PipelinePage";
import { ForecastPage } from "./crm/ForecastPage";
import { TicketsPage } from "./crm/TicketsPage";
import { LeadsPage } from "./crm/LeadsPage";
import { QuotesPage } from "./crm/QuotesPage";
import { PortalLoginPage } from "./portal/PortalLoginPage";
import { PortalActivatePage } from "./portal/PortalActivatePage";
import { PortalRequireAuth } from "./portal/PortalRequireAuth";
import { PortalLayout } from "./portal/PortalLayout";
import { PortalOverviewPage } from "./portal/PortalOverviewPage";
import { PortalTicketsPage } from "./portal/PortalTicketsPage";
import { PortalInvoicesPage } from "./portal/PortalInvoicesPage";
import { PortalConsentPage } from "./portal/PortalConsentPage";
import { PortalUsersPage } from "./portal/PortalUsersPage";
import { HrLoginPage } from "./hr/HrLoginPage";
import { HrActivatePage } from "./hr/HrActivatePage";
import { HrRequireAuth } from "./hr/HrRequireAuth";
import { HrLayout } from "./hr/HrLayout";
import { HrEmployeesPage } from "./hr/HrEmployeesPage";
import { HrLeavePage } from "./hr/HrLeavePage";
import { HrPayrollPage } from "./hr/HrPayrollPage";
import { HrAuditPage } from "./hr/HrAuditPage";
import { MyDocumentsPage } from "./hr/MyDocumentsPage";

export default function App() {
  return (
    <CurrencyProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MarketingPage />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={<Navigate to="ledger" replace />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="financial" element={<FinancialPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="ledger" element={<FmsLedgerPage />} />
          <Route path="reports" element={<FmsReportsPage />} />
        </Route>

        {/* Employee Management System (HR / EMS) — own login/session + RBAC */}
        <Route path="/hr/login" element={<HrLoginPage />} />
        <Route path="/hr/activate" element={<HrActivatePage />} />
        <Route path="/hr" element={<HrRequireAuth><HrLayout /></HrRequireAuth>}>
          <Route index element={<Navigate to="employees" replace />} />
          <Route path="employees" element={<HrEmployeesPage />} />
          <Route path="leave" element={<HrLeavePage />} />
          <Route path="my-documents" element={<MyDocumentsPage />} />
          <Route path="payroll" element={<HrPayrollPage />} />
          <Route path="audit" element={<HrAuditPage />} />
        </Route>

        {/* CRM staff console — its own login/session (internal plane) */}
        <Route path="/crm/login" element={<CrmLoginPage />} />
        <Route path="/crm" element={<CrmRequireAuth><CrmLayout /></CrmRequireAuth>}>
          <Route index element={<Navigate to="accounts" replace />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="accounts/:id" element={<AccountDetailPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="quotes" element={<QuotesPage />} />
          <Route path="forecast" element={<ForecastPage />} />
          <Route path="tickets" element={<TicketsPage />} />
        </Route>

        {/* Client portal — external plane. Own login/session; role-differentiated. */}
        <Route path="/portal/login" element={<PortalLoginPage />} />
        <Route path="/portal/activate" element={<PortalActivatePage />} />
        <Route path="/portal" element={<PortalRequireAuth><PortalLayout /></PortalRequireAuth>}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<PortalOverviewPage />} />
          <Route path="tickets" element={<PortalTicketsPage />} />
          <Route path="invoices" element={<PortalInvoicesPage />} />
          <Route path="consent" element={<PortalConsentPage />} />
          <Route path="users" element={<PortalUsersPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </CurrencyProvider>
  );
}
