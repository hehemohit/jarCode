import { BridgeDatabase } from './db/database.js';
import { PolicyEngine } from './gate/policy-engine.js';
import { ProcessManager } from './pty/process-manager.js';
import { TranscriptTailer } from './tailer/transcript-tailer.js';
import { createHttpServer } from './server/http-server.js';
import { BridgeWebSocketServer } from './server/websocket-server.js';

const PORT = parseInt(process.env.PORT || '3188', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function bootstrap() {
  console.log('🚀 Starting Antigravity Desktop Bridge Daemon...');

  // 1. Initialize SQLite Database
  const db = new BridgeDatabase();
  console.log('📦 Database initialized (SQLite WAL mode)');

  // 2. Initialize Core Engines
  const policyEngine = new PolicyEngine(db);
  const processManager = new ProcessManager(db);
  const transcriptTailer = new TranscriptTailer(db);

  // 3. Initialize Fastify Server
  const app = createHttpServer(policyEngine, transcriptTailer);
  await app.ready();

  // 4. Attach WebSocket Server to the underlying Node HTTP server
  const wsServer = new BridgeWebSocketServer(app.server, db, policyEngine, processManager);

  // 5. Connect broadcast pipelines
  const broadcast = wsServer.broadcast.bind(wsServer);
  policyEngine.setBroadcastHandler(broadcast);
  processManager.setBroadcastHandler(broadcast);
  transcriptTailer.setBroadcastHandler(broadcast);

  // 6. Start Listening
  await app.listen({ port: PORT, host: HOST });
  console.log(`🌐 Desktop Bridge Daemon listening on http://${HOST}:${PORT}`);
  console.log(`📡 WebSocket stream ready on ws://${HOST}:${PORT}/ws`);
  console.log(`🔒 Hook IPC endpoint active on http://127.0.0.1:${PORT}/api/hook/pre-tool`);

  // Handle clean shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down Desktop Bridge Daemon...');
    wsServer.close();
    transcriptTailer.close();
    await app.close();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Fatal error starting daemon:', err);
  process.exit(1);
});
