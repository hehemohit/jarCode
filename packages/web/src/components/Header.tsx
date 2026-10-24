import React from 'react';
import { useBridgeStore } from '../store/useBridgeStore.ts';
import { ShieldAlert, Terminal, MessageSquareCode } from 'lucide-react';

interface HeaderProps {
  activeTab: 'gate' | 'terminal';
  setActiveTab: (tab: 'gate' | 'terminal') => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const { connected, pendingApprovals } = useBridgeStore();

  return (
    <header className="sticky top-0 z-40 glass-panel border-b border-slate-800/80 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        {/* Brand & Status */}
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/20">
            <ShieldAlert className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-white tracking-tight">Antigravity Bridge</span>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400 border border-indigo-500/20">
                P2P Gate
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs">
              {connected ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400 font-medium">Laptop Live</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span className="text-rose-400 font-medium">Reconnecting...</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('gate')}
            className={`flex items-center space-x-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              activeTab === 'gate'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <MessageSquareCode className="h-4 w-4" />
            <span>Approvals & Chat</span>
            {pendingApprovals.length > 0 && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-slate-950">
                {pendingApprovals.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center space-x-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              activeTab === 'terminal'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-4 w-4" />
            <span>Terminal</span>
          </button>
        </div>
      </div>
    </header>
  );
};
