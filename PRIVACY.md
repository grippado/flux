# Privacy

Flux is a set of command definitions written in Markdown. It has no server, no
account and no build step. Everything it does happens on your machine, inside the
harness you already run it in.

## What Flux collects

Nothing.

There is no telemetry, no analytics, no crash reporting and no usage tracking, in
the plugin or on the website. No data is sent to the author of this project, and
there is no endpoint that could receive it.

## What Flux reads

Only what the command you invoked needs, on the machine it runs on:

- files in the repository you point it at, and its Git history
- the repository's own instructions (`AGENTS.md`, `CLAUDE.md`, `.claude/`)
- a context manifest (`flux-context.json`), if you created one
- notes in your own vault, when a command persists to one

## What leaves your machine, and when

Flux delegates to tools you have already installed and authenticated. When it does,
it uses your credentials and speaks to the services you already use:

| tool | what it reaches |
|------|-----------------|
| `git`, `gh` | your Git remote, typically GitHub |
| MCP servers you configured | only the services you connected, such as an issue tracker or a chat workspace |
| the model provider of your harness | the conversation itself, under that provider's own terms |

Flux adds nothing to those requests and routes nothing through any service of its
own.

**Nothing is published without you saying so.** Posting to GitHub, creating an
issue in a tracker, sending a message in chat and merging are all gated on your
explicit approval. A command may draft; you decide whether it is sent.

## What Flux writes

- a dedicated Git worktree, when a command produces code
- files in your notes vault, when your manifest declares one
- files where you confirm, when a command scaffolds agents or configuration

It does not write inside a repository you are only reviewing.

## The website

The page at `grippado.github.io/flux` is static and served by GitHub Pages. It
loads one script, from the same origin, and no third-party resource of any kind.

It sets no cookies. It uses `localStorage` for exactly two keys, both of them your
own display preferences:

- `flux-lang`, the language you picked
- `flux-theme`, light or dark

Both stay in your browser. Clearing site data removes them.

GitHub Pages is operated by GitHub and, like any web host, records requests. That
logging is GitHub's, described in the
[GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement).

## Children

Flux is a developer tool and is not directed at children.

## Changes

This document is versioned with the project. Its history is the changelog: see the
file's commits in the repository.

## Contact

Open an issue at [github.com/grippado/flux/issues](https://github.com/grippado/flux/issues).
