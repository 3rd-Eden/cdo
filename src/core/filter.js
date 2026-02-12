// @ts-check
import path from 'node:path';
import { git } from '../util/git.js';

/**
 * @param {string} root
 */
export async function topAuthorEmail(root) {
  let output = '';
  try {
    output = await git(root, ['shortlog', '-sne', 'HEAD']);
  } catch {
    return null;
  }

  for (const line of output.split('\n')) {
    const match = line.match(/<([^>]+)>/);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

/**
 * @param {string} root
 * @param {string[]} authorEmails
 */
export async function filesTouchedByAuthors(root, authorEmails) {
  /** @type {Set<string>} */
  const files = new Set();

  for (const authorEmail of authorEmails) {
    const pattern = `<${authorEmail}>`;
    let output = '';
    try {
      output = await git(root, [
        'log',
        '--name-only',
        '--pretty=format:',
        '--fixed-strings',
        `--author=${pattern}`
      ]);
    } catch {
      continue;
    }

    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      files.add(trimmed);
    }
  }

  return files;
}

/**
 * @param {{ root: string, trackedFiles: string[], recency: Map<string, number>, authorEmails?: string[], maxFilesPerRepo: number }} input
 */
export async function sampleFiles(input) {
  const { root, trackedFiles, recency, maxFilesPerRepo } = input;
  const authorEmails = (input.authorEmails ?? []).filter(Boolean);

  let chosenEmails = authorEmails;
  if (!chosenEmails.length) {
    const inferred = await topAuthorEmail(root);
    if (inferred) {
      chosenEmails = [inferred];
    }
  }

  let files = trackedFiles;
  if (chosenEmails.length) {
    const authorTouched = await filesTouchedByAuthors(root, chosenEmails);
    files = trackedFiles.filter((file) => authorTouched.has(file));
  }

  files = files
    .map((file) => ({
      file,
      ts: recency.get(file) ?? 0
    }))
    .sort((a, b) => b.ts - a.ts || a.file.localeCompare(b.file))
    .slice(0, maxFilesPerRepo)
    .map((entry) => entry.file);

  return {
    emails: chosenEmails,
    files: files.map((file) => path.join(root, file))
  };
}
