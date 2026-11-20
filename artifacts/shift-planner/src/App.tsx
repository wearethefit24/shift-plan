import { type ReactNode } from 'react';
import { Route, Switch, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/app-shell';
import { PlannerProvider } from '@/hooks/use-planner';
import MasterPage from '@/pages/master';
import ConditionsPage from '@/pages/conditions';
import SchedulePage from '@/pages/schedule';
import NotFound from '@/pages/not-found';

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <PlannerProvider>
      <AppShell>
        <RoutedErrorBoundary>
          <Switch>
            <Route path="/"><Redirect to="/schedule" /></Route>
            <Route path="/master" component={MasterPage} />
            <Route path="/conditions" component={ConditionsPage} />
            <Route path="/schedule" component={SchedulePage} />
            <Route component={NotFound} />
          </Switch>
        </RoutedErrorBoundary>
      </AppShell>
    </PlannerProvider>
  );
}

function App() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter>;
}

export default App;
