import React, { useState, useEffect } from 'react';
import { Search, Filter, Play, RefreshCw, AlertCircle, Eye, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, HelpCircle, Loader2 } from 'lucide-react';
import { Job, Queue } from '../types';

export default function JobsView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedQueue, setSelectedQueue] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [search, setSearch] = useState('');

  // Creation & Detail states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [detailedJob, setDetailedJob] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Create Job Form
  const [jobType, setJobType] = useState('email-send');
  const [targetQueue, setTargetQueue] = useState('');
  const [payloadStr, setPayloadStr] = useState('{\n  "to": "customer@company.com",\n  "template": "welcome",\n  "userName": "Alice"\n}');
  const [priority, setPriority] = useState<'Low' | 'Normal' | 'High'>('Normal');
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [cronExpr, setCronExpr] = useState('');
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        queueId: selectedQueue,
        status: selectedStatus,
        search: search,
      });

      const res = await fetch(`/api/jobs?${query}`);
      const data = await res.json();
      setJobs(data.data);
      setTotal(data.total);

      const qRes = await fetch('/api/queues');
      const qData = await qRes.json();
      setQueues(qData.data);
      if (qData.data.length > 0 && !targetQueue) {
        setTargetQueue(qData.data[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobDetails = async (id: number) => {
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/jobs/${id}`);
      const data = await res.json();
      setDetailedJob(data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(() => {
      fetchJobs();
      if (selectedJobId) {
        fetchJobDetails(selectedJobId);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [page, selectedQueue, selectedStatus, search, selectedJobId]);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCreateError(null);

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payloadStr);
    } catch (err) {
      setCreateError('Invalid JSON format in Payload editor.');
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: targetQueue || queues[0]?.id || 'default',
          type: jobType,
          payload: parsedPayload,
          priority,
          delaySeconds: Number(delaySeconds),
          cronExpr: cronExpr || undefined,
          maxAttempts: Number(maxAttempts),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to submit job');
      }

      setShowCreateModal(false);
      setJobType('email-send');
      setPayloadStr('{\n  "to": "customer@company.com",\n  "template": "welcome"\n}');
      setDelaySeconds(0);
      setCronExpr('');
      fetchJobs();
    } catch (err: any) {
      setCreateError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualRetry = async (id: number) => {
    try {
      const res = await fetch(`/api/jobs/${id}/retry`, { method: 'POST' });
      if (res.ok) {
        fetchJobs();
        if (selectedJobId === id) {
          fetchJobDetails(id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-6 py-2 relative">
      {/* Header Panel */}
      <div className="flex justify-between items-center pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-900">Job Explorer</h2>
          <p className="text-slate-500 text-xs mt-0.5">Filter, search, inspect execution steps, and retry background jobs.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold hover:bg-indigo-700 transition shadow-sm cursor-pointer"
        >
          Enqueue Job
        </button>
      </div>

      {/* FILTER CONTROLS */}
      <div className="bg-white border border-slate-200 rounded p-4 flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by job ID, type..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full border border-slate-200 rounded pl-9 pr-4 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50"
          />
        </div>

        {/* Queues Filter */}
        <div className="w-full md:w-48">
          <select
            value={selectedQueue}
            onChange={(e) => { setSelectedQueue(e.target.value); setPage(1); }}
            className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="">All Queues</option>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="w-full md:w-40">
          <select
            value={selectedStatus}
            onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
            className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="">All Statuses</option>
            <option value="queued">Queued</option>
            <option value="scheduled">Scheduled</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="dead_letter">Dead Letter</option>
          </select>
        </div>
      </div>

      {/* JOBS TABLE */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold font-display">
                <th className="p-3">Job ID</th>
                <th className="p-3">Queue</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Attempts</th>
                <th className="p-3">Created At</th>
                <th className="p-3 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] font-mono text-slate-700">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400 font-sans font-semibold">
                    No matching jobs found. Use 'Enqueue Job' to schedule one!
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/50 transition cursor-pointer" onClick={() => setSelectedJobId(job.id)}>
                    <td className="p-3 font-semibold text-indigo-600">#{job.id}</td>
                    <td className="p-3 text-slate-500 font-sans">{job.queue_name || job.queue_id}</td>
                    <td className="p-3 text-slate-900 font-sans font-medium">{job.type}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 font-sans font-semibold">
                        <span className={`w-2 h-2 rounded-full ${
                          job.status === 'completed' ? 'bg-emerald-500' :
                          job.status === 'failed' ? 'bg-rose-500' :
                          job.status === 'dead_letter' ? 'bg-slate-950 animate-pulse' :
                          job.status === 'running' ? 'bg-teal-500 animate-pulse' : 'bg-slate-400'
                        }`} />
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          job.status === 'completed' ? 'text-emerald-700 bg-emerald-50' :
                          job.status === 'failed' ? 'text-rose-700 bg-rose-50' :
                          job.status === 'dead_letter' ? 'text-slate-100 bg-slate-900' :
                          job.status === 'running' ? 'text-teal-700 bg-teal-50 font-semibold pulse-teal' :
                          'text-slate-700 bg-slate-50'
                        }`}>
                          {job.status.toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`font-sans font-semibold text-[10px] px-2 py-0.5 rounded border ${
                        job.priority === 'High' ? 'bg-red-50 text-red-700 border-red-100' :
                        job.priority === 'Normal' ? 'bg-slate-50 text-slate-700 border-slate-100' :
                        'bg-slate-50 text-slate-500 border-slate-100'
                      }`}>
                        {job.priority}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 font-sans">{job.attempt} / {job.max_attempts}</td>
                    <td className="p-3 text-slate-400">
                      {new Date(job.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedJobId(job.id)}
                        className="p-1 text-slate-400 hover:text-slate-900 transition rounded hover:bg-slate-100 cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION PANEL */}
        <div className="bg-slate-50 p-3 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
          <span>
            Showing <strong className="text-slate-700">{jobs.length}</strong> of{' '}
            <strong className="text-slate-700">{total}</strong> jobs
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

      {/* CREATE JOB MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 w-full max-w-lg rounded shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-display font-bold text-slate-900 uppercase tracking-wider">Enqueue New Job</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 font-sans font-semibold text-xs cursor-pointer">✕</button>
            </div>

            {createError && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded text-xs font-semibold flex gap-2 items-center">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateJob} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                {/* Job Type */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Job Type (Identifier)</label>
                  <select
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="email-send">📧 email-send (success)</option>
                    <option value="image-thumbnail">🖼️ image-thumbnail (success)</option>
                    <option value="data-import">🗄️ data-import (25% random fail)</option>
                    <option value="system-cleanup">🧹 system-cleanup (forced fail)</option>
                  </select>
                </div>

                {/* Queue Selection */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Scope Queue</label>
                  <select
                    value={targetQueue}
                    onChange={(e) => setTargetQueue(e.target.value)}
                    className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {queues.map((q) => (
                      <option key={q.id} value={q.id}>{q.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payload Editor */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Payload JSON (Raw Parameters)</label>
                <textarea
                  required
                  rows={4}
                  value={payloadStr}
                  onChange={(e) => setPayloadStr(e.target.value)}
                  className="w-full font-mono text-xs border border-slate-200 rounded p-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Priority & Delay */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Priority Weight</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Delay (Seconds)</label>
                  <input
                    type="number"
                    min={0}
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Max Attempts</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
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
                  {submitting ? 'Enqueuing...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* JOB DETAIL DRAWER (SLIDING) */}
      {selectedJobId && detailedJob && (
        <div className="fixed inset-0 z-40 overflow-hidden flex justify-end bg-slate-900/40 animate-fade-in" onClick={() => setSelectedJobId(null)}>
          <div 
            className="w-full max-w-xl bg-white border-l border-slate-200 h-full overflow-y-auto shadow-2xl p-6 space-y-6 flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">JOB ID #{detailedJob.id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-sans font-semibold ${
                      detailedJob.status === 'completed' ? 'text-emerald-700 bg-emerald-50' :
                      detailedJob.status === 'failed' ? 'text-rose-700 bg-rose-50' :
                      detailedJob.status === 'dead_letter' ? 'text-slate-100 bg-slate-900' :
                      detailedJob.status === 'running' ? 'text-teal-700 bg-teal-50' : 'text-slate-700 bg-slate-50'
                    }`}>
                      {detailedJob.status.toUpperCase()}
                    </span>
                  </div>
                  <h3 className="text-base font-display font-bold text-slate-900">Type: {detailedJob.type}</h3>
                </div>
                <button onClick={() => setSelectedJobId(null)} className="text-slate-400 hover:text-slate-600 font-semibold cursor-pointer">✕</button>
              </div>

              {/* Grid Overview */}
              <div className="grid grid-cols-2 gap-4 text-xs border-b border-slate-100 pb-4">
                <div>
                  <span className="text-slate-400 font-semibold font-display">Target Queue</span>
                  <p className="font-mono text-slate-800 font-bold mt-0.5">{detailedJob.queue_name}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold font-display">Priority Weight</span>
                  <p className="font-sans text-slate-800 font-bold mt-0.5">{detailedJob.priority}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold font-display">Execution Attempts</span>
                  <p className="font-mono text-slate-800 font-bold mt-0.5">{detailedJob.attempt} / {detailedJob.max_attempts}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold font-display">Created At</span>
                  <p className="font-mono text-slate-600 mt-0.5">{new Date(detailedJob.created_at).toLocaleString()}</p>
                </div>
              </div>

              {/* JSON Payload viewer */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Raw JSON Parameters</span>
                <div className="bg-slate-900 rounded p-4 border border-slate-800 overflow-x-auto max-h-40">
                  <pre className="font-mono text-[10px] text-emerald-400 leading-normal select-all">
                    {JSON.stringify(detailedJob.payload, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Execution history timeline */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-slate-700">Execution Timeline</span>
                {detailedJob.executions?.length === 0 ? (
                  <p className="text-xs text-slate-400 font-sans italic">No execution records found yet. Job is waiting in queue.</p>
                ) : (
                  <div className="space-y-2 border-l-2 border-slate-100 pl-4 py-1">
                    {detailedJob.executions?.map((exec: any, idx: number) => (
                      <div key={exec.id} className="relative space-y-1">
                        <span className={`absolute -left-[21px] top-1.5 w-2 h-2 rounded-full border border-white ${
                          exec.status === 'completed' ? 'bg-emerald-500' :
                          exec.status === 'failed' ? 'bg-rose-500' : 'bg-amber-500'
                        }`} />
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="font-bold text-slate-900">Attempt {detailedJob.executions.length - idx} ({exec.id})</span>
                          <span className="text-slate-400">{new Date(exec.started_at).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-xs text-slate-600 font-sans">
                          Executed on: <span className="font-mono text-[11px] bg-slate-50 px-1 rounded">{exec.worker_id}</span>
                        </p>
                        {exec.error_message && (
                          <div className="bg-rose-50 border border-rose-100 text-rose-700 p-2 rounded text-[10px] font-mono flex gap-1.5 mt-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                            <span>{exec.error_message}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Logs Stream */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-700">System Logs</span>
                <div className="bg-slate-950 border border-slate-900 rounded p-3 h-36 overflow-y-auto space-y-1.5">
                  {detailedJob.logs?.length === 0 ? (
                    <p className="text-[10px] text-slate-500 font-mono">No logs generated yet.</p>
                  ) : (
                    detailedJob.logs?.map((log: any) => (
                      <div key={log.id} className="font-mono text-[10px] leading-relaxed flex gap-2">
                        <span className="text-slate-500">[{new Date(log.created_at).toLocaleTimeString()}]</span>
                        <span className={
                          log.level === 'error' ? 'text-rose-400 font-semibold' :
                          log.level === 'warn' ? 'text-amber-400 font-semibold' : 'text-slate-300'
                        }>
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Manual actions */}
            <div className="border-t border-slate-100 pt-4 flex gap-3">
              {(detailedJob.status === 'failed' || detailedJob.status === 'dead_letter') && (
                <button
                  onClick={() => handleManualRetry(detailedJob.id)}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded text-xs transition flex justify-center items-center gap-1.5 cursor-pointer shadow"
                >
                  <RefreshCw className="w-4 h-4 animate-spin-slow" /> Retry Job Immediately
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
