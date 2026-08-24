# Triage labels

The engineering skills use five canonical triage roles. Their strings map directly to GitHub labels in this repository.

| Canonical role    | GitHub label      | Meaning                                                             |
| ----------------- | ----------------- | ------------------------------------------------------------------- |
| `needs-triage`    | `needs-triage`    | A maintainer must evaluate the issue.                               |
| `needs-info`      | `needs-info`      | Progress is waiting for information from the reporter.              |
| `ready-for-agent` | `ready-for-agent` | The issue is implementation-ready without additional human context. |
| `ready-for-human` | `ready-for-human` | The issue needs human implementation or coordination.               |
| `wontfix`         | `wontfix`         | The issue will not be actioned.                                     |

Apply one workflow role at a time. Product/type labels such as `bug`, `feature`, or `security` are orthogonal and may coexist.
