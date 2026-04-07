const PipelineService = require("./services/Pipeline");
const ShutterStockService = require("./services/shutterstock");

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--trends-only")) {
    const shutterStockService = new ShutterStockService();
    const trends = await shutterStockService.fetchTrendingTags();
    console.log("Trending tags:", trends);
    return;
  }

  const pipeline = new PipelineService();
  await pipeline.run();
}

main().catch((error) => {
  console.error("Pipeline run failed.", error);
  process.exitCode = 1;
});
