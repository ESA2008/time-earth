import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FIRMS_MAP_KEY = process.env.FIRMS_MAP_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing from .env");
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

/* =========================================================
   CONFIG
========================================================= */

const GEMINI_MODEL = "gemini-3.5-flash-lite";

const NASA_POWER_BASE =
  "https://power.larc.nasa.gov/api/temporal";

const NASA_CMR_BASE =
  "https://cmr.earthdata.nasa.gov/search";

const FIRMS_BASE =
  "https://firms.modaps.eosdis.nasa.gov/api/area/csv";

const GEOCODER =
  "https://nominatim.openstreetmap.org/search";

/* =========================================================
   BASIC HELPERS
========================================================= */

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validNumber(value) {
  return typeof value === "number" &&
    Number.isFinite(value);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function parseDateString(value) {
  if (!value) return null;

  const match = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) return null;

  const date = new Date(
    `${match[1]}-${match[2]}-${match[3]}T00:00:00Z`
  );

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

/* =========================================================
   QUESTION ANALYSIS
========================================================= */

/*
  This is the most important change.

  We DO NOT start with the page location.

  We first ask Gemini to determine what the user
  actually requested.
*/

async function analyzeQuestion({
  question,
  conversation,
  pageContext,
}) {
  const today = formatDate(new Date());

  const prompt = `
You are the question parser for TIME EARTH,
a NASA Earth-observation application.

Your job is NOT to answer the user.

Your job is to convert the user's question into
a precise structured data request.

TODAY:
${today}

USER QUESTION:
${question}

PAGE CONTEXT:
${JSON.stringify(pageContext || {}, null, 2)}

CONVERSATION:
${JSON.stringify(conversation || [], null, 2)}

IMPORTANT:

1. Explicit places in the user's question ALWAYS
   override the page location.

2. Explicit years ALWAYS override the page year.

3. If the user says:
   - "this state"
   - "this country"
   - "this location"
   - "here"
   - "selected location"

   resolve that reference using PAGE CONTEXT.

4. If the user says "Canada", "Kenya",
   "Ethiopia", etc., that is an explicit place
   and MUST be independently resolved.

5. If the user says "last 5 months", calculate
   the actual rolling period relative to TODAY.

6. If the user says "annual rainfall in 2019",
   return:
   startDate = 2019-01-01
   endDate = 2019-12-31

7. If the user asks for a comparison, return
   every comparison location separately.

8. Never invent latitude or longitude.
   We will geocode places separately.

9. Identify the requested scientific variable.

Possible intents:

- climate
- weather
- fire
- satellite
- imagery
- vegetation
- land
- atmosphere
- ocean
- scientific
- dataset
- comparison
- general_nasa

Possible metrics include:

- temperature
- maximum_temperature
- minimum_temperature
- rainfall
- precipitation
- humidity
- wind
- solar_radiation
- fires
- fire_detections
- vegetation
- NDVI
- imagery
- air_quality
- pressure
- ocean
- sea_surface_temperature
- unknown

Return ONLY valid JSON.

Schema:

{
  "intent": "climate",
  "metric": "rainfall",
  "locations": [
    {
      "name": "Canada",
      "reference": "explicit"
    }
  ],
  "startDate": "2019-01-01",
  "endDate": "2019-12-31",
  "year": 2019,
  "comparison": false,
  "needsNASAData": true,
  "needsNASAResearch": false,
  "scope": "regional",
  "confidence": 0.95,
  "reason": "short explanation"
}

Rules for dates:

- If no date is specified and the question is
  about historical annual data, use the page year
  only if it is clearly relevant.

- If no date exists at all, set startDate and
  endDate to null.

- For "last N months", use today's date and
  calculate the actual date range.

- For "this year", use January 1 through today.

- For "last year", use the previous calendar year.

Rules for comparison:

"compare Kenya and Ethiopia rainfall in 2019"

must produce:

locations:
[
  { "name": "Kenya", "reference": "explicit" },
  { "name": "Ethiopia", "reference": "explicit" }
]

comparison: true

Do NOT return prose.
`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const raw = response.text || "{}";

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error(
        "NASA question analyzer returned invalid JSON."
      );
    }

    return JSON.parse(match[0]);
  }
}

/* =========================================================
   LOCATION RESOLUTION
========================================================= */

/*
  We deliberately use a real geocoder.

  Gemini identifies "Kenya".

  Gemini does NOT invent Kenya's coordinates.

  Nominatim supplies the coordinates/bounding box.
*/

async function geocodePlace(name) {
  const query = cleanText(name);

  if (!query) {
    throw new Error("Empty location.");
  }

  const url =
    `${GEOCODER}?format=jsonv2` +
    `&q=${encodeURIComponent(query)}` +
    `&limit=1` +
    `&addressdetails=1`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "TIME-EARTH-NASA-Explorer/1.0 contact@example.com",
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Geocoding failed for ${query}: ${response.status}`
    );
  }

  const results = await response.json();

  if (!results.length) {
    throw new Error(
      `Could not resolve location: ${query}`
    );
  }

  const place = results[0];

  const bbox = place.boundingbox || [];

  return {
    requestedName: query,
    displayName: place.display_name,

    latitude: Number(place.lat),
    longitude: Number(place.lon),

    type: place.type || null,

    address: place.address || {},

    boundingBox:
      bbox.length === 4
        ? {
            south: Number(bbox[0]),
            north: Number(bbox[1]),
            west: Number(bbox[2]),
            east: Number(bbox[3]),
          }
        : null,
  };
}

/* =========================================================
   LOCATION HELPERS
========================================================= */

function isCountry(location) {
  const type = location?.type;

  return [
    "country",
  ].includes(type);
}

function getBoundingBox(location) {
  if (location?.boundingBox) {
    return location.boundingBox;
  }

  /*
    Fallback around a point.

    This is intentionally small.
    It is NOT claimed to represent a whole country.
  */

  const lat = location.latitude;
  const lon = location.longitude;

  return {
    south: Math.max(-90, lat - 0.5),
    north: Math.min(90, lat + 0.5),
    west: Math.max(-180, lon - 0.5),
    east: Math.min(180, lon + 0.5),
  };
}

/* =========================================================
   NASA POWER
========================================================= */

const POWER_PARAMETERS = {
  temperature: "T2M",
  maximum_temperature: "T2M_MAX",
  minimum_temperature: "T2M_MIN",
  rainfall: "PRECTOTCORR",
  precipitation: "PRECTOTCORR",
  humidity: "RH2M",
  wind: "WS2M",
  solar_radiation: "ALLSKY_SFC_SW_DWN",
  pressure: "PS",
};

function getPowerParameter(metric) {
  return (
    POWER_PARAMETERS[metric] ||
    POWER_PARAMETERS.temperature
  );
}

async function getPowerPointData({
  latitude,
  longitude,
  startDate,
  endDate,
  metric,
}) {
  const parameter = getPowerParameter(metric);

  const start =
    startDate.replaceAll("-", "");

  const end =
    endDate.replaceAll("-", "");

  const url =
    `${NASA_POWER_BASE}/daily/point` +
    `?parameters=${encodeURIComponent(parameter)}` +
    `&community=AG` +
    `&longitude=${longitude}` +
    `&latitude=${latitude}` +
    `&start=${start}` +
    `&end=${end}` +
    `&format=JSON`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `NASA POWER point request failed: ${response.status}`
    );
  }

  const data = await response.json();

  return {
    source: "NASA POWER",
    mode: "point",
    parameter,
    data,
  };
}

/*
  POWER regional API.

  NASA documents the regional temporal API as
  returning data across a bounding box on the
  POWER grid.

  Regional daily requests are limited to ONE
  parameter, so we request only the needed metric.
*/

async function getPowerRegionalData({
  boundingBox,
  startDate,
  endDate,
  metric,
}) {
  const parameter = getPowerParameter(metric);

  const start =
    startDate.replaceAll("-", "");

  const end =
    endDate.replaceAll("-", "");

  const {
    south,
    north,
    west,
    east,
  } = boundingBox;

  const url =
    `${NASA_POWER_BASE}/daily/regional` +
    `?latitude-min=${south}` +
    `&latitude-max=${north}` +
    `&longitude-min=${west}` +
    `&longitude-max=${east}` +
    `&parameters=${encodeURIComponent(parameter)}` +
    `&community=AG` +
    `&start=${start}` +
    `&end=${end}` +
    `&format=JSON`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `NASA POWER regional request failed: ${response.status}`
    );
  }

  const data = await response.json();

  return {
    source: "NASA POWER",
    mode: "regional",
    parameter,
    data,
    boundingBox,
  };
}

/* =========================================================
   POWER SUMMARIZATION
========================================================= */

function numericValues(object) {
  return Object.values(object || {})
    .filter(
      value =>
        typeof value === "number" &&
        Number.isFinite(value)
    );
}

function average(values) {
  if (!values.length) return null;

  return (
    values.reduce(
      (sum, value) => sum + value,
      0
    ) / values.length
  );
}

function total(values) {
  if (!values.length) return null;

  return values.reduce(
    (sum, value) => sum + value,
    0
  );
}

function summarizePower(data, metric) {
  const parameters =
    data?.properties?.parameter;

  if (!parameters) {
    return null;
  }

  const parameter =
    getPowerParameter(metric);

  const values =
    numericValues(parameters[parameter]);

  if (!values.length) {
    return null;
  }

  const shouldTotal =
    metric === "rainfall" ||
    metric === "precipitation";

  return {
    parameter,
    metric,

    average:
      average(values),

    total:
      shouldTotal
        ? total(values)
        : null,

    minimum:
      Math.min(...values),

    maximum:
      Math.max(...values),

    observationCount:
      values.length,
  };
}

/* =========================================================
   NASA FIRMS
========================================================= */

function isFireMetric(metric, intent) {
  return (
    intent === "fire" ||
    metric === "fires" ||
    metric === "fire_detections"
  );
}

function chooseFireSources(startDate) {
  const year =
    Number(startDate.slice(0, 4));

  const sources = [];

  /*
    MODIS standard processing provides the
    historical backbone.

    VIIRS adds higher-resolution detections
    for more recent periods.
  */

  if (year >= 2012) {
    sources.push(
      "MODIS_SP",
      "VIIRS_SNPP_SP"
    );

    if (year >= 2018) {
      sources.push(
        "VIIRS_NOAA20_SP"
      );
    }

    if (year >= 2024) {
      sources.push(
        "VIIRS_NOAA21_SP"
      );
    }
  } else {
    sources.push("MODIS_SP");
  }

  return sources;
}

function parseCSV(csv) {
  const lines =
    csv
      .split(/\r?\n/)
      .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers =
    lines[0].split(",");

  return lines
    .slice(1)
    .map(line => {
      const parts =
        line.split(",");

      const row = {};

      headers.forEach(
        (header, index) => {
          row[header] =
            parts[index];
        }
      );

      return row;
    });
}

async function getFirmsChunk({
  source,
  boundingBox,
  date,
}) {
  if (!FIRMS_MAP_KEY) {
    throw new Error(
      "FIRMS_MAP_KEY is missing from .env"
    );
  }

  const {
    west,
    south,
    east,
    north,
  } = boundingBox;

  const area =
    `${west},${south},${east},${north}`;

  const url =
    `${FIRMS_BASE}/` +
    `${FIRMS_MAP_KEY}/` +
    `${source}/` +
    `${area}/5/` +
    `${date}`;

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `NASA FIRMS request failed: ${response.status}`
    );
  }

  const csv =
    await response.text();

  return parseCSV(csv);
}

async function getFirmsData({
  boundingBox,
  startDate,
  endDate,
}) {
  const sources =
    chooseFireSources(startDate);

  const records = [];

  let cursor =
    parseDateString(startDate);

  const finalDate =
    parseDateString(endDate);

  /*
    FIRMS Area API supports a maximum
    5-day range per request.
  */

  while (
    cursor &&
    cursor <= finalDate
  ) {
    const chunkDate =
      formatDate(cursor);

    const chunkEnd =
      addDays(cursor, 4);

    const actualEnd =
      chunkEnd > finalDate
        ? finalDate
        : chunkEnd;

    for (const source of sources) {
      try {
        const rows =
          await getFirmsChunk({
            source,
            boundingBox,
            date: chunkDate,
          });

        for (const row of rows) {
          const acquisitionDate =
            row.acq_date;

          if (
            acquisitionDate &&
            acquisitionDate >= startDate &&
            acquisitionDate <= endDate
          ) {
            records.push({
              ...row,
              source,
            });
          }
        }
      } catch (error) {
        console.warn(
          `FIRMS ${source} failed for ${chunkDate}:`,
          error.message
        );
      }
    }

    cursor =
      addDays(actualEnd, 1);

    /*
      Avoid hammering the free API.
    */
    await sleep(100);
  }

  /*
    De-duplicate identical observations.
  */

  const unique =
    new Map();

  for (const record of records) {
    const key =
      [
        record.acq_date,
        record.acq_time,
        record.latitude,
        record.longitude,
        record.satellite,
        record.instrument,
      ].join("|");

    if (!unique.has(key)) {
      unique.set(key, record);
    }
  }

  const detections =
    Array.from(unique.values());

  const monthly = {};

  let maxFRP = null;

  for (const record of detections) {
    const month =
      String(record.acq_date || "")
        .slice(0, 7);

    if (month) {
      monthly[month] =
        (monthly[month] || 0) + 1;
    }

    const frp =
      Number(record.frp);

    if (
      Number.isFinite(frp) &&
      (maxFRP === null || frp > maxFRP)
    ) {
      maxFRP = frp;
    }
  }

  return {
    source: "NASA FIRMS",

    scope: {
      boundingBox,
      startDate,
      endDate,
    },

    detections,

    summary: {
      totalDetections:
        detections.length,

      monthlyDetections:
        monthly,

      maximumFRP:
        maxFRP,

      satellites:
        [
          ...new Set(
            detections
              .map(x => x.satellite)
              .filter(Boolean)
          ),
        ],
    },
  };
}

/* =========================================================
   NASA EARTHDATA CMR
========================================================= */

async function searchNASADatasets(question) {
  const url =
    `${NASA_CMR_BASE}/collections.json` +
    `?keyword=${encodeURIComponent(question)}` +
    `&page_size=5`;

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `NASA Earthdata search failed: ${response.status}`
    );
  }

  const data =
    await response.json();

  const entries =
    data?.feed?.entry || [];

  return entries.map(entry => ({
    title: entry.title,
    shortName: entry.short_name,
    version: entry.version_id,
    summary: entry.summary,
    id: entry.id,
  }));
}

/* =========================================================
   DATE RESOLUTION
========================================================= */

function resolveDates(analysis) {
  const today =
    new Date();

  /*
    If analyzer already produced exact dates,
    use them.
  */

  if (
    analysis.startDate &&
    analysis.endDate
  ) {
    return {
      startDate:
        analysis.startDate,

      endDate:
        analysis.endDate,
    };
  }

  /*
    Explicit year.
  */

  if (
    Number.isInteger(
      Number(analysis.year)
    )
  ) {
    const year =
      Number(analysis.year);

    return {
      startDate:
        `${year}-01-01`,

      endDate:
        `${year}-12-31`,
    };
  }

  /*
    No date supplied.

    For data questions we use the page year
    only as a fallback.

    Otherwise use the latest completed
    available period.
  */

  return {
    startDate:
      `${today.getUTCFullYear()}-01-01`,

    endDate:
      formatDate(today),
  };
}

/* =========================================================
   RETRIEVE DATA FOR ONE LOCATION
========================================================= */

async function retrieveForLocation({
  location,
  analysis,
}) {
  const dates =
    resolveDates(analysis);

  const fire =
    isFireMetric(
      analysis.metric,
      analysis.intent
    );

  if (fire) {
    const bbox =
      getBoundingBox(location);

    const firms =
      await getFirmsData({
        boundingBox: bbox,
        startDate: dates.startDate,
        endDate: dates.endDate,
      });

    return {
      location,
      dates,
      source: "NASA FIRMS",
      fire: firms,
    };
  }

  /*
    Country / region:
    use POWER regional data.

    City / point:
    use POWER point data.
  */

  if (
    isCountry(location) ||
    location.type === "state" ||
    location.type === "administrative"
  ) {
    const bbox =
      getBoundingBox(location);

    const power =
      await getPowerRegionalData({
        boundingBox: bbox,
        startDate: dates.startDate,
        endDate: dates.endDate,
        metric: analysis.metric,
      });

    return {
      location,
      dates,
      source: "NASA POWER",
      power: {
        ...power,
        summary:
          summarizePower(
            power.data,
            analysis.metric
          ),
      },
    };
  }

  const power =
    await getPowerPointData({
      latitude: location.latitude,
      longitude: location.longitude,
      startDate: dates.startDate,
      endDate: dates.endDate,
      metric: analysis.metric,
    });

  return {
    location,
    dates,
    source: "NASA POWER",
    power: {
      ...power,
      summary:
        summarizePower(
          power.data,
          analysis.metric
        ),
    },
  };
}

/* =========================================================
   NASA DATA COLLECTION
========================================================= */

async function collectNASAData({
  analysis,
  pageContext,
}) {
  const resolvedLocations = [];

  for (
    const requested of
    analysis.locations || []
  ) {
    let name =
      cleanText(requested.name);

    /*
      Handle references such as:
      "this state"
      "this location"
      "here"
    */

    if (
      requested.reference ===
        "page_context" ||
      /^(this|here|selected)/i.test(name)
    ) {
      const pageLocation =
        pageContext?.location;

      if (
        pageLocation?.name
      ) {
        name =
          pageLocation.name;
      } else {
        throw new Error(
          "The question refers to the selected location, but no page location is available."
        );
      }
    }

    const geocoded =
      await geocodePlace(name);

    resolvedLocations.push(
      geocoded
    );

    /*
      Nominatim asks clients to avoid
      sending many requests too quickly.
    */
    await sleep(250);
  }

  /*
    If analyzer did not find a location,
    and the question clearly refers to the
    current page, use page context.
  */

  if (
    resolvedLocations.length === 0 &&
    pageContext?.location?.name
  ) {
    const geocoded =
      await geocodePlace(
        pageContext.location.name
      );

    resolvedLocations.push(
      geocoded
    );
  }

  if (
    resolvedLocations.length === 0
  ) {
    throw new Error(
      "I could not determine which place the NASA question refers to."
    );
  }

  const datasets = [];

  for (
    const location of
    resolvedLocations
  ) {
    try {
      const result =
        await retrieveForLocation({
          location,
          analysis,
        });

      datasets.push(result);
    } catch (error) {
      datasets.push({
        location,
        error: error.message,
      });
    }
  }

  /*
    For questions about a NASA dataset
    rather than a numeric measurement,
    search NASA Earthdata metadata.
  */

  let earthdata =
    [];

  if (
    analysis.intent === "dataset" ||
    analysis.intent === "satellite" ||
    analysis.intent === "imagery" ||
    analysis.needsNASAResearch
  ) {
    try {
      earthdata =
        await searchNASADatasets(
          analysis.metric ||
          analysis.intent
        );
    } catch (error) {
      console.warn(
        "Earthdata search failed:",
        error.message
      );
    }
  }

  return {
    analysis,
    locations: datasets,
    earthdata,
  };
}

/* =========================================================
   FINAL NASA AI ANSWER
========================================================= */

async function generateNASAAnswer({
  question,
  conversation,
  pageContext,
  nasaData,
}) {
  const prompt = `
You are the NASA AI scientist inside TIME EARTH.

Answer the user's question using the ACTUAL
retrieved NASA data supplied below.

USER QUESTION:
${question}

PAGE CONTEXT:
${JSON.stringify(pageContext || {}, null, 2)}

CONVERSATION:
${JSON.stringify(conversation || [], null, 2)}

ACTUAL NASA DATA:
${JSON.stringify(nasaData, null, 2)}

STRICT RULES:

1. The user's explicit place overrides the page place.

2. The user's explicit year/date overrides the
   page year/date.

3. "This state", "this country", "here", and
   "this location" may refer to the page context.

4. NEVER substitute the page location for an
   explicitly requested location.

5. NEVER substitute the page year for an
   explicitly requested year.

6. NEVER invent NASA measurements.

7. NEVER use a generic climate statistic as if it
   were retrieved NASA data.

8. If comparing two places, use the retrieved
   data for BOTH places.

9. If one requested place could not be retrieved,
   say exactly which one failed.

10. NASA FIRMS records are ACTIVE FIRE DETECTIONS /
    THERMAL ANOMALIES.

    Do NOT automatically call them confirmed
    wildfires.

11. When reporting FIRMS results, include:
    - exact date range
    - location
    - detection count

12. When reporting POWER results, identify:
    - metric
    - location
    - date range
    - whether the value represents a point
      or regional/bounding-box result

13. If a value is an average, say average.

14. If rainfall/precipitation is summed across
    daily values, say total precipitation.

15. If comparing places, explain the actual
    difference using retrieved values.

16. Keep answers concise:
    normally 3-7 sentences.

17. Add a short "What it means:" explanation
    when useful.

18. If the question is scientific rather than a
    direct measurement question, you may explain
    using established scientific knowledge.

19. Do not claim NASA measured something if the
    retrieved dataset does not measure it.

20. If NASA data is genuinely unavailable,
    explain the limitation and, if useful,
    mention the closest relevant NASA dataset.

21. Do NOT say:
    "the provided NASA context does not contain
    this information"

    unless the backend genuinely failed to retrieve
    any relevant NASA source after attempting retrieval.

22. Answer the question directly.
    Do not describe the backend architecture.

23. If the question asks "yes/no", start with
    the answer.

24. Use units.

25. Do not over-explain.

Return only the final answer text.
`;

  const response =
    await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [
          {
            google_search: {},
          },
        ],
      },
    });

  return (
    response.text ||
    "I couldn't generate a NASA answer."
  );
}

/* =========================================================
   MAIN API
========================================================= */

app.post(
  "/api/nasa/ask",
  async (req, res) => {
    try {
      const {
        question,
        location,
        explorer,
        conversation = [],
      } = req.body;

      const cleanQuestion =
        cleanText(question);

      if (!cleanQuestion) {
        return res.status(400).json({
          error:
            "Please provide a question.",
        });
      }

      /*
        This is ONLY fallback context.

        It is NOT the primary source of the request.
      */

      const pageContext = {
        location: {
          name:
            location?.name ||
            "Unknown",

          country:
            location?.country ||
            "",

          region:
            location?.region ||
            "",

          latitude:
            validNumber(location?.latitude)
              ? location.latitude
              : null,

          longitude:
            validNumber(location?.longitude)
              ? location.longitude
              : null,
        },

        explorer: {
          year:
            explorer?.year || null,

          observationDate:
            explorer?.observationDate ||
            null,

          datasetKey:
            explorer?.datasetKey ||
            null,

          datasetName:
            explorer?.datasetName ||
            null,

          datasetType:
            explorer?.datasetType ||
            null,

          platform:
            explorer?.platform ||
            null,

          instrument:
            explorer?.instrument ||
            null,

          product:
            explorer?.product ||
            null,
        },
      };

      console.log(
        "\n=============================="
      );

      console.log(
        "TIME EARTH QUESTION:"
      );

      console.log(
        cleanQuestion
      );

      /*
        STEP 1:
        Understand the question.
      */

      const analysis =
        await analyzeQuestion({
          question:
            cleanQuestion,

          conversation,

          pageContext,
        });

      console.log(
        "QUESTION ANALYSIS:",
        JSON.stringify(
          analysis,
          null,
          2
        )
      );

      /*
        STEP 2:
        Retrieve actual NASA data.
      */

      const nasaData =
        await collectNASAData({
          analysis,
          pageContext,
        });

      console.log(
        "NASA DATA RETRIEVED"
      );

      /*
        STEP 3:
        Explain actual retrieved data.
      */

      const answer =
        await generateNASAAnswer({
          question:
            cleanQuestion,

          conversation,

          pageContext,

          nasaData,
        });

      console.log(
        "NASA ANSWER:",
        answer
      );

      console.log(
        "==============================\n"
      );

      res.json({
        answer,

        analysis,

        nasa: nasaData,
      });

    } catch (error) {
      console.error(
        "NASA AI ERROR:",
        error
      );

      res.status(500).json({
        error:
          "NASA AI could not complete the request.",

        details:
          error.message,
      });
    }
  }
);

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      status: "ok",

      service:
        "TIME EARTH NASA AI",

      gemini:
        Boolean(GEMINI_API_KEY),

      firms:
        Boolean(FIRMS_MAP_KEY),

      architecture:
        "question-first NASA retrieval",
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "======================================"
    );

    console.log(
      "TIME EARTH NASA AI SERVER"
    );

    console.log(
      `Server running on port ${PORT}`
    );

    console.log(
      `Gemini: ${
        GEMINI_API_KEY
          ? "READY"
          : "MISSING"
      }`
    );

    console.log(
      `NASA FIRMS: ${
        FIRMS_MAP_KEY
          ? "READY"
          : "MISSING"
      }`
    );

    console.log(
      "======================================"
    );
  }
);