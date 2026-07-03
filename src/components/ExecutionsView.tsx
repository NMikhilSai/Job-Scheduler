import { useState, useEffect } from 'react';
import { Play, Activity, Clock, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { JobExecution } from '../types';

export default function ExecutionsView() {
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(true);

  const fetchExecutions = async () => {
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      const res = await fetch(`/api/executions?${query}`);
      const data = await res.json();
      setExecutions(data.data);
      setTotal(data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExecutions();
    const interval = setInterval(fetchExecutions, 3000);
    return () => clearInterval(interval);
  }, [page]);

  if (loading && executions.length === 0) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-6 py-2">
      {/* Header Panel */}
      <div className="pb-2 border-b border-slate-200">
        <h2 className="text-xl font-display font-semibold text-slate-900">Execution Timelines</h2>
        <p className="text-slate-500 text-xs mt-0.5">Real-time telemetry of worker processes, execution loops, and success audits.</p>
      </div>

      {/* Executions Table */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold font-display">
                <th className="p-3">Execution ID</th>
                <th className="p-3">Job ID</th>
                <th className="p-3">Job Type</th>
                <th className="p-3">Worker Node</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Elapsed</th>
                <th className="p-3">Started At</th>
                <th className="p-3">Finished At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] font-mono text-slate-700">
              {executions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 font-sans font-semibold">
                    Waiting for background executions...
                  </td>
                </tr>
              ) : (
                executions.map((exec) => {
                  // Compute elapsed duration
                  let durationStr = '--';
                  if (exec.finished_at) {
                    const elapsed = new Date(exec.finished_at).getTime() - new Date(exec.started_at).getTime();
                    durationStr = `${(elapsed / 1000).toFixed(2)}s`;
                  }

                  return (
                    <tr key={exec.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-3 font-semibold text-indigo-600">{exec.id}</td>
                      <td className="p-3 text-slate-500 font-bold">#{exec.job_id}</td>
                      <td className="p-3 text-slate-900 font-sans font-medium">{exec.job_type || 'generic'}</td>
                      <td className="p-3 text-slate-600">{exec.worker_id}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 font-sans font-semibold">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            exec.status === 'completed' ? 'bg-emerald-500' :
                            exec.status === 'failed' ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'
                          }`} />
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            exec.status === 'completed' ? 'text-emerald-700 bg-emerald-50' :
                            exec.status === 'failed' ? 'text-rose-700 bg-rose-50' :
                            'text-amber-700 bg-amber-50'
                          }`}>
                            {exec.status.toUpperCase()}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-right text-slate-800 font-bold">{durationStr}</td>
                      <td className="p-3 text-slate-400">
                        {new Date(exec.started_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="p-3 text-slate-400">
                        {exec.finished_at ? (
                          new Date(exec.finished_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        ) : (
                          <span className="text-amber-500 animate-pulse font-sans font-semibold">Running</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION PANEL */}
        <div className="bg-slate-50 p-3 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
          <span>
            Showing <strong className="text-slate-700">{executions.length}</strong> of{' '}
            <strong className="text-slate-700">{total}</strong> executions
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="flex items-center px-2 font-semibold">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
