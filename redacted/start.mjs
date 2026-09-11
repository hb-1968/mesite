// dev server -- run with `node start.mjs`. uses vite's programmatic
// api so there's no npm-script indirection. defaults to port 5173;
// pass PORT=xxxx to override.
import { createServer } from 'vite';

const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? 'localhost';

const server = await createServer({
  configFile: './vite.config.ts',
  root: '.',
  server: { port, host, strictPort: false }
});

await server.listen();
server.printUrls();
