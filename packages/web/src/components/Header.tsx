import React from 'react';
import { useBridgeStore } from '../store/useBridgeStore.ts';
import { Plus, History, MoreHorizontal, Terminal, MessageSquareCode } from 'lucide-react';

interface HeaderProps {
  activeTab: 'gate' | 'terminal';
  setActiveTab: (tab: 'gate' | 'terminal') => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const { connected, pendingApprovals } = useBridgeStore();

  return (
    <header className="app-header">
      {/* Left: Chat Title */}
      <div className="header-title-row">
        <span className="header-title">Antigravity Mobile Bridge</span>
        <div className="live-badge">
          <span
            className="live-dot"
            style={{ backgroundColor: connected ? '#34d399' : '#f43f5e' }}
          />
          <span style={{ color: connected ? '#34d399' : '#f43f5e' }}>
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Right Controls: Tab Switcher & Antigravity IDE Header Icons */}
      <div className="header-controls">
        {/* Tabs */}
        <div className="tab-switch">
          <button
            onClick={() => setActiveTab('gate')}
            className={`tab-btn ${activeTab === 'gate' ? 'active' : ''}`}
          >
            <MessageSquareCode size={14} />
            <span>Chat</span>
            {pendingApprovals.length > 0 && (
              <span
                style={{
                  background: '#f59e0b',
                  color: '#000',
                  borderRadius: '9999px',
                  padding: '1px 5px',
                  fontSize: '10px',
                  fontWeight: 700,
                  marginLeft: '4px',
                }}
              >
                {pendingApprovals.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('terminal')}
            className={`tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
          >
            <Terminal size={14} />
            <span>Terminal</span>
          </button>
        </div>

        {/* IDE Action Icons */}
        <button
          type="button"
          className="icon-btn"
          title="New Chat"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="History"
        >
          <History size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="More Options"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    </header>
  );
};
