import React, { useState, useRef, useEffect } from 'react';
import { useBridgeStore } from '../store/useBridgeStore.ts';
import { Plus, Mic, ArrowUp, ChevronDown } from 'lucide-react';

export const ChatInput: React.FC = () => {
  const [text, setText] = useState('');
  const { sendMessage } = useBridgeStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea as text grows
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

  const handleSend = () => {
    if (!text.trim()) return;
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
      <div className="chat-input-card">
        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Antigravity or type instructions..."
          rows={2}
          className="chat-textarea"
        />

        {/* Bottom Toolbar inside the box */}
        <div className="chat-toolbar">
          {/* Left Controls: Plus & Model Pill */}
          <div className="toolbar-left">
            <button
              type="button"
              className="icon-btn"
              title="Add context or file"
            >
              <Plus size={16} />
            </button>

            <button
              type="button"
              className="model-pill"
            >
              <span>Gemini 3.8 Flash Medium</span>
              <ChevronDown size={12} />
            </button>
          </div>

          {/* Right Controls: Mic & Send Button */}
          <div className="toolbar-right">
            <button
              type="button"
              className="icon-btn"
              title="Voice dictation"
            >
              <Mic size={16} />
            </button>

            <button
              type="button"
              disabled={!text.trim()}
              onClick={handleSend}
              className="send-btn"
              title="Send message"
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
