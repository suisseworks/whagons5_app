import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');
const outputDir = path.join(appRoot, 'assets', 'play-store');
const sourceIcon = path.join(appRoot, 'assets', 'icon.png');
const titleSource = path.join(repoRoot, 'src', 'assets', 'WhagonsTitle.svg');
const outputIcon = path.join(outputDir, 'icon.png');
const outputFeatureGraphic = path.join(outputDir, 'feature-graphic.png');

const titleColor = process.env.PLAY_LISTING_TITLE_COLOR ?? '#d12434';
const backgroundColor = process.env.PLAY_LISTING_BACKGROUND_COLOR ?? '#151716';

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
  }
}

function findImageMagick() {
  if (process.env.IMAGEMAGICK) {
    return process.env.IMAGEMAGICK;
  }

  for (const command of ['magick', 'convert']) {
    const result = spawnSync('sh', ['-lc', `command -v ${command}`], {
      encoding: 'utf8',
    });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }

  throw new Error('ImageMagick magick or convert is required.');
}

function makeTitleSvg() {
  return readFileSync(titleSource, 'utf8')
    .replaceAll('#D32F55', titleColor)
    .replaceAll('#d32f55', titleColor);
}

const imageMagick = findImageMagick();
const tempDir = mkdtempSync(path.join(tmpdir(), 'whagons-play-listing-'));

try {
  const titleSvg = path.join(tempDir, 'whagons-title.svg');
  const titlePng = path.join(tempDir, 'whagons-title.png');
  writeFileSync(titleSvg, makeTitleSvg());

  run(imageMagick, [sourceIcon, '-resize', '512x512', outputIcon]);
  run(imageMagick, [
    '-density',
    '1200',
    '-background',
    'none',
    titleSvg,
    '-resize',
    '760x164',
    `png32:${titlePng}`,
  ]);
  run(imageMagick, [
    '-size',
    '1024x500',
    `xc:${backgroundColor}`,
    '(',
    titlePng,
    ')',
    '-gravity',
    'center',
    '-composite',
    outputFeatureGraphic,
  ]);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log('Generated assets/play-store/icon.png and assets/play-store/feature-graphic.png');
