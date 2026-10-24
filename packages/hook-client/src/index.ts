#!/usr/bin/env node

/**
 * Antigravity Lifecycle Hook Client
 * 
 * Executed by Antigravity's hooks.json for PreToolUse events.
 * 1. Reads tool invocation JSON from stdin.
 * 2. Sends fast HTTP POST to Desktop Bridge Daemon (http://127.0.0.1:3188/api/hook/pre-tool).
 * 3. Awaits approval or rejection decision.
 * 4. Outputs JSON decision to stdout and exits with code 0.
 */

import process from 'node:process';

const DAEMON_IPC_URL = process.env.BRIDGE_IPC_URL || 'http://127.0.0.1:3188/api/hook/pre-tool';
const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', (chunk: string | Buffer) => {
      data += chunk.toString();
    });

    process.stdin.on('end', () => {
      resolve(data.trim());
    });

    process.stdin.on('error', (err: Error) => {
      reject(err);
    });

    // In case stdin is empty or tty
    if (process.stdin.isTTY) {
      resolve('');
    }
  });
}

function printDecision(decision: 'allow' | 'deny' | 'ask' | 'force_ask', reason?: string, overwrite?: Record<string, any>) {
  const result: Record<string, any> = { decision };
  if (reason) result.reason = reason;
  if (overwrite) result.overwrite = overwrite;
  
  process.stdout.write(JSON.stringify(result) + '\n');
}

async function main() {
  const rawInput = await readStdin();

  if (!rawInput) {
    // Empty stdin, allow tool to execute
    printDecision('allow');
    process.exit(0);
  }

  let hookPayload: any;
  try {
    hookPayload = JSON.parse(rawInput);
  } catch (err) {
    // If invalid JSON, log to stderr and fallback to allow
    process.stderr.write(`[HookClient] Failed to parse stdin JSON: ${err}\n`);
    printDecision('allow');
    process.exit(0);
  }

  // Attempt to contact Desktop Bridge Daemon
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const response = await fetch(DAEMON_IPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hookPayload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      process.stderr.write(`[HookClient] Daemon responded with HTTP ${response.status}\n`);
      printDecision('allow');
      process.exit(0);
    }

    const decisionObj = await response.json() as {
      decision?: 'allow' | 'deny' | 'ask' | 'force_ask';
      reason?: string;
      overwrite?: Record<string, any>;
    };

    printDecision(
      decisionObj.decision || 'allow',
      decisionObj.reason,
      decisionObj.overwrite
    );
    process.exit(0);
  } catch (err: any) {
    // Daemon offline or timeout -> fail open with warning so agent continues
    process.stderr.write(`[HookClient] Daemon offline or unreachable (${err.message}). Defaulting to allow.\n`);
    printDecision('allow');
    process.exit(0);
  }
}

main();
