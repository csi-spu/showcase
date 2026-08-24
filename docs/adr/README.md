# Architecture decision records

ADRs record decisions that constrain multiple applications, infrastructure, security, or the domain model.

| ADR                                                               | Decision                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| [0001](0001-route-data-and-authentication-through-core.md)        | Route domain data and authentication through Core       |
| [0002](0002-promote-immutable-container-images.md)                | Promote immutable container images through environments |
| [0003](0003-bind-authentication-sessions-to-a-surface.md)         | Bind authentication sessions to one browser surface     |
| [0004](0004-store-sanitized-image-masters-and-variants.md)        | Store sanitized image masters and generated variants    |
| [0005](0005-dispatch-derived-effects-through-a-durable-outbox.md) | Dispatch derived effects through a durable outbox       |

Write one decision per file. State the chosen boundary, rejected alternative, primary reason, and accepted cost. Do not use ADRs as implementation logs.
