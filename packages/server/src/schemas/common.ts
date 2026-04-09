import { z } from "zod";

export const MetadataSchema = z.record(z.string());
export const MetadataPatchSchema = z.record(z.string().nullable());

export const AlwaysAllowPolicySchema = z.object({
  type: z.literal("always_allow"),
});

export const AlwaysAskPolicySchema = z.object({
  type: z.literal("always_ask"),
});

export const PermissionPolicySchema = z.discriminatedUnion("type", [
  AlwaysAllowPolicySchema,
  AlwaysAskPolicySchema,
]);

export const TextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const Base64ImageSourceSchema = z.object({
  type: z.literal("base64"),
  data: z.string(),
  media_type: z.string(),
});

export const URLImageSourceSchema = z.object({
  type: z.literal("url"),
  url: z.string(),
});

export const FileImageSourceSchema = z.object({
  type: z.literal("file"),
  file_id: z.string(),
});

export const ImageBlockSchema = z.object({
  type: z.literal("image"),
  source: z.discriminatedUnion("type", [
    Base64ImageSourceSchema,
    URLImageSourceSchema,
    FileImageSourceSchema,
  ]),
});

export const Base64DocumentSourceSchema = z.object({
  type: z.literal("base64"),
  data: z.string(),
  media_type: z.string(),
});

export const PlainTextDocumentSourceSchema = z.object({
  type: z.literal("text"),
  data: z.string(),
  media_type: z.literal("text/plain"),
});

export const URLDocumentSourceSchema = z.object({
  type: z.literal("url"),
  url: z.string(),
});

export const FileDocumentSourceSchema = z.object({
  type: z.literal("file"),
  file_id: z.string(),
});

export const DocumentBlockSchema = z.object({
  type: z.literal("document"),
  source: z.union([
    Base64DocumentSourceSchema,
    PlainTextDocumentSourceSchema,
    URLDocumentSourceSchema,
    FileDocumentSourceSchema,
  ]),
  title: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
});

export const ContentBlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ImageBlockSchema,
  DocumentBlockSchema,
]);

export const PageCursorQuerySchema = z.object({
  after_id: z.string().optional(),
  before_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export function pageCursorResponse<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    has_more: z.boolean(),
    first_id: z.string().nullable(),
    last_id: z.string().nullable(),
  });
}
