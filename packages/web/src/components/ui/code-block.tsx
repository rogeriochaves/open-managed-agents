import { useState } from "react";
import { Copy, Check } from "lucide-react";

/* ── Format tabs (curl / Python / TypeScript / CLI) ──────────────────── */

type CodeFormat = "curl" | "Python" | "TypeScript" | "CLI";
type ConfigFormat = "YAML" | "JSON";

interface CodeBlockProps {
  /** Map of format label to code string. */
  formats?: Partial<Record<CodeFormat, string>>;
  /** For config display: YAML + JSON content. */
  configs?: { YAML: string; JSON: string };
  /** Single code string (no tabs). */
  code?: string;
  /** Title/header line shown above the code, e.g. "POST /v1/agents". */
  title?: string;
  className?: string;
}

export function CodeBlock({
  formats,
  configs,
  code,
  title,
  className = "",
}: CodeBlockProps) {
  // Determine which tab set to use.
  const isFormats = formats && Object.keys(formats).length > 0;
  const isConfigs = configs != null;

  const [activeFormat, setActiveFormat] = useState<CodeFormat>(
    isFormats
      ? (Object.keys(formats!)[0] as CodeFormat)
      : "curl",
  );
  const [activeConfig, setActiveConfig] = useState<ConfigFormat>("YAML");
  const [copied, setCopied] = useState(false);

  let displayCode = "";
  if (isFormats) {
    displayCode = formats![activeFormat] ?? "";
  } else if (isConfigs) {
    displayCode = configs![activeConfig];
  } else {
    displayCode = code ?? "";
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`rounded-lg border border-surface-border bg-surface-secondary overflow-hidden ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-surface-border px-3 py-1.5">
        <div className="flex items-center gap-1">
          {title && (
            <span className="mr-3 text-xs font-medium text-text-secondary">
              {title}
            </span>
          )}

          {/* Format tabs */}
          {isFormats &&
            (Object.keys(formats!) as CodeFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setActiveFormat(f)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  activeFormat === f
                    ? "bg-surface-hover text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {f}
              </button>
            ))}

          {/* Config tabs */}
          {isConfigs &&
            (["YAML", "JSON"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setActiveConfig(f)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  activeConfig === f
                    ? "bg-surface-hover text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {f}
              </button>
            ))}
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy code
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-text-secondary">
        <code>{displayCode}</code>
      </pre>
    </div>
  );
}
