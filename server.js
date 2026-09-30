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
app.use(express.json({ limit: "2mb" }));

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

/* =========================================================
   CACHE
========================================================= */

const powerCache = new Map();
const firmsCache = new Map();
const geocodeCache = new Map();

const POWER_CACHE_TTL = 1000 * 60 * 60 * 6;
const FIRMS_CACHE_TTL = 1000 * 60 * 60 * 24;
const GEOCODE_CACHE_TTL = 1000 * 60 * 60 * 24 * 30;

/* =========================================================
   KNOWN LOCATIONS
========================================================= */

const KNOWN_LOCATIONS = {
  "bahir dar": {
    name: "Bahir Dar",
    country: "Ethiopia",
    region: "Amhara",
    latitude: 11.5742,
    longitude: 37.3614,
  },

  "nairobi": {
    name: "Nairobi",
    country: "Kenya",
    region: "Nairobi County",
    latitude: -1.2864,
    longitude: 36.8172,
  },

  "addis ababa": {
    name: "Addis Ababa",
    country: "Ethiopia",
    region: "Addis Ababa",
    latitude: 8.9806,
    longitude: 38.7578,
  },

  "gondar": {
    name: "Gondar",
    country: "Ethiopia",
    region: "Amhara",
    latitude: 12.603,
    longitude: 37.4521,
  },

  "hawassa": {
    name: "Hawassa",
    country: "Ethiopia",
    region: "Sidama",
    latitude: 7.0621,
    longitude: 38.4765,
  },

  "mekelle": {
    name: "Mekelle",
    country: "Ethiopia",
    region: "Tigray",
    latitude: 13.4967,
    longitude: 39.4767,
  },

  "delhi": {
    name: "Delhi",
    country: "India",
    region: "Delhi",
    latitude: 28.6139,
    longitude: 77.209,
  },

  "new delhi": {
    name: "New Delhi",
    country: "India",
    region: "Delhi",
    latitude: 28.6139,
    longitude: 77.209,
  },

  "kampala": {
    name: "Kampala",
    country: "Uganda",
    region: "Central Region",
    latitude: 0.3476,
    longitude: 32.5825,
  },

  "dar es salaam": {
    name: "Dar es Salaam",
    country: "Tanzania",
    region: "Dar es Salaam",
    latitude: -6.7924,
    longitude: 39.2083,
  },

  "cairo": {
    name: "Cairo",
    country: "Egypt",
    region: "Cairo",
    latitude: 30.0444,
    longitude: 31.2357,
  },

  "lagos": {
    name: "Lagos",
    country: "Nigeria",
    region: "Lagos",
    latitude: 6.5244,
    longitude: 3.3792,
  },

  "johannesburg": {
    name: "Johannesburg",
    country: "South Africa",
    region: "Gauteng",
    latitude: -26.2041,
    longitude: 28.0473,
  },

  "sao paulo": {
    name: "São Paulo",
    country: "Brazil",
    region: "São Paulo",
    latitude: -23.5505,
    longitude: -46.6333,
  },

  "atalaia do norte": {
    name: "Atalaia do Norte",
    country: "Brazil",
    region: "Amazonas",
    latitude: -4.373,
    longitude: -70.192,
  },
};

/* =========================================================
   COUNTRY REPRESENTATIVE LOCATIONS
========================================================= */

const COUNTRY_LOCATIONS = {
  ethiopia: {
    name: "Ethiopia",
    country: "Ethiopia",
    latitude: 9.145,
    longitude: 40.4897,
  },

  kenya: {
    name: "Kenya",
    country: "Kenya",
    latitude: -0.0236,
    longitude: 37.9062,
  },

  india: {
    name: "India",
    country: "India",
    latitude: 20.5937,
    longitude: 78.9629,
  },

  brazil: {
    name: "Brazil",
    country: "Brazil",
    latitude: -14.235,
    longitude: -51.9253,
  },

  uganda: {
    name: "Uganda",
    country: "Uganda",
    latitude: 1.3733,
    longitude: 32.2903,
  },

  tanzania: {
    name: "Tanzania",
    country: "Tanzania",
    latitude: -6.369,
    longitude: 34.8888,
  },

  nigeria: {
    name: "Nigeria",
    country: "Nigeria",
    latitude: 9.082,
    longitude: 8.6753,
  },

  egypt: {
    name: "Egypt",
    country: "Egypt",
    latitude: 26.8206,
    longitude: 30.8025,
  },

  "south africa": {
    name: "South Africa",
    country: "South Africa",
    latitude: -30.5595,
    longitude: 22.9375,
  },
};

/* =========================================================
   HELPERS
========================================================= */

function isNumber(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function round(value, decimals = 2) {
  if (!isNumber(value)) {
    return null;
  }

  return Number(value.toFixed(decimals));
}

function average(values) {
  const valid = values.filter(isNumber);

  if (!valid.length) {
    return null;
  }

  return (
    valid.reduce(
      (total, value) => total + value,
      0
    ) / valid.length
  );
}

function sum(values) {
  const valid = values.filter(isNumber);

  if (!valid.length) {
    return null;
  }

  return valid.reduce(
    (total, value) => total + value,
    0
  );
}

function correlation(xValues, yValues) {
  const pairs = [];

  for (let i = 0; i < xValues.length; i++) {
    if (
      isNumber(xValues[i]) &&
      isNumber(yValues[i])
    ) {
      pairs.push([
        xValues[i],
        yValues[i],
      ]);
    }
  }

  if (pairs.length < 3) {
    return null;
  }

  const xMean = average(
    pairs.map(pair => pair[0])
  );

  const yMean = average(
    pairs.map(pair => pair[1])
  );

  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;

  for (const [x, y] of pairs) {
    const dx = x - xMean;
    const dy = y - yMean;

    numerator += dx * dy;
    xVariance += dx * dx;
    yVariance += dy * dy;
  }

  if (
    xVariance === 0 ||
    yVariance === 0
  ) {
    return null;
  }

  return round(
    numerator /
      Math.sqrt(
        xVariance * yVariance
      ),
    3
  );
}

function percentChange(oldValue, newValue) {
  if (
    !isNumber(oldValue) ||
    !isNumber(newValue) ||
    oldValue === 0
  ) {
    return null;
  }

  return round(
    ((newValue - oldValue) /
      Math.abs(oldValue)) *
      100,
    2
  );
}

/* =========================================================
   CACHE HELPERS
========================================================= */

function getCache(cache, key, ttl) {
  const item = cache.get(key);

  if (!item) {
    return null;
  }

  if (
    Date.now() - item.timestamp >
    ttl
  ) {
    cache.delete(key);
    return null;
  }

  return item.value;
}

function setCache(cache, key, value) {
  cache.set(key, {
    timestamp: Date.now(),
    value,
  });
}

/* =========================================================
   YEAR EXTRACTION
========================================================= */

function extractYears(question) {
  const matches =
    question.match(
      /\b(?:19|20)\d{2}\b/g
    ) || [];

  return [
    ...new Set(
      matches.map(Number)
    ),
  ].filter(
    year =>
      year >= 1981 &&
      year <=
        new Date().getFullYear()
  );
}

function extractYearRange(question) {
  const years = extractYears(question);

  if (years.length < 2) {
    return null;
  }

  const start = Math.min(...years);
  const end = Math.max(...years);

  const fullRange = [];

  for (
    let year = start;
    year <= end;
    year++
  ) {
    fullRange.push(year);
  }

  return {
    start,
    end,
    years: fullRange,
  };
}

/* =========================================================
   QUESTION CLASSIFICATION
========================================================= */

function isFireQuestion(question) {
  return /\b(fire|fires|wildfire|wildfires|hotspot|hotspots|active fire|thermal anomaly|thermal anomalies|thermal detection|thermal detections|FIRMS|FRP|fire radiative power|burning|burned)\b/i.test(
    question
  );
}

function isClimateQuestion(question) {
  return /\b(temperature|rainfall|precipitation|humidity|wind|climate|weather|wet|dry|drought|heat|solar|radiation)\b/i.test(
    question
  );
}

function isComparisonQuestion(question) {
  return /\b(compare|comparison|versus|vs|between|difference|higher|lower|more|less|greatest|highest|lowest|change|changed|trend|relationship|correlated|correlation)\b/i.test(
    question
  );
}

/* =========================================================
   LOCATION DETECTION
========================================================= */

function findKnownLocations(question) {
  const lower =
    question.toLowerCase();

  const found = [];

  for (const [
    key,
    location,
  ] of Object.entries(
    KNOWN_LOCATIONS
  )) {
    if (
      lower.includes(key)
    ) {
      found.push({
        ...location,
        matchedText: key,
      });
    }
  }

  return found;
}

function findKnownCountries(question) {
  const lower =
    question.toLowerCase();

  const found = [];

  for (const [
    key,
    location,
  ] of Object.entries(
    COUNTRY_LOCATIONS
  )) {
    if (
      lower.includes(key)
    ) {
      found.push(location);
    }
  }

  return found;
}

/* =========================================================
   GEOCODING
========================================================= */

async function geocodeLocation(
  locationText
) {
  const cacheKey =
    locationText
      .toLowerCase()
      .trim();

  const cached = getCache(
    geocodeCache,
    cacheKey,
    GEOCODE_CACHE_TTL
  );

  if (cached) {
    return cached;
  }

  if (
    KNOWN_LOCATIONS[
      cacheKey
    ]
  ) {
    const result =
      KNOWN_LOCATIONS[
        cacheKey
      ];

    setCache(
      geocodeCache,
      cacheKey,
      result
    );

    return result;
  }

  try {
    const url =
      "https://nominatim.openstreetmap.org/search" +
      "?format=jsonv2" +
      "&limit=1" +
      `&q=${encodeURIComponent(
        locationText
      )}`;

    const response =
      await fetch(url, {
        headers: {
          "User-Agent":
            "TIME-EARTH/1.0",
        },
      });

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    if (!Array.isArray(data)) {
      return null;
    }

    if (!data.length) {
      return null;
    }

    const item = data[0];

    const result = {
      name:
        item.display_name
          ?.split(",")[0] ||
        locationText,

      country:
        item.address?.country ||
        "",

      region:
        item.address?.state ||
        item.address?.region ||
        "",

      latitude:
        Number(item.lat),

      longitude:
        Number(item.lon),
    };

    if (
      !isNumber(
        result.latitude
      ) ||
      !isNumber(
        result.longitude
      )
    ) {
      return null;
    }

    setCache(
      geocodeCache,
      cacheKey,
      result
    );

    return result;
  } catch (error) {
    console.error(
      "Geocoding error:",
      error.message
    );

    return null;
  }
}

/* =========================================================
   DETERMINE YEARS
========================================================= */

function determineYears(
  question,
  explorerYear
) {
  const range =
    extractYearRange(
      question
    );

  if (range) {
    return range.years;
  }

  const explicit =
    extractYears(
      question
    );

  if (explicit.length) {
    return explicit;
  }

  const lower =
    question.toLowerCase();

  const currentYear =
    Number(explorerYear) ||
    new Date().getFullYear();

  if (
    lower.includes(
      "past 10 years"
    ) ||
    lower.includes(
      "last 10 years"
    ) ||
    lower.includes(
      "previous 10 years"
    )
  ) {
    const years = [];

    for (
      let i = 9;
      i >= 0;
      i--
    ) {
      years.push(
        currentYear - i
      );
    }

    return years;
  }

  if (
    lower.includes(
      "past five years"
    ) ||
    lower.includes(
      "past 5 years"
    ) ||
    lower.includes(
      "last five years"
    ) ||
    lower.includes(
      "last 5 years"
    )
  ) {
    const years = [];

    for (
      let i = 4;
      i >= 0;
      i--
    ) {
      years.push(
        currentYear - i
      );
    }

    return years;
  }

  return [currentYear];
}

/* =========================================================
   NASA POWER
========================================================= */

async function getNASAPowerData(
  latitude,
  longitude,
  startYear,
  endYear
) {
  const key = [
    round(latitude, 4),
    round(longitude, 4),
    startYear,
    endYear,
  ].join(":");

  const cached =
    getCache(
      powerCache,
      key,
      POWER_CACHE_TTL
    );

  if (cached) {
    return cached;
  }

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
    "https://power.larc.nasa.gov/api/temporal/daily/point" +
    `?parameters=${parameters}` +
    "&community=AG" +
    `&longitude=${longitude}` +
    `&latitude=${latitude}` +
    `&start=${startYear}0101` +
    `&end=${endYear}1231` +
    "&format=JSON";

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `NASA POWER request failed: ${response.status}`
    );
  }

  const data =
    await response.json();

  const result =
    summarizePowerData(
      data
    );

  setCache(
    powerCache,
    key,
    result
  );

  return result;
}

/* =========================================================
   SUMMARIZE NASA POWER
========================================================= */

function summarizePowerData(
  data
) {
  const parameters =
    data?.properties?.parameter;

  if (!parameters) {
    throw new Error(
      "NASA POWER returned no parameter data."
    );
  }

  const dates = Object.keys(
    parameters.T2M || {}
  );

  const yearly = {};

  for (const date of dates) {
    const year =
      Number(
        date.substring(0, 4)
      );

    if (!yearly[year]) {
      yearly[year] = {
        temperature: [],
        maximumTemperature: [],
        minimumTemperature: [],
        precipitation: [],
        humidity: [],
        wind: [],
        solar: [],
      };
    }

    const row =
      yearly[year];

    const values = {
      temperature:
        Number(
          parameters.T2M?.[date]
        ),

      maximumTemperature:
        Number(
          parameters.T2M_MAX?.[date]
        ),

      minimumTemperature:
        Number(
          parameters.T2M_MIN?.[date]
        ),

      precipitation:
        Number(
          parameters.PRECTOTCORR?.[date]
        ),

      humidity:
        Number(
          parameters.RH2M?.[date]
        ),

      wind:
        Number(
          parameters.WS2M?.[date]
        ),

      solar:
        Number(
          parameters.ALLSKY_SFC_SW_DWN?.[
            date
          ]
        ),
    };

    for (const [
      key,
      value,
    ] of Object.entries(
      values
    )) {
      if (isNumber(value)) {
        row[key].push(value);
      }
    }
  }

  const annual = {};

  for (const [
    year,
    values,
  ] of Object.entries(
    yearly
  )) {
    const avgMax =
      average(
        values.maximumTemperature
      );

    const avgMin =
      average(
        values.minimumTemperature
      );

    annual[year] = {
      year: Number(year),

      averageTemperatureC:
        round(
          average(
            values.temperature
          )
        ),

      averageMaximumTemperatureC:
        round(avgMax),

      averageMinimumTemperatureC:
        round(avgMin),

      diurnalTemperatureRangeC:
        isNumber(avgMax) &&
        isNumber(avgMin)
          ? round(
              avgMax - avgMin
            )
          : null,

      totalPrecipitationMm:
        round(
          sum(
            values.precipitation
          )
        ),

      averageRelativeHumidityPercent:
        round(
          average(
            values.humidity
          )
        ),

      averageWindSpeedMs:
        round(
          average(
            values.wind
          )
        ),

      averageSolarRadiation:
        round(
          average(
            values.solar
          )
        ),
    };
  }

  return {
    source: "NASA POWER",
    dataset:
      "Daily Point Data",
    annual,
  };
}

/* =========================================================
   POWER ANALYSIS
========================================================= */

function analyzePower(
  power
) {
  const rows =
    Object.values(
      power?.annual || {}
    ).sort(
      (a, b) =>
        a.year - b.year
    );

  if (!rows.length) {
    return {
      annualRows: [],
    };
  }

  const precipitationRows =
    rows.filter(
      row =>
        isNumber(
          row.totalPrecipitationMm
        )
    );

  const temperatureRows =
    rows.filter(
      row =>
        isNumber(
          row.averageTemperatureC
        )
    );

  const highestPrecipitation =
    precipitationRows.length
      ? precipitationRows.reduce(
          (a, b) =>
            b.totalPrecipitationMm >
            a.totalPrecipitationMm
              ? b
              : a
        )
      : null;

  const lowestPrecipitation =
    precipitationRows.length
      ? precipitationRows.reduce(
          (a, b) =>
            b.totalPrecipitationMm <
            a.totalPrecipitationMm
              ? b
              : a
        )
      : null;

  const hottestYear =
    temperatureRows.length
      ? temperatureRows.reduce(
          (a, b) =>
            b.averageTemperatureC >
            a.averageTemperatureC
              ? b
              : a
        )
      : null;

  const coolestYear =
    temperatureRows.length
      ? temperatureRows.reduce(
          (a, b) =>
            b.averageTemperatureC <
            a.averageTemperatureC
              ? b
              : a
        )
      : null;

  return {
    yearsAvailable:
      rows.map(
        row => row.year
      ),

    highestPrecipitationYear:
      highestPrecipitation,

    lowestPrecipitationYear:
      lowestPrecipitation,

    precipitationDifferenceMm:
      highestPrecipitation &&
      lowestPrecipitation
        ? round(
            highestPrecipitation.totalPrecipitationMm -
              lowestPrecipitation.totalPrecipitationMm
          )
        : null,

    precipitationPercentDifference:
      highestPrecipitation &&
      lowestPrecipitation
        ? percentChange(
            lowestPrecipitation.totalPrecipitationMm,
            highestPrecipitation.totalPrecipitationMm
          )
        : null,

    hottestYear,

    coolestYear,

    precipitationTemperatureCorrelation:
      correlation(
        rows.map(
          row =>
            row.totalPrecipitationMm
        ),
        rows.map(
          row =>
            row.averageTemperatureC
        )
      ),

    annualRows:
      rows,
  };
}

/* =========================================================
   FIRMS DATE HELPERS
========================================================= */

function formatDate(date) {
  return date
    .toISOString()
    .slice(0, 10);
}

function addDays(
  date,
  days
) {
  const result =
    new Date(date);

  result.setUTCDate(
    result.getUTCDate() +
      days
  );

  return result;
}

/* =========================================================
   FIRMS CSV
========================================================= */

function splitCSVLine(line) {
  const output = [];

  let current = "";
  let inQuotes = false;

  for (
    let i = 0;
    i < line.length;
    i++
  ) {
    const character =
      line[i];

    if (
      character === '"'
    ) {
      if (
        inQuotes &&
        line[i + 1] === '"'
      ) {
        current += '"';
        i++;
      } else {
        inQuotes =
          !inQuotes;
      }
    } else if (
      character === "," &&
      !inQuotes
    ) {
      output.push(
        current
      );

      current = "";
    } else {
      current +=
        character;
    }
  }

  output.push(current);

  return output;
}

function parseCSV(text) {
  const clean =
    text.trim();

  if (!clean) {
    return [];
  }

  const lines =
    clean.split(/\r?\n/);

  if (!lines.length) {
    return [];
  }

  const headers =
    splitCSVLine(
      lines[0]
    ).map(
      header =>
        header
          .trim()
          .replace(
            /^"|"$/g,
            ""
          )
    );

  const rows = [];

  for (
    let i = 1;
    i < lines.length;
    i++
  ) {
    if (!lines[i].trim()) {
      continue;
    }

    const values =
      splitCSVLine(
        lines[i]
      );

    const row = {};

    headers.forEach(
      (
        header,
        index
      ) => {
        row[header] =
          values[index]
            ?.trim()
            .replace(
              /^"|"$/g,
              "");
      }
    );

    rows.push(row);
  }

  return rows;
}

/* =========================================================
   FIRMS SOURCES
========================================================= */

function getFirmsSources(
  year
) {
  const sources = [
    "MODIS_SP",
  ];

  if (year >= 2012) {
    sources.push(
      "VIIRS_SNPP_SP"
    );
  }

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

  return sources;
}

/* =========================================================
   LOCAL FIRMS BOUNDING BOX
========================================================= */

function createLocalBox(
  latitude,
  longitude
) {
  const radius = 1;

  return {
    south: Math.max(
      -90,
      latitude - radius
    ),

    north: Math.min(
      90,
      latitude + radius
    ),

    west: Math.max(
      -180,
      longitude - radius
    ),

    east: Math.min(
      180,
      longitude + radius
    ),
  };
}

/* =========================================================
   FIRMS REQUEST
========================================================= */

async function getFirmsChunk(
  source,
  box,
  date,
  days
) {
  if (!FIRMS_MAP_KEY) {
    throw new Error(
      "FIRMS_MAP_KEY is missing from Render environment variables."
    );
  }

  const area = [
    box.west,
    box.south,
    box.east,
    box.north,
  ].join(",");

  const url =
    "https://firms.modaps.eosdis.nasa.gov/api/area/csv/" +
    `${FIRMS_MAP_KEY}/` +
    `${source}/` +
    `${area}/` +
    `${days}/` +
    `${date}`;

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `NASA FIRMS returned HTTP ${response.status}`
    );
  }

  const text =
    await response.text();

  if (
    text
      .toLowerCase()
      .startsWith("error")
  ) {
    throw new Error(
      `NASA FIRMS error: ${text.slice(
        0,
        500
      )}`
    );
  }

  return parseCSV(text);
}

/* =========================================================
   FIRMS ONE YEAR
========================================================= */

async function getFirmsYear(
  box,
  year
) {
  const key = [
    box.south,
    box.north,
    box.west,
    box.east,
    year,
  ].join(":");

  const cached =
    getCache(
      firmsCache,
      key,
      FIRMS_CACHE_TTL
    );

  if (cached) {
    return cached;
  }

  const sources =
    getFirmsSources(
      year
    );

  const allRecords = [];

  for (
    const source of sources
  ) {
    let current =
      new Date(
        Date.UTC(
          year,
          0,
          1
        )
      );

    const end =
      new Date(
        Date.UTC(
          year + 1,
          0,
          1
        )
      );

    while (
      current < end
    ) {
      const remaining =
        Math.ceil(
          (
            end -
            current
          ) /
            86400000
        );

      const days =
        Math.min(
          5,
          remaining
        );

      try {
        const records =
          await getFirmsChunk(
            source,
            box,
            formatDate(
              current
            ),
            days
          );

        for (
          const record of records
        ) {
          allRecords.push({
            ...record,
            _source:
              source,
          });
        }
      } catch (error) {
        console.error(
          `FIRMS ${source} ${formatDate(
            current
          )}:`,
          error.message
        );
      }

      current =
        addDays(
          current,
          days
        );
    }
  }

  const summary =
    summarizeFirms(
      allRecords,
      year
    );

  setCache(
    firmsCache,
    key,
    summary
  );

  return summary;
}

/* =========================================================
   FIRMS MULTI-YEAR
========================================================= */

async function getFirmsMultiYear(
  box,
  startYear,
  endYear
) {
  const years = {};

  for (
    let year = startYear;
    year <= endYear;
    year++
  ) {
    years[year] =
      await getFirmsYear(
        box,
        year
      );
  }

  return {
    source:
      "NASA FIRMS",

    scope: {
      south: box.south,
      north: box.north,
      west: box.west,
      east: box.east,
    },

    years,
  };
}

/* =========================================================
   FIRMS SUMMARY
========================================================= */

function summarizeFirms(
  records,
  year
) {
  const monthly = {};

  for (
    let month = 1;
    month <= 12;
    month++
  ) {
    monthly[month] = 0;
  }

  const sensors = {};

  let day = 0;
  let night = 0;
  let unknown = 0;

  const frpValues = [];

  for (
    const record of records
  ) {
    const date =
      record.acq_date;

    if (date) {
      const month =
        Number(
          date.slice(5, 7)
        );

      if (
        month >= 1 &&
        month <= 12
      ) {
        monthly[month]++;
      }
    }

    const source =
      record._source ||
      "unknown";

    sensors[source] =
      (sensors[source] || 0) +
      1;

    const timing =
      String(
        record.daynight ||
          ""
      ).toUpperCase();

    if (timing === "D") {
      day++;
    } else if (
      timing === "N"
    ) {
      night++;
    } else {
      unknown++;
    }

    const frp =
      Number(record.frp);

    if (
      Number.isFinite(frp)
    ) {
      frpValues.push(frp);
    }
  }

  const total =
    records.length;

  const activeMonths =
    Object.entries(
      monthly
    )
      .map(
        ([
          month,
          count,
        ]) => ({
          month: Number(month),
          count,
        })
      )
      .sort(
        (a, b) =>
          b.count -
          a.count
      );

  return {
    year,

    totalDetections:
      total,

    daytimeDetections:
      day,

    nighttimeDetections:
      night,

    unknownTimingDetections:
      unknown,

    nighttimePercentage:
      total > 0
        ? round(
            (night /
              total) *
              100
          )
        : null,

    maximumFRPMW:
      frpValues.length
        ? round(
            Math.max(
              ...frpValues
            )
          )
        : null,

    averageFRPMW:
      frpValues.length
        ? round(
            average(
              frpValues
            )
          )
        : null,

    monthlyDetections:
      monthly,

    mostActiveMonths:
      activeMonths.slice(
        0,
        3
      ),

    sensorDetections:
      sensors,

    importantWarning:
      "NASA FIRMS detections are satellite-detected thermal anomalies or active-fire observations. They are not automatically confirmed wildfires.",
  };
}

/* =========================================================
   FIRMS ANALYSIS
========================================================= */

function analyzeFirms(
  firms
) {
  const rows =
    Object.values(
      firms?.years || {}
    ).sort(
      (a, b) =>
        a.year - b.year
    );

  if (!rows.length) {
    return null;
  }

  const highest =
    rows.reduce(
      (a, b) =>
        b.totalDetections >
        a.totalDetections
          ? b
          : a
    );

  const lowest =
    rows.reduce(
      (a, b) =>
        b.totalDetections <
        a.totalDetections
          ? b
          : a
    );

  const total =
    rows.reduce(
      (sumValue, row) =>
        sumValue +
        row.totalDetections,
      0
    );

  const night =
    rows.reduce(
      (sumValue, row) =>
        sumValue +
        row.nighttimeDetections,
      0
    );

  const monthlyTotals = {};

  for (
    let month = 1;
    month <= 12;
    month++
  ) {
    monthlyTotals[month] = 0;
  }

  for (
    const row of rows
  ) {
    for (
      const [
        month,
        count,
      ] of Object.entries(
        row.monthlyDetections
      )
    ) {
      monthlyTotals[
        month
      ] += count;
    }
  }

  const months =
    Object.entries(
      monthlyTotals
    )
      .map(
        ([
          month,
          count,
        ]) => ({
          month: Number(month),
          count,
        })
      )
      .sort(
        (a, b) =>
          b.count -
          a.count
      );

  const sensors = {};

  for (
    const row of rows
  ) {
    for (
      const [
        sensor,
        count,
      ] of Object.entries(
        row.sensorDetections
      )
    ) {
      sensors[sensor] =
        (sensors[sensor] || 0) +
        count;
    }
  }

  return {
    annualRows:
      rows,

    highestDetectionYear:
      highest,

    lowestDetectionYear:
      lowest,

    totalDetections:
      total,

    nighttimePercentage:
      total > 0
        ? round(
            (night /
              total) *
              100
          )
        : null,

    mostActiveMonths:
      months.slice(
        0,
        5
      ),

    sensorTotals:
      sensors,

    firstYear:
      rows[0].year,

    lastYear:
      rows[
        rows.length - 1
      ].year,
  };
}

/* =========================================================
   COMBINE FIRE + WEATHER
========================================================= */

function combineData(
  power,
  firms
) {
  const rows = [];

  const fireYears =
    Object.keys(
      firms?.years || {}
    );

  for (
    const year of fireYears
  ) {
    const weather =
      power?.annual?.[
        year
      ];

    const fire =
      firms.years[
        year
      ];

    if (!weather) {
      continue;
    }

    rows.push({
      year: Number(year),

      averageTemperatureC:
        weather.averageTemperatureC,

      precipitationMm:
        weather.totalPrecipitationMm,

      humidityPercent:
        weather.averageRelativeHumidityPercent,

      windSpeedMs:
        weather.averageWindSpeedMs,

      fireDetections:
        fire.totalDetections,

      maximumFRPMW:
        fire.maximumFRPMW,
    });
  }

  return {
    rows,

    precipitationFireCorrelation:
      correlation(
        rows.map(
          row =>
            row.precipitationMm
        ),
        rows.map(
          row =>
            row.fireDetections
        )
      ),

    temperatureFireCorrelation:
      correlation(
        rows.map(
          row =>
            row.averageTemperatureC
        ),
        rows.map(
          row =>
            row.fireDetections
        )
      ),

    humidityFireCorrelation:
      correlation(
        rows.map(
          row =>
            row.humidityPercent
        ),
        rows.map(
          row =>
            row.fireDetections
        )
      ),
  };
}

/* =========================================================
   CONVERSATION CONTEXT
========================================================= */

function buildConversationContext(
  conversation
) {
  if (
    !Array.isArray(
      conversation
    ) ||
    !conversation.length
  ) {
    return "No previous conversation.";
  }

  return conversation
    .slice(-12)
    .map(message => {
      const role =
        message.role ===
        "assistant"
          ? "Assistant"
          : "User";

      return (
        role +
        ": " +
        String(
          message.content || ""
        )
      );
    })
    .join("\n");
}

/* =========================================================
   DATA COLLECTION
========================================================= */

async function collectNASAData({
  question,
  location,
  explorer,
}) {
  const explorerYear =
    Number(
      explorer?.year
    ) ||
    new Date().getFullYear();

  const years =
    determineYears(
      question,
      explorerYear
    );

  /*
    Prevent accidental enormous requests.
  */

  const safeYears =
    years
      .filter(
        year =>
          year >= 1981 &&
          year <=
            new Date().getFullYear()
      )
      .slice(
        0,
        12
      );

  const startYear =
    Math.min(
      ...safeYears
    );

  const endYear =
    Math.max(
      ...safeYears
    );

  const result = {
    request: {
      question,
      years:
        safeYears,
      startYear,
      endYear,
    },

    locations: {},

    countries: {},

    fire: {},

    analysis: {},

    notes: [],
  };

  /* =======================================================
     FIND LOCATIONS IN QUESTION
  ======================================================= */

  let locations =
    findKnownLocations(
      question
    );

  /*
    If the question doesn't contain a known
    location, use the Explorer's location.
  */

  if (
    !locations.length &&
    location &&
    isNumber(
      Number(
        location.latitude
      )
    ) &&
    isNumber(
      Number(
        location.longitude
      )
    )
  ) {
    locations = [
      {
        name:
          location.name ||
          "Selected location",

        country:
          location.country ||
          "",

        region:
          location.region ||
          "",

        latitude:
          Number(
            location.latitude
          ),

        longitude:
          Number(
            location.longitude
          ),
      },
    ];
  }

  /* =======================================================
     GEOCODE SIMPLE UNKNOWN PLACE
  ======================================================= */

  if (
    !locations.length
  ) {
    const locationMatch =
      question.match(
        /\b(?:in|at|around|near|for)\s+([A-Z][A-Za-zÀ-ÿ]+(?:\s+[A-Z][A-Za-zÀ-ÿ]+){0,3})/
      );

    if (locationMatch) {
      const possible =
        await geocodeLocation(
          locationMatch[1]
        );

      if (possible) {
        locations = [
          possible,
        ];
      }
    }
  }

  /* =======================================================
     POWER FOR EACH LOCATION
  ======================================================= */

  for (
    const place of locations
  ) {
    const power =
      await getNASAPowerData(
        place.latitude,
        place.longitude,
        startYear,
        endYear
      );

    const analysis =
      analyzePower(
        power
      );

    result.locations[
      place.name
    ] = {
      metadata:
        place,

      power,

      analysis,
    };
  }

  /* =======================================================
     COUNTRY DETECTION
  ======================================================= */

  const countries =
    findKnownCountries(
      question
    );

  for (
    const country of countries
  ) {
    /*
      NASA POWER point data is used here at the
      representative country coordinate.

      We explicitly label this as a representative
      point estimate rather than pretending it is
      an exact country-wide average.
    */

    const power =
      await getNASAPowerData(
        country.latitude,
        country.longitude,
        startYear,
        endYear
      );

    result.countries[
      country.name
    ] = {
      metadata: {
        ...country,

        method:
          "Representative coordinate estimate, not a country-wide spatial average.",
      },

      power,

      analysis:
        analyzePower(
          power
        ),
    };
  }

  /* =======================================================
     FIRE DATA
  ======================================================= */

  if (
    isFireQuestion(
      question
    )
  ) {
    for (
      const place of locations
    ) {
      const box =
        createLocalBox(
          place.latitude,
          place.longitude
        );

      const firms =
        await getFirmsMultiYear(
          box,
          startYear,
          endYear
        );

      result.fire[
        place.name
      ] = {
        metadata: {
          location:
            place,

          searchArea:
            box,

          method:
            "Local bounding box approximately 2° × 2° around the selected location.",
        },

        firms,

        analysis:
          analyzeFirms(
            firms
          ),
      };

      result.analysis[
        place.name
      ] = {
        weatherFire:
          combineData(
            result.locations[
              place.name
            ]?.power,

            firms
          ),
      };
    }
  }

  /*
    If the user asks about two countries and fires,
    retrieve FIRMS around their representative
    coordinates.
  */

  if (
    isFireQuestion(
      question
    ) &&
    countries.length
  ) {
    for (
      const country of countries
    ) {
      const box =
        createLocalBox(
          country.latitude,
          country.longitude
        );

      const firms =
        await getFirmsMultiYear(
          box,
          startYear,
          endYear
        );

      result.fire[
        country.name
      ] = {
        metadata: {
          location:
            country,

          searchArea:
            box,

          method:
            "Representative local area around the country coordinate; not a complete country-wide fire inventory.",
        },

        firms,

        analysis:
          analyzeFirms(
            firms
          ),
      };
    }
  }

  /* =======================================================
     COMPARISON STATISTICS
  ======================================================= */

  const locationNames =
    Object.keys(
      result.locations
    );

  if (
    locationNames.length >= 2
  ) {
    result.analysis.locationComparison =
      locationNames.map(
        name => ({
          location:
            name,

          annual:
            result.locations[
              name
            ].power.annual,

          analysis:
            result.locations[
              name
            ].analysis,
        })
      );
  }

  const countryNames =
    Object.keys(
      result.countries
    );

  if (
    countryNames.length >= 2
  ) {
    result.analysis.countryComparison =
      countryNames.map(
        name => ({
          country:
            name,

          annual:
            result.countries[
              name
            ].power.annual,

          analysis:
            result.countries[
              name
            ].analysis,
        })
      );
  }

  return result;
}

/* =========================================================
   GEMINI PROMPT
========================================================= */

function buildPrompt({
  question,
  nasaData,
  conversation,
  explorer,
}) {
  return `
You are TIME EARTH's NASA Earth Intelligence AI.

Your purpose is to help users understand real
NASA Earth observation and environmental data.

==================================================
MOST IMPORTANT RULE
==================================================

The backend has already retrieved NASA data
specifically for this question.

USE THAT DATA.

Do NOT claim that a year, location, measurement,
or sensor is unavailable if it exists anywhere
inside the supplied NASA DATA section.

Never invent NASA measurements.

==================================================
NASA POWER
==================================================

NASA POWER can provide:

- average temperature
- average maximum temperature
- average minimum temperature
- diurnal temperature range
- precipitation
- relative humidity
- wind speed
- solar radiation

For year comparisons:

Actually compare the requested years.

Calculate or use:

absolute difference

percentage change

direction of change

highest year

lowest year

If multiple years are available, inspect the
whole series before answering a highest/lowest
question.

For "unusually wet" or "unusually dry", compare
the requested year against the surrounding or
reference years supplied.

==================================================
NASA FIRMS
==================================================

FIRMS provides satellite observations of active
fires / thermal anomalies.

IMPORTANT:

A FIRMS detection is NOT automatically a
confirmed wildfire.

Never write:

"There were exactly 1,500 wildfires."

Instead write:

"FIRMS recorded 1,500 satellite-detected
thermal anomalies/active-fire detections."

FIRMS analysis can include:

- annual detections
- monthly detections
- day/night detections
- nighttime percentage
- sensor detections
- MODIS
- VIIRS
- maximum FRP
- average FRP

==================================================
MODIS VS VIIRS
==================================================

When comparing MODIS and VIIRS:

Use the actual supplied counts.

Explain that differences can result from:

- spatial resolution
- sensor characteristics
- orbital overpass timing
- detection algorithms
- detection thresholds
- cloud conditions
- fire size
- fire duration

Do not automatically interpret a higher count
as more real fires.

==================================================
LOCATION RULES
==================================================

If the user explicitly asks about:

"Bahir Dar and Nairobi"

compare Bahir Dar and Nairobi.

Do not silently answer about the Explorer's
current location instead.

If the user asks about:

"Ethiopia and Kenya"

use the supplied Ethiopia and Kenya data.

IMPORTANT:

Country values may be based on representative
coordinates.

If so, explicitly say that they are representative
point estimates and NOT exact country-wide averages.

==================================================
TIME RULES
==================================================

If the user asks:

2015 and 2019

compare 2015 and 2019.

If the user asks:

2015–2024

analyze the entire period.

If the user asks:

past 10 years

use the ten years supplied by the backend.

If the user asks:

surrounding five years

compare the requested year with the appropriate
nearby years present in the supplied data.

For follow-up questions such as:

"What about 2022?"

preserve the previous location/context and
switch to 2022.

==================================================
CORRELATION VS CAUSATION
==================================================

Never say:

"Lower rainfall caused more fires"

merely because the data has a negative
correlation.

Instead say:

"The data shows an association/correlation,
but this alone does not establish causation."

Mention other possible influences when useful:

- land management
- agriculture
- vegetation
- human activity
- drought
- temperature
- wind
- fuel availability
- detection conditions

==================================================
NASA OBSERVATION VS INTERPRETATION
==================================================

Clearly separate:

NASA OBSERVATION

from

SCIENTIFIC INTERPRETATION

from

LIMITATIONS.

Example:

NASA observation:
NASA POWER recorded 621 mm of precipitation.

Interpretation:
Lower precipitation can contribute to drier
vegetation.

Limitation:
That alone does not prove that rainfall caused
fire activity.

==================================================
ANSWER QUALITY
==================================================

For simple questions:

Answer directly.

For comparisons:

Use a compact table when useful.

For multi-year questions:

1. Direct answer
2. NASA observations
3. Calculated comparison
4. Scientific interpretation
5. Limitations

For fire questions:

Always distinguish satellite detections from
confirmed wildfires.

Do not overwhelm the user with raw JSON.

Use units.

Round numbers sensibly.

==================================================
CURRENT EXPLORER CONTEXT
==================================================

${JSON.stringify(
  explorer || {},
  null,
  2
)}

==================================================
PREVIOUS CONVERSATION
==================================================

${conversation}

==================================================
NASA DATA RETRIEVED BY THE BACKEND
==================================================

${JSON.stringify(
  nasaData,
  null,
  2
)}

==================================================
USER QUESTION
==================================================

${question}
`;
}

/* =========================================================
   NASA AI ENDPOINT
========================================================= */

app.post(
  "/api/nasa/ask",
  async (req, res) => {
    const startTime =
      Date.now();

    try {
      const {
        question,
        location,
        explorer,
        conversation = [],
      } = req.body;

      if (
        !question ||
        !question.trim()
      ) {
        return res.status(400).json({
          error:
            "Please provide a question.",
        });
      }

      console.log(
        "----------------------------------------"
      );

      console.log(
        "TIME EARTH NASA AI"
      );

      console.log(
        "Question:",
        question
      );

      console.log(
        "----------------------------------------"
      );

      /* -----------------------------------------
         GET NASA DATA
      ----------------------------------------- */

      const nasaData =
        await collectNASAData({
          question:
            question.trim(),

          location,

          explorer,
        });

      /* -----------------------------------------
         BUILD PROMPT
      ----------------------------------------- */

      const prompt =
        buildPrompt({
          question:
            question.trim(),

          nasaData,

          conversation:
            buildConversationContext(
              conversation
            ),

          explorer,
        });

      /* -----------------------------------------
         GEMINI
      ----------------------------------------- */

      const response =
        await ai.models.generateContent(
          {
            model:
              GEMINI_MODEL,

            contents:
              prompt,

            config: {
              tools: [
                {
                  google_search: {},
                },
              ],

              maxOutputTokens:
                3000,
            },
          }
        );

      const answer =
        response.text ||
        "I could not generate an answer.";

      const processingTime =
        Date.now() -
        startTime;

      console.log(
        `Completed in ${processingTime} ms`
      );

      res.json({
        answer,

        meta: {
          model:
            GEMINI_MODEL,

          processingTimeMs:
            processingTime,

          questionType: {
            fire:
              isFireQuestion(
                question
              ),

            climate:
              isClimateQuestion(
                question
              ),

            comparison:
              isComparisonQuestion(
                question
              ),
          },
        },

        nasa: nasaData,
      });
    } catch (error) {
      console.error(
        "NASA AI ERROR:",
        error
      );

      res.status(500).json({
        error:
          "NASA AI could not answer the question.",

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
        GEMINI_API_KEY
          ? "READY"
          : "MISSING",

      firms:
        FIRMS_MAP_KEY
          ? "READY"
          : "MISSING",

      model:
        GEMINI_MODEL,

      capabilities: [
        "NASA POWER multi-year analysis",
        "NASA POWER location comparison",
        "NASA POWER climate analysis",
        "NASA FIRMS historical fire analysis",
        "annual fire analysis",
        "monthly fire analysis",
        "day/night analysis",
        "MODIS vs VIIRS",
        "FRP analysis",
        "fire-weather correlation",
        "conversation-aware questions",
      ],
    });
  }
);

/* =========================================================
   STATUS
========================================================= */

app.get(
  "/api/nasa/status",
  (req, res) => {
    res.json({
      nasaPOWER:
        "READY",

      nasaFIRMS:
        FIRMS_MAP_KEY
          ? "READY"
          : "MISSING MAP KEY",

      gemini:
        GEMINI_API_KEY
          ? "READY"
          : "MISSING API KEY",

      model:
        GEMINI_MODEL,

      cache: {
        power:
          powerCache.size,

        firms:
          firmsCache.size,

        geocoding:
          geocodeCache.size,
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
      `Port: ${PORT}`
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
      `Model: ${GEMINI_MODEL}`
    );

    console.log(
      "========================================"
    );
  }
);