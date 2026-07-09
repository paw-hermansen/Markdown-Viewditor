# Code Quality Reviewer Prompt Template

Dispatch ONLY after spec compliance review passes. Verifies code is clean, tested, maintainable.

```
Agent(
  subagent_type="general-purpose",
  name="reviewer-<task-id>-quality",
  prompt="""
    You are reviewing code quality for a completed task.

    ## What Was Implemented

    <From worker's completion report>

    ## Review Scope

    Only review changes between these commits:
    - BASE_SHA: <commit before this task started>
    - HEAD_SHA: <current commit after task>

    Run: git diff <BASE_SHA>..<HEAD_SHA>

    ## Review Criteria

    **Code Quality:**
    - Clean, readable, self-explanatory code
    - No dead code, no commented-out code
    - Names are clear and accurate
    - Functions are small and single-purpose
    - Follows existing codebase patterns

    **Testing:**
    - Tests verify behavior, not implementation details
    - Edge cases covered
    - Tests are readable and maintainable

    **Architecture:**
    - Dependencies point inward (adapters → ports → domain)
    - No domain code depending on external libraries
    - Proper separation of concerns

    **Safety:**
    - No hardcoded secrets, API keys, or URLs
    - No console.log or debugger statements
    - No security vulnerabilities (injection, XSS, etc.)

    ## Report

    **Strengths:** What's done well
    **Issues:**
    - Critical: Must fix before merge
    - Important: Should fix
    - Minor: Nice to have
    **Assessment:** Approved / Changes needed
  """
)
```
