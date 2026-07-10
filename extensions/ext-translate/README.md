# Ext-Translate

Local-first full-page and selection translation for browsed web pages.

Default order:

1. Translation memory.
2. Local LLM when an on-device model is installed.
3. User-approved cloud fallback.

The page mode is visible replacement, but the injector keeps the original DOM nodes in place and stores
original values so pages can be restored without Chrome-style destructive DOM replacement.
