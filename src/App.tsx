import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Releases from "./pages/Releases";
import ReleaseDetail from "./pages/ReleaseDetail";
import Tracks from "./pages/Tracks";
import Royalties from "./pages/Royalties";
import Analytics from "./pages/Analytics";
import Users from "./pages/Users";
import Payouts from "./pages/Payouts";
import AdminPayouts from "./pages/AdminPayouts";
import AuditLogs from "./pages/AuditLogs";
import Settings from "./pages/Settings";
import UploadRoyalty from "./pages/UploadRoyalty";
import MyArtists from "./pages/MyArtists";
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
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboard/releases" element={<Releases />} />
              <Route path="/dashboard/releases/:id" element={<ReleaseDetail />} />
              <Route path="/dashboard/tracks" element={<Tracks />} />
              <Route path="/dashboard/royalties" element={<Royalties />} />
              <Route path="/dashboard/analytics" element={<Analytics />} />
              <Route path="/dashboard/users" element={<Users />} />
              <Route path="/dashboard/upload" element={<UploadRoyalty />} />
              <Route path="/dashboard/payouts" element={<Payouts />} />
              <Route path="/dashboard/admin-payouts" element={<AdminPayouts />} />
              <Route path="/dashboard/audit-logs" element={<AuditLogs />} />
              <Route path="/dashboard/settings" element={<Settings />} />
              <Route path="/dashboard/my-artists" element={<MyArtists />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
