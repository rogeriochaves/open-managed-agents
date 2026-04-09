// ── Pagination ──────────────────────────────────────────────────────────────

export interface PageCursorParams {
  after_id?: string;
  before_id?: string;
  limit?: number;
}

export interface PageCursor<T> {
  data: T[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}

// ── Permission policies ─────────────────────────────────────────────────────

export interface AlwaysAllowPolicy {
  type: "always_allow";
}

export interface AlwaysAskPolicy {
  type: "always_ask";
}

export type PermissionPolicy = AlwaysAllowPolicy | AlwaysAskPolicy;

// ── Content blocks ──────────────────────────────────────────────────────────

export interface TextBlock {
  type: "text";
  text: string;
}

export interface Base64ImageSource {
  type: "base64";
  data: string;
  media_type: string;
}

export interface URLImageSource {
  type: "url";
  url: string;
}

export interface FileImageSource {
  type: "file";
  file_id: string;
}

export type ImageSource = Base64ImageSource | URLImageSource | FileImageSource;

export interface ImageBlock {
  type: "image";
  source: ImageSource;
}

export interface Base64DocumentSource {
  type: "base64";
  data: string;
  media_type: string;
}

export interface PlainTextDocumentSource {
  type: "text";
  data: string;
  media_type: "text/plain";
}

export interface URLDocumentSource {
  type: "url";
  url: string;
}

export interface FileDocumentSource {
  type: "file";
  file_id: string;
}

export type DocumentSource =
  | Base64DocumentSource
  | PlainTextDocumentSource
  | URLDocumentSource
  | FileDocumentSource;

export interface DocumentBlock {
  type: "document";
  source: DocumentSource;
  title?: string | null;
  context?: string | null;
}

export type ContentBlock = TextBlock | ImageBlock | DocumentBlock;

// ── Metadata ────────────────────────────────────────────────────────────────

export type Metadata = Record<string, string>;
export type MetadataPatch = Record<string, string | null>;
