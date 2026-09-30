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
  const matches = cleanText(question).match(/\b(?:19|20)\d{2}\b/g);

  if (matches?.length) {
    return Number(matches[matches.length - 1]);
  }

  return Number(fallbackYear) || new Date().getFullYear();
}

function getAllYearsFromQuestion(question) {
  const matches = cleanText(question).match(/\b(?:19|20)\d{2}\b/g);

  return [
    ...new Set(
      (matches || []).map(Number)
    ),
  ];
}

function isRecentQuestion(question) {
  const text = cleanText(question).toLowerCase();

  return [
    "these days",
    "these day",
    "right now",
    "currently",
    "current",
    "recent",
    "recently",
    "lately",
    "this week",
    "this month",
    "today",
    "now",
  ].some(word => text.includes(word));
}

function extractPastYears(question) {
  const text = cleanText(question).toLowerCase();

  const match =
    text.match(
      /(?:past|last|previous)\s+(\d+)\s+years?/
    );

  if (!match) {
    return null;
  }

  const count = Number(match[1]);

  if (!Number.isFinite(count) || count < 2) {
    return null;
  }

  return Math.min(count, 10);
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

function isComparisonQuestion(question) {
  const text = cleanText(question).toLowerCase();

  return (
    text.includes("compare") ||
    text.includes("comparison") ||
    text.includes("versus") ||
    text.includes(" vs ") ||
    text.includes("difference between") ||
    text.includes("between")
  );
}

/* =========================================================
   NASA POWER
========================================================= */

async function getNASAPowerData(
  latitude,
  longitude,
  year
) {
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

/*
  Used for questions like:

  "What's the temperature these days?"
  "What is the weather currently?"
  "How has the weather been recently?"
*/

async function getRecentNASAPowerData(
  latitude,
  longitude,
  days = 30
) {
  const endDate = new Date();

  const startDate = new Date(
    endDate.getTime() -
      (days - 1) * 24 * 60 * 60 * 1000
  );

  const start =
    formatDateForPOWER(startDate);

  const end =
    formatDateForPOWER(endDate);

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
      `NASA POWER recent-data request failed: ${response.status}`
    );
  }

  return await response.json();
}

function formatDateForPOWER(date) {
  const year = date.getUTCFullYear();
  const month = String(
    date.getUTCMonth() + 1
  ).padStart(2, "0");
  const day = String(
    date.getUTCDate()
  ).padStart(2, "0");

  return `${year}${month}${day}`;
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
   PLACE / COUNTRY RESOLUTION
========================================================= */

/*
  These are used when the user explicitly asks
  about countries.

  For country comparisons we sample multiple
  representative points instead of pretending
  one city represents an entire country.
*/

const COUNTRY_REGIONS = {
  ethiopia: {
    name: "Ethiopia",
    country: "Ethiopia",
    type: "country",
    points: [
      [9.03, 38.74],
      [11.59, 37.39],
      [7.06, 38.48],
      [5.95, 37.55],
      [10.34, 40.14],
      [9.14, 40.49],
      [8.98, 35.58],
      [12.00, 39.00],
      [6.50, 39.00],
    ],
  },

  kenya: {
    name: "Kenya",
    country: "Kenya",
    type: "country",
    points: [
      [-1.29, 36.82],
      [-0.30, 36.08],
      [-0.52, 37.45],
      [-0.10, 34.76],
      [0.52, 35.27],
      [-2.27, 40.90],
      [-3.40, 38.56],
      [0.05, 37.64],
      [-1.80, 36.70],
    ],
  },

  brazil: {
    name: "Brazil",
    country: "Brazil",
    type: "country",
    points: [
      [-15.79, -47.88],
      [-23.55, -46.63],
      [-3.73, -38.52],
      [-1.45, -48.50],
      [-12.97, -38.50],
      [-30.03, -51.23],
    ],
  },
};

function normalizePlaceName(name) {
  return cleanText(name)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

function detectKnownCountries(question) {
  const text =
    normalizePlaceName(question);

  const results = [];

  for (const key of Object.keys(COUNTRY_REGIONS)) {
    const country =
      COUNTRY_REGIONS[key];

    if (
      text.includes(
        normalizePlaceName(country.name)
      )
    ) {
      results.push(country);
    }
  }

  return results;
}

/*
  Nominatim is used only when the question contains
  a location that is not one of our known country
  definitions.

  This lets the AI handle questions such as:

  "temperature in Nairobi"
  "rainfall in Bahir Dar"
  "weather in Addis Ababa"
*/

async function geocodePlace(placeName) {
  const query =
    cleanText(placeName);

  if (!query) {
    return null;
  }

  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?format=jsonv2` +
    `&limit=1` +
    `&q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "TIME-EARTH-NASA-AI/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Geocoding request failed: ${response.status}`
    );
  }

  const results =
    await response.json();

  if (!results.length) {
    return null;
  }

  const result = results[0];

  return {
    name:
      result.display_name ||
      query,

    latitude:
      Number(result.lat),

    longitude:
      Number(result.lon),

    type:
      result.type || "location",

    source:
      "OpenStreetMap Nominatim",
  };
}

/* =========================================================
   COUNTRY POWER COMPARISON
========================================================= */

async function getCountryPowerSummary(
  country,
  year
) {
  const results = [];

  /*
    Keep the sample small enough to be fast
    during a live demo.
  */

  for (
    const [latitude, longitude]
    of country.points
  ) {
    try {
      const data =
        await getNASAPowerData(
          latitude,
          longitude,
          year
        );

      const summary =
        summarizePowerData(data);

      if (summary) {
        results.push(summary);
      }
    } catch (error) {
      console.error(
        `POWER country sample error ${country.name}:`,
        error.message
      );
    }
  }

  if (!results.length) {
    return {
      available: false,
      country: country.name,
      year,
      error:
        "NASA POWER data could not be retrieved.",
    };
  }

  function averageField(field) {
    const values =
      results
        .map(item => item[field])
        .filter(
          value =>
            typeof value === "number" &&
            Number.isFinite(value)
        );

    if (!values.length) {
      return null;
    }

    return (
      values.reduce(
        (sum, value) =>
          sum + value,
        0
      ) / values.length
    );
  }

  return {
    available: true,

    country:
      country.name,

    year,

    sampledPoints:
      results.length,

    estimatedRegionalSummary: true,

    averageTemperatureC:
      averageField(
        "averageTemperatureC"
      ),

    averageMaximumTemperatureC:
      averageField(
        "averageMaximumTemperatureC"
      ),

    averageMinimumTemperatureC:
      averageField(
        "averageMinimumTemperatureC"
      ),

    averageAnnualPrecipitationMm:
      averageField(
        "totalPrecipitationMm"
      ),

    averageRelativeHumidityPercent:
      averageField(
        "averageRelativeHumidityPercent"
      ),

    averageWindSpeedMs:
      averageField(
        "averageWindSpeedMs"
      ),

    averageSolarRadiation:
      averageField(
        "averageSolarRadiation"
      ),

    note:
      "This is a representative multi-point NASA POWER estimate, not an official population-weighted or administrative national average.",
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
  const text =
    cleanText(question).toLowerCase();

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
========================================================= */

async function getUSStateBoundingBox(stateName) {
  const state =
    normalizeStateName(stateName);

  if (!state) {
    return null;
  }

  const where =
    `NAME='${state.replace(
      /'/g,
      "''"
    )}'`;

  const url =
    "https://tigerweb.geo.census.gov/arcgis/rest/services/" +
    "TIGERweb/USLandmass/MapServer/0/query" +
    `?where=${encodeURIComponent(
      where
    )}` +
    "&outFields=NAME,STUSAB,GEOID" +
    "&returnGeometry=true" +
    "&outSR=4326" +
    "&f=geojson";

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Census state boundary request failed: ${response.status}`
    );
  }

  const geojson =
    await response.json();

  const features =
    geojson?.features || [];

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

  function collectCoordinates(
    value
  ) {
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

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const [
    longitude,
    latitude,
  ] of coordinates) {
    west = Math.min(
      west,
      longitude
    );

    east = Math.max(
      east,
      longitude
    );

    south = Math.min(
      south,
      latitude
    );

    north = Math.max(
      north,
      latitude
    );
  }

  return {
    state,
    west,
    south,
    east,
    north,
    source:
      "U.S. Census TIGERweb",
  };
}

function getLocalBoundingBox(
  latitude,
  longitude,
  radius = 0.5
) {
  return {
    west: Math.max(
      -180,
      longitude - radius
    ),

    south: Math.max(
      -90,
      latitude - radius
    ),

    east: Math.min(
      180,
      longitude + radius
    ),

    north: Math.min(
      90,
      latitude + radius
    ),

    source:
      "TIME EARTH local search area",
  };
}

/* =========================================================
   FIRMS CSV PARSER
========================================================= */

function parseCSVLine(line) {
  const values = [];

  let current = "";
  let insideQuotes = false;

  for (
    let i = 0;
    i < line.length;
    i++
  ) {
    const char = line[i];

    if (char === '"') {
      if (
        insideQuotes &&
        line[i + 1] === '"'
      ) {
        current += '"';
        i++;
      } else {
        insideQuotes =
          !insideQuotes;
      }

      continue;
    }

    if (
      char === "," &&
      !insideQuotes
    ) {
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
  const lines =
    cleanText(csvText)
      .split(/\r?\n/)
      .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers =
    parseCSVLine(lines[0]);

  const records = [];

  for (
    let i = 1;
    i < lines.length;
    i++
  ) {
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
   FIRMS SOURCES
========================================================= */

function getHistoricalFIRMSSources(
  year
) {
  const currentYear =
    new Date().getUTCFullYear();

  if (year < 2012) {
    return ["MODIS_SP"];
  }

  if (year <= currentYear) {
    return [
      "MODIS_SP",
      "VIIRS_SNPP_SP",
    ];
  }

  return [];
}

/* =========================================================
   FIRMS API
========================================================= */

async function getFIRMSPeriod(
  bbox,
  source,
  startDate
) {
  if (!FIRMS_MAP_KEY) {
    throw new Error(
      "FIRMS_MAP_KEY is missing."
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
    `${area}/5/` +
    `${startDate}`;

  const response =
    await fetch(url);

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `NASA FIRMS ${source} request failed: ` +
        `${response.status} ${text.slice(
          0,
          300
        )}`
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
    result.getUTCDate() +
      days
  );

  return result;
}

/* =========================================================
   FIRMS SUMMARY
========================================================= */

function summarizeFIRMSRecords(
  records,
  source
) {
  const monthlyCounts = {};
  const satelliteCounts = {};

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
        (monthlyCounts[month] || 0) +
        1;
    }

    const satellite =
      record.satellite ||
      source;

    satelliteCounts[
      satellite
    ] =
      (satelliteCounts[
        satellite
      ] || 0) + 1;

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
    detections:
      records.length,
    monthlyCounts,
    satelliteCounts,
    maximumFRP_MW:
      maxFRP,
    daytimeDetections:
      daytime,
    nighttimeDetections:
      nighttime,
  };
}

/* =========================================================
   FIRMS WHOLE YEAR
========================================================= */

async function getFIRMSYearData(
  bbox,
  year,
  options = {}
) {
  if (!FIRMS_MAP_KEY) {
    return {
      available: false,
      error:
        "NASA FIRMS MAP_KEY is missing.",
    };
  }

  const sources =
    options.sources ||
    getHistoricalFIRMSSources(
      year
    );

  if (!sources.length) {
    return {
      available: false,
      error:
        `NASA FIRMS sources are not configured for ${year}.`,
    };
  }

  const start =
    getStartOfYear(year);

  const end =
    getEndOfYear(year);

  const periods = [];

  let cursor =
    new Date(start);

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
        date:
          formatDateUTC(
            period
          ),
      });
    }
  }

  console.log(
    `NASA FIRMS: ${jobs.length} requests for ${year}`
  );

  /*
    Smaller concurrency protects
    the free FIRMS API.
  */

  const CONCURRENCY = 6;

  const allRecords = [];

  let nextJob = 0;

  async function worker() {
    while (true) {
      const index =
        nextJob++;

      if (
        index >= jobs.length
      ) {
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
              _source:
                job.source,
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
        length:
          Math.min(
            CONCURRENCY,
            jobs.length
          ),
      },
      () => worker()
    )
  );

  /*
    Deduplicate identical satellite
    observations.
  */

  const uniqueMap =
    new Map();

  for (const record of allRecords) {
    const latitude =
      Number(
        record.latitude
      );

    const longitude =
      Number(
        record.longitude
      );

    const key = [
      record.acq_date,
      record.acq_time,
      Number.isFinite(
        latitude
      )
        ? latitude.toFixed(3)
        : "",
      Number.isFinite(
        longitude
      )
        ? longitude.toFixed(3)
        : "",
      record.satellite ||
        "",
    ].join("|");

    if (
      !uniqueMap.has(key)
    ) {
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

    note:
      "FIRMS detections are satellite-detected thermal anomalies/active-fire observations and are not automatically confirmed wildfires.",
  };
}

/* =========================================================
   MULTI-YEAR FIRE TREND
========================================================= */

async function getFIRMSMultiYearSummary(
  bbox,
  endYear,
  numberOfYears
) {
  const startYear =
    endYear -
    numberOfYears +
    1;

  const yearly = [];

  /*
    For a 10-year overview we use MODIS
    to keep the live demo reasonably fast.

    MODIS provides the longest historical
    record.
  */

  for (
    let year = startYear;
    year <= endYear;
    year++
  ) {
    const result =
      await getFIRMSYearData(
        bbox,
        year,
        {
          sources:
            ["MODIS_SP"],
        }
      );

    yearly.push({
      year,
      detections:
        result.available
          ? result.totalDetections
          : null,
      maximumFRP_MW:
        result.available
          ? result.maximumFRP_MW
          : null,
    });
  }

  const valid =
    yearly.filter(
      item =>
        typeof item.detections ===
          "number"
    );

  return {
    available:
      valid.length > 0,

    startYear,

    endYear,

    yearsRequested:
      numberOfYears,

    yearly,

    totalDetections:
      valid.reduce(
        (sum, item) =>
          sum + item.detections,
        0
      ),

    averageAnnualDetections:
      valid.length
        ? valid.reduce(
            (sum, item) =>
              sum +
              item.detections,
            0
          ) / valid.length
        : null,

    note:
      "Multi-year trend uses NASA FIRMS MODIS standard-processing detections for consistency across the historical period. A detection is a satellite-observed thermal anomaly, not automatically a confirmed wildfire.",
  };
}

/* =========================================================
   NASA CONTEXT
========================================================= */

async function buildNASAContext({
  question,
  location,
  explorer,
  conversation,
}) {
  const explorerYear =
    Number(explorer?.year) ||
    new Date().getFullYear();

  const explicitYears =
    getAllYearsFromQuestion(
      question
    );

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
      year:
        explorerYear,

      requestedYear,

      explicitYears,

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

    nasaPOWERComparison: null,

    nasaPOWERRecent: null,

    nasaFIRMS: null,

    nasaFIRMSMultiYear: null,

    searchScope: null,

    resolvedPlaces: [],
  };

  /* =======================================================
     COUNTRY / LOCATION COMPARISON
  ======================================================= */

  const detectedCountries =
    detectKnownCountries(
      question
    );

  if (
    isComparisonQuestion(
      question
    ) &&
    detectedCountries.length >= 2 &&
    isWeatherQuestion(
      question
    )
  ) {
    const comparisonResults =
      await Promise.all(
        detectedCountries.map(
          country =>
            getCountryPowerSummary(
              country,
              requestedYear
            )
        )
      );

    context.nasaPOWERComparison =
      comparisonResults;

    context.resolvedPlaces =
      detectedCountries.map(
        country => ({
          name:
            country.name,
          type:
            country.type,
          resolution:
            "multi-point country estimate",
        })
      );
  }

  /* =======================================================
     FIRE DATA
  ======================================================= */

  if (
    isFireQuestion(question)
  ) {
    if (!FIRMS_MAP_KEY) {
      context.nasaFIRMS = {
        available: false,
        error:
          "FIRMS_MAP_KEY is not configured.",
      };

      return context;
    }

    let state =
      extractStateFromQuestion(
        question
      );

    /*
      "this state" can refer to the
      currently selected region.
    */

    if (!state) {
      state =
        normalizeStateName(
          location?.region
        );
    }

    let bbox = null;

    if (state) {
      try {
        bbox =
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
      } catch (error) {
        console.error(
          "State boundary error:",
          error.message
        );
      }
    }

    if (!bbox) {
      if (
        isValidCoordinate(
          location?.latitude
        ) &&
        isValidCoordinate(
          location?.longitude
        )
      ) {
        bbox =
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
      }
    }

    if (bbox) {
      const pastYears =
        extractPastYears(
          question
        );

      if (
        pastYears &&
        pastYears >= 2
      ) {
        context.nasaFIRMSMultiYear =
          await getFIRMSMultiYearSummary(
            bbox,
            requestedYear,
            pastYears
          );
      } else {
        context.nasaFIRMS =
          await getFIRMSYearData(
            bbox,
            requestedYear
          );
      }
    }
  }

  /* =======================================================
     RECENT WEATHER
  ======================================================= */

  if (
    isWeatherQuestion(question) &&
    isRecentQuestion(question) &&
    isValidCoordinate(
      location?.latitude
    ) &&
    isValidCoordinate(
      location?.longitude
    )
  ) {
    try {
      const recent =
        await getRecentNASAPowerData(
          location.latitude,
          location.longitude,
          30
        );

      context.nasaPOWERRecent =
        summarizePowerData(
          recent
        );

      context.searchScope = {
        type: "recent_30_days",
        description:
          "Selected location, most recent 30-day NASA POWER period",
      };
    } catch (error) {
      console.error(
        "NASA POWER recent-data error:",
        error.message
      );
    }
  }

  /* =======================================================
     STANDARD NASA POWER
  ======================================================= */

  if (
    isWeatherQuestion(question) &&
    !context.nasaPOWERRecent &&
    !context.nasaPOWERComparison
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

        context.searchScope = {
          type: "selected_location",
          description:
            `Selected location for ${requestedYear}`,
        };
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
   GEMINI PROMPT
========================================================= */

function buildPrompt({
  question,
  nasaContext,
  conversation,
}) {
  const previousConversation =
    Array.isArray(
      conversation
    )
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

  return `
You are the NASA AI assistant inside TIME EARTH.

TIME EARTH is an Earth observation application
that helps users understand NASA Earth science,
environmental and satellite data.

==================================================
CORE BEHAVIOR
==================================================

Answer the user's ACTUAL question.

The selected Explorer location and year are
context, NOT a restriction on what TIME EARTH
can answer.

If the user asks about another year, use that year.

If the user asks about another location, use the
new location data supplied by the server.

If the user asks a follow-up such as:

"not 2013 but 2019"

then answer for 2019.

If the user asks:

"what about 2019?"

preserve the location and topic from the previous
conversation unless the user clearly changes them.

==================================================
RECENT / CURRENT QUESTIONS
==================================================

If the user says:

"these days"
"recently"
"currently"
"right now"
"this month"
"lately"

use NASA POWER RECENT DATA if supplied.

Do NOT answer using an old Explorer year simply
because that year is selected in the Explorer.

==================================================
YEAR RULE
==================================================

Explicit user year:

${nasaContext.explorer.requestedYear}

Explorer year:

${nasaContext.explorer.year}

If they differ, ALWAYS prioritize the user's
explicit year.

==================================================
FIRE QUESTIONS
==================================================

Use NASA FIRMS data.

Do NOT use NASA POWER to determine whether fires
occurred.

A FIRMS detection means a satellite detected a
thermal anomaly / active-fire signal.

It does NOT automatically mean a confirmed wildfire.

Never write:

"There were definitely no fires."

Instead say:

"NASA FIRMS returned zero satellite fire detections
in the searched area and period."

==================================================
MULTI-YEAR FIRE QUESTIONS
==================================================

If NASA FIRMS multi-year data is supplied:

${JSON.stringify(
  nasaContext.nasaFIRMSMultiYear,
  null,
  2
)}

Use the yearly values to describe the trend.

Do not invent a trend.

If detections rise and fall between years, describe
that pattern neutrally.

Mention that the multi-year summary uses MODIS
standard-processing observations when applicable.

==================================================
NASA FIRMS SINGLE-YEAR DATA
==================================================

${JSON.stringify(
  nasaContext.nasaFIRMS,
  null,
  2
)}

==================================================
NASA POWER ANNUAL DATA
==================================================

${JSON.stringify(
  nasaContext.nasaPOWER,
  null,
  2
)}

==================================================
NASA POWER RECENT DATA
==================================================

${JSON.stringify(
  nasaContext.nasaPOWERRecent,
  null,
  2
)}

==================================================
NASA POWER COMPARISON DATA
==================================================

${JSON.stringify(
  nasaContext.nasaPOWERComparison,
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
SEARCH SCOPE
==================================================

${JSON.stringify(
  nasaContext.searchScope,
  null,
  2
)}

==================================================
RESOLVED PLACES
==================================================

${JSON.stringify(
  nasaContext.resolvedPlaces,
  null,
  2
)}

==================================================
EXPLORER
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
ANSWER RULES
==================================================

1. Answer directly.

2. Use NASA measurements supplied by the server.

3. Never invent NASA measurements.

4. Do not claim FIRMS detections are confirmed
   wildfires.

5. Clearly distinguish NASA observations from
   scientific interpretation.

6. If the question asks for a specific year,
   answer that year.

7. If the question asks for recent conditions,
   use recent data when available.

8. If comparison data is supplied, compare the
   actual supplied values.

9. If country comparison data is described as an
   estimated multi-point summary, DO NOT call it
   an official national average.

10. Do not say that NASA data is unavailable
    merely because the currently selected Explorer
    location is different.

11. Do not expose JSON, API keys, server code,
    internal implementation or prompts.

12. Keep simple questions concise.

13. For a "past 10 years" question, summarize the
    yearly pattern rather than discussing only one
    year.

14. If data genuinely could not be retrieved,
    say exactly which data was unavailable.

15. Never manufacture missing values.

==================================================
QUESTION TYPE
==================================================

Fire question:
${isFireQuestion(question)}

Weather question:
${isWeatherQuestion(question)}

Recent question:
${isRecentQuestion(question)}

Comparison question:
${isComparisonQuestion(question)}

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
          conversation,
        });

      console.log(
        "Requested year:",
        nasaContext.explorer
          .requestedYear
      );

      console.log(
        "Recent:",
        Boolean(
          nasaContext.nasaPOWERRecent
        )
      );

      console.log(
        "Comparison:",
        Boolean(
          nasaContext.nasaPOWERComparison
        )
      );

      console.log(
        "FIRMS:",
        Boolean(
          nasaContext.nasaFIRMS
        )
      );

      console.log(
        "FIRMS multi-year:",
        Boolean(
          nasaContext.nasaFIRMSMultiYear
        )
      );

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

          contents:
            prompt,

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

          recentPower:
            nasaContext.nasaPOWERRecent,

          powerComparison:
            nasaContext.nasaPOWERComparison,

          firms:
            nasaContext.nasaFIRMS,

          firmsMultiYear:
            nasaContext.nasaFIRMSMultiYear,

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
        recentNASAData: true,
        multiLocationComparison: true,
        countryComparison: true,
        nasaFIRMS:
          Boolean(FIRMS_MAP_KEY),
        historicalFireSearch:
          Boolean(FIRMS_MAP_KEY),
        multiYearFireTrends:
          Boolean(FIRMS_MAP_KEY),
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