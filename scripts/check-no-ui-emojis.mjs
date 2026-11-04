import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const sourceDirectory = join(process.cwd(), 'src', 'app');
const emojiPattern = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u;

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else if (entry.isFile() && (path.endsWith('.html') || path.endsWith('.ts'))) files.push(path);
  }
  return files;
}

const violations = [];
for (const file of await collectFiles(sourceDirectory)) {
  if (
    file.endsWith('.spec.ts') ||
    file.includes(`${join('models', '')}`) ||
    file.endsWith('mock-mangas.ts')
  )
    continue;
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (emojiPattern.test(line)) violations.push(`${relative(process.cwd(), file)}:${index + 1}`);
  });
}

if (violations.length) {
  process.stderr.write(`Emojis decorativos encontrados na interface:\n${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Verificação de ícones da interface concluída.\n');
}
