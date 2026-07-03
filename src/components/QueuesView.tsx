import React, { useState, useEffect } from 'react';
import { Play, Pause, Plus, ToggleLeft, ToggleRight, Loader2, AlertCircle } from 'lucide-react';
import { Queue, Project } from '../types';

export default function QueuesView() {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [queueName, setQueueName] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [priority, setPriority] = useState(2); // Normal
  const [concurrency, setConcurrency] = useState(5);
  const [retryPolicy, setRetryPolicy] = useState('policy_fixed');

  const fetchQueues = async () => {
    try {
      const qRes = await fetch('/api/queues');
      const qData = await qRes.json();
      setQueues(qData.data);

      const pRes = await fetch('/api/projects');
      if (pRes.ok) {
        // Fallback placeholder if no project seed found
        const pData = await pRes.json();
        setProjects(pData.data || [
          { id: 'proj_email', name: 'Email Service' },
          { id: 'proj_image', name: 'Image Processor' },
          { id: 'proj_pipeline', name: 'Data Pipeline' }
        ]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueues();
    const interval = setInterval(fetchQueues, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleTogglePause = async (id: string, currentlyPaused: boolean) => {
    try {
      const response = await fetch(`/api/queues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaused: !currentlyPaused }),
      });
      if (response.ok) {
        setQueues((prev) =>
          prev.map((q) => (q.id === id ? { ...q, is_paused: !currentlyPaused } : q))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const projId = selectedProject || (projects[0]?.id || 'proj_email');

    try {
      const response = await fetch('/api/queues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: queueName,
          projectId: projId,
          priority: Number(priority),
          concurrencyLimit: Number(concurrency),
          retryPolicyId: retryPolicy,
        }),
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error?.message || 'Failed to create queue');
      }

      setShowCreateModal(false);
      setQueueName('');
      setPriority(2);
      setConcurrency(5);
      fetchQueues();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && queues.length === 0) {
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
          <h2 className="text-xl font-display font-semibold text-slate-900">Queues</h2>
          <p className="text-slate-500 text-xs mt-0.5">Manage and monitor your distributed job queues in real-time.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold hover:bg-indigo-700 transition shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Create Queue
        </button>
      </div>

      {/* Main Table Card */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold font-display">
                <th className="p-3">Queue Name</th>
                <th className="p-3">Project</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Status</th>
                <th className="p-3">Concurrency</th>
                <th className="p-3 text-right">Jobs (Est)</th>
                <th className="p-3 text-right">Failed</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] font-mono text-slate-700">
              {queues.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50/50 transition">
                  <td className="p-3 font-semibold text-slate-900 font-sans">{q.name}</td>
                  <td className="p-3 text-slate-500 font-sans">{q.project_name || 'System'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold font-sans ${
                      q.priority === 3 ? 'bg-red-50 text-red-700 border border-red-100' :
                      q.priority === 2 ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                      'bg-slate-50 text-slate-600 border border-slate-150'
                    }`}>
                      {q.priority === 3 ? 'High' : q.priority === 2 ? 'Normal' : 'Low'}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`flex items-center gap-1.5 font-sans font-semibold`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${q.is_paused ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                      <span className={q.is_paused ? 'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded' : 'text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded'}>
                        {q.is_paused ? 'Paused' : 'Active'}
                      </span>
                    </span>
                  </td>
                  <td className="p-3 text-slate-600 font-sans">{q.concurrencyLimit || q.concurrency_limit} listeners</td>
                  <td className="p-3 text-right text-slate-950 font-bold">{q.jobsCount?.toLocaleString() || '0'}</td>
                  <td className="p-3 text-right text-rose-600 font-bold">{q.failedCount?.toLocaleString() || '0'}</td>
                  <td className="p-3 text-center font-sans">
                    <button
                      onClick={() => handleTogglePause(q.id, q.is_paused)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                        q.is_paused
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                      }`}
                    >
                      {q.is_paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                      {q.is_paused ? 'Resume' : 'Pause'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE QUEUE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-display font-bold text-slate-900 uppercase tracking-wider">Create New Queue</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 font-sans font-semibold text-xs cursor-pointer">✕</button>
            </div>

            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded text-xs font-semibold flex gap-2 items-center">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateQueue} className="space-y-4 text-xs">
              {/* Queue Name */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Queue Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. video-rendering"
                  value={queueName}
                  onChange={(e) => setQueueName(e.target.value)}
                  className="w-full border border-slate-200 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs bg-slate-50"
                />
              </div>

              {/* Project Picker */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Scope Project</label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Priority & Concurrency */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Queue Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value={1}>Low</option>
                    <option value={2}>Normal</option>
                    <option value={3}>High</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Concurrency Limit</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs bg-slate-50"
                  />
                </div>
              </div>

              {/* Retry Policy */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Retry Policy Backoff</label>
                <select
                  value={retryPolicy}
                  onChange={(e) => setRetryPolicy(e.target.value)}
                  className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="policy_fixed">Fixed Backoff (5s delay, 3 max retries)</option>
                  <option value="policy_exp">Exponential Backoff (10s base, 5 max retries)</option>
                  <option value="policy_linear">Linear Backoff (2s base, 4 max retries)</option>
                </select>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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
                  {submitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
