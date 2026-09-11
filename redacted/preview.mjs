// preview the built dist/ -- run with `node preview.mjs` after a
// `node build.mjs`. defaults to port 4173.
import { preview } from 'vite';

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? 'localhost';

const server = await preview({
  configFile: './vite.config.ts',
  root: '.',
  preview: { port, host, strictPort: false }
});

server.printUrls();
