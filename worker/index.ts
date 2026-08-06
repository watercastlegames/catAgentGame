/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleCompanyCliRequest } from "./company-relay";
import { handleAifImageRequest } from "./aif-image-relay";
import { handlePmWorkerRequest } from "./pm-worker-relay";
import { handleRelayRequest } from "./relay";
import { handlePlayerSyncRequest } from "./player-sync";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  APP_EDITION: "service" | "public";
  COMPANY_CLI_ENDPOINT?: string;
  COMPANY_CLI_API_TOKEN?: string;
  PM_WORKER_CHAT_ENDPOINT?: string;
  PM_WORKER_CHAT_API_KEY?: string;
  AIF_IMAGE_ENDPOINT?: string;
  AIF_IMAGE_API_KEY?: string;
  AIF_IMAGE_PROJECT_ID?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    const playerSyncResponse = await handlePlayerSyncRequest(request, env);
    if (playerSyncResponse) return playerSyncResponse;

    const aifImageResponse = await handleAifImageRequest(request, env);
    if (aifImageResponse) return aifImageResponse;

    const companyCliResponse = await handleCompanyCliRequest(request, env);
    if (companyCliResponse) return companyCliResponse;

    const pmWorkerResponse = await handlePmWorkerRequest(request, env);
    if (pmWorkerResponse) return pmWorkerResponse;

    const relayResponse = await handleRelayRequest(request, env);
    if (relayResponse) return relayResponse;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
