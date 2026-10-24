import fs from 'node:fs';
import path from 'node:path';
import { watch, FSWatcher } from 'chokidar';
import { randomUUID } from 'node:crypto';
import { BridgeEvent } from '@antigravity-bridge/shared';
import { BridgeDatabase } from '../db/database.js';

export class TranscriptTailer {
  private db: BridgeDatabase;
  private currentFilePath: string | null = null;
  private fileOffset = 0;
  private watcher: FSWatcher | null = null;
  private sessionId: string | null = null;
  private onBroadcast?: (event: BridgeEvent) => void;

  constructor(db: BridgeDatabase) {
    this.db = db;
  }

  public setBroadcastHandler(handler: (event: BridgeEvent) => void) {
    this.onBroadcast = handler;
  }

  public trackFile(transcriptPath: string, sessionId: string) {
    if (this.currentFilePath === transcriptPath) return;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.currentFilePath = transcriptPath;
    this.sessionId = sessionId;
    this.fileOffset = 0;

    if (!fs.existsSync(transcriptPath)) {
      return;
    }

    // Read initial contents to catch up
    this.readNewLines();

    // Watch for file modifications
    this.watcher = watch(transcriptPath, {
      persistent: true,
      usePolling: true,
      interval: 100,
    });

    this.watcher.on('change', () => {
      this.readNewLines();
    });
  }

  private readNewLines() {
    if (!this.currentFilePath || !this.sessionId || !fs.existsSync(this.currentFilePath)) return;

    try {
      const stats = fs.statSync(this.currentFilePath);
      if (stats.size < this.fileOffset) {
        // File truncated/restarted
        this.fileOffset = 0;
      }

      if (stats.size === this.fileOffset) return;

      const fd = fs.openSync(this.currentFilePath, 'r');
      const buffer = Buffer.alloc(stats.size - this.fileOffset);
      fs.readSync(fd, buffer, 0, buffer.length, this.fileOffset);
      fs.closeSync(fd);

      this.fileOffset = stats.size;

      const chunk = buffer.toString('utf-8');
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line.trim());
          this.processTranscriptEntry(entry);
        } catch {
          // Incomplete line
        }
      }
    } catch {
      // Ignore temporary read lock errors on Windows
    }
  }

  private processTranscriptEntry(entry: any) {
    if (!this.sessionId) return;

    // Check entry types: USER_INPUT, PLANNER_RESPONSE, thoughts, tool_calls
    const entryType = entry.type || '';
    const content = entry.content || '';

    if (entryType === 'USER_INPUT') {
      let cleanContent = content;
      const match = content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
      if (match) {
        cleanContent = match[1].trim();
      } else {
        cleanContent = content
          .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, '')
          .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g, '')
          .trim();
      }

      if (cleanContent) {
        const payload = { role: 'user', content: cleanContent, stepIdx: entry.step_index };
        const { seq, ts } = this.db.appendEvent(randomUUID(), this.sessionId, 'agent', 'agent.message', payload);
        this.broadcast('agent.message', payload, seq, ts);
      }
    } else if (entryType === 'PLANNER_RESPONSE') {
      if (content) {
        const payload = { role: 'assistant', content, stepIdx: entry.step_index };
        const { seq, ts } = this.db.appendEvent(randomUUID(), this.sessionId, 'agent', 'agent.message', payload);
        this.broadcast('agent.message', payload, seq, ts);
      }
      if (entry.thinking || entry.thought) {
        const text = entry.thinking || entry.thought;
        const payload = { text, stepIdx: entry.step_index };
        const { seq, ts } = this.db.appendEvent(randomUUID(), this.sessionId, 'agent', 'agent.thought', payload);
        this.broadcast('agent.thought', payload, seq, ts);
      }
    }
  }

  private broadcast(type: any, payload: Record<string, any>, seq: number, ts: number) {
    if (!this.onBroadcast || !this.sessionId) return;
    this.onBroadcast({
      id: randomUUID(),
      sessionId: this.sessionId,
      seq,
      ts,
      source: 'agent',
      type,
      payload,
    });
  }

  public close() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
