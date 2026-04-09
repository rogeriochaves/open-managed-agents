import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error(
        "Error: ANTHROPIC_API_KEY environment variable is required"
      );
      process.exit(1);
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}
