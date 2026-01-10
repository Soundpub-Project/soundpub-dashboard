import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Releases from "./pages/Releases";
import Tracks from "./pages/Tracks";
import Royalties from "./pages/Royalties";
import Users from "./pages/Users";
import Payouts from "./pages/Payouts";
import Settings from "./pages/Settings";
import UploadRoyalty from "./pages/UploadRoyalty";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
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
            <Route path="/dashboard/tracks" element={<Tracks />} />
            <Route path="/dashboard/royalties" element={<Royalties />} />
            <Route path="/dashboard/users" element={<Users />} />
            <Route path="/dashboard/upload" element={<UploadRoyalty />} />
            <Route path="/dashboard/payouts" element={<Payouts />} />
            <Route path="/dashboard/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
