import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Releases from "./pages/Releases";
import ReleaseDetail from "./pages/ReleaseDetail";
import Tracks from "./pages/Tracks";
import Royalties from "./pages/Royalties";
import RoyaltySummary from "./pages/RoyaltySummary";
import Analytics from "./pages/Analytics";
import Users from "./pages/Users";
import Payouts from "./pages/Payouts";
import AdminPayouts from "./pages/AdminPayouts";
import AuditLogs from "./pages/AuditLogs";
import Settings from "./pages/Settings";
import UploadRoyalty from "./pages/UploadRoyalty";
import MyArtists from "./pages/MyArtists";
import Export from "./pages/Export";
import ComposerRoyalties from "./pages/ComposerRoyalties";
import WhitelabelDashboard from "./pages/WhitelabelDashboard";
import CopyrightDashboard from "./pages/CopyrightDashboard";
import CopyrightAnalytics from "./pages/CopyrightAnalytics";
import CopyrightRoyaltySummary from "./pages/CopyrightRoyaltySummary";
import MediaLibrary from "./pages/MediaLibrary";
import LandingPage from "./pages/LandingPage";
import AllRoyalties from "./pages/AllRoyalties";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Auth />} />
              <Route path="/auth" element={<Auth />} />
              {/* Archived: LandingPage tersedia di /catalog untuk penggunaan di masa depan */}
              <Route path="/catalog" element={<LandingPage />} />
              
              {/* Protected dashboard routes - require authentication */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/releases" element={
                <ProtectedRoute>
                  <Releases />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/releases/:id" element={
                <ProtectedRoute>
                  <ReleaseDetail />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/tracks" element={
                <ProtectedRoute>
                  <Tracks />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/royalties" element={
                <ProtectedRoute>
                  <Royalties />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/analytics" element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/royalty-summary" element={
                <ProtectedRoute>
                  <RoyaltySummary />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/payouts" element={
                <ProtectedRoute>
                  <Payouts />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/settings" element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/my-artists" element={
                <ProtectedRoute allowedRoles={['label', 'whitelabel']}>
                  <MyArtists />
                </ProtectedRoute>
              } />
              
              {/* Whitelabel-specific routes */}
              <Route path="/dashboard/whitelabel" element={
                <ProtectedRoute requireWhitelabel>
                  <WhitelabelDashboard />
                </ProtectedRoute>
              } />
              
              {/* Copyright-specific routes */}
              <Route path="/dashboard/copyright" element={
                <ProtectedRoute requireCopyright>
                  <CopyrightDashboard />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/copyright-analytics" element={
                <ProtectedRoute allowedRoles={['superadmin', 'admin', 'copyright']}>
                  <CopyrightAnalytics />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/copyright-royalty-summary" element={
                <ProtectedRoute allowedRoles={['superadmin', 'admin', 'copyright']}>
                  <CopyrightRoyaltySummary />
                </ProtectedRoute>
              } />
              
              {/* Admin-only routes */}
              <Route path="/dashboard/users" element={
                <ProtectedRoute requireAdmin>
                  <Users />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/upload" element={
                <ProtectedRoute requireAdmin>
                  <UploadRoyalty />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/admin-payouts" element={
                <ProtectedRoute requireAdmin>
                  <AdminPayouts />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/composer-royalties" element={
                <ProtectedRoute requireAdmin>
                  <ComposerRoyalties />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/media-library" element={
                <ProtectedRoute requireAdmin>
                  <MediaLibrary />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/all-royalties" element={
                <ProtectedRoute requireAdmin>
                  <AllRoyalties />
                </ProtectedRoute>
              } />
              
              {/* Superadmin-only routes */}
              <Route path="/dashboard/audit-logs" element={
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <AuditLogs />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/export" element={
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <Export />
                </ProtectedRoute>
              } />
              
              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
