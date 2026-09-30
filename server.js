import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FIRMS_MAP_KEY = process.env.FIRMS_MAP_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

if (!GEMINI_API_KEY) {
  throw new Error(
    "GEMINI_API_KEY is missing from .env"
  );
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

app.use(cors());

app.use(
  express.json({
    limit: "2mb",
  })
);

/* =========================================================
   CACHE
========================================================= */

const cache = new Map();

function getCache(key, ttl = 3600000) {
  const item = cache.get(key);

  if (!item) {
    return null;
  }

  if (
    Date.now() - item.time >
    ttl
  ) {
    cache.delete(key);
    return null;
  }

  return item.value;
}

function setCache(key, value) {
  cache.set(key, {
    time: Date.now(),
    value,
  });
}

/* =========================================================
   QUESTION CLASSIFICATION
========================================================= */

function isEarthQuestion(question) {
  return /\b(earth|land|soil|rain|rainfall|precipitation|temperature|weather|climate|humidity|wind|vegetation|forest|ocean|sea|lake|river|drought|flood|agriculture|crop|fire|fires|wildfire|wildfires|hotspot|hotspots|burning|burned|smoke|air quality|atmosphere|surface|satellite image|imagery|land cover|land use|snow|ice|glacier|water)\b/i.test(
    question
  );
}

function isFireQuestion(question) {
  return /\b(fire|fires|wildfire|wildfires|hotspot|hotspots|active fire|thermal anomaly|thermal anomalies|FIRMS|FRP|fire radiative power|burning|burned)\b/i.test(
    question
  );
}

function isWeatherQuestion(question) {
  return /\b(temperature|rainfall|precipitation|humidity|wind|weather|climate|drought|solar radiation|solar|evaporation|pressure)\b/i.test(
    question
  );
}

function isDatasetQuestion(question) {
  return /\b(dataset|data|measurement|measure|parameter|product|collection|resolution|spatial resolution|temporal resolution|instrument|sensor|band|bands|spectral|observation)\b/i.test(
    question
  );
}

function isSatelliteQuestion(question) {
  return /\b(satellite|satellites|orbit|orbital|instrument|sensor|Landsat|Sentinel|MODIS|VIIRS|GOES|Terra|Aqua|Suomi|NOAA|ICESat|GRACE|SMAP|GEDI|ECOSTRESS)\b/i.test(
    question
  );
}

function isSpaceQuestion(question) {
  return /\b(Mars|Moon|Luna|Venus|Jupiter|Saturn|Mercury|Neptune|Uranus|Pluto|asteroid|comet|galaxy|galaxies|star|stars|exoplanet|black hole|nebula|universe|solar system|Sun|sun|planet|planets|space|cosmos|James Webb|Hubble|Roman|Chandra|Spitzer)\b/i.test(
    question
  );
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
  ];
}

function extractYearRange(question) {
  const years =
    extractYears(question);

  if (years.length < 2) {
    return null;
  }

  const start =
    Math.min(...years);

  const end =
    Math.max(...years);

  const result = [];

  for (
    let year = start;
    year <= end;
    year++
  ) {
    result.push(year);
  }

  return {
    start,
    end,
    years: result,
  };
}

/* =========================================================
   LOCATION EXTRACTION
========================================================= */

const knownLocations = {
  "bahir dar": {
    name: "Bahir Dar",
    country: "Ethiopia",
    latitude: 11.5742,
    longitude: 37.3614,
  },

  nairobi: {
    name: "Nairobi",
    country: "Kenya",
    latitude: -1.2864,
    longitude: 36.8172,
  },

  "addis ababa": {
    name: "Addis Ababa",
    country: "Ethiopia",
    latitude: 8.9806,
    longitude: 38.7578,
  },

  gondar: {
    name: "Gondar",
    country: "Ethiopia",
    latitude: 12.603,
    longitude: 37.4521,
  },

  hawassa: {
    name: "Hawassa",
    country: "Ethiopia",
    latitude: 7.0621,
    longitude: 38.4765,
  },

  mekelle: {
    name: "Mekelle",
    country: "Ethiopia",
    latitude: 13.4967,
    longitude: 39.4767,
  },

  delhi: {
    name: "Delhi",
    country: "India",
    latitude: 28.6139,
    longitude: 77.209,
  },

  "new delhi": {
    name: "New Delhi",
    country: "India",
    latitude: 28.6139,
    longitude: 77.209,
  },

  lagos: {
    name: "Lagos",
    country: "Nigeria",
    latitude: 6.5244,
    longitude: 3.3792,
  },

  cairo: {
    name: "Cairo",
    country: "Egypt",
    latitude: 30.0444,
    longitude: 31.2357,
  },

  kampala: {
    name: "Kampala",
    country: "Uganda",
    latitude: 0.3476,
    longitude: 32.5825,
  },

  "dar es salaam": {
    name: "Dar es Salaam",
    country: "Tanzania",
    latitude: -6.7924,
    longitude: 39.2083,
  },

  johannesburg: {
    name: "Johannesburg",
    country: "South Africa",
    latitude: -26.2041,
    longitude: 28.0473,
  },

  "sao paulo": {
    name: "São Paulo",
    country: "Brazil",
    latitude: -23.5505,
    longitude: -46.6333,
  },

  "atalaia do norte": {
    name: "Atalaia do Norte",
    country: "Brazil",
    latitude: -4.373,
    longitude: -70.192,
  },
};

function findKnownLocations(question) {
  const lower =
    question.toLowerCase();

  const results = [];

  for (
    const [
      key,
      location,
    ] of Object.entries(
      knownLocations
    )
  ) {
    if (
      lower.includes(key)
    ) {
      results.push(location);
    }
  }

  return results;
}

/* =========================================================
   GEOCODING
========================================================= */

async function geocodeLocation(
  place
) {
  const key =
    place.toLowerCase().trim();

  const cached =
    getCache(
      `geo:${key}`,
      1000 * 60 * 60 * 24 * 30
    );

  if (cached) {
    return cached;
  }

  if (
    knownLocations[key]
  ) {
    return knownLocations[key];
  }

  try {
    const url =
      "https://nominatim.openstreetmap.org/search" +
      `?format=jsonv2&limit=1&q=${encodeURIComponent(
        place
      )}`;

    const response =
      await fetch(url, {
        headers: {
          "User-Agent":
            "TIME-EARTH-NASA-AI/1.0",
        },
      });

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    if (
      !Array.isArray(data) ||
      !data.length
    ) {
      return null;
    }

    const item = data[0];

    const result = {
      name:
        item.display_name
          ?.split(",")[0] ||
        place,

      country:
        item.address?.country ||
        "",

      region:
        item.address?.state ||
        "",

      latitude:
        Number(item.lat),

      longitude:
        Number(item.lon),
    };

    if (
      !Number.isFinite(
        result.latitude
      ) ||
      !Number.isFinite(
        result.longitude
      )
    ) {
      return null;
    }

    setCache(
      `geo:${key}`,
      result
    );

    return result;
  } catch {
    return null;
  }
}

/* =========================================================
   FIND POSSIBLE PLACE NAMES
========================================================= */

async function findQuestionLocations(
  question,
  pageLocation
) {
  const known =
    findKnownLocations(
      question
    );

  if (known.length) {
    return known;
  }

  /*
    Try common natural-language forms:

    "weather in Tokyo"
    "fires around Amazon"
    "temperature at Nairobi"
  */

  const patterns = [
    /\b(?:in|at|around|near|over|for)\s+([A-Z][A-Za-zÀ-ÿ]+(?:\s+[A-Z][A-Za-zÀ-ÿ]+){0,4})/,
    /\b(?:of)\s+([A-Z][A-Za-zÀ-ÿ]+(?:\s+[A-Z][A-Za-zÀ-ÿ]+){0,4})/,
  ];

  for (
    const pattern of patterns
  ) {
    const match =
      question.match(pattern);

    if (match) {
      const result =
        await geocodeLocation(
          match[1]
        );

      if (result) {
        return [result];
      }
    }
  }

  /*
    IMPORTANT:
    Page location is ONLY a fallback.

    It is NOT allowed to override an explicit
    location in the user's question.
  */

  if (
    pageLocation &&
    Number.isFinite(
      Number(
        pageLocation.latitude
      )
    ) &&
    Number.isFinite(
      Number(
        pageLocation.longitude
      )
    )
  ) {
    return [
      {
        name:
          pageLocation.name ||
          "Current map location",

        country:
          pageLocation.country ||
          "",

        region:
          pageLocation.region ||
          "",

        latitude:
          Number(
            pageLocation.latitude
          ),

        longitude:
          Number(
            pageLocation.longitude
          ),
      },
    ];
  }

  return [];
}

/* =========================================================
   NASA POWER
========================================================= */

async function getPower(
  latitude,
  longitude,
  startYear,
  endYear
) {
  const key =
    [
      "power",
      latitude.toFixed(4),
      longitude.toFixed(4),
      startYear,
      endYear,
    ].join(":");

  const cached =
    getCache(
      key,
      1000 * 60 * 60 * 12
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
      `NASA POWER failed: ${response.status}`
    );
  }

  const data =
    await response.json();

  const annual = {};

  const temperature =
    data?.properties?.parameter
      ?.T2M || {};

  for (
    const date of Object.keys(
      temperature
    )
  ) {
    const year =
      Number(
        date.slice(0, 4)
      );

    if (!annual[year]) {
      annual[year] = {
        temperature: [],
        maximum: [],
        minimum: [],
        precipitation: [],
        humidity: [],
        wind: [],
        solar: [],
      };
    }

    const p =
      data.properties.parameter;

    const values = {
      temperature:
        Number(p.T2M?.[date]),

      maximum:
        Number(
          p.T2M_MAX?.[date]
        ),

      minimum:
        Number(
          p.T2M_MIN?.[date]
        ),

      precipitation:
        Number(
          p.PRECTOTCORR?.[date]
        ),

      humidity:
        Number(
          p.RH2M?.[date]
        ),

      wind:
        Number(
          p.WS2M?.[date]
        ),

      solar:
        Number(
          p.ALLSKY_SFC_SW_DWN?.[
            date
          ]
        ),
    };

    if (
      Number.isFinite(
        values.temperature
      )
    ) {
      annual[
        year
      ].temperature.push(
        values.temperature
      );
    }

    if (
      Number.isFinite(
        values.maximum
      )
    ) {
      annual[
        year
      ].maximum.push(
        values.maximum
      );
    }

    if (
      Number.isFinite(
        values.minimum
      )
    ) {
      annual[
        year
      ].minimum.push(
        values.minimum
      );
    }

    if (
      Number.isFinite(
        values.precipitation
      )
    ) {
      annual[
        year
      ].precipitation.push(
        values.precipitation
      );
    }

    if (
      Number.isFinite(
        values.humidity
      )
    ) {
      annual[
        year
      ].humidity.push(
        values.humidity
      );
    }

    if (
      Number.isFinite(
        values.wind
      )
    ) {
      annual[
        year
      ].wind.push(
        values.wind
      );
    }

    if (
      Number.isFinite(
        values.solar
      )
    ) {
      annual[
        year
      ].solar.push(
        values.solar
      );
    }
  }

  const result = {};

  for (
    const [
      year,
      values,
    ] of Object.entries(
      annual
    )
  ) {
    const avgMax =
      average(
        values.maximum
      );

    const avgMin =
      average(
        values.minimum
      );

    result[year] = {
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
        Number.isFinite(
          avgMax
        ) &&
        Number.isFinite(
          avgMin
        )
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

      averageHumidityPercent:
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

  setCache(
    key,
    result
  );

  return result;
}

function average(values) {
  const valid =
    values.filter(
      value =>
        Number.isFinite(
          value
        )
    );

  if (!valid.length) {
    return null;
  }

  return (
    valid.reduce(
      (a, b) =>
        a + b,
      0
    ) /
    valid.length
  );
}

function sum(values) {
  const valid =
    values.filter(
      value =>
        Number.isFinite(
          value
        )
    );

  if (!valid.length) {
    return null;
  }

  return valid.reduce(
    (a, b) =>
      a + b,
    0
  );
}

function round(
  value,
  decimals = 2
) {
  if (
    !Number.isFinite(
      value
    )
  ) {
    return null;
  }

  return Number(
    value.toFixed(
      decimals
    )
  );
}

/* =========================================================
   NASA FIRMS
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

function localBoundingBox(
  latitude,
  longitude
) {
  const radius = 1;

  return {
    west:
      longitude - radius,

    south:
      latitude - radius,

    east:
      longitude + radius,

    north:
      latitude + radius,
  };
}

function formatDate(
  date
) {
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

function parseCSV(text) {
  const lines =
    text.trim().split(/\r?\n/);

  if (lines.length < 2) {
    return [];
  }

  const headers =
    lines[0].split(",");

  return lines
    .slice(1)
    .map(line => {
      const values =
        line.split(",");

      const row = {};

      headers.forEach(
        (
          header,
          index
        ) => {
          row[
            header.trim()
          ] =
            values[
              index
            ]?.trim();
        }
      );

      return row;
    });
}

async function getFirmsChunk(
  source,
  box,
  date,
  days
) {
  if (!FIRMS_MAP_KEY) {
    return [];
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
    return [];
  }

  const text =
    await response.text();

  return parseCSV(text);
}

async function getFirms(
  latitude,
  longitude,
  years
) {
  if (!FIRMS_MAP_KEY) {
    return {
      enabled: false,
      message:
        "NASA FIRMS is not configured.",
    };
  }

  const result = {};

  const box =
    localBoundingBox(
      latitude,
      longitude
    );

  for (
    const year of years
  ) {
    const records = [];

    const sources =
      getFirmsSources(
        year
      );

    for (
      const source of sources
    ) {
      let date =
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
        date < end
      ) {
        const remaining =
          Math.ceil(
            (
              end -
              date
            ) /
              86400000
          );

        const days =
          Math.min(
            5,
            remaining
          );

        try {
          const rows =
            await getFirmsChunk(
              source,
              box,
              formatDate(
                date
              ),
              days
            );

          records.push(
            ...rows.map(
              row => ({
                ...row,
                source,
              })
            )
          );
        } catch {}

        date =
          addDays(
            date,
            days
          );
      }
    }

    const monthly = {};

    for (
      let month = 1;
      month <= 12;
      month++
    ) {
      monthly[
        month
      ] = 0;
    }

    let day = 0;
    let night = 0;

    for (
      const record of records
    ) {
      if (
        record.acq_date
      ) {
        const month =
          Number(
            record.acq_date.slice(
              5,
              7
            )
          );

        if (
          monthly[month] !==
          undefined
        ) {
          monthly[
            month
          ]++;
        }
      }

      if (
        record.daynight ===
        "D"
      ) {
        day++;
      }

      if (
        record.daynight ===
        "N"
      ) {
        night++;
      }
    }

    result[year] = {
      totalDetections:
        records.length,

      daytimeDetections:
        day,

      nighttimeDetections:
        night,

      nighttimePercentage:
        records.length
          ? round(
              (night /
                records.length) *
                100
            )
          : 0,

      monthlyDetections:
        monthly,

      warning:
        "FIRMS detections are satellite-detected thermal anomalies/active-fire observations, not automatically confirmed wildfires.",
    };
  }

  return {
    enabled: true,

    searchArea: box,

    annual: result,
  };
}

/* =========================================================
   NASA EARTHDATA DATASET DISCOVERY
========================================================= */

async function searchNASADataCatalog(
  question
) {
  try {
    const url =
      "https://cmr.earthdata.nasa.gov/search/collections" +
      `?keyword=${encodeURIComponent(
        question
      )}` +
      "&page_size=8" +
      "&format=json";

    const response =
      await fetch(url);

    if (!response.ok) {
      return [];
    }

    const data =
      await response.json();

    const entries =
      data?.feed?.entry ||
      [];

    return entries
      .slice(0, 8)
      .map(entry => ({
        title:
          entry.title,

        id:
          entry.id,

        summary:
          entry.summary,

        shortName:
          entry.short_name,

        version:
          entry.version_id,

        temporal:
          entry.time_start
            ? {
                start:
                  entry.time_start,

                end:
                  entry.time_end ||
                  null,
              }
            : null,

        organizations:
          entry.archive_center ||
          [],

        links:
          entry.links
            ?.slice(0, 5)
            .map(
              link => ({
                href:
                  link.href,

                title:
                  link.title ||
                  "",
              })
            ) ||
          [],
      }));
  } catch {
    return [];
  }
}

/* =========================================================
   GENERAL NASA CONTEXT
========================================================= */

async function buildNASAContext({
  question,
  pageLocation,
  explorer,
  conversation,
}) {
  const years =
    extractYears(
      question
    );

  const locations =
    await findQuestionLocations(
      question,
      pageLocation
    );

  const context = {
    userRequest: question,

    requestedYears:
      years,

    requestedLocations:
      locations,

    pageContext: {
      location:
        pageLocation || null,

      explorer:
        explorer || null,
    },

    previousConversation:
      conversation || [],

    questionClassification: {
      earth:
        isEarthQuestion(
          question
        ),

      fire:
        isFireQuestion(
          question
        ),

      weather:
        isWeatherQuestion(
          question
        ),

      dataset:
        isDatasetQuestion(
          question
        ),

      satellite:
        isSatelliteQuestion(
          question
        ),

      space:
        isSpaceQuestion(
          question
        ),
    },
  };

  /* -----------------------------------------
     NASA POWER

     Only use it when the user actually asks
     for Earth environmental measurements.
  ----------------------------------------- */

  if (
    locations.length &&
    isWeatherQuestion(
      question
    )
  ) {
    const startYear =
      years.length
        ? Math.min(...years)
        : new Date().getFullYear();

    const endYear =
      years.length
        ? Math.max(...years)
        : startYear;

    context.power = {};

    for (
      const location of locations
    ) {
      try {
        context.power[
          location.name
        ] = await getPower(
          location.latitude,
          location.longitude,
          startYear,
          endYear
        );
      } catch (
        error
      ) {
        context.power[
          location.name
        ] = {
          error:
            error.message,
        };
      }
    }
  }

  /* -----------------------------------------
     NASA FIRMS
  ----------------------------------------- */

  if (
    locations.length &&
    isFireQuestion(
      question
    )
  ) {
    const fireYears =
      years.length
        ? years
        : [
            new Date().getFullYear(),
          ];

    context.firms = {};

    for (
      const location of locations
    ) {
      context.firms[
        location.name
      ] = await getFirms(
        location.latitude,
        location.longitude,
        fireYears
      );
    }
  }

  /* -----------------------------------------
     EARTHDATA DATASET DISCOVERY

     Useful for questions about NASA datasets,
     instruments, sensors, products, etc.
  ----------------------------------------- */

  if (
    isDatasetQuestion(
      question
    ) ||
    isSatelliteQuestion(
      question
    ) ||
    isEarthQuestion(
      question
    )
  ) {
    context.earthdata =
      await searchNASADataCatalog(
        question
      );
  }

  return context;
}

/* =========================================================
   AI PROMPT
========================================================= */

function buildPrompt({
  question,
  context,
  conversation,
}) {
  return `
You are the general NASA AI research assistant
inside TIME EARTH.

You are NOT merely a chatbot for the current map.

You are a broad NASA information assistant.

The user can ask about:

• any place on Earth
• any year or date
• multiple years
• multiple locations
• weather
• climate
• fires
• oceans
• atmosphere
• vegetation
• agriculture
• land
• water
• satellites
• sensors
• instruments
• NASA missions
• NASA datasets
• Earth observation
• satellite imagery
• astronomy
• planets
• the Moon
• the Sun
• galaxies
• stars
• spacecraft
• NASA discoveries
• NASA science
• scientific concepts
• historical NASA observations
• current NASA information

==================================================
THE USER'S QUESTION IS THE AUTHORITY
==================================================

The user's question determines what information
you should answer.

DO NOT automatically restrict the answer to:

• the current map location
• the current country
• the current year
• the current dataset
• the currently selected satellite
• the current observation date

Page context is only additional context.

If the user explicitly mentions a different place,
time, satellite, planet, dataset, or property,
USE THAT instead.

Example:

Page:
Delhi, 2026

User:
"What was rainfall in Bahir Dar from 2015 to 2020?"

Answer:
Bahir Dar, 2015–2020.

NOT Delhi 2026.

Example:

Page:
Bahir Dar

User:
"How does the James Webb Space Telescope work?"

Answer:
James Webb.

NOT Bahir Dar.

Example:

Page:
Earth map

User:
"What is the temperature on Mars?"

Answer:
Mars.

==================================================
DO NOT USE THE PAGE AS A LIMIT
==================================================

Never say:

"The provided NASA context doesn't contain this."

Never say:

"I can only answer for the selected location."

Never say:

"I only have data for the current year."

Never say:

"I cannot answer because the current dataset
doesn't include it."

Instead:

1. Understand what the user wants.
2. Use the NASA data supplied when relevant.
3. Use NASA sources through web search when more
   information is needed.
4. Use general scientific knowledge when appropriate.
5. Combine the information into a useful answer.

==================================================
NASA SOURCES
==================================================

Prefer authoritative NASA sources.

Useful NASA ecosystems include:

NASA Science
NASA Earthdata
NASA POWER
NASA FIRMS
NASA GIBS
NASA mission pages
NASA instrument documentation
NASA datasets
NASA APIs
NASA publications and technical documentation

Google Search is available.

When the question needs current or specific NASA
information, SEARCH for it.

Do not pretend that the supplied context is the
entire NASA knowledge base.

==================================================
NASA MEASUREMENTS
==================================================

When exact NASA measurements are supplied:

USE THEM.

When the user asks for information that is not
represented by the structured context:

RESEARCH the relevant NASA source.

Do not invent a number.

If an exact numerical value cannot be verified,
give the relevant NASA information and explain
what the measurement represents instead of making
up a value.

==================================================
LOCATION
==================================================

The user can ask about ANY location.

Do not restrict locations to Ethiopia,
Kenya, India, or any predefined list.

For example:

Tokyo
New York
Amazon rainforest
Sahara
Antarctica
Pacific Ocean
Mount Everest
California
Ethiopia
Bahir Dar
Mars

Treat the explicit location in the question as
the target.

==================================================
TIME
==================================================

The user can ask about ANY time period.

Examples:

1990
2005
2015–2020
last decade
before 2000
during 2022
historically
today
recently

Do not substitute the Explorer's current year
for the year the user actually asks about.

==================================================
PROPERTY
==================================================

The user can ask about ANY relevant property.

Examples:

temperature
precipitation
humidity
wind
soil moisture
vegetation
fires
burned area
radiation
clouds
aerosols
ocean temperature
sea level
ice
snow
carbon
land cover
spectral bands
surface reflectance
elevation
gravity
magnetic fields

Do not assume the property is limited to the
current dataset.

==================================================
ANSWER STYLE
==================================================

The answer should be:

SHORT but EXPLAINED.

Do not dump raw data.

Do not give a giant essay.

For most questions use:

1. Direct answer
2. 2–5 useful bullets or short paragraphs
3. Important interpretation
4. Small limitation only when genuinely necessary

Target approximately:

100–250 words.

For very simple questions:

50–120 words.

For complex comparisons:

Use a compact table followed by a short explanation.

==================================================
EXPLAIN, DON'T JUST REPORT
==================================================

Do not merely say:

"Temperature was 23°C."

Explain what that means.

Example:

"NASA POWER reports an average temperature of
23°C. In practical terms, that means the average
daily temperature over the selected period was
around 23°C; it does not mean the temperature
stayed at 23°C all day."

==================================================
FIRE QUESTIONS
==================================================

FIRMS observations are satellite-detected
thermal anomalies / active-fire detections.

Do not automatically call every detection a
confirmed wildfire.

Say:

"FIRMS detected..."

rather than:

"There were exactly X wildfires."

Explain the distinction briefly when relevant.

==================================================
CORRELATION
==================================================

Do not turn correlation into causation.

Bad:

"Low rainfall caused the fires."

Better:

"Fire detections were higher in the drier years,
which is consistent with conditions that can
increase fire risk, but this comparison alone
does not prove rainfall caused the fires."

==================================================
COMPARISONS
==================================================

When comparing:

• locations
• years
• satellites
• sensors
• datasets
• planets
• missions

actually compare them.

Do not answer only one side.

==================================================
FOLLOW-UP QUESTIONS
==================================================

Use previous conversation when the user says:

"What about 2022?"
"What about Nairobi?"
"Which one was higher?"
"Why?"
"Compare that with 2019."

Preserve the relevant topic from the conversation.

==================================================
CURRENT PAGE CONTEXT
==================================================

This is OPTIONAL context.

Do not treat it as a restriction.

${JSON.stringify(
  context.pageContext,
  null,
  2
)}

==================================================
RETRIEVED NASA INFORMATION
==================================================

${JSON.stringify(
  context,
  null,
  2
)}

==================================================
PREVIOUS CONVERSATION
==================================================

${conversation}

==================================================
USER QUESTION
==================================================

${question}

Now answer the user's actual question directly.
`;
}

/* =========================================================
   MAIN AI ROUTE
========================================================= */

app.post(
  "/api/nasa/ask",
  async (req, res) => {
    const start =
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
        "NASA AI QUESTION:",
        question
      );

      /*
        Build information dynamically from the
        user's question.

        The current page is NOT the source of truth.
      */

      const context =
        await buildNASAContext({
          question:
            question.trim(),

          pageLocation:
            location,

          explorer,

          conversation,
        });

      const previousConversation =
        conversation
          .slice(-12)
          .map(
            message =>
              `${
                message.role ===
                "assistant"
                  ? "Assistant"
                  : "User"
              }: ${
                message.content || ""
              }`
          )
          .join("\n");

      const prompt =
        buildPrompt({
          question:
            question.trim(),

          context,

          conversation:
            previousConversation ||
            "No previous conversation.",
        });

      /*
        Gemini can research NASA information
        beyond the structured APIs above.
      */

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

              temperature: 0.2,

              maxOutputTokens:
                3000,
            },
          }
        );

      const answer =
        response.text ||
        "I couldn't generate an answer.";

      res.json({
        answer,

        meta: {
          processingTimeMs:
            Date.now() -
            start,

          model:
            GEMINI_MODEL,

          questionDriven: true,

          pageContextIsOptional:
            true,
        },

        context,
      });
    } catch (error) {
      console.error(
        "NASA AI ERROR:",
        error
      );

      res.status(500).json({
        error:
          "NASA AI encountered an error.",

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
          : "OPTIONAL / MISSING",

      model:
        GEMINI_MODEL,

      mode:
        "QUESTION_DRIVEN_GENERAL_NASA_AI",
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
      status:
        "TIME EARTH NASA AI READY",

      mode:
        "General NASA research assistant",

      pageContext:
        "Optional",

      questionDriven:
        true,

      gemini:
        GEMINI_API_KEY
          ? "READY"
          : "MISSING",

      firms:
        FIRMS_MAP_KEY
          ? "READY"
          : "NOT CONFIGURED",

      model:
        GEMINI_MODEL,
    });
  }
);

/* =========================================================
   SERVER
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "======================================"
    );

    console.log(
      "TIME EARTH NASA AI"
    );

    console.log(
      "General NASA Research Mode"
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
      `FIRMS: ${
        FIRMS_MAP_KEY
          ? "READY"
          : "OPTIONAL"
      }`
    );

    console.log(
      `Model: ${GEMINI_MODEL}`
    );

    console.log(
      "Question-driven: YES"
    );

    console.log(
      "Page location as restriction: NO"
    );

    console.log(
      "======================================"
    );
  }
);