# @tepegoz/process-ui

Presentational `tepegoz://process` surface — a Chrome-style Task Manager listing the browser process
tree (browser / GPU / utility / per-tab renderers) with CPU, memory and PID, plus "end process" for a
tab. The host injects the poll + end-process callbacks; this package owns only UI state, row shaping,
and en/tr strings.
