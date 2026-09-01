import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { SsoAuthProvider } from "@/context/SsoAuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import VerifyEmailRequired from "./pages/VerifyEmailRequired";
import Dashboard from "./pages/Dashboard";
import Releases from "./pages/Releases";
import ReleaseDetail from "./pages/ReleaseDetail";
import ReleaseCreate from "./pages/ReleaseCreate";
import ReleaseEdit from "./pages/ReleaseEdit";
import Tracks from "./pages/Tracks";
import Royalties from "./pages/Royalties";
import RoyaltySummary from "./pages/RoyaltySummary";
import Analytics from "./pages/Analytics";
import Users from "./pages/Users";
import UserOrphanAudit from "./pages/UserOrphanAudit";
import Payouts from "./pages/Payouts";
import AdminPayouts from "./pages/AdminPayouts";
import AuditLogs from "./pages/AuditLogs";
import Settings from "./pages/Settings";
import UploadRoyalty from "./pages/UploadRoyalty";
import MyArtists from "./pages/MyArtists";
import Export from "./pages/Export";
import ComposerRoyalties from "./pages/ComposerRoyalties";
import CopyrightDashboard from "./pages/CopyrightDashboard";
import CopyrightAnalytics from "./pages/CopyrightAnalytics";
import CopyrightRoyaltySummary from "./pages/CopyrightRoyaltySummary";
import CopyrightRoyaltyUpload from "./pages/CopyrightRoyaltyUpload";
import CopyrightRoyaltyUploadHistory from "./pages/CopyrightRoyaltyUploadHistory";
import CopyrightRegistrationInfo from "./pages/CopyrightRegistrationInfo";
import CopyrightRegistrationForm from "./pages/CopyrightRegistrationForm";
import CopyrightRegistrationReview from "./pages/CopyrightRegistrationReview";
import MediaLibrary from "./pages/MediaLibrary";
import LandingPage from "./pages/LandingPage";
import AllRoyalties from "./pages/AllRoyalties";
import PaymentCallback from "./pages/PaymentCallback";
import ArtistProfile from "./pages/ArtistProfile";
import NotificationManagement from "./pages/NotificationManagement";
import PaymentSettings from "./pages/PaymentSettings";
import Invoices from "./pages/Invoices";
import ArtistDeletionRequests from "./pages/ArtistDeletionRequests";
import NotFound from "./pages/NotFound";
import IccnIframeAuth from "./pages/IccnIframeAuth";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <SsoAuthProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Auth />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/login" element={<Auth />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              
              {/* Semi-protected: user must be logged in but email may not be verified */}
              <Route path="/verify-email-required" element={<VerifyEmailRequired />} />
              
              {/* Archived: LandingPage tersedia di /catalog untuk penggunaan di masa depan */}
              <Route path="/catalog" element={<LandingPage />} />

              {/* ICCN Super App iframe embed */}
              <Route path="/iccn/iframe" element={<IccnIframeAuth />} />
              
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
              <Route path="/dashboard/releases/new" element={
                <ProtectedRoute>
                  <ReleaseCreate />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/releases/:id/edit" element={
                <ProtectedRoute>
                  <ReleaseEdit />
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
              <Route path="/dashboard/artists" element={
                <ProtectedRoute allowedRoles={['superadmin', 'admin', 'label', 'whitelabel']}>
                  <MyArtists />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/artist-deletion-requests" element={
                <ProtectedRoute allowedRoles={['label', 'whitelabel']}>
                  <ArtistDeletionRequests />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/artist-profile" element={
                <ProtectedRoute allowedRoles={['artist']}>
                  <ArtistProfile />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/artist-profile/:userId" element={
                <ProtectedRoute allowedRoles={["superadmin", "admin", "label", "whitelabel"]}>
                  <ArtistProfile />
                </ProtectedRoute>
              } />
              
              {/* Whitelabel-specific routes */}
              <Route path="/dashboard/whitelabel" element={
                <ProtectedRoute requireWhitelabel>
                  <MyArtists />
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
              <Route path="/dashboard/royalties/copyright-upload" element={
                <ProtectedRoute requireAdmin>
                  <CopyrightRoyaltyUpload />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/royalties/copyright-uploads" element={
                <ProtectedRoute requireAdmin>
                  <CopyrightRoyaltyUploadHistory />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/copyright-registration" element={
                <ProtectedRoute allowedRoles={['superadmin', 'admin', 'copyright', 'user', 'label', 'whitelabel', 'artist']}>
                  <CopyrightRegistrationInfo />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/copyright-registration/new" element={
                <ProtectedRoute allowedRoles={['superadmin', 'admin', 'copyright', 'user', 'label', 'whitelabel', 'artist']}>
                  <CopyrightRegistrationForm />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/copyright-registration/review" element={
                <ProtectedRoute requireAdmin>
                  <CopyrightRegistrationReview />
                </ProtectedRoute>
              } />
              
              {/* Admin-only routes */}
              <Route path="/dashboard/users" element={
                <ProtectedRoute requireAdmin>
                  <Users />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/users/orphan-audit" element={
                <ProtectedRoute requireAdmin>
                  <UserOrphanAudit />
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
              <Route path="/dashboard/notifications" element={
                <ProtectedRoute requireAdmin>
                  <NotificationManagement />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/payment-settings" element={
                <ProtectedRoute requireAdmin>
                  <PaymentSettings />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/invoices" element={
                <ProtectedRoute requireAdmin>
                  <Invoices />
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
              
              {/* Payment callback */}
              <Route path="/payment/callback" element={
                <ProtectedRoute>
                  <PaymentCallback />
                </ProtectedRoute>
              } />
              
              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </SsoAuthProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
