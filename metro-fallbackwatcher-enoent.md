---
name: Metro FallbackWatcher ENOENT fix
description: Replit's workflow-log files race with Metro's FallbackWatcher, causing ENOENT crashes on startup
---

**Rule:** When Metro crashes with `ENOENT: no such file or directory, watch '/home/runner/workspace/.local/state/workflow-logs/...'`, patch `node_modules/metro-file-map/src/watchers/FallbackWatcher.js` to wrap the `fs.watch()` call in a try-catch.

**Why:** Replit creates and deletes workflow-log files in `.local/state/workflow-logs/`. Metro's FallbackWatcher (used when watchman is absent) walks all directories including `.local`, finds a log file, then tries to call `fs.watch()` on it. The file gets deleted between the walk and the watch call. `fs.watch()` throws ENOENT synchronously — outside any error handler — crashing the process.

**How to apply:** In `_watchdir` of `FallbackWatcher.js`, change the `const watcher = fs.watch(...)` call to:
```js
let watcher;
try {
  watcher = _fs.default.watch(dir, {persistent: true}, (event, filename) => this._normalizeChange(dir, event, filename));
} catch (err) {
  if (err.code === 'ENOENT' || err.code === 'EPERM') { return false; }
  throw err;
}
```
Note: Metro's `resolver.blockList` does NOT fix this — it filters the resolver, not the file watcher. The FallbackWatcher's `filterDir` only excludes directories from being entered, not individual files from being watched. The only reliable fix is the try-catch patch above.
