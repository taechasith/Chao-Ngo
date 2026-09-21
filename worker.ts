import app from "vinext/server/fetch-handler";

import { cleanExpiredResearch } from "./lib/server/research-cleanup";
import { withSecurityHeaders } from "./lib/server/security-headers";

type ApplicationWorker = {
  fetch(request: Request, env: CloudflareEnv, context: ExecutionContext): Promise<Response>;
};

const application = app as ApplicationWorker;

export default {
  async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext) {
    return withSecurityHeaders(await application.fetch(request, env, context), request);
  },
  async scheduled(_controller: ScheduledController, env: CloudflareEnv) {
    await cleanExpiredResearch(env);
  },
};
