# Mocking rules

Prefer real owned code and replace only a true external seam.

Use, in order:

1. Pure production implementation with deterministic inputs.
2. In-memory adapter satisfying an existing repository/provider interface.
3. Local integration service or disposable database.
4. Narrow fake server for a third-party HTTP contract.
5. Mock function only when the call itself is the public contract.

Good replacement targets include R2, email delivery, clocks, random ID sources, and third-party video metadata. Do not mock Nest application services inside controller tests merely to assert delegation unless the controller translation is the behavior under test.

Avoid:

- mocking private methods or module internals;
- asserting every collaborator call;
- duplicating production branching inside a fake;
- permissive mocks that accept impossible requests;
- network access in unit tests;
- fixtures containing real Student IDs, credentials, or roster data.

A fake must model contract-relevant failures such as timeout, duplicate request, authorization denial, and provider rejection when those states are part of the requirement.
