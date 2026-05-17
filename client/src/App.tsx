import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppLayout from "./components/AppLayout";
import Home from "./pages/Home";
import ItemCatalog from "./pages/ItemCatalog";
import CountSheet from "./pages/CountSheet";
import OrderingDashboard from "./pages/OrderingDashboard";
import CateringCalculator from "./pages/CateringCalculator";
import CountHistory from "./pages/CountHistory";
import Settings from "./pages/Settings";
import ParLevels from "./pages/ParLevels";
import UserManagement from "./pages/UserManagement";
import AccountSettings from "./pages/AccountSettings";
import Login from "./pages/Login";
import Register from "./pages/Register";

function Router() {
  return (
    <Switch>
      {/* Public auth routes — no AppLayout wrapper */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      {/* Protected app routes — wrapped in AppLayout */}
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/catalog" component={ItemCatalog} />
            <Route path="/count" component={CountSheet} />
            <Route path="/count/history" component={CountHistory} />
            <Route path="/orders" component={OrderingDashboard} />
            <Route path="/catering" component={CateringCalculator} />
            <Route path="/par-levels" component={ParLevels} />
            <Route path="/settings" component={Settings} />
            <Route path="/admin/users" component={UserManagement} />
            <Route path="/account" component={AccountSettings} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
