# GitKraken and version history

## Save a checkpoint

1. Save the scene and any open translation tables in Cocos Creator.
2. Open this repository in GitKraken. Review **WIP** and the changed files.
3. Stage the files belonging to the change. Include each asset's `.meta` file.
4. Commit with a useful description, such as `Fix English achievement label spacing`.
5. **Push** to send committed checkpoints to the remote repository.

A commit saves a local checkpoint. Push backs up committed history to the configured remote. Unsaved editor changes and uncommitted files are not sent by Push. Git does not automatically save the project.

Keep `assets`, `settings`, `packages`, `tools`, project configuration, documentation, and their asset metadata in Git. The `.gitignore` excludes `library`, `temp`, `local`, build output, dependencies, and credentials. Creator regenerates its caches after cloning. Local drafts, screenshots, and recovery backups under `local` remain on the computer where they were created.

## Work on a second computer

1. On the first computer, save in Creator, **Commit**, then **Push**.
2. Install GitKraken and **Cocos Creator 2.4.13** on the second computer.
3. Sign in to the Git hosting account that owns the private remote repository.
4. In GitKraken, choose **Clone**, paste the remote URL, and select a local folder.
5. Open that folder in Creator and allow assets to import.
6. Before starting each work session, use **Pull** in GitKraken. After finishing, save, commit, and push.

Use one computer at a time for changes on `main`. If both computers have independent commits, review and resolve conflicts before pushing; do not force-push over the other computer's work. Close Creator or ensure its editors are saved before pulling changes that affect open assets.

The localization editor extension and its fonts/artwork are part of this repository. Optional Cocos MCP automation also needs a local Python environment and Codex connection on each computer; see the bundled bridge's `SETUP.md` and `server/README.md`. Those per-computer connections are separate from opening and playing the game.

## Recover an older version

- To undo a committed change on shared `main`, select that commit in GitKraken and use **Revert commit**, then review, commit if prompted, and push. This preserves subsequent history.
- To inspect a historical checkpoint, create a new branch from that commit after saving your current work. Open it in Creator and let assets reimport. Return to `main` when finished.
- Avoid **Hard reset**, **Discard all**, **Clean**, or force-push unless you deliberately intend to remove work and already have a backup.

The `checkpoint/git-setup-2026-11-06` tag marks the initial recovery checkpoint. It contains localization work in progress at the time Git was introduced.

## References

- [GitKraken: open, clone, or initialize a repository](https://help.gitkraken.com/gitkraken-desktop/open-clone-init/)
- [Cocos Creator 2.4 project structure](https://docs.cocos.com/creator/2.4/manual/en/getting-started/project-structure.html)
