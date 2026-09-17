/**
 * Public agent ids read `agent_<number>`, while phone numbers and the
 * statistics endpoints address the same agent by the bare number.
 */
export function agentNumber(id: string): number {
  return Number(id.replace('agent_', ''));
}
