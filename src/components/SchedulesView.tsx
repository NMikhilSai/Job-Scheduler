import React, { useState, useEffect } from 'react';
import { ToggleLeft, ToggleRight, Trash2, Plus, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import { Schedule, Queue } from '../types';

export default function SchedulesView() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create Modal state
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [selectedQueue, setSelectedQueue] = useState('');
  const [cronExpr, setCronExpr] = useState('*/1 * * * *'); // Default 1 min for demo
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = async () => {
    try {
      const res = await fetch('/api/schedules');
      const data = await res.json();
      setSchedules(data.data);

      const qRes = await fetch('/api/queues');
      const qData = await qRes.json();
      setQueues(qData.data);
      if (qData.data.length > 0 && !selectedQueue) {
        setSelectedQueue(qData.data[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
    const interval = setInterval(fetchSchedules, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleSchedule = async (id: string, currentlyActive: boolean) => {
    try {
      const res = await fetch(`/api/schedules/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        fetchSchedules();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          queueId: selectedQueue || queues[0]?.id || 'default',
          cronExpr,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to register schedule');
      }

      setShowModal(false);
      setName('');
      setCronExpr('*/1 * * * *');
      fetchSchedules();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && schedules.length === 0) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-2">
      {/* Header Panel */}
      <div className="flex justify-between items-center pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-900">Recurring Schedules</h2>
          <p className="text-slate-500 text-xs mt-0.5">Automate and manage system-wide workflows using cron expressions.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold hover:bg-indigo-700 transition shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Create Schedule
        </button>
      </div>

      {/* Main Table Card */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold font-display">
                <th className="p-3">Schedule Name</th>
                <th className="p-3">Target Queue</th>
                <th className="p-3">Cron Expression</th>
                <th className="p-3">Next Calculated Run</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-center">Toggle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] font-mono text-slate-700">
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 font-sans font-semibold">
                    No recurring schedules configured yet. Click 'Create Schedule' to start!
                  </td>
                </tr>
              ) : (
                schedules.map((s) => {
                  const isActive = s.status === 'Active';
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-3 font-semibold text-slate-900 font-sans">{s.name}</td>
                      <td className="p-3 text-slate-500 font-sans">{s.queue_name || s.queue_id}</td>
                      <td className="p-3 text-indigo-600 font-bold bg-indigo-50/30 px-2 py-1 rounded w-fit">{s.cron_expr}</td>
                      <td className="p-3 text-slate-600">
                        {s.status === 'Paused' ? (
                          <span className="text-slate-400 italic">None (Paused)</span>
                        ) : (
                          new Date(s.next_run).toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', month: 'short', day: 'numeric' })
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1.5 font-sans font-semibold text-[10px] px-1.5 py-0.5 rounded ${
                          isActive ? 'text-emerald-700 bg-emerald-50' : 'text-slate-600 bg-slate-50'
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {s.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleSchedule(s.id, isActive)}
                          className="text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                        >
                          {isActive ? (
                            <ToggleRight className="w-7 h-7 text-indigo-600" />
                          ) : (
                            <ToggleLeft className="w-7 h-7 text-slate-300" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-display font-bold text-slate-900 uppercase tracking-wider">Create Recurring Schedule</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-sans font-semibold text-xs cursor-pointer">✕</button>
            </div>

            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded text-xs font-semibold flex gap-2 items-center">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateSchedule} className="space-y-4 text-xs">
              {/* Schedule Name */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Schedule Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daily Activity Analytics"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-200 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs bg-slate-50"
                />
              </div>

              {/* Target Queue */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Queue Assignment</label>
                <select
                  value={selectedQueue}
                  onChange={(e) => setSelectedQueue(e.target.value)}
                  className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {queues.map((q) => (
                    <option key={q.id} value={q.id}>{q.name}</option>
                  ))}
                </select>
              </div>

              {/* Cron Expression */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Cron Expression (Format: m h dom mon dow)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. */5 * * * * (every 5 mins)"
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  className="w-full font-mono text-xs border border-slate-200 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50"
                />
                <p className="text-[10px] text-slate-400 mt-1">Use <span className="font-mono bg-slate-100 px-1 py-0.5 rounded">*/1 * * * *</span> to trigger a recurring task every single minute.</p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded hover:bg-slate-50 cursor-pointer font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition flex items-center gap-1 cursor-pointer font-semibold"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {submitting ? 'Registering...' : 'Register Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
