import { useState, useEffect } from 'react';
import { 
  Home, 
  Layers, 
  List, 
  Clock, 
  AlertTriangle, 
  Cpu, 
  Terminal, 
  BookOpen, 
  LogOut, 
  User, 
  ChevronRight,
  Menu,
  FileSpreadsheet
} from 'lucide-react';
import AuthPage from './components/AuthPage';
import DashboardView from './components/DashboardView';
import QueuesView from './components/QueuesView';
import JobsView from './components/JobsView';
import WorkersView from './components/WorkersView';
import SchedulesView from './components/SchedulesView';
import DeadLetterView from './components/DeadLetterView';
import ExecutionsView from './components/ExecutionsView';
import LogsView from './components/LogsView';
import { User as UserType } from './types';

export default function App() {
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string>('Dashboard');
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(true);

  // Authenticate user session on boot
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch (err) {
        console.error('Session validation failed:', err);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  const handleLoginSuccess = (token: string, userData: UserType) => {
    setUser(userData);
    setActiveSection('Dashboard');
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/sign-out', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    setUser(null);
  };

  // Safe visual heartbeat spike trigger (no-op since animation is removed)
  const triggerHeartbeatSpike = (type: 'completed' | 'failed') => {};

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin mb-4" />
        <span className="font-mono text-xs text-indigo-400">CONNECTING TO TRANSACTION ENGINE...</span>
      </div>
    );
  }

  // Not Logged In -> Show Beautiful Auth Page
  if (!user) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Render current routed page view
  const renderContent = () => {
    switch (activeSection) {
      case 'Dashboard':
        return <DashboardView onNavigate={setActiveSection} onTriggerEvent={triggerHeartbeatSpike} />;
      case 'Queues':
        return <QueuesView />;
      case 'Jobs':
        return <JobsView />;
      case 'Schedules':
        return <SchedulesView />;
      case 'Workers':
        return <WorkersView />;
      case 'DLQ':
        return <DeadLetterView />;
      case 'Executions':
        return <ExecutionsView />;
      case 'Logs':
        return <LogsView />;
      default:
        return <DashboardView onNavigate={setActiveSection} onTriggerEvent={triggerHeartbeatSpike} />;
    }
  };

  const navItems = [
    { name: 'Dashboard', icon: Home, label: 'Overview' },
    { name: 'Queues', icon: Layers, label: 'Queues' },
    { name: 'Jobs', icon: List, label: 'Job Explorer' },
    { name: 'Schedules', icon: Clock, label: 'Schedules' },
    { name: 'Workers', icon: Cpu, label: 'Worker Nodes' },
    { name: 'DLQ', icon: AlertTriangle, label: 'Dead Letter' },
    { name: 'Executions', icon: FileSpreadsheet, label: 'Executions' },
    { name: 'Logs', icon: Terminal, label: 'System Logs' },
  ];

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans select-none antialiased">
      
      {/* Top Banner Bar */}
      <header className="bg-slate-900 border-b border-slate-800 text-white h-[48px] flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="font-display font-bold text-sm tracking-wide text-slate-100 uppercase">Distributed Job Scheduler</h1>
          </div>
        </div>

        {/* User context & log out */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 border-r border-slate-800 pr-4">
            <div className="p-1 bg-slate-800 border border-slate-700 text-indigo-400 rounded-full">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="font-semibold text-slate-200 font-display leading-tight">{user.fullName}</p>
              <p className="font-mono text-[9px] text-slate-500 leading-tight">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded transition cursor-pointer text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </header>

      {/* Main Container Layout */}
      <div className="flex-1 flex relative">
        
        {/* Collapsible Left Nav Rail */}
        <aside className={`bg-white border-r border-slate-200 flex flex-col justify-between transition-all duration-300 z-20 ${
          sidebarExpanded ? 'w-56' : 'w-14'
        }`}>
          {/* Menu items */}
          <nav className="p-2 space-y-1">
            {navItems.map((item) => {
              const isSelected = activeSection === item.name;
              return (
                <button
                  key={item.name}
                  onClick={() => setActiveSection(item.name)}
                  className={`w-full flex items-center rounded py-2 px-3 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-teal-400 ${
                    isSelected 
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold' 
                      : 'text-slate-600 hover:bg-slate-50 border border-transparent font-medium hover:text-slate-900'
                  }`}
                  title={item.label}
                >
                  <item.icon className={`w-4 h-4 flex-shrink-0 transition-colors ${
                    isSelected ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-700'
                  }`} />
                  {sidebarExpanded && (
                    <span className="ml-3 text-xs tracking-wide text-left">{item.label}</span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick connection footer status */}
          <div className="p-3 border-t border-slate-100 text-[10px] font-mono text-slate-400 bg-slate-50/50">
            {sidebarExpanded ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-teal" />
                  <span>CLUSTER ONLINE</span>
                </div>
                <p>NODES: 3 ACTIVE</p>
                <p>LATENCY: 42ms</p>
              </div>
            ) : (
              <div className="flex justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-teal" />
              </div>
            )}
          </div>
        </aside>

        {/* Central Dynamic Content Canvas with Desktop Padding */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
