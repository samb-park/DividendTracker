---
name: sequential-thinking
description: Use for complex problems requiring systematic step-by-step reasoning with ability to revise thoughts, branch into alternative approaches, or dynamically adjust scope. Not for simple queries or single-step tasks.
---

# Sequential Thinking

Enable structured problem-solving through iterative reasoning with revision and branching capabilities.

## When to Use

Apply sequential thinking for:
- Problems requiring multiple interconnected reasoning steps
- Uncertain initial scope or approach
- Complex situations needing filtering to identify core issues
- Tasks requiring backtracking or conclusion revision
- Alternative solution path exploration

**Do NOT use for:**
- Simple queries or direct facts
- Single-step tasks
- Straightforward questions with obvious answers

## Key Capabilities

- **Iterative reasoning**: Break complex problems into sequential thought steps
- **Dynamic scope**: Adjust total thought count as understanding evolves
- **Revision tracking**: Reconsider and modify previous conclusions
- **Branch exploration**: Explore alternative reasoning paths
- **Context preservation**: Maintain full reasoning context throughout analysis

## Workflow Pattern

### Step 1: Initialize Reasoning
Start with an initial assessment:
- State the problem clearly
- Estimate how many thought steps might be needed
- Identify key unknowns or decision points

### Step 2: Sequential Processing
For each thought step:
1. Express the current reasoning step clearly
2. Reference previous thoughts when building on them
3. Indicate if more reasoning is needed
4. Adjust total estimate if scope changes

### Step 3: Revision (when needed)
If a previous conclusion needs reconsideration:
- Mark the thought as a revision
- Reference which thought is being reconsidered
- Explain why revision is necessary
- Provide updated reasoning

### Step 4: Branching (when needed)
To explore alternative approaches:
- Branch from a specific thought number
- Give the branch a descriptive identifier
- Explore the alternative path independently
- Compare branch outcomes when complete

## Thought Structure

Each thought should include:

```
Thought [N] of [Total]:
- Current reasoning step
- Key observations or conclusions
- Questions or uncertainties
- Next steps needed (if any)
```

## Example Application

**Problem**: Debugging a complex race condition

```
Thought 1 of 5:
Initial analysis - The bug occurs intermittently, suggesting timing-dependent behavior.
Key observation: Error logs show data corruption in shared state.
Next: Identify all access points to the shared resource.

Thought 2 of 5:
Found 3 locations accessing shared state: ComponentA (read), ComponentB (write), ComponentC (read/write).
Uncertainty: Not clear if locks are properly acquired in ComponentC.
Next: Analyze locking patterns in each component.

Thought 3 of 5 (Revision of Thought 1):
Revising initial assessment - After deeper analysis, this appears to be a deadlock, not a race condition.
Evidence: Thread dumps show circular wait pattern.
Adjusting total to 7 thoughts - need to trace lock acquisition order.
```

## Best Practices

1. **Be explicit about uncertainty**: State what you don't know
2. **Revise freely**: Don't hesitate to reconsider earlier conclusions
3. **Adjust scope dynamically**: Update total thoughts as understanding grows
4. **Use branches for alternatives**: Don't just pick one path when multiple are viable
5. **Summarize at the end**: Provide a final synthesis of the reasoning chain

## Integration with Problem Solving

Sequential thinking works well combined with:
- Root cause analysis
- Architecture decisions
- Code review reasoning
- Debugging complex issues
- Design trade-off evaluation
