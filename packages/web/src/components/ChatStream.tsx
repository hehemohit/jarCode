import React, { useState } from 'react';
import { useBridgeStore } from '../store/useBridgeStore.ts';
import { Brain, User, Bot, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

export const ChatStream: React.FC = () => {
  const { messages, thoughts } = useBridgeStore();
  const [showThoughts, setShowThoughts] = useState(true);

  return (
    <div className="space-y-4">
      {/* Thoughts Collapsible Block */}
      {thoughts.length > 0 && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 overflow-hidden">
          <button
            onClick={() => setShowThoughts(!showThoughts)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/10 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <Brain className="h-4 w-4 text-indigo-400 animate-pulse" />
              <span>Agent Reasoning / Thoughts ({thoughts.length})</span>
            </div>
            {showThoughts ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {showThoughts && (
            <div className="p-3 bg-black/30 font-mono text-xs text-indigo-200/80 max-h-60 overflow-y-auto space-y-2 border-t border-indigo-500/10">
              {thoughts.map((t) => (
                <div key={t.id} className="whitespace-pre-wrap leading-relaxed">
                  💭 {t.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
          <Sparkles className="h-8 w-8 text-slate-600 mb-2 stroke-1" />
          <p className="text-sm font-medium">No live conversation messages yet.</p>
          <p className="text-xs text-slate-600 mt-1">
            Prompts and agent responses from your laptop will mirror here in real time.
          </p>
        </div>
      ) : (
        messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={m.id}
              className={`flex space-x-3 rounded-2xl p-4 transition-all ${
                isUser
                  ? 'bg-slate-900/60 border border-slate-800 ml-4 sm:ml-12'
                  : 'glass-panel mr-4 sm:mr-12'
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                  isUser
                    ? 'bg-indigo-600 text-white'
                    : 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                }`}
              >
                {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-300">
                    {isUser ? 'You (Laptop)' : 'Antigravity Agent'}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {m.content}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
