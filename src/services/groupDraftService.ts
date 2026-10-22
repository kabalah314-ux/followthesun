import { addOption, removeOption, sanitizeGroupPlan, type GroupOption, type GroupPlan } from "../lib/groupPlan";
import { createLocalStore } from "../lib/localStore";

/** El plan en grupo que se está preparando (las opciones se añaden desde las fichas). */
export const groupDraftStore = createLocalStore<GroupPlan>("fts:group-draft:v1", { title: "", options: [] }, sanitizeGroupPlan);

export const addToGroupDraft = (o: GroupOption) => groupDraftStore.set((p) => addOption(p, o));
export const removeFromGroupDraft = (id: string) => groupDraftStore.set((p) => removeOption(p, id));
export const setGroupDraftTitle = (title: string) => groupDraftStore.set((p) => ({ ...p, title: title.slice(0, 80) }));
