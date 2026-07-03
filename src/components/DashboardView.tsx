import { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { Activity, CheckCircle, AlertOctagon, Users, RefreshCw, ChevronRight } from 'lucide-react';
import { Worker, JobExecution } from '../types';

interface DashboardViewProps {
  onNavigate: (section: string) => void;
  onTriggerEvent: (type: 'completed' | 'failed') => void;
}

export default function DashboardView({ onNavigate, onTriggerEvent }: DashboardViewProps) {
  const [metrics, setMetrics] = useState<any>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<JobExecution[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const metricsRes = await fetch('/api/metrics/throughput');
      const metricsData = await metricsRes.json();
      setMetrics(metricsData);

      const workersRes = await fetch('/api/workers');
      const workersData = await workersRes.json();
      setWorkers(workersData.data);

      const executionsRes = await fetch('/api/executions?pageSize=5');
      const executionsData = await executionsRes.json();
      setRecentExecutions(executionsData.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 3000); // Live poll updates
    return () => clearInterval(interval);
  }, []);

  // Listen to recent jobs status to notify parent for the heartbeat visual polyline spike
  useEffect(() => {
    if (recentExecutions.length > 0) {
      const topExec = recentExecutions[0];
      if (topExec.status === 'completed') {
        onTriggerEvent('completed');
      } else if (topExec.status === 'failed') {
        onTriggerEvent('failed');
      }
    }
  }, [recentExecutions]);

  if (loading && !metrics) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const activeWorkerCount = workers.filter((w) => w.status !== 'offline').length;
  const totalWorkerCount = workers.length;

  return (
    <div className="space-y-6 py-2">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Throughput */}
        <div className="bg-white border border-slate-200 rounded p-4 flex justify-between items-start">
          <div className="space-y-1">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider font-display">Throughput</span>
            <h3 className="text-2xl font-bold text-slate-900 font-mono">{metrics?.summary?.throughput || '1,234/hr'}</h3>
            <span className="text-[11px] text-emerald-600 font-medium font-sans">+2.4% from last hour</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-100 rounded text-indigo-500">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 2: Success Rate */}
        <div className="bg-white border border-slate-200 rounded p-4 flex justify-between items-start">
          <div className="space-y-1">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider font-display">Success Rate</span>
            <h3 className="text-2xl font-bold text-slate-900 font-mono">{metrics?.summary?.successRate || '96.3%'}</h3>
            <span className="text-[11px] text-emerald-600 font-medium font-sans">+0.2% from last hour</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-100 rounded text-emerald-500">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 3: Avg Duration */}
        <div className="bg-white border border-slate-200 rounded p-4 flex justify-between items-start">
          <div className="space-y-1">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider font-display">Avg Duration</span>
            <h3 className="text-2xl font-bold text-slate-900 font-mono">{metrics?.summary?.avgDuration || '1.42s'}</h3>
            <span className="text-[11px] text-slate-500 font-medium font-sans">-50ms from last hour</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-100 rounded text-amber-500">
            <RefreshCw className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 4: Active Workers */}
        <div className="bg-white border border-slate-200 rounded p-4 flex justify-between items-start">
          <div className="space-y-1">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider font-display">Active Workers</span>
            <h3 className="text-2xl font-bold text-slate-900 font-mono">{`${activeWorkerCount} / ${totalWorkerCount}`}</h3>
            <span className="text-[11px] text-slate-500 font-medium font-sans">Heartbeats received live</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-100 rounded text-teal-500">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Jobs Over Time Area Chart (Completed vs Failed) */}
        <div className="bg-white border border-slate-200 rounded p-4 lg:col-span-2 space-y-3">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h4 className="font-display font-semibold text-slate-900 text-sm">Jobs Processed (Last 24 Hours)</h4>
            <span className="font-mono text-[10px] text-slate-400">INTERVAL: 2H</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics?.lineChart || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '11px', fontFamily: 'Inter' }}
                  labelStyle={{ fontFamily: 'JetBrains Mono', color: '#94A3B8' }}
                />
                <Area type="monotone" dataKey="completed" name="Completed" stroke="#10B981" strokeWidth={1.5} fillOpacity={1} fill="url(#colorCompleted)" />
                <Area type="monotone" dataKey="failed" name="Failed" stroke="#EF4444" strokeWidth={1.5} fillOpacity={1} fill="url(#colorFailed)" />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Distribution Chart */}
        <div className="bg-white border border-slate-200 rounded p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h4 className="font-display font-semibold text-slate-900 text-sm">Status Distribution</h4>
            <span className="font-mono text-[10px] text-slate-400">LIVE COUPLING</span>
          </div>
          <div className="h-48 relative flex justify-center items-center my-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metrics?.donutChart || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {(metrics?.donutChart || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '11px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute flex flex-col items-center">
              <span className="text-[10px] uppercase text-slate-400 tracking-wider font-semibold font-display">Total Jobs</span>
              <span className="text-xl font-bold text-slate-900 font-mono">
                {metrics?.summary?.totalJobs?.toLocaleString() || '24,532'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-3">
            {metrics?.donutChart?.map((d: any) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-slate-600 font-medium">{d.name}:</span>
                <span className="font-mono font-bold text-slate-900 ml-auto">{d.value?.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="bg-white border border-slate-200 rounded p-4 space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <h4 className="font-display font-semibold text-slate-900 text-sm">Recent Job Executions</h4>
          <button 
            onClick={() => onNavigate('Executions')} 
            className="text-xs text-indigo-600 hover:underline flex items-center font-semibold gap-0.5 cursor-pointer"
          >
            See all executions <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentExecutions.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs font-medium">No recent executions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-600 font-semibold font-display">
                  <th className="p-2.5">Execution ID</th>
                  <th className="p-2.5">Job ID</th>
                  <th className="p-2.5">Job Type</th>
                  <th className="p-2.5">Worker</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Started At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-[11px] font-mono text-slate-700">
                {recentExecutions.map((exec) => (
                  <tr key={exec.id} className="hover:bg-slate-50/50 transition">
                    <td className="p-2.5 text-indigo-600 font-semibold">{exec.id}</td>
                    <td className="p-2.5 text-slate-500">#{exec.job_id}</td>
                    <td className="p-2.5 text-slate-900 font-sans font-medium">{exec.job_type}</td>
                    <td className="p-2.5 text-slate-600">{exec.worker_id}</td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-1.5 font-sans font-semibold">
                        <span className={`w-2 h-2 rounded-full ${
                          exec.status === 'completed' ? 'bg-emerald-500' :
                          exec.status === 'failed' ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'
                        }`} />
                        <span className={
                          exec.status === 'completed' ? 'text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]' :
                          exec.status === 'failed' ? 'text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded text-[10px]' :
                          'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[10px]'
                        }>
                          {exec.status.toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td className="p-2.5 text-slate-400">
                      {new Date(exec.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
