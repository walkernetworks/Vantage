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
import AlcoholManagement from "./pages/AlcoholManagement";
import CateringCalculator from "./pages/CateringCalculator";
import CountHistory from "./pages/CountHistory";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/catalog" component={ItemCatalog} />
        <Route path="/count" component={CountSheet} />
        <Route path="/count/history" component={CountHistory} />
        <Route path="/orders" component={OrderingDashboard} />
        <Route path="/alcohol" component={AlcoholManagement} />
        <Route path="/catering" component={CateringCalculator} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
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
