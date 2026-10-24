import React from 'react';
import { FileCode2, Terminal } from 'lucide-react';

interface DiffViewerProps {
  targetPath?: string;
  diff?: string;
  command?: string;
  toolName: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ targetPath, diff, command, toolName }) => {
  if (command) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden font-mono text-xs">
        <div className="flex items-center space-x-2 border-b border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-400">
          <Terminal className="h-4 w-4 text-amber-400" />
          <span className="font-medium text-slate-300">Terminal Command</span>
        </div>
        <div className="p-3 text-amber-300 bg-black/40 overflow-x-auto whitespace-pre-wrap select-all">
          $ {command}
        </div>
      </div>
    );
  }

  const lines = (diff || '').split('\n');

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden font-mono text-xs">
      <div className="flex items-center space-x-2 border-b border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-400">
        <FileCode2 className="h-4 w-4 text-indigo-400" />
        <span className="font-medium text-slate-300">{targetPath || toolName}</span>
      </div>
      <div className="max-h-72 overflow-y-auto p-2 bg-black/40">
        {lines.length === 0 || !diff ? (
          <div className="p-2 text-slate-500 italic">No diff content available</div>
        ) : (
          lines.map((line, idx) => {
            const isAdd = line.startsWith('+');
            const isDel = line.startsWith('-');
            return (
              <div
                key={idx}
                className={`flex py-0.5 px-2 rounded-sm leading-relaxed ${
                  isAdd
                    ? 'bg-emerald-950/40 text-emerald-300'
                    : isDel
                    ? 'bg-rose-950/40 text-rose-300'
                    : 'text-slate-400'
                }`}
              >
                <span className="w-6 select-none opacity-40 text-right pr-2">{idx + 1}</span>
                <span className="whitespace-pre-wrap break-all">{line}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
