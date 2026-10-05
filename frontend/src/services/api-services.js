/**
 * Typed API service modules — every component talks to the backend through
 * these wrappers so endpoints and shapes live in exactly one place.
 */
import { api } from "@/lib/api";

export const spacesApi = {
  list: (opts) => api.get(`/spaces${opts?.includeArchived ? "?include_archived=true" : ""}`),
  get: (id) => api.get(`/spaces/${id}`),
  create: (body) => api.post("/spaces", body),
  update: (id, body) => api.patch(`/spaces/${id}`, body),
  delete: (id) => api.delete(`/spaces/${id}`),

  // Sharing
  createShare: (spaceId, body) => api.post(`/spaces/${spaceId}/shares`, body),
  listShares: (spaceId) => api.get(`/spaces/${spaceId}/shares`),
  revokeShare: (spaceId, shareId) => api.delete(`/spaces/${spaceId}/shares/${shareId}`),

  // Public publishing
  publish: (spaceId, body) => api.post(`/spaces/${spaceId}/public`, body),
  getPublicInfo: (spaceId) => api.get(`/spaces/${spaceId}/public`),
  unpublish: (spaceId) => api.delete(`/spaces/${spaceId}/public`),
  getPublicSpace: (slug) => api.get(`/spaces/public/${slug}`),
  getSharedSpace: (token) => api.get(`/spaces/shared/${token}`),

  // RAG Settings
  getRagSettings: (spaceId) => api.get(`/spaces/${spaceId}/rag`),
  updateRagSettings: (spaceId, body) => api.patch(`/spaces/${spaceId}/rag`, body),
  resetRagSettings: (spaceId) => api.delete(`/spaces/${spaceId}/rag`),

  // Citation Audit
  auditCitations: (spaceId, body) => api.post(`/spaces/${spaceId}/citation-audit`, body),

  // Export / Import — `exportUrl` is a plain link the browser downloads directly,
  // `importBundle` posts a file as multipart form-data.
  exportUrl: (spaceId, fmt) => `${api.base}/spaces/${spaceId}/export?fmt=${encodeURIComponent(fmt)}`,
  importBundle: (spaceId, fmt, formData) => api.upload(`/spaces/${spaceId}/import?fmt=${encodeURIComponent(fmt)}`, formData),
};

export const sourcesApi = {
  list: (spaceId) => api.get(`/spaces/${spaceId}/sources`),
  upload: (spaceId, formData) => api.upload(`/spaces/${spaceId}/sources/upload`, formData),
  addPasted: (spaceId, body) => api.post(`/spaces/${spaceId}/sources/pasted`, body),
  delete: (spaceId, sourceId) => api.delete(`/spaces/${spaceId}/sources/${sourceId}`),
};

export const chatApi = {
  listThreads: (spaceId) => api.get(`/spaces/${spaceId}/chat/threads`),
  getThread: (spaceId, threadId) => api.get(`/spaces/${spaceId}/chat/threads/${threadId}`),
  deleteThread: (spaceId, threadId) => api.delete(`/spaces/${spaceId}/chat/threads/${threadId}`),
};

export const studioApi = {
  generate: (spaceId, body) => api.post(`/spaces/${spaceId}/studio/generate`, body),
  listOutputs: (spaceId) => api.get(`/spaces/${spaceId}/studio/outputs`),
  getOutput: (spaceId, id) => api.get(`/spaces/${spaceId}/studio/outputs/${id}`),
  updateOutput: (spaceId, id, body) => api.patch(`/spaces/${spaceId}/studio/outputs/${id}`, body),
  deleteOutput: (spaceId, id) => api.delete(`/spaces/${spaceId}/studio/outputs/${id}`),
};

export const studyApi = {
  due: () => api.get("/study/due"),
  listCards: (spaceId) => api.get(`/study/cards${spaceId ? `?space_id=${spaceId}` : ""}`),
  review: (body) => api.post("/study/review", body),
  deleteCard: (cardId) => api.delete(`/study/cards/${cardId}`),
};

export const plannerApi = {
  createRun: (body) => api.post("/planner/runs", body),
  listRuns: () => api.get("/planner/runs"),
  getRun: (id) => api.get(`/planner/runs/${id}`),
  approveRun: (id, body) => api.post(`/planner/runs/${id}/approve`, body ?? {}),
  rejectRun: (id) => api.post(`/planner/runs/${id}/reject`, {}),
  listTasks: (includeDone) => api.get(`/planner/tasks${includeDone ? "?include_done=true" : ""}`),
  updateTask: (id, body) => api.patch(`/planner/tasks/${id}`, body),
  deleteTask: (id) => api.delete(`/planner/tasks/${id}`),
};

export const notesApi = {
  list: (params = {}) => {
    const q = new URLSearchParams();
    if (params.q) q.set("q", params.q);
    if (params.tag) q.set("tag", params.tag);
    if (params.sort) q.set("sort", params.sort);
    if (params.space_id) q.set("space_id", params.space_id);
    const qs = q.toString();
    return api.get(`/notes${qs ? `?${qs}` : ""}`);
  },
  create: (body) => api.post("/notes", body),
  get: (id) => api.get(`/notes/${id}`),
  update: (id, body) => api.patch(`/notes/${id}`, body),
  delete: (id) => api.delete(`/notes/${id}`),
};

export const focusApi = {
  sessions: (limit = 100) => api.get(`/focus/sessions?limit=${limit}`),
  create: (body) => api.post("/focus/sessions", body),
  delete: (id) => api.delete(`/focus/sessions/${id}`),
};

export const habitsApi = {
  list: () => api.get("/habits"),
  create: (body) => api.post("/habits", body),
  update: (id, body) => api.patch(`/habits/${id}`, body),
  delete: (id) => api.delete(`/habits/${id}`),
  toggleLog: (id, body) => api.post(`/habits/${id}/logs`, body ?? {}),
};

export const visionApi = {
  list: () => api.get("/vision"),
  create: (body) => api.post("/vision", body),
  upload: (formData) => api.upload("/vision/upload", formData),
  update: (id, body) => api.patch(`/vision/${id}`, body),
  delete: (id) => api.delete(`/vision/${id}`),
};

export const financeApi = {
  transactions: (days = 90) => api.get(`/finance/transactions?days=${days}`),
  create: (body) => api.post("/finance/transactions", body),
  update: (id, body) => api.patch(`/finance/transactions/${id}`, body),
  delete: (id) => api.delete(`/finance/transactions/${id}`),
  summary: (days = 30) => api.get(`/finance/summary?days=${days}`),
};

export const analyticsApi = {
  summary: (days = 120) => api.get(`/analytics/summary?days=${days}`),
};

export const evalsApi = {
  dataset: () => api.get("/evals/dataset"),
  startRun: (body) => api.post("/evals/run", body),
  listRuns: () => api.get("/evals/runs"),
  getRun: (id) => api.get(`/evals/runs/${id}`),
  results: (id) => api.get(`/evals/runs/${id}/results`),
};

export const demoApi = {
  session: (reset = false) => api.post("/demo/session", { reset }),
  reset: () => api.post("/demo/reset", {}),
};

export const meApi = {
  get: () => api.get("/me"),
  update: (body) => api.patch("/me", body),
  exportUrl: `${(import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/$/, "")}/me/export`,
  delete: () => api.delete("/me"),
  mcpTokens: () => api.get("/me/mcp-tokens"),
  createMcpToken: (body) => api.post("/me/mcp-tokens", body),
  revokeMcpToken: (id) => api.delete(`/me/mcp-tokens/${id}`),
};

export const modelsApi = {
  catalog: () => api.get("/models/catalog"),
  config: () => api.get("/models/config"),
  defaults: () => api.get("/models/defaults"),
};

export const promptTemplatesApi = {
  list: ({ spaceId, type } = {}) => {
    const q = new URLSearchParams();
    if (spaceId) q.set("space_id", spaceId);
    if (type) q.set("type", type);
    const qs = q.toString();
    return api.get(`/prompt-templates${qs ? `?${qs}` : ""}`);
  },
  get: (id) => api.get(`/prompt-templates/${id}`),
  create: (body) => api.post("/prompt-templates", body),
  update: (id, body) => api.patch(`/prompt-templates/${id}`, body),
  remove: (id) => api.delete(`/prompt-templates/${id}`),
  render: (id, variables) => api.post(`/prompt-templates/${id}/render`, variables),
};

export const ragApi = {
  getSettings: (spaceId) => api.get(`/spaces/${spaceId}/rag`),
  updateSettings: (spaceId, body) => api.patch(`/spaces/${spaceId}/rag`, body),
  resetSettings: (spaceId) => api.delete(`/spaces/${spaceId}/rag`),
  auditCitations: (spaceId, body = {}) => api.post(`/spaces/${spaceId}/citation-audit`, body),
};
