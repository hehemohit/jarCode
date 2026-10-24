# Antigravity Remote Bridge & Approval Gate
## Phase-Wise Execution & Debugging Plan

> **Scope Focus**: Web Application first (responsive across laptop and phone via Tailscale). Native mobile wrapper planned for subsequent phase.  
> **Repository Strategy**: All reference repositories under `study/` are excluded via `.gitignore`.

---

## Phase Overview & Progress Tracking

| Phase | Component / Goal | Key Deliverable | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Monorepo & Protocol Foundation** | Pnpm workspace + `packages/shared` types/events | ⏳ Next |
| **Phase 2** | **Antigravity Hook Interception** | `packages/hook-client` + `.agents/hooks.json` | ⚪ Queued |
| **Phase 3** | **Desktop Bridge Daemon Core** | Fastify IPC + SQLite WAL + ConPTY manager | ⚪ Queued |
| **Phase 4** | **Responsive Web Application** | React 19 + Diff Viewer + xterm.js terminal | ⚪ Queued |
| **Phase 5** | **E2E Integration & Tailscale Test** | Real prompt $\rightarrow$ Phone approve $\rightarrow$ Agent resume | ⚪ Queued |
| **Phase 6** | **IDE Companion Extension** | Status bar presence + Active chat injection | ⚪ Queued |

---

## Phase 1: Monorepo & Protocol Foundation

### Objective
Establish the pnpm workspace monorepo, TypeScript configuration, build tooling, and the strongly-typed shared event protocol used by the Daemon, Hook Client, and Web App.

### Detailed Steps
- [ ] **Step 1.1: Root Monorepo Configuration**
  - Files to create:
    - `pnpm-workspace.yaml`:
      ```yaml
      packages:
        - 'packages/*'
      ```
    - `package.json` (root scripts: `build`, `dev`, `lint`, `clean`)
    - `tsconfig.base.json`: Modern strict TypeScript configuration (ESNext, NodeNext, declaration maps).
    - `turbo.json`: Turborepo pipeline configuration for caching builds.
- [ ] **Step 1.2: `packages/shared` Package Setup**
  - Path: `packages/shared/`
  - Dependencies: `zod`
  - Submodules:
    - `src/events.ts`: Strict Zod schemas and TypeScript types for all bridge events:
      - `agent.thought`
      - `agent.message`
      - `gate.approval_requested`
      - `gate.approved`
      - `gate.rejected`
      - `terminal.stream`
      - `pty.resize`
      - `client.sync_requested`
    - `src/policies.ts`: Risk Tier enum (`Tier0_Auto`, `Tier1_Review`, `Tier2_HighRisk`) and tool classifier rules.
    - `src/diff.ts`: Types for unified file diff chunks (`additions`, `deletions`, `hunks`).
- [ ] **Step 1.3: Build & Package Verification**
  - Verify that `packages/shared` compiles cleanly to TypeScript declaration files (`dist/index.d.ts`).

### Verification & Debugging Checkpoint
```bash
# In workspace root:
pnpm install
pnpm --filter @antigravity-bridge/shared build
```
**Expected Outcome**: Clean build with zero TypeScript errors and generated `dist/` types.

---

## Phase 2: Antigravity Hook Interception Client

### Objective
Create the lightweight hook client executed by Antigravity's `hooks.json` that reads `stdin`, transmits the tool call to the daemon via fast HTTP IPC, holds the process paused, and writes the decision to `stdout`.

### Detailed Steps
- [ ] **Step 2.1: `packages/hook-client` Package Setup**
  - Path: `packages/hook-client/`
  - Dependencies: `@antigravity-bridge/shared`, native `fetch` (Node.js 20+)
  - Implementation in `src/index.ts`:
    - Read complete JSON payload from `process.stdin`.
    - Extract `conversationId`, `stepIdx`, `toolCall`, `transcriptPath`.
    - Send `POST http://127.0.0.1:3188/api/hook/pre-tool` with a 300s timeout.
    - On daemon response: output `{ "decision": "allow" | "deny", "reason": "..." }` to `process.stdout`.
    - Fail-safe fallback: if daemon is not running, output `{ "decision": "allow" }` (or `"ask"`) so agent is not permanently bricked.
- [ ] **Step 2.2: Compile Executable Binary**
  - Build output: `packages/hook-client/dist/index.js` (executable via `node`).
- [ ] **Step 2.3: Wire Antigravity `.agents/hooks.json`**
  - Create `.agents/hooks.json` at workspace root:
    ```json
    {
      "remote-approval-gate": {
        "enabled": true,
        "PreToolUse": [
          {
            "matcher": "write_to_file|replace_file_content|multi_replace_file_content|run_command",
            "hooks": [
              {
                "type": "command",
                "command": "node ./packages/hook-client/dist/index.js",
                "timeout": 300
              }
            ]
          }
        ]
      }
    }
    ```

### Verification & Debugging Checkpoint
```bash
# Test mock stdin directly into hook-client:
echo '{"conversationId":"test-123","stepIdx":1,"toolCall":{"name":"write_to_file","args":{"TargetFile":"test.txt"}}}' | node ./packages/hook-client/dist/index.js
```
**Expected Outcome**: With daemon offline, hook-client gracefully handles the timeout/fallback and outputs valid JSON on stdout without throwing uncaught exceptions.

---

## Phase 3: Desktop Bridge Daemon Core

### Objective
Build the Node.js TypeScript daemon running on your laptop with SQLite WAL persistence, Fastify IPC server, WebSocket server, Windows ConPTY terminal runner, and transcript tailer.

### Detailed Steps
- [ ] **Step 3.1: `packages/daemon` Package Setup**
  - Dependencies:
    - `fastify`, `@fastify/cors`, `@fastify/static`
    - `ws`
    - `better-sqlite3` + `@types/better-sqlite3`
    - `node-pty`
    - `chokidar` (file watcher for `transcript.jsonl`)
    - `tree-kill`
- [ ] **Step 3.2: SQLite WAL Event Store (`src/db/`)**
  - Apply `better-sqlite3` optimizations:
    ```typescript
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    ```
  - Schema initialization: `sessions`, `events` (monotonic `seq`), and `pending_approvals`.
  - Cache prepared statements for insert, sequential query (`seq > lastSeq`), and approval state updates.
- [ ] **Step 3.3: Approval Gate & Risk Policy Engine (`src/gate/`)**
  - Classify tools:
    - Tier 0: Read operations $\rightarrow$ instant auto-approval.
    - Tier 1: File writes/modifications $\rightarrow$ calculate line diff, hold HTTP request, broadcast `gate.approval_requested`.
    - Tier 2: Destructive shell commands (`rm -rf`, `git push --force`) $\rightarrow$ require explicit confirmation.
  - Implement endpoints:
    - `POST /api/hook/pre-tool` (called by `hook-client`)
    - `POST /api/gate/approve/:id` (called by Web App or lockscreen action)
    - `POST /api/gate/reject/:id` (called by Web App with feedback string)
- [ ] **Step 3.4: Transcript Tailer (`src/tailer/`)**
  - Watch the active `transcript.jsonl` discovered from hook calls.
  - Parse incremental JSON lines (`USER_INPUT`, `PLANNER_RESPONSE`, `agent.thought`, `tool_calls`).
  - Store in SQLite and broadcast to WebSocket clients.
- [ ] **Step 3.5: Windows ConPTY Manager (`src/pty/`)**
  - Spawn terminal commands using `node-pty` with ConPTY backend.
  - Handle `{ type: 'pty.resize', cols, rows }` from client.
  - Implement hard kill switch via `tree-kill` (`taskkill /pid <PID> /T /F` on Windows).

### Verification & Debugging Checkpoint
```bash
# Start the daemon:
pnpm --filter @antigravity-bridge/daemon dev
# In another terminal, trigger a test approval:
curl -X POST http://127.0.0.1:3188/api/hook/pre-tool \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"demo-session","stepIdx":1,"toolCall":{"name":"write_to_file","args":{"TargetFile":"demo.ts","CodeContent":"console.log(\"hello\");"}}}'
```
**Expected Outcome**: The request pauses and waits; checking `http://127.0.0.1:3000/api/approvals/pending` shows 1 pending request; approving via curl releases the held connection immediately.

---

## Phase 4: Responsive Web Application (Laptop & Phone Friendly)

### Objective
Build a web application using React 19, Vite, and Zustand. The UI must be responsive, usable on a laptop monitor or a mobile phone screen via Tailscale.

### Detailed Steps
- [ ] **Step 4.1: `packages/web` Scaffolding**
  - Vite + React 19 + TypeScript + Zustand + Lucide Icons.
  - Vanilla/Tailwind CSS with rich dark theme, glassmorphism cards, and mobile touch targets.
- [ ] **Step 4.2: WebSocket Sync Engine (`src/store/`)**
  - Auto-reconnecting WebSocket client.
  - Tracks `lastSeq` and automatically requests missing events on reconnect (`client.sync_requested { lastSeq }`).
- [ ] **Step 4.3: Plan & Diff Viewer (`src/components/DiffViewer.tsx`)**
  - Syntax-highlighted unified diff view (green additions, red removals).
  - Displays target file path, operation type (`create`, `modify`, `delete`).
- [ ] **Step 4.4: Approval Action Bar (`src/components/ApprovalGate.tsx`)**
  - Prominent sticky action bar on mobile:
    - Green **Approve** button (one-tap approval).
    - Red **Reject** button with slide-out feedback input.
- [ ] **Step 4.5: Live Thinking & Chat Stream (`src/components/ChatStream.tsx`)**
  - Displays user prompt, streaming assistant markdown, and collapsible thinking blocks.
- [ ] **Step 4.6: Embedded Mobile Terminal (`src/components/Terminal.tsx`)**
  - Embedded `xterm.js` terminal.
  - Uses `@xterm/addon-fit` to recalculate dimensions on screen rotation.
  - Floating **Kill Process** button to abort runaway commands.

### Verification & Debugging Checkpoint
```bash
# Build the web app and serve via daemon:
pnpm --filter @antigravity-bridge/web build
pnpm --filter @antigravity-bridge/daemon start
```
**Expected Outcome**: Open `http://localhost:3000` (or `http://100.x.y.z:3000` on phone). Status indicator shows "Connected". Approvals, terminal, and chat panels render with responsive layouts.

---

## Phase 5: End-to-End Integration & Tailscale Verification

### Objective
Execute a live agent session in Antigravity, verify that tool execution pauses, approve the change from a phone or separate browser window, and observe the agent completing the task.

### Detailed Steps
- [ ] **Step 5.1: Bind Daemon to Tailscale Mesh**
  - Daemon binds to `0.0.0.0` or specific Tailscale IP (`100.x.y.z:3000`).
  - Verify access from phone browser over Tailscale.
- [ ] **Step 5.2: Live Antigravity Interception Test**
  - Send prompt to Antigravity: *"Create a file named hello_world.txt containing 'Tested from mobile bridge'"*.
  - Observe `PreToolUse` hook intercepting `write_to_file`.
  - Notice Antigravity waiting patiently.
  - Check phone/web UI: pending approval banner appears with diff preview.
  - Click **Approve** on the web UI.
  - Observe Antigravity immediately creating the file and continuing.
- [ ] **Step 5.3: Rejection Feedback Test**
  - Send prompt to Antigravity requesting a file modification.
  - On phone/web UI, click **Reject** with feedback: *"Change message to 'Revision approved'"*.
  - Observe Antigravity receiving the rejection reason on `stdout` and issuing a revised plan.

---

## Phase 6: Antigravity IDE Companion Extension

### Objective
Create a lightweight companion extension for the Antigravity IDE to provide status bar awareness and direct active-chat prompt injection from the phone.

### Detailed Steps
- [ ] **Step 6.1: `packages/extension` Setup**
  - VS Code extension manifest (`package.json`) targeting Antigravity IDE.
- [ ] **Step 6.2: Status Bar Item**
  - Display `📱 Mobile Gate: Connected` or `⏳ 1 Pending Approval` in the bottom bar.
  - Clicking opens the diff in an IDE side editor.
- [ ] **Step 6.3: Phone $\rightarrow$ IDE Chat Injection**
  - Listen to daemon `client.prompt_submitted` events.
  - Forward prompts directly into the active IDE chat panel via `vscode.commands.executeCommand`.
- [ ] **Step 6.4: Auto-Launch Daemon**
  - Start daemon process automatically on IDE workspace open.

---

## Immediate Next Task to Execute

**Begin Phase 1**:
1. Create root `pnpm-workspace.yaml`, `package.json`, and TypeScript configuration.
2. Implement `packages/shared` with typed event schemas and risk policies.
3. Verify compilation with `pnpm build`.
