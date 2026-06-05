import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, join } from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'moonshotai/kimi-k2.5';
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const DIFF_CHUNK_SIZE = 45_000;
const DEFAULT_TRANSLATOR_BIN = 'bulktranslatorgo';
const DEFAULT_ANALYSIS_CONCURRENCY = 4;
const DEFAULT_AI_TIMEOUT_MS = 120_000;
const DEFAULT_AI_RETRIES = 2;

type DiffFile = {
  path: string;
  diff: string;
};

type AnalysisJob = {
  id: string;
  label: string;
  chunk: number;
  chunkCount: number;
  files: string[];
  diff: string;
};

type GroupNote = {
  label: string;
  chunk: number;
  chunkCount: number;
  files: string[];
  notes: string;
};

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

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

  return Math.floor(parsed);
}

function formatProgressBar(completed: number, total: number, width = 24) {
  if (total <= 0) return `[${'-'.repeat(width)}]`;

  const filled = Math.min(width, Math.round((completed / total) * width));
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

function logProgress(label: string, completed: number, total: number, detail?: string) {
  const suffix = detail ? ` ${detail}` : '';
  console.log(`${label} ${formatProgressBar(completed, total)} ${completed}/${total}${suffix}`);
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

function parseDiffFiles(diff: string): DiffFile[] {
  const sections = diff.split(/\n(?=diff --git )/g).map((section) => section.trim()).filter(Boolean);

  return sections.map((section, index) => {
    const header = section.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    const path = header?.[2] ?? header?.[1] ?? `unknown-${index + 1}`;

    return { path, diff: section };
  });
}

function isExcludedFromAiAnalysis(filePath: string) {
  if (filePath === 'package-lock.json') return true;
  if (filePath === 'src/config/releaseNotes.ts') return true;
  if (filePath === 'src/config/version.ts') return true;
  if (filePath.startsWith('android/app/build/')) return true;
  if (filePath.startsWith('android/.gradle/')) return true;
  if (filePath.startsWith('android/app/.cxx/')) return true;
  if (/\.(aab|apk|bin|gif|ico|jpe?g|png|webp|zip)$/i.test(filePath)) return true;

  return false;
}

function groupLabelForPath(filePath: string) {
  if (filePath === 'makefile' || filePath.startsWith('scripts/')) return 'scripts/makefile/release';
  if (filePath.startsWith('src/screens/')) return 'src/screens';
  if (filePath.startsWith('src/components/')) return 'src/components';
  if (filePath.startsWith('src/context/')) return 'src/context';
  if (filePath.startsWith('src/firebase/')) return 'src/firebase';
  if (filePath.startsWith('src/services/')) return 'src/services';
  if (filePath.startsWith('src/locales/')) return 'locales/config';
  if (filePath.startsWith('src/config/') || filePath === 'app.json' || filePath === 'package.json') return 'locales/config';
  if (filePath.startsWith('src/navigation/')) return 'src/navigation';
  if (filePath.startsWith('src/hooks/')) return 'src/hooks';
  if (filePath.startsWith('src/utils/')) return 'src/utils';
  if (filePath.startsWith('src/models/')) return 'src/models';
  if (filePath.startsWith('tests/')) return 'tests';

  const [first, second] = filePath.split('/');
  return second ? `${first}/${second}` : first;
}

function buildAnalysisJobs(diffFiles: DiffFile[]) {
  const grouped = new Map<string, DiffFile[]>();

  for (const diffFile of diffFiles) {
    const label = groupLabelForPath(diffFile.path);
    const files = grouped.get(label) ?? [];
    files.push(diffFile);
    grouped.set(label, files);
  }

  const jobs: AnalysisJob[] = [];

  for (const [label, files] of grouped) {
    const chunks: DiffFile[][] = [];
    let currentChunk: DiffFile[] = [];
    let currentSize = 0;

    for (const file of files) {
      const nextSize = currentSize + file.diff.length;
      if (currentChunk.length > 0 && nextSize > DIFF_CHUNK_SIZE) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentSize = 0;
      }

      currentChunk.push(file);
      currentSize += file.diff.length;
    }

    if (currentChunk.length > 0) chunks.push(currentChunk);

    chunks.forEach((chunkFiles, index) => {
      jobs.push({
        id: `${label}#${index + 1}`,
        label,
        chunk: index + 1,
        chunkCount: chunks.length,
        files: chunkFiles.map((file) => file.path),
        diff: chunkFiles.map((file) => file.diff).join('\n\n'),
      });
    });
  }

  return jobs;
}

async function runWithTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function retry<T>(label: string, attempts: number, operation: (attempt: number) => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (attempt > 1) console.log(`Retrying ${label} (${attempt}/${attempts})...`);
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${label} failed (${attempt}/${attempts}): ${message}`);
    }
  }

  throw new Error(`${label} failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));

  return results;
}

function goEnv(name: string) {
  try {
    return execFileSync('go', ['env', name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function resolveTranslatorBin(configuredBin: string) {
  const goBin = goEnv('GOBIN');
  const goPath = goEnv('GOPATH');
  const commandName = basename(configuredBin);
  const candidates = [
    configuredBin,
    ...((process.env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, commandName))),
    process.env.GOBIN ? join(process.env.GOBIN, commandName) : '',
    process.env.GOPATH ? join(process.env.GOPATH, 'bin', commandName) : '',
    goBin ? join(goBin, commandName) : '',
    goPath ? join(goPath, 'bin', commandName) : '',
    join(homedir(), 'go', 'bin', commandName),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `Release-note translator not found. Set BULK_TRANSLATOR_BIN to the bulktranslatorgo binary path, or add it to PATH. Tried: ${candidates.join(', ')}`,
  );
}

function translateReleaseNotes(markdown: string, language: string, translatorBin: string) {
  const resolvedTranslatorBin = resolveTranslatorBin(translatorBin);

  return execFileSync(resolvedTranslatorBin, ['-from', 'en', '-to', language], {
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
const analysisConcurrency = parsePositiveInteger(process.env.RELEASE_NOTES_ANALYSIS_CONCURRENCY, DEFAULT_ANALYSIS_CONCURRENCY);
const aiTimeoutMs = parsePositiveInteger(process.env.RELEASE_NOTES_AI_TIMEOUT_MS, DEFAULT_AI_TIMEOUT_MS);
const aiRetries = parsePositiveInteger(process.env.RELEASE_NOTES_AI_RETRIES, DEFAULT_AI_RETRIES);
const translationLanguages = (process.env.RELEASE_NOTE_TRANSLATION_LANGUAGES || 'es')
  .split(',')
  .map((language) => language.trim())
  .filter(Boolean);

console.log(`Release-note generation started with ${model}`);
logProgress('Release-note setup', 0, 5, 'reading git metadata');

const logRange = previousTag ? `${previousTag}..HEAD` : 'HEAD';
const diffArgs = [previousTag || EMPTY_TREE];
const rangeLabel = previousTag ? `${previousTag}..working-tree` : `${EMPTY_TREE}..working-tree`;

logProgress('Release-note setup', 1, 5, `range ${rangeLabel}`);
const commits =
  git([
    'log',
    '--date=short',
    '--pretty=format:commit %H%nshort: %h%ndate: %ad%nauthor: %an%nsubject: %s%nbody:%n%b%n---END COMMIT---',
    logRange,
  ]) || 'No committed changes found.';
logProgress('Release-note setup', 2, 5, 'commit history collected');
const untrackedFiles = listUntrackedFiles();
const trackedChangedFiles = git(['diff', '--name-status', '--find-renames', '--find-copies', ...diffArgs]);
const untrackedChangedFiles = untrackedFiles.map((file) => `A\t${file}`).join('\n');
const changedFiles = [trackedChangedFiles, untrackedChangedFiles].filter(Boolean).join('\n') || 'No file changes found.';
const trackedDiffStat = git(['diff', '--stat', '--find-renames', '--find-copies', ...diffArgs]);
const diffStat = [trackedDiffStat, untrackedFiles.length ? `Untracked files: ${untrackedFiles.length}` : ''].filter(Boolean).join('\n') || 'No diff stat found.';
logProgress('Release-note setup', 3, 5, 'file list and diff stat collected');
const trackedFullDiff = git(['diff', '--find-renames', '--find-copies', '--minimal', ...diffArgs]);
const untrackedFullDiff = diffUntrackedFiles(untrackedFiles);
const fullDiff = [trackedFullDiff, untrackedFullDiff].filter(Boolean).join('\n\n');
logProgress('Release-note setup', 4, 5, 'full diff collected');
const commitCount = countCommits(logRange);
const diffFiles = parseDiffFiles(fullDiff);
const includedDiffFiles = diffFiles.filter((file) => !isExcludedFromAiAnalysis(file.path));
const excludedDiffFiles = diffFiles.filter((file) => isExcludedFromAiAnalysis(file.path));
const analysisJobs = buildAnalysisJobs(includedDiffFiles);
const excludedSummary =
  excludedDiffFiles.length > 0
    ? excludedDiffFiles.map((file) => `- ${file.path}`).join('\n')
    : 'No noisy/generated files were excluded from AI diff analysis.';
logProgress('Release-note setup', 5, 5, 'analysis groups prepared');

const openrouter = createOpenAI({
  baseURL: OPENROUTER_BASE_URL,
  apiKey,
  headers: {
    'HTTP-Referer': 'https://whagons.com',
    'X-Title': 'Whagons Release Notes',
  },
  name: 'openrouter',
});

console.log(
  `Release-note analysis: ${includedDiffFiles.length} files, ${excludedDiffFiles.length} excluded, ${analysisJobs.length} jobs, concurrency ${analysisConcurrency}, timeout ${aiTimeoutMs}ms, retries ${aiRetries}`,
);

let completedAnalysisJobs = 0;
const activeAnalysisJobs = new Set<string>();
const analysisHeartbeat =
  analysisJobs.length > 0
    ? setInterval(() => {
        const active = Array.from(activeAnalysisJobs).join(', ') || 'waiting for next job';
        logProgress('Release-note analysis', completedAnalysisJobs, analysisJobs.length, `active: ${active}`);
      }, 10_000)
    : undefined;

logProgress('Release-note analysis', 0, analysisJobs.length, 'starting grouped AI analysis');

let groupNotes: GroupNote[];
try {
  groupNotes = analysisJobs.length > 0
    ? await mapWithConcurrency(analysisJobs, analysisConcurrency, async (job, index): Promise<GroupNote> => {
      const jobLabel = `${job.label} ${job.chunk}/${job.chunkCount}`;
      activeAnalysisJobs.add(jobLabel);
      console.log(`Analyzing ${jobLabel} (${index + 1}/${analysisJobs.length}, ${job.files.length} files)...`);
      logProgress('Release-note analysis', completedAnalysisJobs, analysisJobs.length, `started ${jobLabel}`);

      const result = await retry(`analysis ${jobLabel}`, aiRetries, () =>
        runWithTimeout(
          (abortSignal) =>
            generateText({
              model: openrouter.chat(model as never),
              temperature: 0.1,
              abortSignal,
              system: `You summarize one grouped git diff for Whagons mobile app release notes.

Rules:
- Extract only release-note-worthy changes supported by this diff.
- Write concise factual notes.
- Separate user-facing impact from technical/release impact where possible.
- Do not invent behavior not present in the diff.
- If the diff is only refactor/noise, say so briefly.`,
              prompt: `Release: ${releaseName}
Range: ${rangeLabel}
Group: ${job.label}
Chunk: ${job.chunk}/${job.chunkCount}
Files:
${job.files.map((file) => `- ${file}`).join('\n')}

Git diff:
${job.diff}

Return Markdown with:
### User-facing
- bullets, or "- No user-facing changes found."

### Technical
- bullets, or "- No technical changes worth release notes."`,
            }),
          aiTimeoutMs,
          `analysis ${jobLabel}`,
        ),
      );

      activeAnalysisJobs.delete(jobLabel);
      completedAnalysisJobs += 1;
      console.log(`Finished ${jobLabel}`);
      logProgress('Release-note analysis', completedAnalysisJobs, analysisJobs.length, `finished ${jobLabel}`);

      return {
        label: job.label,
        chunk: job.chunk,
        chunkCount: job.chunkCount,
        files: job.files,
        notes: stripCodeFence(result.text),
      };
    })
    : [];
} finally {
  if (analysisHeartbeat) clearInterval(analysisHeartbeat);
}

console.log(`Synthesizing final release notes from ${groupNotes.length} analyzed job(s)...`);
logProgress('Release-note synthesis', 0, 1, 'starting final AI call');
const synthesisHeartbeat = setInterval(() => {
  logProgress('Release-note synthesis', 0, 1, 'waiting for OpenRouter response');
}, 10_000);

let result: Awaited<ReturnType<typeof generateText>>;
try {
  result = await retry('final release-note synthesis', aiRetries, () =>
    runWithTimeout(
      (abortSignal) =>
        generateText({
          model: openrouter.chat(model as never),
          temperature: 0.2,
          abortSignal,
          system: `You are Kimi K2.5 writing polished GitHub release notes for the Whagons mobile app.

Use the provided deterministic release context and grouped analysis notes.
Do not invent features.
Write for app users first, then operators/developers where useful.
Prefer concise, polished GitHub Markdown.
Do not include raw commit hashes unless they are useful for an ops note.`,
          prompt: `Create GitHub release notes for Whagons mobile app release ${releaseName}.

Release metadata:
- Version: ${version}
- Previous tag: ${previousTag || 'none'}
- Range: ${rangeLabel}
- Commit count: ${commitCount}
- Build number: ${buildNumber ?? 'unknown'}
- Git hash: ${gitHash ?? 'unknown'}

Commit history:
${commits}

Changed files:
${changedFiles}

Diff stat:
${diffStat}

Files excluded from AI diff analysis as noisy/generated/binary:
${excludedSummary}

Grouped analysis notes:
${groupNotes
  .map(
    (note) => `## ${note.label} (${note.chunk}/${note.chunkCount})
Files:
${note.files.map((file) => `- ${file}`).join('\n')}

${note.notes}`,
  )
  .join('\n\n')}

Required final format:
## Summary
- 2 to 4 bullets with user-facing impact

## Changes
- Group notable changes in plain language

## Technical Notes
- Include build/release/ops notes only if supported by the inspected git diff`,
        }),
      aiTimeoutMs,
      'final release-note synthesis',
    ),
  );
} finally {
  clearInterval(synthesisHeartbeat);
}
logProgress('Release-note synthesis', 1, 1, 'final notes generated');

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
  console.log(`Finished translating release notes to ${language}`);
}

console.log(`Writing release notes to ${outputFile}...`);
writeFileSync(outputFile, `${englishBody}\n`, 'utf8');
console.log(`Writing bundled release notes to ${bundledReleaseNotesFile}...`);
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
