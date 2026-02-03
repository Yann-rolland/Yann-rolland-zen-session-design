import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import { AppLayout } from "@/components/layout/AppLayout";
import Home from "./pages/Home";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import AdminInsights from "./pages/AdminInsights";
import AdminSettings from "./pages/AdminSettings";
import AdminAudioLibrary from "./pages/AdminAudioLibrary";
import Chat from "./pages/Chat";
import Playlists from "./pages/Playlists";
import TestElevenLabs from "./pages/TestElevenLabs";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <AppProvider>
          <Toaster />
          <BrowserRouter>
            <Routes>
              {/* Public route */}
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              
              {/* Protected routes */}
              <Route
                path="/"
                element={
                  <AppLayout>
                    <Home />
                  </AppLayout>
                }
              />
              <Route
                path="/history"
                element={
                  <AppLayout>
                    <History />
                  </AppLayout>
                }
              />
              <Route
                path="/settings"
                element={
                  <AppLayout>
                    <Settings />
                  </AppLayout>
                }
              />
              <Route
                path="/chat"
                element={
                  <AppLayout>
                    <Chat />
                  </AppLayout>
                }
              />
              <Route
                path="/playlists"
                element={
                  <AppLayout>
                    <Playlists />
                  </AppLayout>
                }
              />

              <Route
                path="/admin/insights"
                element={
                  <AppLayout>
                    <AdminInsights />
                  </AppLayout>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <AppLayout>
                    <AdminSettings />
                  </AppLayout>
                }
              />
              <Route
                path="/admin/library"
                element={
                  <AppLayout>
                    <AdminAudioLibrary />
                  </AppLayout>
                }
              />
              <Route
                path="/test/elevenlabs"
                element={
                  <AppLayout requireAuth={false}>
                    <TestElevenLabs />
                  </AppLayout>
                }
              />
              
              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
