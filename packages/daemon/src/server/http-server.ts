import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { PolicyEngine } from '../gate/policy-engine.js';
import { TranscriptTailer } from '../tailer/transcript-tailer.js';

export function createHttpServer(policyEngine: PolicyEngine, transcriptTailer: TranscriptTailer) {
  const fastify = Fastify({ logger: false });

  fastify.register(cors, { origin: true });

  // Serve static web application frontend if built
  const webDistPath = path.resolve(process.cwd(), 'packages', 'web', 'dist');
  if (fs.existsSync(webDistPath)) {
    fastify.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
    });
  }

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', time: Date.now() };
  });

  // Antigravity Hook IPC endpoint
  fastify.post('/api/hook/pre-tool', async (request, reply) => {
    const body = request.body as {
      conversationId: string;
      stepIdx: number;
      toolCall: { name: string; args: Record<string, any> };
      transcriptPath?: string;
    };

    if (!body || !body.toolCall) {
      return reply.code(400).send({ error: 'Invalid hook payload' });
    }

    // Auto-track the transcript if provided
    if (body.transcriptPath && body.conversationId) {
      transcriptTailer.trackFile(body.transcriptPath, body.conversationId);
    }

    // Wait for the policy decision (synchronously suspended if Tier 1 or 2)
    const decision = await policyEngine.handleToolCall(body);
    return decision;
  });

  // Get pending approvals
  fastify.get('/api/gate/pending', async () => {
    return policyEngine.getPendingList();
  });

  // One-tap approve endpoint (used by WebApp or mobile push action)
  fastify.post('/api/gate/approve/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = policyEngine.approve(id);
    if (!success) {
      return reply.code(404).send({ error: 'Approval request not found or expired' });
    }
    return { success: true, id };
  });

  // Reject endpoint
  fastify.post('/api/gate/reject/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = (request.body as { reason?: string }) || {};
    const success = policyEngine.reject(id, reason || 'Rejected by user.');
    if (!success) {
      return reply.code(404).send({ error: 'Approval request not found or expired' });
    }
    return { success: true, id };
  });

  return fastify;
}
