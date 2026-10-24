import React, { useEffect, useRef, useState } from 'react';
import { useBridgeStore } from '../store/useBridgeStore.ts';
import { marked } from 'marked';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';

export const ChatStream: React.FC = () => {
  const { messages, thoughts } = useBridgeStore();
  const [showThoughts, setShowThoughts] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message at bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thoughts]);

  return (
    <div className="chat-content-width">
      {/* Collapsible Thoughts Process */}
      {thoughts.length > 0 && (
        <div className="thoughts-card">
          <button
            onClick={() => setShowThoughts(!showThoughts)}
            className="thoughts-btn"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Brain size={15} style={{ color: '#818cf8' }} />
              <span>Thinking Process ({thoughts.length})</span>
            </div>
            {showThoughts ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {showThoughts && (
            <div className="thoughts-content">
              {thoughts.map((t) => (
                <div key={t.id} style={{ marginBottom: '6px' }}>
                  💭 {t.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages Stream - Oldest at top, latest at bottom */}
      {messages.map((m) => {
        const isUser = m.role === 'user';

        if (isUser) {
          return (
            <div key={m.id} className="user-message-row">
              <div className="user-bubble">
                {m.content}
              </div>
            </div>
          );
        }

        // Assistant Message (Markdown rendered)
        const html = marked.parse(m.content) as string;
        return (
          <div key={m.id} className="assistant-message-row">
            <div
              className="assistant-body markdown-body"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        );
      })}

      {/* Anchor for auto-scrolling to bottom */}
      <div ref={messagesEndRef} />
    </div>
  );
};
