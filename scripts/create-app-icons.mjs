import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = PNG.sync.read(
  await readFile(resolve(root, 'public/assets/items/CRAFTING_TABLE.png')),
);
for (const size of [192, 512]) {
  const image = new PNG({ width: size, height: size });
  const edge = Math.round(size * 0.16);
  const width = size - edge * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const target = (y * size + x) * 4;
      image.data.set([32, 39, 37, 255], target);
      if (x < edge || y < edge || x >= size - edge || y >= size - edge) continue;
      const sx = Math.floor(((x - edge) * source.width) / width);
      const sy = Math.floor(((y - edge) * source.height) / width);
      const index = (sy * source.width + sx) * 4;
      const alpha = source.data[index + 3] / 255;
      for (let c = 0; c < 3; c++)
        image.data[target + c] = Math.round(
          source.data[index + c] * alpha + image.data[target + c] * (1 - alpha),
        );
    }
  }
  await writeFile(resolve(root, `public/assets/app-icon-${size}.png`), PNG.sync.write(image));
}
