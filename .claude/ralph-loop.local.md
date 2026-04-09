---
active: true
iteration: 6
session_id: 
max_iterations: 0
completion_promise: null
started_at: "2026-04-09T18:58:31Z"
---

hey there, anthropic launched this: https://claude.com/blog/claude-managed-agents                                                                
https://platform.claude.com/docs/en/managed-agents/quickstart

Let's create an open source clone of it, typescript, react, looking exactly the same on the ui for the managed agents builder, use some mcp discovery service for all the connector, and @anthropic-ai/claude-agent-sdk for the harness, all very strictly types, react-testing-library tests for the frontend, 1-1 mapping for the backend, specs and cli (you can literally copy paste the cli sdk from github right? and see the openapi specs, remove everything tho except the managed agents parts)

Use browser in use and chrome in chrome to explore every piece of detail you need to learn how it works on anthropic console (https://platform.claude.com/workspaces/default/agent-quickstart), I'm logged in, open our solution too and keep comparing and keep advancing until everything works
