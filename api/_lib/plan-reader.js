/* =========================================================================
   Shared plan-reader logic — used by BOTH the local Express backend
   (server/index.js) and the Vercel serverless route (api/ai/vision.js), so
   the prompt and schema can never drift between dev and production.

   The `_lib` prefix keeps Vercel from treating this file as a route.

   Model: claude-opus-5. Plans are dense line drawings where the win comes
   from careful reading — figured dimensions half-hidden behind leader
   lines, a scale bar in the title block, room labels at 6pt. Opus 5 is the
   high-resolution vision tier (2576 px on the long edge, coordinates map
   1:1 to image pixels), which is exactly what makes the returned polygons
   usable as canvas geometry without a scale factor.
   ========================================================================= */

/** JSON Schema for structured outputs — guarantees parseable, shaped output. */
export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    rooms: {
      type: "array",
      description: "Every enclosed, named space visible on the drawing.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Room label exactly as printed, e.g. 'BED 2', 'Living'." },
          dimensions: { type: "string", description: "Figured dimensions as printed, e.g. '3600 x 4200'. Empty string if not shown." },
          areaM2: { type: "number", description: "Floor area in square metres. 0 if it cannot be determined." },
          ceilingHeight: { type: "number", description: "Ceiling height in metres if noted on the drawing, else 0." },
          polygon: {
            type: "array",
            description:
              "Room outline as [x, y] IMAGE PIXEL coordinates, clockwise, following the inside face of the walls. Empty array if you cannot trace it confidently.",
            items: { type: "array", items: { type: "number" } },
          },
          confidence: { type: "number", description: "0 to 1 — your confidence in this room's outline and dimensions." },
        },
        required: ["name", "dimensions", "areaM2", "ceilingHeight", "polygon", "confidence"],
        additionalProperties: false,
      },
    },
    schedule: {
      type: "array",
      description:
        "Counted items of any kind. On an architectural plan that means doors, windows and fixtures; on a structural or setout plan it means columns, pads, footings, downturns, type tags, grid bubbles and section callouts.",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description:
              "What is being counted, e.g. 'Door', 'Window', 'Column', 'Pad footing', 'Section callout', 'Grid bubble'.",
          },
          code: { type: "string", description: "Type tag or reference as printed — D01, W03, CC.1, SF.6, F.12/S059. Empty string if none." },
          size: { type: "string", description: "Nominal size or note as printed, e.g. '820 x 2040', '1600h'. Empty string if not shown." },
          count: { type: "number", description: "How many of this type appear on the drawing." },
        },
        required: ["type", "code", "size", "count"],
        additionalProperties: false,
      },
    },
    scaleNote: {
      type: "string",
      description:
        "What the drawing says about scale, and the single best dimension to calibrate against — name it and give its printed length.",
    },
    notes: {
      type: "string",
      description: "Anything that would change how these quantities are priced, or that you could not read.",
    },
  },
  required: ["rooms", "schedule", "scaleNote", "notes"],
  additionalProperties: false,
};

export const PLAN_SYSTEM = `You are reading a construction drawing for an Australian residential builder who is about to price the job. You are doing the first pass of a quantity takeoff.

Read what is actually drawn. Do not infer a typical house.

Rooms:
- List every enclosed named space. Use the label exactly as printed on the drawing.
- If figured dimensions are printed, report them verbatim in "dimensions" and compute areaM2 from them. Figured dimensions always beat anything measured off the image.
- Trace "polygon" along the INSIDE face of the walls, clockwise, in image pixel coordinates with (0,0) at the top-left of the image. This is the coordinate space the estimator's canvas measures in, so accuracy here matters more than completeness.
- If you cannot trace a room's outline confidently, return an empty polygon rather than guessing. A missing outline costs the builder thirty seconds; a wrong one costs them the job.
- Set "confidence" honestly. Reserve above 0.8 for rooms whose outline and dimensions you can both read directly.

Schedule — counted items:
- Count every repeated item by type, using the drawing's own tags as the code (D01, W03, CC.1, SF.6, DW.1, F.12/S059).
- On an architectural plan that means doors, windows and fixtures. On a structural, footing or setout plan it means columns, pads, footings, downturns, type tags, grid bubbles and section callouts — count those, do not return an empty schedule because there are no doors.
- Count what you can actually see on the sheet. If a figure is inferred rather than counted — assuming one pad per column, say — give it, but state plainly in "notes" which figures were inferred and why. A builder will price from these numbers, so an inferred count they think was measured is worse than no count at all.

Scale:
- In "scaleNote", state any printed scale ratio, whether a scale bar is present, and — most usefully — name the single longest dimension on the sheet that the builder should calibrate against, with its printed length.

Notes:
- Flag anything unreadable, ambiguous, or likely to change the price: partial plans, missing dimensions, "NOT TO SCALE", revision clouds, split levels, existing-vs-new work.

Australian conventions: dimensions are millimetres unless stated; areas are square metres.

If the image is not a construction drawing, return empty arrays and say so in "notes".`;

/**
 * Run the plan reader. Caller supplies a constructed Anthropic client so the
 * two host environments can each manage their own client lifecycle.
 */
export async function readPlanWithClaude(client, { image, imageWidth, imageHeight, pxPerMetre, model }) {
  const context = [
    `The image is ${imageWidth || "an unknown number of"} x ${imageHeight || "unknown"} pixels.`,
    `Return every polygon coordinate in that pixel space.`,
    pxPerMetre
      ? `The estimator has already calibrated this drawing: 1 metre = ${Number(pxPerMetre).toFixed(2)} pixels. Use that to sanity-check any area you report against the printed dimensions, and mention any disagreement in "notes".`
      : `The drawing has not been calibrated yet, so identify the best dimension to calibrate against.`,
  ].join(" ");

  const resp = await client.messages.create({
    model: model || "claude-opus-5",
    max_tokens: 16000,
    system: PLAN_SYSTEM,
    output_config: { format: { type: "json_schema", schema: PLAN_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: `${context}\n\nRead this plan and return the takeoff data.` },
        ],
      },
    ],
  });

  // Opus 5 runs safety classifiers that can decline a request outright —
  // a 200 with no content. Check before indexing into content.
  if (resp.stop_reason === "refusal") {
    throw Object.assign(new Error("The model declined to read this image. If it is a genuine construction plan, try a cropped or clearer version."), { status: 422 });
  }
  if (resp.stop_reason === "max_tokens") {
    throw Object.assign(new Error("The plan was too complex to read in one pass. Crop to one area of the drawing and try again."), { status: 413 });
  }

  const text = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!text) throw Object.assign(new Error("The plan reader returned an empty response."), { status: 502 });

  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("The plan reader returned malformed data."), { status: 502 });
  }
}

/** Shared error mapping so both hosts report failures identically. */
export function planReaderError(e) {
  const status = e?.status || 500;
  if (status === 401) return { status, error: "The server's API key was rejected (401). Check your ANTHROPIC_API_KEY." };
  if (status === 429) return { status, error: "Rate limited (429) — wait a few seconds and try again." };
  if (status === 413) return { status, error: e.message || "That image is too large. Crop it and try again." };
  return { status, error: e?.message || "The plan reader failed." };
}
