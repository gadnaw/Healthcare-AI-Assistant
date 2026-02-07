import { MonitoringDashboard } from '@/components/monitoring';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Monitoring Dashboard - Healthcare AI Assistant',
  description: 'Real-time system health, security, and compliance monitoring',
};

export default function MonitoringPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <MonitoringDashboard />
    </div>
  );
}
