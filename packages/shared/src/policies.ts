import { z } from 'zod';

export enum RiskTier {
  TIER_0_AUTO = 0,    // Read-only tools, safe linters, read tests
  TIER_1_REVIEW = 1,  // File writes, modifications, dependency installation
  TIER_2_HIGH_RISK = 2 // Destructive operations, network outside workspace, git force push
}

export const RiskTierSchema = z.nativeEnum(RiskTier);

export interface PolicyRule {
  toolPattern: RegExp;
  tier: RiskTier;
  description: string;
}

export const DEFAULT_POLICY_RULES: PolicyRule[] = [
  // Tier 0: Read-only & inspection tools
  {
    toolPattern: /^(view_file|list_dir|grep_search|read_url_content|read_resource|list_resources)$/,
    tier: RiskTier.TIER_0_AUTO,
    description: 'Safe read-only file or directory inspection',
  },
  // Tier 2: Destructive shell commands
  {
    toolPattern: /^run_command$/,
    tier: RiskTier.TIER_2_HIGH_RISK,
    description: 'Shell command execution requiring verification',
  },
  // Tier 1: File modifications
  {
    toolPattern: /^(write_to_file|replace_file_content|multi_replace_file_content)$/,
    tier: RiskTier.TIER_1_REVIEW,
    description: 'Modifying, creating, or replacing file content',
  },
];

/**
 * Classifies a tool call by risk tier based on tool name and arguments.
 */
export function classifyToolRisk(toolName: string, args: Record<string, any> = {}): RiskTier {
  // Check high-risk command patterns
  if (toolName === 'run_command' && args.CommandLine) {
    const cmd = String(args.CommandLine).toLowerCase().trim();
    // Destructive commands
    if (cmd.includes('rm -rf') || cmd.includes('del /s') || cmd.includes('git push --force') || cmd.includes('format ')) {
      return RiskTier.TIER_2_HIGH_RISK;
    }
    // Safe read commands can be Tier 0
    if (/^(ls|dir|git status|git diff|pwd|echo|node -v|npm -v|pnpm -v)(\s|$)/.test(cmd)) {
      return RiskTier.TIER_0_AUTO;
    }
    return RiskTier.TIER_1_REVIEW;
  }

  for (const rule of DEFAULT_POLICY_RULES) {
    if (rule.toolPattern.test(toolName)) {
      return rule.tier;
    }
  }

  // Default unknown tools to Tier 1 (Review)
  return RiskTier.TIER_1_REVIEW;
}
