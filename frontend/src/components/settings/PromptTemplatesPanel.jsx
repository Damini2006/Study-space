/**
 * Prompt template manager — browse the built-in system templates plus any custom
 * ones the user has saved, create/edit their own, and preview a rendered
 * template with sample variables before putting it into use.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { promptTemplatesApi } from "@/services/api-services";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/dialog";
import { extractVariables } from "@/lib/prompt-templates";
import { cn } from "@/lib/utils";
import { Eye, FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

const TEMPLATE_TYPES = [
  { value: "chat_system", label: "Chat — system" },
  { value: "chat_user", label: "Chat — user" },
  { value: "studio_summary", label: "Studio — summary" },
  { value: "studio_guide", label: "Studio — study guide" },
  { value: "studio_flashcards", label: "Studio — flashcards" },
  { value: "studio_quiz", label: "Studio — quiz" },
  { value: "judge_claims", label: "Judge — claim verification" },
  { value: "socratic", label: "Socratic tutor" },
  { value: "custom", label: "Custom" },
];

const VARIABLE_SAMPLES = {
  context: "<context>\n[1] Retrieved passage text…\n</context>",
  question: "What causes the Vitamin D deficiency?",
  passages: "[1] Retrieved passage text…\n[2] Another passage…",
  topic: "Photosynthesis",
  count: "10",
  blocks: "Claim 1 (1) → \"Vitamin D is synthesised in skin.\"",
  assistant_name: "Study Assistant",
  source_untrusted_marker: "--- BEGIN SOURCE TEXT (untrusted) ---",
};

function TemplateCard({ template, onEdit, onPreview, onDelete }) {
  const isSystem = Boolean(template.is_system);
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{template.name}</span>
            {isSystem ? <Badge>Built-in</Badge> : <Badge variant="info">Custom</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{template.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" title="Preview rendered output" onClick={onPreview}>
            <Eye className="size-3.5" />
          </Button>
          {isSystem ? null : (
            <>
              <Button variant="ghost" size="icon" title="Edit template" onClick={onEdit}>
                <Pencil className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" title="Delete template" onClick={onDelete}>
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
      <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-surface-2 p-2 text-xs text-muted-foreground">
        {template.template}
      </pre>
      {template.variables?.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Variables: {template.variables.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

export default function PromptTemplatesPanel({ spaceId }) {
  const { success, error: onError } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("chat_system");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(null);
  const [filter, setFilter] = useState("all");

  const queryKey = ["prompt-templates", spaceId ?? "global"];
  const { data: templates = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => promptTemplatesApi.list({ spaceId }),
  });

  const variables = useMemo(() => extractVariables(body), [body]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const saveTemplate = useMutation({
    mutationFn: () => {
      const payload = { name, description, type, template: body, variables };
      return editingId
        ? promptTemplatesApi.update(editingId, payload)
        : promptTemplatesApi.create({ ...payload, space_id: spaceId ?? null });
    },
    onSuccess: () => {
      invalidate();
      success(editingId ? "Template updated." : "Template created.");
      closeForm();
    },
    onError: onError,
  });

  const removeTemplate = useMutation({
    mutationFn: (id) => promptTemplatesApi.remove(id),
    onSuccess: () => {
      invalidate();
      success("Template deleted.");
    },
    onError: onError,
  });

  const renderTemplate = useMutation({
    mutationFn: ({ id, vars }) => promptTemplatesApi.render(id, vars),
    onSuccess: (data) => setPreview(data),
    onError,
  });

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setName("");
    setDescription("");
    setType("chat_system");
    setBody("");
    setPreview(null);
  }

  function openCreate() {
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(template) {
    setEditingId(template.id);
    setName(template.name);
    setDescription(template.description ?? "");
    setType(template.type);
    setBody(template.template);
    setPreview(null);
    setShowForm(true);
  }

  function openPreview(template) {
    const vars = {};
    for (const v of template.variables ?? []) {
      vars[v] = VARIABLE_SAMPLES[v] ?? `sample ${v}`;
    }
    renderTemplate.mutate({ id: template.id, vars });
  }

  const shown = filter === "all" ? templates : templates.filter((t) => t.type === filter);

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Prompt templates</h3>
            <p className="text-sm text-muted-foreground">
              Customise how the assistant is instructed. Built-in templates stay editable as a starting point.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="size-4 mr-1" /> New template
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="tpl_filter" className="text-xs text-muted-foreground">
            Filter
          </Label>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger placeholder="All types" className="max-w-56" />
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TEMPLATE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading templates…</p>
      ) : null}

      {!isLoading && shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No templates match this filter.</p>
      ) : null}

      <div className="space-y-3">
        {shown.map((t) => (
          <TemplateCard
            key={t.id ?? t.type}
            template={t}
            onEdit={() => openEdit(t)}
            onPreview={() => openPreview(t)}
            onDelete={() => removeTemplate.mutate(t.id)}
          />
        ))}
      </div>

      <Dialog
        open={showForm}
        onClose={closeForm}
        title={editingId ? "Edit template" : "New prompt template"}
        className="max-w-2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveTemplate.mutate();
          }}
          className="space-y-3 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl_name">Name</Label>
              <Input
                id="tpl_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl_type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger placeholder="Choose a type" />
                <SelectContent>
                  {TEMPLATE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl_desc">Description</Label>
            <Input
              id="tpl_desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When should this template be used?"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl_body" className="flex items-center gap-1.5">
              <FileText className="size-3.5" /> Template body
            </Label>
            <Textarea
              id="tpl_body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="font-mono text-xs"
              placeholder="Answer only from <context>. Cite with [n]."
              required
            />
          </div>

          {variables.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Detected variables: {variables.join(", ")}
            </p>
          ) : null}

          {preview ? (
            <div className="rounded-md border bg-surface-2 p-2">
              <p className="text-xs font-medium text-muted-foreground">Rendered preview</p>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                {preview.system ?? preview.user ?? preview.messages?.[0]?.content ?? JSON.stringify(preview)}
              </pre>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const vars = {};
                for (const v of variables) vars[v] = VARIABLE_SAMPLES[v] ?? `sample ${v}`;
                renderTemplate.mutate({ id: editingId, vars });
              }}
              disabled={!variables.length || renderTemplate.isPending}
            >
              {renderTemplate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
              <span className="ml-1">Preview</span>
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || !body.trim() || saveTemplate.isPending}>
                {saveTemplate.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                <span className={cn(saveTemplate.isPending && "ml-1")}>
                  {editingId ? "Save changes" : "Create template"}
                </span>
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  );
}