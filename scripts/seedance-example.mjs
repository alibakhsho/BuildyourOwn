#!/usr/bin/env node
/* Seedance 2.5 text-to-video through the official Higgsfield client.
   Billable: one 5 s 720p generation against the API balance.

     npm run hf:seedance

   Server-side only — the client refuses to run in a browser. */
import { config, higgsfield } from "@higgsfield/client/v2";
import { loadHfCredentials } from "./hf-env.mjs";

config({
  credentials: loadHfCredentials(),
  maxPollTime: 15 * 60 * 1000, // video can outlast the client's 5-minute default
});

const MODEL = "bytedance/seedance-2.5/text-to-video";

try {
  console.log(`Submitting ${MODEL}…`);
  const result = await higgsfield.subscribe(MODEL, {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: true,
  });

  const url = result.video?.url;
  if (result.status === "completed" && url) {
    console.log(`Completed (request ${result.request_id})`);
    console.log(`Video URL: ${url}`);
  } else {
    // failed / nsfw (moderated) / canceled, or completed without an output
    const why = { failed: "the generation failed", nsfw: "the request was blocked by moderation", canceled: "the request was canceled" }[result.status]
      || (result.status === "completed" ? "it completed but returned no video URL" : `it ended with status "${result.status}"`);
    console.error(`No video: ${why} (request ${result.request_id}).`);
    process.exitCode = 1;
  }
} catch (err) {
  // AuthenticationError (401), NotEnoughCreditsError (403), ValidationError (422),
  // TimeoutError (polling cap — also how a canceled request surfaces) …
  console.error(`No video: ${err.name || "Error"} — ${err.message}`);
  process.exitCode = 1;
}
