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
  throw new Error("GEMINI_API_KEY was not found in the .env file.");
}

console.log(
  "Gemini API key loaded:",
  GEMINI_API_KEY.slice(0, 6) + "..."
);

console.log(
  "NASA FIRMS MAP_KEY:",
  FIRMS_MAP_KEY ? "loaded" : "NOT LOADED"
);

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));

/* =========================================================
   GENERAL HELPERS
========================================================= */

function cleanText(value) {
  return String(value || "").trim();
}

function isValidCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function extractYearFromQuestion(question, fallbackYear) {
  const match = cleanText(question).match(/\b(19|20)\d{2}\b/);

  if (match) {
    return Number(match[0]);
  }

  return Number(fallbackYear) || new Date().getFullYear();
}

function isFireQuestion(question) {
  const text = cleanText(question).toLowerCase();

  const fireWords = [
    "fire",
    "fires",
    "wildfire",
    "wildfires",
    "burn",
    "burned",
    "burning",
    "hotspot",
    "hotspots",
    "thermal anomaly",
    "thermal anomalies",
    "forest fire",
    "bush fire",
    "bushfire",
    "fire event",
    "fire events",
  ];

  return fireWords.some(word => text.includes(word));
}

function isWeatherQuestion(question) {
  const text = cleanText(question).toLowerCase();

  const weatherWords = [
    "weather",
    "temperature",
    "rain",
    "rainfall",
    "precipitation",
    "humidity",
    "wind",
    "solar",
    "radiation",
    "sunlight",
    "climate",
    "hot",
    "cold",
  ];

  return weatherWords.some(word => text.includes(word));
}

function isLocationQuestion(question) {
  const text = cleanText(question).toLowerCase();

  return (
    text.includes("where") ||
    text.includes("location") ||
    text.includes("coordinates") ||
    text.includes("latitude") ||
    text.includes("longitude")
  );
}

/* =========================================================
   NASA POWER
========================================================= */

async function getNASAPowerData(latitude, longitude, year) {
  const start = `${year}0101`;
  const end = `${year}1231`;

  const parameters = [
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "PRECTOTCORR",
    "RH2M",
    "WS2M",
    "ALLSKY_SFC_SW_DWN",
  ].join(",");

  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point` +
    `?parameters=${parameters}` +
    `&community=AG` +
    `&longitude=${longitude}` +
    `&latitude=${latitude}` +
    `&start=${start}` +
    `&end=${end}` +
    `&format=JSON`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `NASA POWER request failed: ${response.status}`
    );
  }

  return await response.json();
}

function validNumbers(values) {
  return Object.values(values || {}).filter(
    value =>
      typeof value === "number" &&
      Number.isFinite(value)
  );
}

function average(values) {
  const numbers = validNumbers(values);

  if (!numbers.length) {
    return null;
  }

  return (
    numbers.reduce(
      (sum, value) => sum + value,
      0
    ) / numbers.length
  );
}

function total(values) {
  const numbers = validNumbers(values);

  if (!numbers.length) {
    return null;
  }

  return numbers.reduce(
    (sum, value) => sum + value,
    0
  );
}

function summarizePowerData(data) {
  const properties =
    data?.properties?.parameter;

  if (!properties) {
    return null;
  }

  return {
    averageTemperatureC:
      average(properties.T2M),

    averageMaximumTemperatureC:
      average(properties.T2M_MAX),

    averageMinimumTemperatureC:
      average(properties.T2M_MIN),

    totalPrecipitationMm:
      total(properties.PRECTOTCORR),

    averageRelativeHumidityPercent:
      average(properties.RH2M),

    averageWindSpeedMs:
      average(properties.WS2M),

    averageSolarRadiation:
      average(properties.ALLSKY_SFC_SW_DWN),
  };
}

/* =========================================================
   STATE / REGION DETECTION
========================================================= */

const US_STATE_NAMES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

function normalizeStateName(name) {
  if (!name) return null;

  const cleaned = cleanText(name);

  return (
    US_STATE_NAMES.find(
      state =>
        state.toLowerCase() ===
        cleaned.toLowerCase()
    ) || null
  );
}

function extractStateFromQuestion(question) {
  const text = cleanText(question).toLowerCase();

  for (const state of US_STATE_NAMES) {
    if (
      text.includes(
        state.toLowerCase()
      )
    ) {
      return state;
    }
  }

  return null;
}

/* =========================================================
   US CENSUS TIGERWEB
   Gets the actual state bounding box dynamically.
========================================================= */

async function getUSStateBoundingBox(stateName) {
  const state = normalizeStateName(stateName);

  if (!state) {
    return null;
  }

  const where =
    `NAME='${state.replace(/'/g, "''")}'`;

  const url =
    "https://tigerweb.geo.census.gov/arcgis/rest/services/" +
    "TIGERweb/USLandmass/MapServer/0/query" +
    `?where=${encodeURIComponent(where)}` +
    "&outFields=NAME,STUSAB,GEOID" +
    "&returnGeometry=true" +
    "&outSR=4326" +
    "&f=geojson";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Census state boundary request failed: ${response.status}`
    );
  }

  const geojson = await response.json();

  const features = geojson?.features || [];

  if (!features.length) {
    throw new Error(
      `Could not find the state boundary for ${state}.`
    );
  }

  const geometry =
    features[0]?.geometry;

  if (!geometry) {
    throw new Error(
      `No geometry returned for ${state}.`
    );
  }

  const coordinates = [];

  function collectCoordinates(value) {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      coordinates.push(value);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collectCoordinates(item);
      }
    }
  }

  collectCoordinates(
    geometry.coordinates
  );

  if (!coordinates.length) {
    throw new Error(
      `Could not calculate the bounding box for ${state}.`
    );
  }

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }

  return {
    state,
    west,
    south,
    east,
    north,
    source: "U.S. Census TIGERweb",
  };
}

/* =========================================================
   LOCAL BOUNDING BOX
   Used for countries/regions that are not U.S. states.
========================================================= */

function getLocalBoundingBox(
  latitude,
  longitude,
  radius = 0.5
) {
  return {
    west: Math.max(-180, longitude - radius),
    south: Math.max(-90, latitude - radius),
    east: Math.min(180, longitude + radius),
    north: Math.min(90, latitude + radius),
    source: "TIME EARTH local search area",
  };
}

/* =========================================================
   FIRMS CSV PARSER
========================================================= */

function parseCSVLine(line) {
  const values = [];

  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (
        insideQuotes &&
        line[i + 1] === '"'
      ) {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }

      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);

  return values;
}

function parseFIRMSCSV(csvText) {
  const lines = cleanText(csvText)
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers =
    parseCSVLine(lines[0]);

  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const values =
      parseCSVLine(lines[i]);

    const record = {};

    headers.forEach(
      (header, index) => {
        record[header] =
          values[index];
      }
    );

    records.push(record);
  }

  return records;
}

/* =========================================================
   FIRMS DATASET SELECTION
========================================================= */

function getHistoricalFIRMSSources(year) {
  const currentYear =
    new Date().getUTCFullYear();

  /*
    Historical years use standard processing.

    MODIS has the longest historical record.
    VIIRS Suomi-NPP begins in 2012.
  */

  if (year < 2012) {
    return ["MODIS_SP"];
  }

  /*
    For 2012 onward:
    MODIS + VIIRS Suomi-NPP
  */

  if (year <= currentYear) {
    return [
      "MODIS_SP",
      "VIIRS_SNPP_SP",
    ];
  }

  return [];
}

/* =========================================================
   FIRMS API REQUEST
========================================================= */

async function getFIRMSPeriod(
  bbox,
  source,
  startDate
) {
  if (!FIRMS_MAP_KEY) {
    throw new Error(
      "FIRMS_MAP_KEY is missing. " +
      "Create a free NASA FIRMS MAP_KEY and add it to .env."
    );
  }

  const area = [
    bbox.west,
    bbox.south,
    bbox.east,
    bbox.north,
  ].join(",");

  const url =
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/` +
    `${FIRMS_MAP_KEY}/` +
    `${source}/` +
    `${area}/` +
    `5/` +
    `${startDate}`;

  const response = await fetch(url);

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `NASA FIRMS ${source} request failed: ` +
      `${response.status} ${text.slice(0, 300)}`
    );
  }

  return await response.text();
}

/* =========================================================
   DATE HELPERS
========================================================= */

function getStartOfYear(year) {
  return new Date(
    Date.UTC(year, 0, 1)
  );
}

function getEndOfYear(year) {
  return new Date(
    Date.UTC(year, 11, 31)
  );
}

function formatDateUTC(date) {
  return date
    .toISOString()
    .slice(0, 10);
}

function addDays(date, days) {
  const result =
    new Date(date);

  result.setUTCDate(
    result.getUTCDate() + days
  );

  return result;
}

/* =========================================================
   FIRMS RECORD SUMMARY
========================================================= */

function summarizeFIRMSRecords(
  records,
  source
) {
  const monthlyCounts =
    {};

  const satelliteCounts =
    {};

  let maxFRP = null;

  let daytime = 0;
  let nighttime = 0;

  for (const record of records) {
    const date =
      record.acq_date;

    if (date) {
      const month =
        date.slice(0, 7);

      monthlyCounts[month] =
        (monthlyCounts[month] || 0) + 1;
    }

    const satellite =
      record.satellite ||
      source;

    satelliteCounts[satellite] =
      (satelliteCounts[satellite] || 0) + 1;

    const frp =
      Number(record.frp);

    if (
      Number.isFinite(frp) &&
      (maxFRP === null ||
        frp > maxFRP)
    ) {
      maxFRP = frp;
    }

    if (
      String(record.daynight)
        .toLowerCase() === "d"
    ) {
      daytime++;
    }

    if (
      String(record.daynight)
        .toLowerCase() === "n"
    ) {
      nighttime++;
    }
  }

  return {
    source,
    detections: records.length,
    monthlyCounts,
    satelliteCounts,
    maximumFRP_MW: maxFRP,
    daytimeDetections: daytime,
    nighttimeDetections: nighttime,
  };
}

/* =========================================================
   QUERY FIRMS FOR A WHOLE YEAR
========================================================= */

async function getFIRMSYearData(
  bbox,
  year
) {
  if (!FIRMS_MAP_KEY) {
    return {
      available: false,
      error:
        "NASA FIRMS MAP_KEY is missing.",
    };
  }

  const sources =
    getHistoricalFIRMSSources(year);

  if (!sources.length) {
    return {
      available: false,
      error:
        `NASA FIRMS historical sources are not configured for ${year}.`,
    };
  }

  const start =
    getStartOfYear(year);

  const end =
    getEndOfYear(year);

  const periods = [];

  let cursor = new Date(start);

  while (cursor <= end) {
    periods.push(
      new Date(cursor)
    );

    cursor =
      addDays(cursor, 5);
  }

  const jobs = [];

  for (const source of sources) {
    for (const period of periods) {
      jobs.push({
        source,
        date: formatDateUTC(period),
      });
    }
  }

  console.log(
    `NASA FIRMS: querying ${jobs.length} periods for ${year}`
  );

  /*
    Limit concurrency so we do not
    hammer the FIRMS API.
  */

  const CONCURRENCY = 8;

  const allRecords = [];

  let completed = 0;

  async function worker() {
    while (true) {
      const index =
        completed++;

      if (index >= jobs.length) {
        return;
      }

      const job =
        jobs[index];

      try {
        const csv =
          await getFIRMSPeriod(
            bbox,
            job.source,
            job.date
          );

        const records =
          parseFIRMSCSV(csv);

        allRecords.push(
          ...records.map(
            record => ({
              ...record,
              _source: job.source,
            })
          )
        );
      } catch (error) {
        console.error(
          `FIRMS error ${job.source} ${job.date}:`,
          error.message
        );
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          CONCURRENCY,
          jobs.length
        ),
      },
      () => worker()
    )
  );

  /*
    Remove duplicate detections.

    Different satellite products can
    sometimes observe the same thermal
    event.

    We use date + time + rounded
    coordinates + satellite.
  */

  const uniqueMap =
    new Map();

  for (const record of allRecords) {
    const latitude =
      Number(record.latitude);

    const longitude =
      Number(record.longitude);

    const key = [
      record.acq_date,
      record.acq_time,
      Number.isFinite(latitude)
        ? latitude.toFixed(3)
        : "",
      Number.isFinite(longitude)
        ? longitude.toFixed(3)
        : "",
      record.satellite || "",
    ].join("|");

    if (!uniqueMap.has(key)) {
      uniqueMap.set(
        key,
        record
      );
    }
  }

  const uniqueRecords =
    Array.from(
      uniqueMap.values()
    );

  const bySource = {};

  for (const source of sources) {
    const sourceRecords =
      uniqueRecords.filter(
        record =>
          record._source === source
      );

    bySource[source] =
      summarizeFIRMSRecords(
        sourceRecords,
        source
      );
  }

  const overall =
    summarizeFIRMSRecords(
      uniqueRecords,
      "combined"
    );

  return {
    available: true,

    year,

    bbox,

    sources,

    totalDetections:
      overall.detections,

    maximumFRP_MW:
      overall.maximumFRP_MW,

    daytimeDetections:
      overall.daytimeDetections,

    nighttimeDetections:
      overall.nighttimeDetections,

    monthlyCounts:
      overall.monthlyCounts,

    satelliteCounts:
      overall.satelliteCounts,

    bySource,

    note:
      "FIRMS detections are satellite-detected thermal anomalies/active-fire observations and are not automatically confirmed wildfires.",
  };
}

/* =========================================================
   BUILD NASA CONTEXT
========================================================= */

async function buildNASAContext({
  question,
  location,
  explorer,
}) {
  const explorerYear =
    Number(explorer?.year) ||
    new Date().getFullYear();

  /*
    IMPORTANT:
    The year explicitly written by
    the user wins over Explorer year.
  */

  const requestedYear =
    extractYearFromQuestion(
      question,
      explorerYear
    );

  const context = {
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
        location?.latitude,

      longitude:
        location?.longitude,
    },

    explorer: {
      year: explorerYear,

      requestedYear,

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

    nasaPOWER: null,

    nasaFIRMS: null,

    searchScope: null,
  };

  /* =======================================================
     FIRE DATA
  ======================================================= */

  if (isFireQuestion(question)) {
    if (!FIRMS_MAP_KEY) {
      context.nasaFIRMS = {
        available: false,

        error:
          "FIRMS_MAP_KEY is not configured.",

        message:
          "NASA FIRMS requires a free MAP_KEY for API access.",
      };

      return context;
    }

    /*
      First try to identify a U.S. state
      explicitly mentioned in the question.
    */

    let state =
      extractStateFromQuestion(
        question
      );

    /*
      If question says "this state",
      use Explorer's region.
    */

    if (!state) {
      state =
        normalizeStateName(
          location?.region
        );
    }

    if (state) {
      /*
        Whole U.S. state.
      */

      try {
        const bbox =
          await getUSStateBoundingBox(
            state
          );

        context.searchScope = {
          type: "us_state",
          state,
          bbox,
          description:
            `Whole state of ${state}`,
        };

        context.nasaFIRMS =
          await getFIRMSYearData(
            bbox,
            requestedYear
          );
      } catch (error) {
        console.error(
          "State FIRMS search failed:",
          error
        );

        /*
          Fallback to local search
          rather than completely failing.
        */

        if (
          isValidCoordinate(
            location?.latitude
          ) &&
          isValidCoordinate(
            location?.longitude
          )
        ) {
          const bbox =
            getLocalBoundingBox(
              location.latitude,
              location.longitude
            );

          context.searchScope = {
            type: "local_fallback",
            bbox,
            description:
              "Local fallback around selected location",
          };

          context.nasaFIRMS =
            await getFIRMSYearData(
              bbox,
              requestedYear
            );

          context.nasaFIRMS.fallbackReason =
            error.message;
        }
      }
    } else if (
      isValidCoordinate(
        location?.latitude
      ) &&
      isValidCoordinate(
        location?.longitude
      )
    ) {
      /*
        Non-U.S. location:
        search around the selected location.
      */

      const bbox =
        getLocalBoundingBox(
          location.latitude,
          location.longitude
        );

      context.searchScope = {
        type: "local",
        bbox,
        description:
          "Local area around selected location",
      };

      context.nasaFIRMS =
        await getFIRMSYearData(
          bbox,
          requestedYear
        );
    }
  }

  /* =======================================================
     NASA POWER
  ======================================================= */

  if (
    isWeatherQuestion(question) ||
    !isFireQuestion(question)
  ) {
    if (
      isValidCoordinate(
        location?.latitude
      ) &&
      isValidCoordinate(
        location?.longitude
      )
    ) {
      try {
        const powerData =
          await getNASAPowerData(
            location.latitude,
            location.longitude,
            requestedYear
          );

        context.nasaPOWER =
          summarizePowerData(
            powerData
          );
      } catch (error) {
        console.error(
          "NASA POWER error:",
          error.message
        );
      }
    }
  }

  return context;
}

/* =========================================================
   GEMINI
========================================================= */

function buildPrompt({
  question,
  nasaContext,
  conversation,
}) {
  const previousConversation =
    Array.isArray(conversation)
      ? conversation
          .slice(-12)
          .map(message => {
            const role =
              message.role ===
              "assistant"
                ? "Assistant"
                : "User";

            return `${role}: ${cleanText(
              message.content
            )}`;
          })
          .join("\n")
      : "";

  const fireData =
    nasaContext.nasaFIRMS;

  const powerData =
    nasaContext.nasaPOWER;

  return `
You are the NASA AI assistant inside TIME EARTH.

TIME EARTH is an Earth observation application
that helps users understand NASA satellite and
environmental data.

==================================================
MOST IMPORTANT RULE
==================================================

Answer the user's actual question.

Do NOT automatically use the Explorer's current
year if the user explicitly gives another year.

For example:

Explorer year = 2020
User asks = "Was there any fire in 2016?"

The answer must be about 2016.

==================================================
FIRE QUESTIONS
==================================================

When the user asks about fires, wildfires,
burning, hotspots, or thermal anomalies:

Use NASA FIRMS data supplied below.

Do NOT use NASA POWER to determine whether fires
occurred.

FIRMS detects satellite-observed thermal anomalies
and active-fire locations.

A FIRMS detection is NOT automatically proof of a
confirmed wildfire.

If FIRMS reports zero detections, say:

"NASA FIRMS returned zero satellite fire
detections in the searched area and period."

Do NOT say:

"There were no fires."

Those are not the same thing.

==================================================
GEOGRAPHIC SCOPE
==================================================

Pay very close attention to SEARCH SCOPE.

If the scope says:

Whole state of Texas

then the user is asking about Texas as a whole.

If the scope says:

Local area around selected location

then do NOT describe the result as covering
the entire state.

Always tell the user what geographic area was
actually searched when it matters.

==================================================
YEAR
==================================================

The requested year is:

${nasaContext.explorer.requestedYear}

The Explorer's original year was:

${nasaContext.explorer.year}

If these differ, use the requested year.

==================================================
NASA FIRMS DATA
==================================================

${JSON.stringify(
  fireData,
  null,
  2
)}

==================================================
NASA POWER DATA
==================================================

${JSON.stringify(
  powerData,
  null,
  2
)}

==================================================
LOCATION
==================================================

${JSON.stringify(
  nasaContext.location,
  null,
  2
)}

==================================================
EXPLORER DATASET
==================================================

${JSON.stringify(
  nasaContext.explorer,
  null,
  2
)}

==================================================
PREVIOUS CONVERSATION
==================================================

${previousConversation ||
  "No previous conversation."}

==================================================
USER QUESTION
==================================================

${question}

==================================================
ANSWER RULES
==================================================

1. Answer the question directly.

2. Use NASA measurements supplied in the context
   whenever they are relevant.

3. Never invent NASA measurements.

4. Never claim a satellite detection is definitely
   a confirmed wildfire.

5. Clearly distinguish:
   - NASA observation
   - scientific interpretation
   - general scientific knowledge

6. If the data says zero detections, explain the
   exact search area and period.

7. If the data is unavailable, say so honestly.

8. Do not confuse the Explorer year with the
   year explicitly requested by the user.

9. If the user asks about a whole state and the
   search scope actually covers the whole state,
   answer at the state level.

10. If the search only covers a local area,
    explicitly say that.

11. Keep answers concise but useful.

12. Do not expose internal JSON, API keys,
    implementation details, or server code.

13. When answering a simple question, do not give
    a long generic introduction.

14. If the user asks a follow-up question such as
    "what about 2018?", understand that they may
    be referring to the same location and dataset
    from the previous conversation.

==================================================
CURRENT QUESTION TYPE
==================================================

Fire question:
${isFireQuestion(question)}

Weather question:
${isWeatherQuestion(question)}

Location question:
${isLocationQuestion(question)}
`;
}

/* =========================================================
   ASK NASA AI
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

      if (
        !question ||
        !cleanText(question)
      ) {
        return res.status(400).json({
          error:
            "Please provide a question.",
        });
      }

      if (
        !location ||
        !isValidCoordinate(
          location.latitude
        ) ||
        !isValidCoordinate(
          location.longitude
        )
      ) {
        return res.status(400).json({
          error:
            "A valid NASA location is required.",
        });
      }

      console.log(
        "\n========================================"
      );

      console.log(
        "TIME EARTH NASA AI QUESTION:"
      );

      console.log(question);

      console.log(
        "========================================\n"
      );

      const nasaContext =
        await buildNASAContext({
          question,
          location,
          explorer,
        });

      console.log(
        "Requested year:",
        nasaContext.explorer.requestedYear
      );

      if (
        nasaContext.nasaFIRMS
      ) {
        console.log(
          "FIRMS detections:",
          nasaContext.nasaFIRMS
            .totalDetections
        );
      }

      const prompt =
        buildPrompt({
          question,
          nasaContext,
          conversation,
        });

      const response =
        await ai.models.generateContent({
          model:
            "gemini-3.5-flash-lite",

          contents: prompt,

          config: {
            tools: [
              {
                google_search: {},
              },
            ],
          },
        });

      const answer =
        response.text ||
        "I couldn't generate an answer.";

      return res.json({
        answer,

        nasa: {
          location:
            nasaContext.location,

          explorer:
            nasaContext.explorer,

          power:
            nasaContext.nasaPOWER,

          firms:
            nasaContext.nasaFIRMS,

          searchScope:
            nasaContext.searchScope,
        },
      });
    } catch (error) {
      console.error(
        "\nNASA AI ERROR:"
      );

      console.error(error);

      return res.status(500).json({
        error:
          "NASA AI could not answer the question.",

        details:
          error.message,
      });
    }
  }
);

/* =========================================================
   HEALTH CHECK
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

      nasaFIRMS:
        Boolean(FIRMS_MAP_KEY),

      features: {
        nasaPOWER: true,
        nasaFIRMS: Boolean(
          FIRMS_MAP_KEY
        ),

        historicalFireSearch:
          Boolean(
            FIRMS_MAP_KEY
          ),

        stateSearch: true,

        questionYearDetection:
          true,

        conversation:
          true,
      },
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
      "========================================"
    );

    console.log(
      "TIME EARTH NASA AI SERVER"
    );

    console.log(
      "========================================"
    );

    console.log(
      `Server running at http://localhost:${PORT}`
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
      "========================================"
    );
  }
);