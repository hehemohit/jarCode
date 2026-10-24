import React, { useState } from 'react';
import { useBridgeStore, PendingApproval } from '../store/useBridgeStore.ts';
import { DiffViewer } from './DiffViewer.tsx';
import { CheckCircle2, XCircle, AlertTriangle, Send } from 'lucide-react';

interface ApprovalGateModalProps {
  approval: PendingApproval;
}

export const ApprovalGateModal: React.FC<ApprovalGateModalProps> = ({ approval }) => {
  const { approve, reject } = useBridgeStore();
  const [rejecting, setRejecting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    await approve(approval.id);
  };

  const handleReject = async () => {
    if (!feedback.trim()) return;
    setSubmitting(true);
    await reject(approval.id, feedback.trim());
  };

  return (
    <div className="glass-panel-glow rounded-2xl p-4 sm:p-6 mb-6 transition-all duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-base">{approval.summary}</h3>
            <p className="text-xs text-slate-400">Step #{approval.stepIdx} • Tool: {approval.toolName}</p>
          </div>
        </div>

        {/* Risk Badge */}
        <div className="flex items-center space-x-2 self-start sm:self-auto">
          {approval.riskTier === 2 ? (
            <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400 border border-rose-500/30">
              High Risk Tier 2
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400 border border-amber-500/30">
              Standard Review
            </span>
          )}
        </div>
      </div>

      {/* Diff / Command Preview */}
      <div className="my-4">
        <DiffViewer
          targetPath={approval.toolArgs?.TargetFile}
          diff={approval.diff}
          command={approval.command}
          toolName={approval.toolName}
        />
      </div>

      {/* Action Buttons */}
      {!rejecting ? (
        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            disabled={submitting}
            onClick={() => setRejecting(true)}
            className="flex items-center space-x-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            <span>Reject with Reason</span>
          </button>

          <button
            disabled={submitting}
            onClick={handleApprove}
            className="flex items-center space-x-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 text-sm font-semibold shadow-lg shadow-emerald-600/30 transition-all active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Approve & Release</span>
          </button>
        </div>
      ) : (
        /* Rejection Feedback Input */
        <div className="pt-2">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-xs font-medium text-slate-400">Rejection guidance for the agent:</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. Do not touch this file, use native fetch instead..."
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReject();
              }}
            />
            <button
              disabled={submitting || !feedback.trim()}
              onClick={handleReject}
              className="flex items-center space-x-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50 active:scale-95"
            >
              <Send className="h-4 w-4" />
              <span>Send</span>
            </button>
            <button
              onClick={() => setRejecting(false)}
              className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
