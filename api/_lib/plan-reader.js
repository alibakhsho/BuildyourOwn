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
- Count things that get built and priced. Keynotes, general notes, legend entries and abbreviation lists are not items: skip them, and mention in "notes" only the ones that change the price. Group identical items into one row with a count rather than one row each. Keep the schedule to about 60 rows; if a dense sheet has more, keep the costliest items and say what you left out.

Scale:
- In "scaleNote", state any printed scale ratio, whether a scale bar is present, and — most usefully — name the single longest dimension on the sheet that the builder should calibrate against, with its printed length.

Notes:
- Flag anything unreadable, ambiguous, or likely to change the price: partial plans, missing dimensions, "NOT TO SCALE", revision clouds, split levels, existing-vs-new work.
- Be brief: "notes" under 150 words, "scaleNote" under 60. The builder reads these on site.

Australian conventions: dimensions are millimetres unless stated; areas are square metres.

If the image is not a construction drawing, return empty arrays and say so in "notes".`;

/**
 * Run the plan reader. Caller supplies a constructed Anthropic client so the
 * two host environments can each manage their own client lifecycle.
 */
export async function readPlanWithClaude(client, { image, imageWidth, imageHeight, pxPerMetre, model, pageText }) {
  // A sheet that came from a CAD PDF carries its own text layer: every label
  // and figured dimension exactly as typed, with where it sits. Reading those
  // strings beats squinting at 6pt text in pixels, so the model gets both.
  const textBlock = pageText && String(pageText).trim()
    ? `\n\nThis sheet came from a PDF, and this is its text layer — each line is "x,y text" with x,y the text's position in the SAME image pixel space. These strings are exact: use them for room labels, figured dimensions, tags and the scale, and use their positions to tell which dimension belongs to which room. The drawing itself is still the authority on what is enclosed and where walls run.\n<pdf_text>\n${String(pageText).slice(0, 16000)}\n</pdf_text>`
    : "";
  const context = [
    `The image is ${imageWidth || "an unknown number of"} x ${imageHeight || "unknown"} pixels.`,
    `Return every polygon coordinate in that pixel space.`,
    pxPerMetre
      ? `The estimator has already calibrated this drawing: 1 metre = ${Number(pxPerMetre).toFixed(2)} pixels. Use that to sanity-check any area you report against the printed dimensions, and mention any disagreement in "notes".`
      : `The drawing has not been calibrated yet, so identify the best dimension to calibrate against.`,
  ].join(" ");

  // max_tokens caps thinking + answer together. At Opus 5's default "high"
  // effort a dense US engineered sheet spent all 16k on thinking and ran ~5
  // minutes — past Vercel's 300 s function limit. "medium" reads the same
  // sheets well in a fraction of the time; BYO_PLAN_EFFORT overrides it.
  const effort = ["low", "medium", "high", "xhigh", "max"].includes(process.env.BYO_PLAN_EFFORT) ? process.env.BYO_PLAN_EFFORT : "medium";
  const t0 = Date.now();
  const resp = await client.messages.create({
    model: model || "claude-opus-5",
    max_tokens: 20000,   // also the SDK's ceiling for a non-streamed request
    system: PLAN_SYSTEM,
    output_config: { effort, format: { type: "json_schema", schema: PLAN_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: `${context}${textBlock}\n\nRead this plan and return the takeoff data.` },
        ],
      },
    ],
  });

  // token use and time per read, for tuning effort against the 300 s limit (no content logged)
  console.info(`[plan-reader] ${resp.model} effort=${effort} stop=${resp.stop_reason} in=${resp.usage?.input_tokens} out=${resp.usage?.output_tokens} ${Math.round((Date.now() - t0) / 1000)}s`);

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

/* =========================================================================
   Plan → brief: the "Upload plans" tab on the Describe card.

   A homeowner's plan is rarely a CAD sheet. It is a phone photo of a
   brochure, a builder's sales plan, or a page of a PDF — shot at an angle,
   with glare, sometimes cut off. They don't want a takeoff, they want the
   estimate set up: how many bedrooms, how big each room is, the overall
   footprint, the garage. So this mode asks for exactly that, with no pixel
   polygons (which a skewed photo can't give anyway), and the app maps it
   onto the same house spec the Describe card fills (logic/describe.js →
   houseSpecFromPlan). The owner checks the list before it is applied.
   ========================================================================= */

export const BRIEF_ROOM_TYPES = ["Bedroom", "Bathroom", "Ensuite", "WC", "Kitchen", "Living", "Dining", "Family", "Study", "Media", "Laundry", "Garage", "Alfresco", "Hallway", "Walk-in robe", "Other"];

export const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    isPlan: { type: "boolean", description: "True if the image shows a floor plan of a building." },
    storeys: { type: "number", description: "Number of storeys shown or stated. 0 if unknown." },
    overallWidthM: { type: "number", description: "Overall width of the building across the front in metres, from printed overall dimensions. 0 if not printed." },
    overallLengthM: { type: "number", description: "Overall depth of the building front to back in metres, from printed overall dimensions. 0 if not printed." },
    totalAreaM2: { type: "number", description: "Total floor area if printed (e.g. an area schedule or 'Total 245 m²' / squares × 9.29). 0 if not printed." },
    rooms: {
      type: "array",
      description: "Every room on the plan.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Label as printed, e.g. 'BED 2', 'Master', 'Family'." },
          type: { type: "string", enum: BRIEF_ROOM_TYPES },
          widthM: { type: "number", description: "Room width in metres from the printed dimension (3600 → 3.6). 0 if not printed." },
          lengthM: { type: "number", description: "Room length in metres. 0 if not printed." },
          level: { type: "number", description: "0 = ground floor, 1 = first floor." },
        },
        required: ["name", "type", "widthM", "lengthM", "level"],
        additionalProperties: false,
      },
    },
    windows: { type: "number", description: "Windows you can count on the plan. 0 if they can't be made out." },
    externalDoors: { type: "number", description: "Doors in the outside walls (front door, sliders, laundry door). 0 if unclear." },
    garageSpaces: { type: "number", description: "Car spaces in the garage, 0 if no garage." },
    roof: { type: "string", enum: ["colorbond", "tile", "shingle", "unknown"] },
    cladding: { type: "string", enum: ["brick", "weatherboard", "render", "unknown"] },
    notes: { type: "string", description: "Under 80 words: what was hard to read, what was estimated rather than read, anything cut off." },
  },
  required: ["isPlan", "storeys", "overallWidthM", "overallLengthM", "totalAreaM2", "rooms", "windows", "externalDoors", "garageSpaces", "roof", "cladding", "notes"],
  additionalProperties: false,
};

export const BRIEF_SYSTEM = `You are helping an Australian homeowner set up a building estimate from a picture of a house plan. The picture is often a phone photo of a printed plan or a builder's brochure — taken at an angle, with glare, folds or part of the sheet cut off — or a page from a PDF.

Read what is printed. Do not invent a typical house.

- List every room with its printed label. Choose its type from the list; a master bedroom is "Bedroom", a powder room or toilet is "WC", a "meals" or "kitchen/meals" area is "Kitchen" (with "Dining" for a separate dining room), "rumpus"/"games"/"retreat" is "Family", "theatre" is "Media", "porch"/"patio"/"alfresco"/"verandah" is "Alfresco".
- Room sizes: Australian plans print them in millimetres (3600 x 4200) or as metres (3.6 x 4.2); convert to metres. Brochures sometimes print feet-and-inches; convert. If a room has no printed size, give 0 — never measure a skewed photo.
- Overall dimensions: use the printed overall (outermost) dimension strings. If none are printed, give 0.
- Total area: only if printed. Brochures often give it in "squares" — 1 square = 9.29 m².
- Count windows and external doors only where you can actually see them; 0 means "couldn't tell", which is better than a guess.
- Roof and cladding: only if a note or elevation on the sheet says so; otherwise "unknown".
- If the picture is not a floor plan, set isPlan false, return no rooms, and say what it is in notes.`;

export async function readBriefWithClaude(client, { image, model, pageText }) {
  const textBlock = pageText && String(pageText).trim()
    ? `\n\nThe page's PDF text layer, exact as typed (each line "x,y text"):\n<pdf_text>\n${String(pageText).slice(0, 12000)}\n</pdf_text>`
    : "";
  const effort = ["low", "medium", "high"].includes(process.env.BYO_BRIEF_EFFORT) ? process.env.BYO_BRIEF_EFFORT : "medium";
  const t0 = Date.now();
  const resp = await client.messages.create({
    model: model || "claude-opus-5",
    max_tokens: 12000,
    system: BRIEF_SYSTEM,
    output_config: { effort, format: { type: "json_schema", schema: BRIEF_SCHEMA } },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
        { type: "text", text: `Read this house plan and return the rooms and overall sizes.${textBlock}` },
      ],
    }],
  });
  console.info(`[plan-brief] ${resp.model} effort=${effort} stop=${resp.stop_reason} in=${resp.usage?.input_tokens} out=${resp.usage?.output_tokens} ${Math.round((Date.now() - t0) / 1000)}s`);
  if (resp.stop_reason === "refusal") {
    throw Object.assign(new Error("The model declined to read this image. If it is a house plan, try a straighter, closer photo."), { status: 422 });
  }
  if (resp.stop_reason === "max_tokens") {
    throw Object.assign(new Error("That plan was too much to read in one go. Photograph one floor at a time."), { status: 413 });
  }
  const text = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  try { return JSON.parse(text); } catch {
    throw Object.assign(new Error("The plan reader returned malformed data."), { status: 502 });
  }
}
