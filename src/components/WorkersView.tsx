import { useEffect, useState } from 'react';
import { Cpu, Server, Activity, Loader2 } from 'lucide-react';
import { Worker } from '../types';

export default function WorkersView() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkers = async () => {
    try {
      const res = await fetch('/api/workers');
      const data = await res.json();
      setWorkers(data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
    const interval = setInterval(fetchWorkers, 3000);
    return () => clearInterval(interval);
  }, []);

  if (loading && workers.length === 0) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-2">
      {/* Header Panel */}
      <div className="pb-2 border-b border-slate-200">
        <h2 className="text-xl font-display font-semibold text-slate-900">Distributed Worker Nodes</h2>
        <p className="text-slate-500 text-xs mt-0.5">Observe live resource utilization, heartbeat intervals, and claim capacity across your cluster.</p>
      </div>

      {/* Grid of Workers overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {workers.map((w) => {
          const isOffline = w.status === 'offline';
          const cpuColor = w.cpu_usage > 80 ? 'bg-rose-500' : w.cpu_usage > 50 ? 'bg-amber-500' : 'bg-emerald-500';
          const memColor = w.memory_usage > 80 ? 'bg-rose-500' : w.memory_usage > 50 ? 'bg-amber-500' : 'bg-emerald-500';

          return (
            <div key={w.id} className={`bg-white border rounded p-4 space-y-4 relative overflow-hidden transition ${
              isOffline ? 'opacity-60 border-slate-200' : 'border-slate-200 hover:border-slate-300'
            }`}>
              {/* Decorative side accent bar */}
              <div className={`absolute top-0 bottom-0 left-0 w-1 ${
                isOffline ? 'bg-slate-300' : w.status === 'busy' ? 'bg-amber-500' : 'bg-emerald-500'
              }`} />

              <div className="flex justify-between items-start pl-1">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">{w.hostname}</span>
                  <h4 className="font-display font-bold text-slate-900 text-sm">{w.name}</h4>
                </div>
                <div className="flex items-center gap-1.5 font-sans font-semibold">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    isOffline ? 'bg-slate-400' : w.status === 'busy' ? 'bg-amber-400' : 'bg-emerald-400'
                  }`} />
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    isOffline ? 'text-slate-600 bg-slate-50' :
                    w.status === 'busy' ? 'text-amber-700 bg-amber-50' : 'text-emerald-700 bg-emerald-50'
                  }`}>
                    {w.status.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Resource load meters */}
              <div className="space-y-3 pl-1 text-[11px] font-sans">
                {/* CPU Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-slate-500">
                    <span className="flex items-center gap-1 font-medium"><Cpu className="w-3.5 h-3.5 text-slate-400" /> CPU Allocation</span>
                    <span className="font-mono font-bold text-slate-800">{isOffline ? '0%' : `${w.cpu_usage}%`}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${cpuColor}`} style={{ width: isOffline ? '0%' : `${w.cpu_usage}%` }} />
                  </div>
                </div>

                {/* Memory Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-slate-500">
                    <span className="flex items-center gap-1 font-medium"><Server className="w-3.5 h-3.5 text-slate-400" /> Memory Buffer</span>
                    <span className="font-mono font-bold text-slate-800">{isOffline ? '0%' : `${w.memory_usage}%`}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${memColor}`} style={{ width: isOffline ? '0%' : `${w.memory_usage}%` }} />
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="pt-3 border-t border-slate-100 pl-1 flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>v{w.version}</span>
                <span>UPTIME: {isOffline ? 'OFFLINE' : w.uptime}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid of details table */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 font-display font-semibold text-slate-700 text-xs">
          Cluster Connection Details
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-semibold font-display">
                <th className="p-3">Worker Node</th>
                <th className="p-3">Core Host IP</th>
                <th className="p-3">Current Job</th>
                <th className="p-3">Last Ping Heartbeat</th>
                <th className="p-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] font-mono text-slate-700">
              {workers.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50/50 transition">
                  <td className="p-3 font-semibold text-slate-900 font-sans">{w.name}</td>
                  <td className="p-3 text-slate-500">{w.hostname}</td>
                  <td className="p-3 text-indigo-600 font-bold">
                    {w.current_job_id ? `#${w.current_job_id}` : <span className="text-slate-400 font-sans font-normal">idle</span>}
                  </td>
                  <td className="p-3 text-slate-400">
                    {w.status === 'offline' ? 'No connection' : `${new Date(w.last_heartbeat_at).toLocaleTimeString()} (Live)`}
                  </td>
                  <td className="p-3 text-right">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      w.status === 'offline' ? 'bg-slate-400' : w.status === 'busy' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
