import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useBridgeStore } from '../store/useBridgeStore.ts';
import { PowerOff, TerminalSquare } from 'lucide-react';

export const TerminalView: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTerm | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const { terminalData, activeProcessId, killProcess } = useBridgeStore();

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 13,
      theme: {
        background: '#090d16',
        foreground: '#f1f5f9',
        cursor: '#6366f1',
        selectionBackground: 'rgba(99, 102, 241, 0.4)',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalRef.current);
    fit.fit();

    xtermInstance.current = term;
    fitAddon.current = fit;

    const handleResize = () => {
      fit.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  // Update terminal when new data streams in
  useEffect(() => {
    if (xtermInstance.current && terminalData) {
      xtermInstance.current.clear();
      xtermInstance.current.write(terminalData);
    }
  }, [terminalData]);

  return (
    <div className="flex flex-col h-[75vh] glass-panel rounded-2xl overflow-hidden border border-slate-800">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-950/80">
        <div className="flex items-center space-x-2 text-xs font-medium text-slate-300">
          <TerminalSquare className="h-4 w-4 text-indigo-400" />
          <span>Interactive PTY Stream</span>
          {activeProcessId && (
            <span className="flex items-center space-x-1.5 ml-2 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[10px] font-mono">Running (PID: {activeProcessId.slice(0, 8)})</span>
            </span>
          )}
        </div>

        {activeProcessId && (
          <button
            onClick={() => killProcess(activeProcessId)}
            className="flex items-center space-x-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white px-3 py-1 text-xs font-semibold shadow-md shadow-rose-600/30 transition-all active:scale-95"
          >
            <PowerOff className="h-3.5 w-3.5" />
            <span>Kill Process</span>
          </button>
        )}
      </div>

      {/* Terminal Canvas */}
      <div ref={terminalRef} className="flex-1 p-2 bg-[#090d16]" />
    </div>
  );
};
