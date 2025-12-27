---
name: context7
description: Use when you need up-to-date documentation for any library or framework. Fetches current documentation using the Context7 MCP server to ensure accurate, version-specific information.
---

# Context7 Documentation Lookup

Fetch up-to-date documentation for libraries and frameworks using the Context7 MCP server.

## When to Use

Use this skill when:
- You need current documentation for a library or framework
- The user asks about specific library APIs or features
- You're implementing code that uses external dependencies
- You need to verify correct usage patterns or syntax
- Documentation might have changed since your knowledge cutoff

## Available Tools

### 1. resolve-library-id

First, resolve the library name to get a Context7-compatible library ID:

```
mcp__context7-mcp__resolve-library-id
Parameters:
  - libraryName: The name of the library to search for (e.g., "react", "next.js", "prisma")
```

This returns matching libraries with:
- Library ID (required for documentation fetch)
- Description
- Code snippet count
- Trust score

### 2. get-library-docs

Then fetch the documentation:

```
mcp__context7-mcp__get-library-docs
Parameters:
  - context7CompatibleLibraryID: The ID from resolve-library-id (e.g., "/vercel/next.js")
  - topic: (optional) Focus on specific topic (e.g., "routing", "hooks", "authentication")
  - tokens: (optional) Max tokens to retrieve (default: 5000)
```

## Workflow

### Step 1: Identify the Library
When the user mentions a library or you need documentation:
1. Extract the library name from context
2. Call `resolve-library-id` to find the correct library

### Step 2: Select the Best Match
From the results:
- Prioritize exact name matches
- Consider trust score (7-10 is authoritative)
- Check code snippet count for documentation coverage

### Step 3: Fetch Relevant Documentation
Call `get-library-docs` with:
- The resolved library ID
- A specific topic if the query is focused
- Appropriate token limit based on complexity

### Step 4: Apply Documentation
Use the fetched documentation to:
- Provide accurate code examples
- Explain current API usage
- Implement features correctly

## Example Usage

**User asks**: "How do I set up authentication in Next.js 14?"

```
1. resolve-library-id(libraryName: "next.js")
   → Returns: /vercel/next.js

2. get-library-docs(
     context7CompatibleLibraryID: "/vercel/next.js",
     topic: "authentication",
     tokens: 8000
   )
   → Returns current auth documentation

3. Use documentation to provide accurate guidance
```

## Best Practices

1. **Always resolve first**: Don't guess library IDs, use resolve-library-id
2. **Be specific with topics**: Narrow topics get more relevant results
3. **Adjust token limits**: Use higher limits for complex topics
4. **Verify versions**: Check if documentation is version-specific
5. **Combine with code search**: Use alongside codebase exploration

## Common Libraries

Frequently requested libraries:
- `/vercel/next.js` - Next.js framework
- `/facebook/react` - React library
- `/prisma/prisma` - Prisma ORM
- `/tailwindlabs/tailwindcss` - Tailwind CSS
- `/tanstack/query` - TanStack Query (React Query)
- `/trpc/trpc` - tRPC
- `/shadcn-ui/ui` - shadcn/ui components

## Integration Notes

This skill relies on the Context7 MCP server being configured. Ensure `context7-mcp` is listed in your MCP servers configuration.
