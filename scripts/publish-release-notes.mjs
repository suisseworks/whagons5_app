import { readFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
const secret = process.env.RELEASE_NOTES_SECRET;
const notesFile = process.env.RELEASE_NOTES_FILE;

if (!convexUrl) {
  throw new Error('EXPO_PUBLIC_CONVEX_URL or CONVEX_URL is required to publish release notes.');
}

if (!secret) {
  throw new Error('RELEASE_NOTES_SECRET is required to publish release notes. Set it locally and in the Convex deployment env.');
}

if (!notesFile) {
  throw new Error('RELEASE_NOTES_FILE is required to publish release notes.');
}

const version = process.env.RELEASE_VERSION;
const tagName = process.env.RELEASE_TAG;
const title = process.env.RELEASE_TITLE || tagName || version;

if (!version || !tagName) {
  throw new Error('RELEASE_VERSION and RELEASE_TAG are required to publish release notes.');
}

const client = new ConvexHttpClient(convexUrl);
const body = readFileSync(notesFile, 'utf8').trim();
const buildNumber = process.env.RELEASE_BUILD_NUMBER ? Number(process.env.RELEASE_BUILD_NUMBER) : undefined;

await client.mutation(api.releaseNotes.upsertFromRelease, {
  secret,
  version,
  tagName,
  title,
  body,
  buildNumber: Number.isFinite(buildNumber) ? buildNumber : undefined,
  gitHash: process.env.RELEASE_GIT_HASH || undefined,
  githubUrl: process.env.RELEASE_GITHUB_URL || undefined,
  publishedAt: process.env.RELEASE_PUBLISHED_AT ? Number(process.env.RELEASE_PUBLISHED_AT) : Date.now(),
});

console.log(`Published app release notes for ${tagName} to Convex.`);
