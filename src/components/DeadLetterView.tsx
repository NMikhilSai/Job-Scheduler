import { useState, useEffect } from 'react';
import { AlertCircle, RotateCcw, Trash2, ArrowRightLeft, HelpCircle, Loader2 } from 'lucide-react';
import { DeadLetter } from '../types';

export default function DeadLetterView() {
  const [items, setItems] = useState<DeadLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<number | null>(null);

  const fetchDLQ = async () => {
    try {
      const res = await fetch('/api/dead-letter');
      const data = await res.json();
      setItems(data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDLQ();
    const interval = setInterval(fetchDLQ, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleRequeue = async (jobId: number) => {
    setActioningId(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' });
      if (res.ok) {
        fetchDLQ();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActioningId(null);
    }
  };

  const handleDiscard = async (id: number) => {
    setActioningId(id);
    try {
      const res = await fetch(`/api/dead-letter/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchDLQ();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActioningId(null);
    }
  };

  if (loading && items.length === 0) {
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
        <h2 className="text-xl font-display font-semibold text-slate-900">Dead Letter Queue (DLQ)</h2>
        <p className="text-slate-500 text-xs mt-0.5">Inspect poisoned messages and jobs that permanently failed retry limits. Intervene manually to replay or purge.</p>
      </div>

      {/* Instructional banner */}
      <div className="bg-slate-900 border border-slate-800 rounded p-4 text-xs text-slate-300 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5 animate-pulse" />
        <div className="space-y-1">
          <h4 className="font-semibold text-white font-display">Systemic Failures Safe-Harbor</h4>
          <p className="text-slate-400">
            When a job exhausts all assigned retry buffers (fixed, linear, or exponential), the scheduler isolates it in this Dead Letter Queue to protect worker process capacity. Restored jobs will preserve their parameters but reset execution counters.
          </p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold font-display">
                <th className="p-3">Job ID</th>
                <th className="p-3">Queue Name</th>
                <th className="p-3">Job Type</th>
                <th className="p-3">Termination Reason</th>
                <th className="p-3">Attempts</th>
                <th className="p-3">Failed At</th>
                <th className="p-3 text-center">Intervene</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] font-mono text-slate-700">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-sans font-semibold">
                    Excellent! The Dead Letter Queue is currently empty.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition">
                    <td className="p-3 font-semibold text-rose-600">#{item.job_id}</td>
                    <td className="p-3 text-slate-500 font-sans">{item.queue_name || item.queue_id}</td>
                    <td className="p-3 text-slate-900 font-sans font-medium">{item.type}</td>
                    <td className="p-3 text-rose-700 max-w-xs truncate font-sans" title={item.reason}>
                      {item.reason}
                    </td>
                    <td className="p-3 text-slate-600 font-sans">{item.attempts} attempts</td>
                    <td className="p-3 text-slate-400">
                      {new Date(item.failed_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="p-3 text-center font-sans space-x-2">
                      <button
                        onClick={() => handleRequeue(item.job_id)}
                        disabled={actioningId !== null}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" /> Requeue
                      </button>
                      <button
                        onClick={() => handleDiscard(item.id)}
                        disabled={actioningId !== null}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" /> Discard
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
