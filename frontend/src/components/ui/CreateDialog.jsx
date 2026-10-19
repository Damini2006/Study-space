import { Fragment, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

/**
 * Unified create/edit dialog.
 * - open/onClose/title/description control visibility.
 * - fields: array of { id, label, type, placeholder, required, disabled, options (for select), autoFocus }.
 *   types: "text" | "number" | "textarea" | "select" | "checkbox" | "color-swatch" | "date".
 * - onSubmit: called with formData object on valid submit.
 * - submitLabel / submitDisabled / submitPending for the primary button.
 * - cancelLabel for the cancel button.
 * - className extends the Dialog.
 */
export function CreateDialog({
  open,
  onClose,
  title,
  description,
  fields = [],
  onSubmit,
  submitLabel = "Save",
  submitDisabled,
  submitPending,
  cancelLabel = "Cancel",
  className,
}) {
  const [form, setForm] = useState(() =>
    fields.reduce((acc, f) => ({ ...acc, [f.id]: f.defaultValue ?? "" }), {})
  );

  useEffect(() => {
    setForm(fields.reduce((acc, f) => ({ ...acc, [f.id]: f.defaultValue ?? "" }), {}));
  }, [fields]);

  const handleChange = (id, value) => setForm((prev) => ({ ...prev, [id]: value }));
  const handleSubmit = (e) => {
    e.preventDefault();
    const valid = fields.every((f) => !f.required || (form[f.id]?.toString().trim?.() ?? "") !== "");
    if (valid) onSubmit(form);
  };

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} className={className} footer={
      <>
        <Button variant="outline" onClick={onClose} disabled={submitPending}>
          {cancelLabel}
        </Button>
        <Button onClick={handleSubmit} disabled={submitPending || submitDisabled}>
          {submitPending && <Loader2 className="size-4 animate-spin mr-2" />}
          {submitLabel}
        </Button>
      </>
    }>
      <form onSubmit={handleSubmit} className="space-y-3">
        {fields.map((f) => (
          <div key={f.id} className="space-y-1.5">
            {f.label && <label htmlFor={f.id} className="text-sm font-medium">{f.label}</label>}
            {f.type === "textarea" ? (
              <textarea
                id={f.id}
                value={form[f.id] || ""}
                onChange={(e) => handleChange(f.id, e.target.value)}
                placeholder={f.placeholder}
                disabled={f.disabled}
                autoFocus={f.autoFocus}
                className="h-24 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            ) : f.type === "select" ? (
              <select
                id={f.id}
                value={form[f.id] || ""}
                onChange={(e) => handleChange(f.id, e.target.value)}
                disabled={f.disabled}
                className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : f.type === "number" ? (
              <input
                type="number"
                id={f.id}
                value={form[f.id] || ""}
                onChange={(e) => handleChange(f.id, e.target.value)}
                placeholder={f.placeholder}
                min={f.min}
                max={f.max}
                step={f.step}
                disabled={f.disabled}
                autoFocus={f.autoFocus}
                className={cn("h-9 w-full rounded-lg border border-input bg-card px-3 text-sm tabular-nums", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary")}
              />
            ) : f.type === "date" ? (
              <input
                type="date"
                id={f.id}
                value={form[f.id] || ""}
                onChange={(e) => handleChange(f.id, e.target.value)}
                disabled={f.disabled}
                className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            ) : f.type === "checkbox" ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  id={f.id}
                  checked={form[f.id]}
                  onChange={(e) => handleChange(f.id, e.target.checked)}
                  disabled={f.disabled}
                  className="size-4 accent-primary"
                />
                <span className="text-sm">{f.label}</span>
              </label>
            ) : f.type === "color-swatch" ? (
              <div className="flex gap-2">
                {f.options?.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Choose color ${c}`}
                    aria-pressed={form[f.id] === c}
                    onClick={() => handleChange(f.id, c)}
                    className={cn("size-6 rounded-full border-2", form[f.id] === c ? "border-foreground" : "border-transparent")}
                    style={{ background: c }}
                  />
                ))}
              </div>
            ) : (
              <input
                type="text"
                id={f.id}
                value={form[f.id] || ""}
                onChange={(e) => handleChange(f.id, e.target.value)}
                placeholder={f.placeholder}
                disabled={f.disabled}
                autoFocus={f.autoFocus}
                className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            )}
            {f.helper && <p className="text-[11px] text-muted-foreground">{f.helper}</p>}
          </div>
        ))}
      </form>
    </Dialog>
  );
}