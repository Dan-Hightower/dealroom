---
name: Sync captures nothing or the wrong thing
about: X changed its markup, or the parser mis-read a chat
labels: parser
---

## What happened

<!-- e.g. "Sync said 0 messages", "every message attributed to one person",
     "replies appear twice" -->

## Diagnostic

Open the chat on x.com, open the console, and paste the output of:

```js
const SC = document.querySelector('[data-testid="dm-message-scroller"]');
console.log(JSON.stringify({
  scroller: !!SC,
  bubbles: document.querySelectorAll('[data-testid^="message-text-"]').length,
  articles: document.querySelectorAll('[role="article"]').length,
  gridAreas: SC ? [...new Set([...SC.querySelectorAll('[style*="grid-area"]')]
    .map(e => e.style.gridArea))] : [],
  sample: (SC?.innerText || '').slice(0, 200).replace(/\S/g, 'x')
}, null, 2));
```

Message text is redacted to `x`s. If you paste anything else from the page,
redact it yourself first — these are private conversations.

## Version

- Extension built from commit:
- Chrome version:
