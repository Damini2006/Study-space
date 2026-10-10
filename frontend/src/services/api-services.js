/**
 * Typed API service modules — every component talks to the backend through
 * these wrappers so endpoints and shapes live in exactly one place.
 */
import { api } from "@/lib/api";

export const spacesApi = {
  list: (opts) => api.get(`/spaces${opts?.includeArchived ? "?include_archived=true" : ""}`),
  get: (id) => api.get(`/spaces/${id}`),
  create: (body) => api.post("/spaces", body),
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

  // Export / Import — `export` fetches with auth and hands back a Blob (a
  // plain link would 401), `importBundle` posts a file as multipart form-data.
  export: (spaceId, fmt, { print } = {}) =>
    api.download(
      `/spaces/${spaceId}/export?fmt=${encodeURIComponent(fmt)}${print ? "&print=1" : ""}`
    ),
  importBundle: (spaceId, fmt, formData) => api.upload(`/spaces/${spaceId}/import?fmt=${encodeURIComponent(fmt)}`, formData),
};

export const sourcesApi = {
  list: (spaceId) => api.get(`/spaces/${spaceId}/sources`),
  // Hybrid (vector + full-text) search over the space's indexed chunks —
  // the same retrieval endpoint chat's RAG and the MCP tool call.
  search: (spaceId, q, limit = 10) =>
    api.get(`/spaces/${spaceId}/search?q=${encodeURIComponent(q)}&limit=${limit}`),
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
  updateOutput: (spaceId, id, body) => api.patch(`/spaces/${spaceId}/studio/outputs/${id}`, body),
  deleteOutput: (spaceId, id) => api.delete(`/spaces/${spaceId}/studio/outputs/${id}`),
};

export const studyApi = {
  due: () => api.get("/study/due"),
  review: (body) => api.post("/study/review", body),
};

export const plannerApi = {
  createRun: (body) => api.post("/planner/runs", body),
  listRuns: () => api.get("/planner/runs"),
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
  update: (id, body) => api.patch(`/notes/${id}`, body),
  delete: (id) => api.delete(`/notes/${id}`),
};

export const focusApi = {
  sessions: (limit = 100) => api.get(`/focus/sessions?limit=${limit}`),
  create: (body) => api.post("/focus/sessions", body),
};

export const habitsApi = {
  list: () => api.get("/habits"),
  create: (body) => api.post("/habits", body),
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
  startRun: (body) => api.post("/evals/run", body),
  listRuns: () => api.get("/evals/runs"),
  results: (id) => api.get(`/evals/runs/${id}/results`),
};

export const demoApi = {
  session: (reset = false) => api.post("/demo/session", { reset }),
};

export const meApi = {
  get: () => api.get("/me"),
  update: (body) => api.patch("/me", body),
  // A blob through the same authenticated path as every other request —
  // a bare <a href> to this endpoint would 401 (it did, as dead code).
  export: () => api.download("/me/export"),
  delete: () => api.delete("/me"),
  mcpTokens: () => api.get("/me/mcp-tokens"),
  createMcpToken: (body) => api.post("/me/mcp-tokens", body),
  revokeMcpToken: (id) => api.delete(`/me/mcp-tokens/${id}`),
};

export const modelsApi = {
  catalog: () => api.get("/models/catalog"),
  defaults: () => api.get("/models/defaults"),
};

export const promptTemplatesApi = {
  // Built-in templates are addressable by their type name ("chat_system"), custom
  // ones by UUID — so `render` accepts either without the caller caring.
  list: ({ spaceId, type } = {}) => {
    const q = new URLSearchParams();
    if (spaceId) q.set("space_id", spaceId);
    if (type) q.set("type", type);
    const qs = q.toString();
    return api.get(`/prompt-templates${qs ? `?${qs}` : ""}`);
  },
  create: (body) => {
    const { space_id: spaceId, ...rest } = body;
    const q = spaceId ? `?space_id=${encodeURIComponent(spaceId)}` : "";
    return api.post(`/prompt-templates${q}`, rest);
  },
  update: (id, body) => api.patch(`/prompt-templates/${encodeURIComponent(id)}`, body),
  remove: (id) => api.delete(`/prompt-templates/${encodeURIComponent(id)}`),
  render: (id, variables) =>
    api.post(`/prompt-templates/${encodeURIComponent(id)}/render`, variables),
};

export const ragApi = {
  getSettings: (spaceId) => api.get(`/spaces/${spaceId}/rag`),
  updateSettings: (spaceId, body) => api.patch(`/spaces/${spaceId}/rag`, body),
  resetSettings: (spaceId) => api.delete(`/spaces/${spaceId}/rag`),
  // Optional filters go in the request body (not the query string) so
  // `source_ids` arrives as a real UUID array rather than a comma-joined string.
  auditCitations: (spaceId, filters = {}) =>
    api.post(`/spaces/${spaceId}/citation-audit`, filters),
};
