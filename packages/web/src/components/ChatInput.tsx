import React, { useState, useRef, useEffect } from 'react';
import { useBridgeStore } from '../store/useBridgeStore.ts';
import { Plus, Mic, ArrowUp, ChevronDown, Square } from 'lucide-react';

export const ChatInput: React.FC = () => {
  const [text, setText] = useState('');
  const { sendMessage, isExecuting, stopExecution } = useBridgeStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea as text grows
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

  const handleSend = () => {
    if (isExecuting) {
      console.warn('[ChatInput WARN] Cannot send message while prompt is being executed.');
      return;
    }
    if (!text.trim()) {
      return;
    }
    console.log('[ChatInput] Submitting message from UI textarea:', text.trim());
    sendMessage(text);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input-wrapper">
      <div className={`chat-input-card ${isExecuting ? 'is-executing' : ''}`}>
        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={text}
          disabled={isExecuting}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isExecuting
              ? 'Antigravity is working...'
              : 'Ask anything, @ to mention, / for actions'
          }
          rows={2}
          className={`chat-textarea ${isExecuting ? 'textarea-disabled' : ''}`}
        />

        {/* Bottom Toolbar inside the box */}
        <div className="chat-toolbar">
          {/* Left Controls: Plus & Model Pill */}
          <div className="toolbar-left">
            <button
              type="button"
              disabled={isExecuting}
              className="icon-btn"
              title="Add context or file"
            >
              <Plus size={16} />
            </button>

            <button
              type="button"
              disabled={isExecuting}
              className="model-pill"
            >
              <span>Gemini 3.8 Flash Medium</span>
              <ChevronDown size={12} />
            </button>
          </div>

          {/* Right Controls: Mic & Send/Stop Button */}
          <div className="toolbar-right">
            <button
              type="button"
              disabled={isExecuting}
              className="icon-btn"
              title="Voice dictation"
            >
              <Mic size={16} />
            </button>

            {isExecuting ? (
              <button
                type="button"
                onClick={stopExecution}
                className="stop-btn"
                title="Stop current execution"
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                disabled={!text.trim()}
                onClick={handleSend}
                className="send-btn"
                title="Send message"
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
