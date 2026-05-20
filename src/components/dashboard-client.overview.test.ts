import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/components/dashboard-client.tsx"), "utf8");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(!source.includes("./ai-panel"), "Overview must not import AiPanel; AI assistant lives on the AI page.");
assert(!source.includes("./projection-card"), "Overview must not import ProjectionCard; AI projection lives on the AI page.");
assert(!source.includes("<AiPanel"), "Overview must not render AiPanel.");
assert(!source.includes("<ProjectionCard"), "Overview must not render ProjectionCard.");

console.log("dashboard overview excludes AI assistant/projection cards");
