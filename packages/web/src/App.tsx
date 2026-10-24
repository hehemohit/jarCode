import React, { useEffect, useState } from 'react';
import { useBridgeStore } from './store/useBridgeStore.ts';
import { Header } from './components/Header.tsx';
import { ApprovalGateModal } from './components/ApprovalGateModal.tsx';
import { ChatStream } from './components/ChatStream.tsx';
import { TerminalView } from './components/TerminalView.tsx';
import { ShieldCheck } from 'lucide-react';

export const App: React.FC = () => {
  const { connect, pendingApprovals } = useBridgeStore();
  const [activeTab, setActiveTab] = useState<'gate' | 'terminal'>('gate');

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white pb-12">
      {/* Top Bar */}
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Container */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        {/* Pending Approvals Section (Always prominent on top if any exist) */}
        {pendingApprovals.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center space-x-2 mb-3">
              <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400 animate-ping" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">
                Action Required ({pendingApprovals.length})
              </h2>
            </div>
            <div className="space-y-4">
              {pendingApprovals.map((approval) => (
                <ApprovalGateModal key={approval.id} approval={approval} />
              ))}
            </div>
          </section>
        )}

        {/* Tab Content */}
        {activeTab === 'gate' ? (
          <section className="space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h2 className="text-base font-semibold text-white flex items-center space-x-2">
                <span>Live Conversation & Reasoning</span>
              </h2>
              {pendingApprovals.length === 0 && (
                <span className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Gate Idle • No Pauses</span>
                </span>
              )}
            </div>

            <ChatStream />
          </section>
        ) : (
          <section>
            <TerminalView />
          </section>
        )}
      </main>
    </div>
  );
};
