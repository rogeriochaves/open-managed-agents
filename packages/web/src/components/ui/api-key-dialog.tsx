import { useState, useEffect } from "react";
import { Button } from "./button";
import { Key } from "lucide-react";

const API_KEY_STORAGE = "oma_api_key";

export function getStoredApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE);
}

export function setStoredApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function clearStoredApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE);
}

interface ApiKeyDialogProps {
  open: boolean;
  onSave: (key: string) => void;
  onClose: () => void;
}

export function ApiKeyDialog({ open, onSave, onClose }: ApiKeyDialogProps) {
  const [key, setKey] = useState("");

  useEffect(() => {
    if (open) {
      setKey(getStoredApiKey() ?? "");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-surface-border bg-surface-primary p-6 shadow-xl">
        <div className="flex items-center gap-2 text-text-primary">
          <Key className="h-5 w-5 text-accent-blue" />
          <h2 className="text-lg font-semibold">API Key Required</h2>
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          Enter your Anthropic API key to connect to the Managed Agents API.
          The key is stored in your browser only.
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-api03-..."
          className="mt-4 w-full rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none font-mono"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && key.trim()) {
              onSave(key.trim());
            }
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (key.trim()) onSave(key.trim());
            }}
            disabled={!key.trim()}
          >
            Save Key
          </Button>
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Don&apos;t have a key?{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-accent-blue hover:underline"
          >
            Get one from Anthropic
          </a>
        </p>
      </div>
    </div>
  );
}
