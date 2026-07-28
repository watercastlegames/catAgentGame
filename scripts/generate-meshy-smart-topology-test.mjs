import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const defaultInputPath = path.join(
  projectRoot,
  "assets",
  "meshy-references",
  "cats-soup-v1",
  "low-monitor-raised-four-key-workstation-ref-v2.png",
);
const defaultOutputDirectory = path.join(
  projectRoot,
  "assets",
  "meshy-source",
  "cats-soup-t2-v1",
);
const defaultStem =
  "low-monitor-raised-four-key-workstation-meshy-t2-v1";
const [, , inputArgument, outputDirectoryArgument, stemArgument] = process.argv;
const inputPath = path.resolve(inputArgument ?? defaultInputPath);
const outputDirectory = path.resolve(
  outputDirectoryArgument ?? defaultOutputDirectory,
);
const stem = stemArgument ?? defaultStem;
const apiKey = process.env.MESHY_API_KEY;
const generationProfile =
  process.env.MESHY_GENERATION_PROFILE ?? "smart-topology";

if (!apiKey) {
  throw new Error("MESHY_API_KEY is not available in this process.");
}

const settings =
  generationProfile === "standard-meshy6"
    ? {
        model_type: "standard",
        ai_model: "meshy-6",
        target_polycount: 40000,
        should_texture: true,
        texture_resolution: "4k",
        enable_pbr: false,
        should_remesh: true,
        topology: "triangle",
        save_pre_remeshed_model: true,
        image_enhancement: false,
        remove_lighting: true,
        target_formats: ["glb"],
        alpha_thumbnail: true,
      }
    : {
        model_type: "smart-topology",
        ai_model: "meshy-t2",
        target_polycount: 15000,
        should_texture: true,
        texture_resolution: "4k",
        enable_pbr: false,
        target_formats: ["glb"],
        alpha_thumbnail: true,
      };

if (
  generationProfile !== "smart-topology" &&
  generationProfile !== "standard-meshy6"
) {
  throw new Error(
    `Unsupported MESHY_GENERATION_PROFILE: ${generationProfile}`,
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readJsonResponse(response, operation) {
  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(
      `${operation} returned ${response.status} with non-JSON body: ${body.slice(0, 500)}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `${operation} failed with ${response.status}: ${JSON.stringify(parsed)}`,
    );
  }
  return parsed;
}

async function download(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed with ${response.status}: ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, bytes);
  return bytes.length;
}

await fs.mkdir(outputDirectory, { recursive: true });
const sourceBytes = await fs.readFile(inputPath);
const imageUrl = `data:image/png;base64,${sourceBytes.toString("base64")}`;
const createResponse = await fetch(
  "https://api.meshy.ai/openapi/v1/image-to-3d",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      ...settings,
    }),
  },
);
const createTask = await readJsonResponse(createResponse, "Create task");
const taskId = createTask.result;
if (!taskId) {
  throw new Error(`Meshy did not return a task id: ${JSON.stringify(createTask)}`);
}

console.log(
  JSON.stringify({
    event: "created",
    taskId,
    generationProfile,
    settings,
  }),
);

const startedAt = Date.now();
const maximumWaitMilliseconds = 12 * 60 * 1000;
let task;
while (Date.now() - startedAt < maximumWaitMilliseconds) {
  await sleep(5000);
  const statusResponse = await fetch(
    `https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );
  task = await readJsonResponse(statusResponse, "Retrieve task");
  console.log(
    JSON.stringify({
      event: "progress",
      taskId,
      status: task.status,
      progress: task.progress,
      consumedCredits: task.consumed_credits,
    }),
  );
  if (task.status === "SUCCEEDED") break;
  if (task.status === "FAILED" || task.status === "CANCELED") {
    throw new Error(
      `Meshy task ${task.status}: ${JSON.stringify(task.task_error ?? {})}`,
    );
  }
}

if (task?.status !== "SUCCEEDED") {
  throw new Error(`Meshy task did not finish within 12 minutes: ${taskId}`);
}
if (!task.model_urls?.glb) {
  throw new Error(`Meshy task has no GLB output: ${taskId}`);
}

const modelPath = path.join(outputDirectory, `${stem}.glb`);
const previewPath = path.join(outputDirectory, `${stem}-preview.png`);
const alphaPreviewPath = path.join(
  outputDirectory,
  `${stem}-alpha-preview.png`,
);
const modelBytes = await download(task.model_urls.glb, modelPath);
const previewBytes = task.thumbnail_url
  ? await download(task.thumbnail_url, previewPath)
  : null;
const alphaPreviewBytes = task.alpha_thumbnail_url
  ? await download(task.alpha_thumbnail_url, alphaPreviewPath)
  : null;
const manifestPath = path.join(outputDirectory, `${stem}-task.json`);
const manifest = {
  version: 1,
  generated_at: new Date().toISOString(),
  api_endpoint: "https://api.meshy.ai/openapi/v1/image-to-3d",
  task_id: taskId,
  status: task.status,
  consumed_credits: task.consumed_credits,
  source_image: inputPath,
  source_image_bytes: sourceBytes.length,
  model: modelPath,
  model_bytes: modelBytes,
  preview: previewBytes ? previewPath : null,
  preview_bytes: previewBytes,
  alpha_preview: alphaPreviewBytes ? alphaPreviewPath : null,
  alpha_preview_bytes: alphaPreviewBytes,
  settings,
  generation_profile: generationProfile,
};
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      event: "completed",
      taskId,
      consumedCredits: task.consumed_credits,
      modelPath,
      modelBytes,
      previewPath: previewBytes ? previewPath : null,
      alphaPreviewPath: alphaPreviewBytes ? alphaPreviewPath : null,
      manifestPath,
    },
    null,
    2,
  ),
);
