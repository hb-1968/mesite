// production build -- run with `node build.mjs`. emits to dist/.
// set VITE_BASE if the site will live under a subpath.
import { build } from 'vite';

await build({
  configFile: './vite.config.ts',
  root: '.'
});
