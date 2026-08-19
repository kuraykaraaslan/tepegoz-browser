import { randomUUID } from 'node:crypto';
import { IpcChannels, type SkillRecord } from '@tepegoz/desktop-ipc';
import { AgentSkillIdSchema, AgentSkillSaveSchema } from '@tepegoz/desktop-ipc/schemas';
import { AgentMemoryStore } from '@tepegoz/persistence';
import { getDb } from '../db/database.electron';
import { handle } from './ipc-helpers';
import { requireAgentEnabled } from './ipc-agent-shared';

/**
 * The skills library (S9 PR4): stored prompt **templates** the user can re-run.
 *
 * Two properties are worth stating because they are what keep a skill from being an autonomy channel:
 *
 * 1. **A skill never starts a run.** Every handler here reads or writes rows; the renderer pre-fills its
 *    composer from one, and the human still presses send. The gesture that authorises a task stays where
 *    it was.
 * 2. **A skill carries a grant PROFILE, never a grant.** `grantProfile` names which S6 profile the skill
 *    expects so the panel can show it; the policy kernel is unaffected, and every gated call is still
 *    asked for exactly as it would be on a hand-typed prompt.
 *
 * The renderer never supplies an id for a new skill — the main process mints the UUID. A renderer-chosen
 * primary key is a renderer choosing which row to overwrite.
 */
export function registerAgentSkillsIpc(): void {
  const list = (): SkillRecord[] => {
    const db = getDb();
    return db === null ? [] : AgentMemoryStore.listSkills(db);
  };

  handle(IpcChannels.agentSkillsList, (): SkillRecord[] => {
    requireAgentEnabled();
    return list();
  });

  handle(IpcChannels.agentSkillsSave, (_event, payload): SkillRecord[] => {
    requireAgentEnabled();
    const db = getDb();
    if (db === null) return [];
    const input = AgentSkillSaveSchema.parse(payload);
    AgentMemoryStore.putSkill(db, {
      id: input.id ?? randomUUID(),
      name: input.name,
      prompt: input.prompt,
      ...(input.startUrl !== undefined ? { startUrl: input.startUrl } : {}),
      ...(input.grantProfile !== undefined ? { grantProfile: input.grantProfile } : {}),
    });
    return list();
  });

  handle(IpcChannels.agentSkillsDelete, (_event, payload): SkillRecord[] => {
    requireAgentEnabled();
    const db = getDb();
    if (db === null) return [];
    // Soft-delete, like every other row in this store: a hard delete on one device is indistinguishable
    // from a row that never synced.
    const id = AgentSkillIdSchema.parse(payload);
    AgentMemoryStore.forgetSkill(db, id);
    // A skill is the ONLY scope that can hold a remembered grant, so deleting it must take its saved
    // permissions with it — otherwise they would linger with no surface left to revoke them from.
    AgentMemoryStore.revokeGrantsForScope(db, id);
    return list();
  });
}
