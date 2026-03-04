import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import PlaceholderPage from "./pages/PlaceholderPage";
import ImportPage from "./pages/ImportPage";
import CategoriesPage from "./pages/CategoriesPage";
import ObjectifsPage from "./pages/ObjectifsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Dashboard />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route path="/import" element={<ProtectedRoute><AppLayout><ImportPage /></AppLayout></ProtectedRoute>} />
            <Route path="/categories" element={<ProtectedRoute><AppLayout><CategoriesPage /></AppLayout></ProtectedRoute>} />
            <Route path="/objectifs" element={<ProtectedRoute><AppLayout><ObjectifsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/tresorerie" element={<ProtectedRoute><AppLayout><PlaceholderPage title="Trésorerie" /></AppLayout></ProtectedRoute>} />
            <Route path="/parametres" element={<ProtectedRoute><AppLayout><PlaceholderPage title="Paramètres" /></AppLayout></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
