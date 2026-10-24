import React, { useEffect, useState } from 'react';
import { useBridgeStore } from './store/useBridgeStore.ts';
import { Header } from './components/Header.tsx';
import { ApprovalGateModal } from './components/ApprovalGateModal.tsx';
import { ChatStream } from './components/ChatStream.tsx';
import { ChatInput } from './components/ChatInput.tsx';
import { TerminalView } from './components/TerminalView.tsx';

export const App: React.FC = () => {
  const { connect, pendingApprovals } = useBridgeStore();
  const [activeTab, setActiveTab] = useState<'gate' | 'terminal'>('gate');

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div className="app-container">
      {/* Header */}
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Chat Area */}
      {activeTab === 'gate' ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
          {/* Scrollable Conversation Stream */}
          <main className="chat-scroll-area">
            {/* Action Required Banner if approvals are pending */}
            {pendingApprovals.length > 0 && (
              <section className="chat-content-width" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#fbbf24' }} />
                  <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#fbbf24' }}>
                    Action Required ({pendingApprovals.length})
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {pendingApprovals.map((approval) => (
                    <ApprovalGateModal key={approval.id} approval={approval} />
                  ))}
                </div>
              </section>
            )}

            {/* Live Chat Messages (Old at top, latest at bottom) */}
            <ChatStream />
          </main>

          {/* Sticky Antigravity Bottom Input Bar */}
          <ChatInput />
        </div>
      ) : (
        /* Terminal View */
        <main style={{ flex: 1, maxWidth: '1000px', width: '100%', margin: '0 auto', padding: '16px', overflow: 'hidden' }}>
          <TerminalView />
        </main>
      )}
    </div>
  );
};
