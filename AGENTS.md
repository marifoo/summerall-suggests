# Repository guidance

Read [README.md](README.md) for the product behavior, architecture, data sources,
caching rules, deployment, and verification command. Keep it current when behavior
or workflows change.

## Design

- Follow John Ousterhout's deep-module approach: hide substantial implementation
  detail behind small, narrow interfaces.
- Keep the design clean and cohesive. Encapsulate decisions and state so callers
  need little knowledge of implementation details.
- Enable local reasoning: a change should be understandable from the module and
  its explicit contracts, without tracing unrelated code or hidden dependencies.
- Minimize the cognitive effort of future changes. Prefer clear names, explicit
  invariants, and simple control flow over cleverness or unnecessary abstractions.

## Testing and commits

- Every bug fix must follow red-green testing: first add a regression test that
  reproduces the bug and run it to confirm it fails for the expected reason; only
  then implement the fix and run the tests to confirm they pass.
- Run the relevant checks described in README.md before committing.
- Make atomic commits: each commit should contain one coherent, independently
  reviewable change, including its related tests and documentation. Keep unrelated
  edits separate and use commit messages that describe the change.
