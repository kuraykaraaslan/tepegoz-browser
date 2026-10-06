/** Inline gear — chat-ui is a string-free leaf with no icon dependency, so the glyph lives here. */
export function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M11.3 1.6a1 1 0 0 0-2.6 0l-.2 1.2a6.6 6.6 0 0 0-1.5.9L5.9 5a1 1 0 0 0-1.3.4L3.3 7.6a1 1 0 0 0 .3 1.3l1 .8a6.7 6.7 0 0 0 0 1.8l-1 .8a1 1 0 0 0-.3 1.3l1.3 2.2A1 1 0 0 0 5.9 18l1.1-.5c.5.4 1 .7 1.5.9l.2 1.2a1 1 0 0 0 2.6 0l.2-1.2c.6-.2 1-.5 1.5-.9l1.1.5a1 1 0 0 0 1.3-.4l1.3-2.2a1 1 0 0 0-.3-1.3l-1-.8a6.7 6.7 0 0 0 0-1.8l1-.8a1 1 0 0 0 .3-1.3l-1.3-2.2A1 1 0 0 0 14.1 5l-1.1.5c-.5-.4-1-.7-1.5-.9l-.2-1.2ZM10 13a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
      />
    </svg>
  );
}

/** A speech bubble with a "+" — the "start something new" affordance next to the gear icon. */
export function NewChatIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M2.5 5.5A2 2 0 0 1 4.5 3.5h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8l-3.2 2.6a.5.5 0 0 1-.8-.4V12.5h-.5a2 2 0 0 1-2-2v-5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 5.7v4M6.5 7.7h4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
