import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { createOpenAI } from '@ai-sdk/openai';
import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import { z } from 'zod';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'moonshotai/kimi-k2.5';
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const DIFF_CHUNK_SIZE = 45_000;
const DEFAULT_TRANSLATOR_BIN = '/home/gabriel/go/bin/bulktranslatorgo';

function git(args: string[]) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  }).trimEnd();
}

function gitAllowFailure(args: string[]) {
  try {
    return git(args);
  } catch (error) {
    const stdout = (error as { stdout?: Buffer | string }).stdout;

    if (typeof stdout === 'string') return stdout.trimEnd();
    if (stdout) return stdout.toString('utf8').trimEnd();

    throw error;
  }
}

function stripCodeFence(text: string) {
  return text.trim().replace(/^```(?:markdown)?\s*/i, '').replace(/```$/i, '').trim();
}

function chunkText(text: string, chunkSize: number) {
  const chunks: string[] = [];

  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }

  return chunks;
}

function countCommits(range: string) {
  return Number(git(['rev-list', '--count', range]) || '0');
}

function listUntrackedFiles() {
  return git(['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
}

function diffUntrackedFiles(files: string[]) {
  return files
    .map((file) => gitAllowFailure(['diff', '--no-index', '--', '/dev/null', file]))
    .filter(Boolean)
    .join('\n\n');
}

function translateReleaseNotes(markdown: string, language: string, translatorBin: string) {
  if (!existsSync(translatorBin)) {
    throw new Error(`Release-note translator not found: ${translatorBin}`);
  }

  return execFileSync(translatorBin, ['-from', 'en', '-to', language], {
    input: markdown,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}

async function main() {
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY is required to generate release notes.');
}

const version = process.env.RELEASE_VERSION || process.env.VERSION || 'unknown';
const previousTag = process.env.PREVIOUS_TAG || '';
const releaseName = process.env.RELEASE_NAME || version;
const outputFile = process.env.RELEASE_NOTES_FILE || '.release-notes.md';
const bundledReleaseNotesFile = process.env.BUNDLED_RELEASE_NOTES_FILE || 'src/config/releaseNotes.ts';
const buildNumber = process.env.RELEASE_BUILD_NUMBER ? Number(process.env.RELEASE_BUILD_NUMBER) : undefined;
const gitHash = process.env.RELEASE_GIT_HASH || undefined;
const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
const translatorBin = process.env.BULK_TRANSLATOR_BIN || DEFAULT_TRANSLATOR_BIN;
const translationLanguages = (process.env.RELEASE_NOTE_TRANSLATION_LANGUAGES || 'es')
  .split(',')
  .map((language) => language.trim())
  .filter(Boolean);

const logRange = previousTag ? `${previousTag}..HEAD` : 'HEAD';
const diffArgs = [previousTag || EMPTY_TREE];
const rangeLabel = previousTag ? `${previousTag}..working-tree` : `${EMPTY_TREE}..working-tree`;

const commits =
  git([
    'log',
    '--date=short',
    '--pretty=format:commit %H%nshort: %h%ndate: %ad%nauthor: %an%nsubject: %s%nbody:%n%b%n---END COMMIT---',
    logRange,
  ]) || 'No committed changes found.';
const untrackedFiles = listUntrackedFiles();
const trackedChangedFiles = git(['diff', '--name-status', '--find-renames', '--find-copies', ...diffArgs]);
const untrackedChangedFiles = untrackedFiles.map((file) => `A\t${file}`).join('\n');
const changedFiles = [trackedChangedFiles, untrackedChangedFiles].filter(Boolean).join('\n') || 'No file changes found.';
const trackedDiffStat = git(['diff', '--stat', '--find-renames', '--find-copies', ...diffArgs]);
const diffStat = [trackedDiffStat, untrackedFiles.length ? `Untracked files: ${untrackedFiles.length}` : ''].filter(Boolean).join('\n') || 'No diff stat found.';
const trackedFullDiff = git(['diff', '--find-renames', '--find-copies', '--minimal', ...diffArgs]);
const untrackedFullDiff = diffUntrackedFiles(untrackedFiles);
const fullDiff = [trackedFullDiff, untrackedFullDiff].filter(Boolean).join('\n\n');
const diffChunks = chunkText(fullDiff || 'No line-level diff found.', DIFF_CHUNK_SIZE);
const commitCount = countCommits(logRange);

let contextWasRead = false;
const readChunkNumbers = new Set<number>();

const openrouter = createOpenAI({
  baseURL: OPENROUTER_BASE_URL,
  apiKey,
  headers: {
    'HTTP-Referer': 'https://whagons.com',
    'X-Title': 'Whagons Release Notes',
  },
  name: 'openrouter',
});

const tools = {
  getReleaseContext: tool({
    description: 'Read the release metadata, commit history, changed files, diff stat, and the number of full git diff chunks available.',
    inputSchema: z.object({}),
    execute: async () => {
      contextWasRead = true;

      return {
        releaseName,
        version,
        previousTag: previousTag || null,
        range: rangeLabel,
        comparisonMode: 'previous release tag compared to current working tree, including committed, staged, unstaged, and untracked files',
        commitCount,
        commits,
        untrackedFiles,
        changedFiles,
        diffStat,
        diffChunkCount: diffChunks.length,
        requiredNextStep:
          diffChunks.length > 0
            ? `Call readGitDiffChunk for every chunk number from 1 through ${diffChunks.length} before writing final release notes.`
            : 'No diff chunks are available.',
      };
    },
  }),
  readGitDiffChunk: tool({
    description: 'Read one chunk of the full line-level git diff for this release range. Chunks are 1-indexed.',
    inputSchema: z.object({
      chunk: z.number().int().min(1).describe('The 1-indexed diff chunk number to read.'),
    }),
    execute: async ({ chunk }) => {
      if (chunk > diffChunks.length) {
        return {
          error: `Chunk ${chunk} does not exist. There are ${diffChunks.length} chunks.`,
        };
      }

      readChunkNumbers.add(chunk);

      return {
        chunk,
        chunkCount: diffChunks.length,
        range: rangeLabel,
        diff: diffChunks[chunk - 1],
      };
    },
  }),
};

const agent = new ToolLoopAgent({
  id: 'whagons-release-notes',
  model: openrouter.chat(model as never),
  tools,
  temperature: 0.2,
  stopWhen: stepCountIs(Math.max(20, diffChunks.length + 8)),
  instructions: `You are Kimi K2.5 acting as an agentic release-note writer for the Whagons mobile app.

Use the provided git tools. Do not rely on the initial prompt alone.

Requirements:
- First call getReleaseContext.
- Then call readGitDiffChunk for every diff chunk from 1 through the reported diffChunkCount.
- Base the notes on all local release changes since the previous release tag, including committed, staged, unstaged, and untracked files.
- The final release commit has not been created yet, so the working-tree diff is the source of truth for what will ship.
- Do not invent features or mention unsupported changes.
- Write for app users first, then operators/developers where useful.
- Prefer concise, polished GitHub Markdown.
- Do not include raw commit hashes unless they are useful for an ops note.`,
});

const result = await agent.generate({
  prompt: `Create GitHub release notes for Whagons mobile app release ${releaseName}.

Required format:
## Summary
- 2 to 4 bullets with user-facing impact

## Changes
- Group notable changes in plain language

## Technical Notes
- Include build/release/ops notes only if supported by the inspected git diff

Before writing the final answer, inspect every git diff chunk with the available tools.`,
});

if (!contextWasRead) {
  throw new Error('Release-note agent did not read the release context.');
}

const missingChunks = diffChunks
  .map((_, index) => index + 1)
  .filter((chunk) => !readChunkNumbers.has(chunk));

if (missingChunks.length > 0) {
  throw new Error(`Release-note agent did not inspect every git diff chunk. Missing: ${missingChunks.join(', ')}`);
}

const content = result.text;
if (!content || typeof content !== 'string') {
  throw new Error('OpenRouter returned an empty release note response.');
}

const englishBody = stripCodeFence(content);
const bodyByLanguage: Record<string, string> = { en: englishBody };

for (const language of translationLanguages) {
  if (language === 'en') continue;

  console.log(`Translating release notes to ${language} with ${translatorBin}...`);
  bodyByLanguage[language] = translateReleaseNotes(englishBody, language, translatorBin);
}

writeFileSync(outputFile, `${englishBody}\n`, 'utf8');
writeFileSync(
  bundledReleaseNotesFile,
  `// Auto-updated by release scripts. Do not edit manually.\n` +
    `export const BUNDLED_RELEASE_NOTES = ${JSON.stringify(
      {
        version,
        tagName: `v${version}`,
        title: `Release ${releaseName}`,
        body: englishBody,
        bodyByLanguage,
        buildNumber,
        gitHash,
      },
      null,
      2,
    )} as const;\n`,
  'utf8',
);
console.log(`Release notes generated with ${model}: ${outputFile}`);
console.log(`Bundled release notes written: ${bundledReleaseNotesFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
