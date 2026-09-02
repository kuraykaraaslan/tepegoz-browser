// Fails the build if any relative markdown link under `phases/**` points at a file that does not
// exist. This is the executable form of the S0 exit criterion "zero broken links across phases/"
// (phases/ai-agent/phase-s0-truth-and-repair.md).
//
// Why this exists as a script rather than a one-off grep: S0 closed its link gate with a
// hand-counted "all 839 relative links resolve". That number is not reproducible — the tree measures
// 870 today and no plausible counting rule yields 839 — so a later auditor cannot tell a real
// regression from a different way of counting. The constitution forbids exactly that kind of
// unfalsifiable claim, so the gate is now a command anyone can re-run instead of a number to trust.
//
// Usage: `pnpm docs:links`            (checks phases/**, the S0 gate)
//        `pnpm docs:links docs .`     (pass roots to widen the check)
import fs from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2);
const ROOTS = roots.length > 0 ? roots : ['phases'];

// Skip external, in-page, absolute-POSIX and Windows/UNC targets — only repo-relative paths are ours
// to verify. An absolute or UNC path in a document is a deliberate out-of-repo pointer, not a link we
// can resolve — so it is not a broken link either.
const RELATIVE_LINK = /\]\(\s*(?!https?:|mailto:|tepegoz:|#|\/|\\)([^)\s]+?)(?:\s+"[^"]*")?\s*\)/g;

/** Markdown files under `dir`, recursively. */
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

// Code spans are stripped before matching: `phases/**` carries ~15 intentional recovery commands of
// the form `git show <sha>:phases/ai/<file>` that name deleted historical paths on purpose. Those are
// documentation of where things went, not links, and must never be "fixed".
function stripCode(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

const files = ROOTS.flatMap((root) => {
  const abs = path.resolve(root);
  if (!fs.existsSync(abs)) {
    console.error(`check-doc-links: root not found: ${root}`);
    process.exit(1);
  }
  return walk(abs);
});

let total = 0;
const broken = [];

for (const file of files) {
  const source = stripCode(fs.readFileSync(file, 'utf8'));
  for (const match of source.matchAll(RELATIVE_LINK)) {
    const raw = match[1];
    let target = raw.split('#')[0];
    if (target === '') continue; // pure in-page anchor, e.g. [x](#section)
    try {
      target = decodeURIComponent(target);
    } catch {
      // A malformed percent-escape is not a path we can resolve; check it verbatim.
    }
    total += 1;
    if (!fs.existsSync(path.resolve(path.dirname(file), target))) {
      broken.push(`${path.relative(process.cwd(), file).replace(/\\/g, '/')} -> ${raw}`);
    }
  }
}

console.log(
  `check-doc-links: ${files.length} files, ${total} relative links, ${broken.length} broken`,
);
if (broken.length > 0) {
  for (const entry of broken) console.error(`  BROKEN  ${entry}`);
  process.exit(1);
}
