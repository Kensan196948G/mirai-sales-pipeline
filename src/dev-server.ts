/** ローカル開発サーバー（API のみ。フロントは vite dev が担当） */
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadLocalEnv } from '../scripts/lib-env.ts';

async function main() {
  const env = loadLocalEnv();
  const app = createApp();

  // @hono/node-server の env 注入: DATABASE_URL 等を Bindings として渡す
  serve(
    {
      fetch: (request: Request) => {
        return app.fetch(request, env as never, {} as never);
      },
      port: Number(process.env.PORT ?? 8787),
    },
    (info) => {
      console.log(`API server: http://localhost:${info.port}`);
    },
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
