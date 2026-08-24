# Issue tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues for `csi-spu/showcase`. Run all GitHub operations from the repository through `rtk gh`; never invoke `gh` directly.

## Conventions

- Create: `rtk gh issue create --title "..." --body-file <path>`.
- Read: `rtk gh issue view <number> --comments --json number,title,body,state,labels,comments`.
- List: `rtk gh issue list --state open --json number,title,body,labels` with appropriate label/state filters.
- Comment: `rtk gh issue comment <number> --body-file <path>`.
- Label: `rtk gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: `rtk gh issue close <number> --comment "..."`.

Prefer body files over complex shell quoting. Never include tokens, cookies, credentials, authorization headers, or secret environment values in commands, issue bodies, or logs.

Infer the repository from `git remote -v`; commands run inside this clone target `csi-spu/showcase` automatically.

## Skill language

- "Publish to the issue tracker" means create a GitHub issue.
- "Fetch the relevant ticket" means read the issue including labels and comments.
- External writes require explicit user authorization for that exact change.
