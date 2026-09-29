/* =========================================================
   TIME EARTH — EARTH INTELLIGENCE
   REAL NASA POWER DATA
   ========================================================= */

(() => {
  "use strict";

  /* =======================================================
     CONFIG
     ======================================================= */

  const POWER_BASE =
    "https://power.larc.nasa.gov/api/temporal/daily/point";

  /*
    NASA POWER can have a short delay before the newest
    observations become available.

    We therefore stop the request 7 days before today.
    This prevents the UI from treating recent unavailable
    dates as if they were broken data.
  */
  const DATA_LAG_DAYS = 7;

  /*
    How many days of history to request.

    365 days gives us a useful one-year observation history
    for the chart and monthly statistics.
  */
  const HISTORY_DAYS = 365;

  /*
    NASA POWER parameters.

    These are REAL POWER variables.
  */
  const PARAMETERS = [
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "PRECTOTCORR",
    "WS10M",
    "ALLSKY_SFC_SW_DWN"
  ];

  const PARAMETER_INFO = {
    T2M: {
      label: "Temperature",
      unit: "°C",
      decimals: 1
    },

    T2M_MAX: {
      label: "Max Temperature",
      unit: "°C",
      decimals: 1
    },

    T2M_MIN: {
      label: "Min Temperature",
      unit: "°C",
      decimals: 1
    },

    PRECTOTCORR: {
      label: "Precipitation",
      unit: "mm/day",
      decimals: 1
    },

    WS10M: {
      label: "Wind Speed",
      unit: "m/s",
      decimals: 1
    },

    ALLSKY_SFC_SW_DWN: {
      label: "Solar Radiation",
      unit: "kWh/m²/day",
      decimals: 2
    }
  };


  /* =======================================================
     STATE
     ======================================================= */

  let map = null;
  let observationMarker = null;

  let currentRequestId = 0;

  let latestObservation = null;

  let intelligencePanel = null;

  let chartCanvas = null;

  let chartTooltip = null;
  let selectedExplorerDate = null;
  let selectedDateRequestId = 0;


  /* =======================================================
     STARTUP
     ======================================================= */

  function init() {
    createPanel();

    connectToMap();

    /*
      If explorer.js loaded before this file and already
      created the map, connect immediately.
    */
    if (window.TIME_EARTH_MAP) {
      connectMap(window.TIME_EARTH_MAP);
    }
  }


  /* =======================================================
     CONNECT TO EXPLORER MAP
     ======================================================= */

  function connectToMap() {
    window.addEventListener(
      "timeEarthMapReady",
      () => {
        if (window.TIME_EARTH_MAP) {
          connectMap(window.TIME_EARTH_MAP);
        }
      }
    );
  }


  function connectMap(leafletMap) {
    if (!leafletMap) return;

    /*
      Prevent attaching the same click handler twice.
    */
    if (map === leafletMap) {
      return;
    }

    map = leafletMap;

    map.on("click", handleMapClick);

    setStatus(
      "READY",
      "Click anywhere on Earth to inspect real NASA POWER observations."
    );
  }


  /* =======================================================
     MAP CLICK
     ======================================================= */

  async function handleMapClick(event) {
    if (!event || !event.latlng) {
      return;
    }

    const latitude = Number(event.latlng.lat);
    const longitude = Number(event.latlng.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    /*
      Normalize longitude so the API receives a normal
      geographic longitude.
    */
    const normalizedLongitude = normalizeLongitude(longitude);

    /*
      Every click receives a unique request ID.

      If the user clicks three locations quickly and the
      first request finishes last, we don't allow that old
      response to overwrite the newest click.
    */
    const requestId = ++currentRequestId;

    latestObservation = null;

    placeObservationMarker(latitude, normalizedLongitude);

    showLoadingState(
      latitude,
      normalizedLongitude
    );

    try {
      const request = buildPowerRequest(
        latitude,
        normalizedLongitude
      );

      /*
        Show the exact request information in the panel.
        This is useful for verifying that different clicks
        actually generate different NASA requests.
      */
      updateRequestDisplay(request);

      console.log(
        "[TIME EARTH] NASA POWER request:",
        request.url
      );

      const response = await fetch(
        request.url,
        {
          method: "GET",
          headers: {
            Accept: "application/json"
          },
          cache: "no-store"
        }
      );

      if (!response.ok) {
        throw new Error(
          `NASA POWER returned HTTP ${response.status}`
        );
      }

      const rawData = await response.json();

      /*
        Ignore the response if a newer click happened while
        this request was running.
      */
      if (requestId !== currentRequestId) {
        return;
      }

      console.log(
        "[TIME EARTH] NASA POWER raw response:",
        rawData
      );

      const parsed = parsePowerResponse(rawData);

      if (!parsed || parsed.days.length === 0) {
        showNoDataState(
          "NASA POWER returned no valid observations for this point."
        );

        return;
      }

      latestObservation = {
        ...parsed,
        latitude,
        longitude: normalizedLongitude,
        request
      };

      renderObservation(parsed);

    } catch (error) {
      console.error(
        "[TIME EARTH] NASA POWER error:",
        error
      );

      if (requestId !== currentRequestId) {
        return;
      }

      showErrorState(error);
    }
  }


  /* =======================================================
     SYNCHRONIZE WITH EXPLORER TIMELINE
     ======================================================= */

  window.addEventListener("timeEarthDateChanged", event => {
    const date = event.detail?.date;
    if (!date) return;
    selectedExplorerDate = date;
    loadPowerForExplorerDate(date).catch(error => {
      console.warn("[TIME EARTH] Selected-date POWER sync failed:", error);
    });
  });

  async function loadPowerForExplorerDate(date) {
    const id = ++selectedDateRequestId;
    const year = Number(String(date).slice(0,4));
    if (!Number.isFinite(year)) return;
    const lat = Number(window.TIME_EARTH_STATE?.location?.latitude);
    const lon = Number(window.TIME_EARTH_STATE?.location?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const start = `${year}0101`;
    const end = `${year}1231`;
    const params = new URLSearchParams();
    params.set("parameters", PARAMETERS.join(","));
    params.set("community", "AG");
    params.set("longitude", lon.toFixed(4));
    params.set("latitude", lat.toFixed(4));
    params.set("start", start);
    params.set("end", end);
    params.set("format", "JSON");

    const response = await fetch(`${POWER_BASE}?${params.toString()}`);
    if (!response.ok) throw new Error(`NASA POWER HTTP ${response.status}`);
    const raw = await response.json();
    const parsed = parsePowerResponse(raw);
    if (!parsed || id !== selectedDateRequestId) return;

    parsed.selectedDate = date;
    latestObservation = {
      latitude:lat, longitude:lon, request:{start,end}, ...parsed
    };
    renderObservation(parsed);
    updateSelectedDateDisplay(date);
  }

  function updateSelectedDateDisplay(date) {
    const content=document.getElementById("teiContent");
    if (!content || !date) return;
    let badge=document.getElementById("teiSelectedDate");
    if (!badge) {
      badge=document.createElement("div");
      badge.id="teiSelectedDate";
      badge.className="tei-selected-date";
      const chartSection=content.querySelector(".tei-chart-wrap")?.parentElement;
      if (chartSection) chartSection.insertBefore(badge, chartSection.querySelector(".tei-chart-wrap"));
    }
    badge.textContent=`Timeline observation: ${date}`;
    if (latestObservation?.monthlyTemperature) drawTemperatureChart(latestObservation.monthlyTemperature);
  }

  /* =======================================================
     BUILD NASA POWER REQUEST
     ======================================================= */

  function buildPowerRequest(latitude, longitude) {
    /*
      Use UTC dates for the API.

      POWER expects YYYYMMDD.
    */

    const endDate = new Date();

    /*
      Move back by DATA_LAG_DAYS.
    */
    endDate.setUTCDate(
      endDate.getUTCDate() - DATA_LAG_DAYS
    );

    const startDate = new Date(endDate);

    startDate.setUTCDate(
      startDate.getUTCDate() - HISTORY_DAYS + 1
    );

    const start = formatPowerDate(startDate);
    const end = formatPowerDate(endDate);

    const params = new URLSearchParams();

    params.set(
      "parameters",
      PARAMETERS.join(",")
    );

    params.set(
      "community",
      "AG"
    );

    /*
      Keep the clicked coordinates exactly as the request
      coordinates.
    */
    params.set(
      "longitude",
      longitude.toFixed(4)
    );

    params.set(
      "latitude",
      latitude.toFixed(4)
    );

    params.set(
      "start",
      start
    );

    params.set(
      "end",
      end
    );

    params.set(
      "format",
      "JSON"
    );

    return {
      latitude,
      longitude,
      start,
      end,
      url: `${POWER_BASE}?${params.toString()}`
    };
  }


  /* =======================================================
     PARSE NASA POWER RESPONSE
     ======================================================= */

  function parsePowerResponse(data) {
    /*
      NASA POWER daily JSON is structured approximately as:

      properties
        parameter
          T2M
            20250101: value
            20250102: value
            ...

      We intentionally do NOT trust a single value.

      Instead we build a proper daily observation table.
    */

    const parameterRoot =
      data?.properties?.parameter;

    if (
      !parameterRoot ||
      typeof parameterRoot !== "object"
    ) {
      console.error(
        "[TIME EARTH] Unexpected NASA POWER response:",
        data
      );

      return null;
    }

    const availableParameters =
      Object.keys(parameterRoot);

    console.log(
      "[TIME EARTH] Parameters returned:",
      availableParameters
    );

    /*
      Find every date that appears in the returned data.
    */
    const dateSet = new Set();

    for (const parameterName of PARAMETERS) {
      const parameterData =
        parameterRoot[parameterName];

      if (
        !parameterData ||
        typeof parameterData !== "object"
      ) {
        continue;
      }

      for (const dateKey of Object.keys(parameterData)) {
        if (/^\d{8}$/.test(dateKey)) {
          dateSet.add(dateKey);
        }
      }
    }

    const dates = Array.from(dateSet).sort();

    const days = [];

    for (const dateKey of dates) {
      const row = {
        dateKey,
        date: formatDisplayDate(dateKey)
      };

      let hasAtLeastOneValue = false;

      for (const parameterName of PARAMETERS) {
        const rawValue =
          parameterRoot?.[parameterName]?.[dateKey];

        const value =
          parseNASAValue(rawValue);

        row[parameterName] = value;

        if (value !== null) {
          hasAtLeastOneValue = true;
        }
      }

      /*
        Only keep dates where NASA actually returned at
        least one valid measurement.
      */
      if (hasAtLeastOneValue) {
        days.push(row);
      }
    }

    /*
      Count valid observations for each parameter.
    */
    const validCounts = {};

    for (const parameterName of PARAMETERS) {
      validCounts[parameterName] =
        days.filter(
          day =>
            day[parameterName] !== null
        ).length;
    }

    console.log(
      "[TIME EARTH] Valid observation counts:",
      validCounts
    );

    if (days.length === 0) {
      return null;
    }

    /*
      Find the latest date that has a temperature value.
    */
    const latestTemperatureDay =
      findLatestDayWithValue(
        days,
        "T2M"
      );

    /*
      Calculate statistics from REAL observations only.
    */
    const statistics = {};

    for (const parameterName of PARAMETERS) {
      statistics[parameterName] =
        calculateStatistics(
          days,
          parameterName
        );
    }

    /*
      Build monthly temperature averages.
    */
    const monthlyTemperature =
      calculateMonthlySeries(
        days,
        "T2M",
        "average"
      );

    /*
      Build monthly precipitation totals.
    */
    const monthlyPrecipitation =
      calculateMonthlySeries(
        days,
        "PRECTOTCORR",
        "sum"
      );

    return {
      days,

      latestTemperatureDay,

      latestDay:
        days[days.length - 1],

      statistics,

      monthlyTemperature,

      monthlyPrecipitation,

      validCounts
    };
  }


  /* =======================================================
     NASA VALUE PARSER
     ======================================================= */

  function parseNASAValue(rawValue) {
    /*
      NASA POWER uses special missing-value codes.

      IMPORTANT:
      We NEVER turn missing values into fake values.
    */

    if (
      rawValue === null ||
      rawValue === undefined ||
      rawValue === ""
    ) {
      return null;
    }

    const numericValue =
      Number(rawValue);

    if (!Number.isFinite(numericValue)) {
      return null;
    }

    /*
      NASA missing-data sentinel.
    */
    if (numericValue === -999) {
      return null;
    }

    /*
      Protect against related sentinel-style values.
    */
    if (numericValue <= -998) {
      return null;
    }

    return numericValue;
  }


  /* =======================================================
     STATISTICS
     ======================================================= */

  function calculateStatistics(days, parameterName) {
    const values = days
      .map(day => day[parameterName])
      .filter(
        value =>
          value !== null &&
          Number.isFinite(value)
      );

    if (values.length === 0) {
      return {
        count: 0,
        average: null,
        minimum: null,
        maximum: null
      };
    }

    const sum =
      values.reduce(
        (total, value) =>
          total + value,
        0
      );

    return {
      count: values.length,

      average:
        sum / values.length,

      minimum:
        Math.min(...values),

      maximum:
        Math.max(...values)
    };
  }


  /* =======================================================
     MONTHLY SERIES
     ======================================================= */

  function calculateMonthlySeries(
    days,
    parameterName,
    mode
  ) {
    const groups = {};

    for (const day of days) {
      const value =
        day[parameterName];

      if (
        value === null ||
        !Number.isFinite(value)
      ) {
        continue;
      }

      const monthKey =
        day.dateKey.slice(0, 6);

      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }

      groups[monthKey].push(value);
    }

    return Object.keys(groups)
      .sort()
      .map(monthKey => {
        const values =
          groups[monthKey];

        let result;

        if (mode === "sum") {
          result =
            values.reduce(
              (sum, value) =>
                sum + value,
              0
            );
        } else {
          result =
            values.reduce(
              (sum, value) =>
                sum + value,
              0
            ) / values.length;
        }

        return {
          monthKey,
          label: formatMonth(monthKey),
          value: result,
          count: values.length
        };
      });
  }


  /* =======================================================
     FIND LATEST VALID VALUE
     ======================================================= */

  function findLatestDayWithValue(
    days,
    parameterName
  ) {
    for (let i = days.length - 1; i >= 0; i--) {
      if (
        days[i][parameterName] !== null
      ) {
        return days[i];
      }
    }

    return null;
  }


  /* =======================================================
     PANEL
     ======================================================= */

  function createPanel() {
    if (
      document.getElementById(
        "timeEarthIntelligence"
      )
    ) {
      intelligencePanel =
        document.getElementById(
          "timeEarthIntelligence"
        );

      cacheChartElements();

      return;
    }

    intelligencePanel =
      document.createElement("aside");

    intelligencePanel.id =
      "timeEarthIntelligence";

    intelligencePanel.innerHTML = `
      <div class="tei-header">
        <div>
          <div class="tei-brand">
            TIME EARTH
          </div>

          <div class="tei-title">
            EARTH INTELLIGENCE
          </div>
        </div>

        <div class="tei-live">
          NASA POWER
        </div>
      </div>


      <div class="tei-instruction">
        <span class="tei-crosshair">⌖</span>

        CLICK THE MAP TO QUERY A NASA POINT
      </div>


      <div id="teiContent">

        <div class="tei-empty">
          <div class="tei-empty-icon">
            ⌖
          </div>

          <div class="tei-empty-title">
            POINT OBSERVATION
          </div>

          <div class="tei-empty-text">
            Click anywhere on the map to retrieve
            real NASA POWER observations for that
            geographic point.
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(
      intelligencePanel
    );

    cacheChartElements();
  }


  function cacheChartElements() {
    chartCanvas =
      document.getElementById(
        "teiTemperatureChart"
      );

    chartTooltip =
      document.getElementById(
        "teiChartTooltip"
      );
  }


  /* =======================================================
     LOADING STATE
     ======================================================= */

  function showLoadingState(
    latitude,
    longitude
  ) {
    const content =
      document.getElementById(
        "teiContent"
      );

    if (!content) return;

    content.innerHTML = `
      <div class="tei-loading">

        <div class="tei-spinner"></div>

        <div class="tei-loading-title">
          QUERYING NASA POWER
        </div>

        <div class="tei-loading-text">
          Requesting real observations for
          <strong>
            ${formatCoordinate(latitude, true)}
          </strong>,
          <strong>
            ${formatCoordinate(longitude, false)}
          </strong>
        </div>

      </div>
    `;
  }


  /* =======================================================
     REQUEST DISPLAY
     ======================================================= */

  function updateRequestDisplay(request) {
    /*
      Also put useful debugging information into the
      browser console.
    */

    console.log(
      `[TIME EARTH] Coordinates:
      lat=${request.latitude}
      lon=${request.longitude}`
    );

    console.log(
      `[TIME EARTH] Date range:
      ${request.start} → ${request.end}`
    );
  }


  /* =======================================================
     RENDER REAL OBSERVATION
     ======================================================= */

  function renderObservation(data) {
    const content =
      document.getElementById(
        "teiContent"
      );

    if (!content) return;

    const latest =
      data.latestTemperatureDay;

    const temperature =
      latest?.T2M;

    const maxTemp =
      latest?.T2M_MAX;

    const minTemp =
      latest?.T2M_MIN;

    const precipitation =
      latest?.PRECTOTCORR;

    const wind =
      latest?.WS10M;

    const solar =
      latest?.ALLSKY_SFC_SW_DWN;

    const stats =
      data.statistics;

    const location =
      window.TIME_EARTH_STATE?.location;

    content.innerHTML = `

      <div class="tei-observation">

        <div class="tei-observation-top">

          <div>
            <div class="tei-kicker">
              NASA POWER POINT OBSERVATION
            </div>

            <div class="tei-location">
              ${escapeHTML(
                location?.name ||
                "Selected Point"
              )}
            </div>

            <div class="tei-coordinates">
              ${formatCoordinate(
                latestObservation.latitude,
                true
              )}
              ,
              ${formatCoordinate(
                latestObservation.longitude,
                false
              )}
            </div>
          </div>

          <div class="tei-valid-badge">
            REAL DATA
          </div>

        </div>


        <div class="tei-date">
          Latest valid temperature observation:
          <strong>
            ${latest?.date || "Unavailable"}
          </strong>
        </div>


        <div class="tei-metrics">

          ${metricCard(
            "Temperature",
            temperature,
            "°C"
          )}

          ${metricCard(
            "Max Temp",
            maxTemp,
            "°C"
          )}

          ${metricCard(
            "Min Temp",
            minTemp,
            "°C"
          )}

          ${metricCard(
            "Rainfall",
            precipitation,
            "mm/day"
          )}

          ${metricCard(
            "Wind",
            wind,
            "m/s"
          )}

          ${metricCard(
            "Solar",
            solar,
            "kWh/m²/day"
          )}

        </div>


        <div class="tei-section">

          <div class="tei-section-title">
            12-MONTH TEMPERATURE
          </div>

          <div class="tei-chart-wrap">

            <canvas
              id="teiTemperatureChart"
              height="170"
            ></canvas>

            <div
              id="teiChartTooltip"
              class="tei-chart-tooltip"
            ></div>

          </div>

          <div class="tei-chart-note">
            Monthly averages calculated only
            from valid NASA POWER daily observations.
          </div>

        </div>


        <div class="tei-section">

          <div class="tei-section-title">
            OBSERVATION STATISTICS
          </div>

          <div class="tei-stat-grid">

            ${statRow(
              "Temperature average",
              stats.T2M?.average,
              "°C"
            )}

            ${statRow(
              "Temperature minimum",
              stats.T2M?.minimum,
              "°C"
            )}

            ${statRow(
              "Temperature maximum",
              stats.T2M?.maximum,
              "°C"
            )}

            ${statRow(
              "Rainfall average",
              stats.PRECTOTCORR?.average,
              "mm/day"
            )}

            ${statRow(
              "Wind average",
              stats.WS10M?.average,
              "m/s"
            )}

            ${statRow(
              "Valid temperature days",
              stats.T2M?.count,
              ""
            )}

          </div>

        </div>


        <div class="tei-section">

          <div class="tei-section-title">
            EARTH SIGNAL
          </div>

          <div class="tei-insight">
            ${generateInsight(data)}
          </div>

        </div>


        <div class="tei-section tei-debug">

          <div class="tei-section-title">
            NASA REQUEST
          </div>

          <div class="tei-request-row">
            <span>Latitude</span>
            <strong>
              ${latestObservation.latitude.toFixed(4)}°
            </strong>
          </div>

          <div class="tei-request-row">
            <span>Longitude</span>
            <strong>
              ${latestObservation.longitude.toFixed(4)}°
            </strong>
          </div>

          <div class="tei-request-row">
            <span>Start</span>
            <strong>
              ${latestObservation.request.start}
            </strong>
          </div>

          <div class="tei-request-row">
            <span>End</span>
            <strong>
              ${latestObservation.request.end}
            </strong>
          </div>

          <div class="tei-request-row">
            <span>Valid T2M</span>
            <strong>
              ${data.validCounts.T2M}
            </strong>
          </div>

          <div class="tei-request-row">
            <span>Valid rainfall</span>
            <strong>
              ${data.validCounts.PRECTOTCORR}
            </strong>
          </div>

        </div>


        <div class="tei-source">

          <div class="tei-source-title">
            DATA SOURCE
          </div>

          <div>
            NASA POWER
          </div>

          <div class="tei-source-small">
            Daily point observations
          </div>

          <div class="tei-source-small">
            Missing NASA values are excluded,
            never replaced with estimates.
          </div>

        </div>

      </div>
    `;

    cacheChartElements();

    drawTemperatureChart(
      data.monthlyTemperature
    );
    if (data.selectedDate) updateSelectedDateDisplay(data.selectedDate);
  }


  /* =======================================================
     METRIC CARD
     ======================================================= */

  function metricCard(
    label,
    value,
    unit
  ) {
    const valid =
      value !== null &&
      value !== undefined &&
      Number.isFinite(value);

    return `
      <div class="tei-metric">

        <div class="tei-metric-label">
          ${label}
        </div>

        <div class="tei-metric-value">

          ${
            valid
              ? formatNumber(value, unit)
              : "N/A"
          }

        </div>

      </div>
    `;
  }


  /* =======================================================
     STAT ROW
     ======================================================= */

  function statRow(
    label,
    value,
    unit
  ) {
    const valid =
      value !== null &&
      value !== undefined &&
      Number.isFinite(value);

    return `
      <div class="tei-stat-row">

        <span>
          ${label}
        </span>

        <strong>
          ${
            valid
              ? formatNumber(value, unit)
              : "N/A"
          }
        </strong>

      </div>
    `;
  }


  /* =======================================================
     CHART
     ======================================================= */

  function drawTemperatureChart(
    series
  ) {
    const canvas =
      document.getElementById(
        "teiTemperatureChart"
      );

    if (!canvas) return;

    const ctx =
      canvas.getContext("2d");

    if (!ctx) return;

    const rect =
      canvas.getBoundingClientRect();

    const width =
      Math.max(
        300,
        Math.floor(rect.width || 320)
      );

    const height = 170;

    const dpr =
      window.devicePixelRatio || 1;

    canvas.width =
      width * dpr;

    canvas.height =
      height * dpr;

    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    /*
      Clear.
    */
    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    if (
      !Array.isArray(series) ||
      series.length === 0
    ) {
      ctx.font =
        "12px sans-serif";

      ctx.fillText(
        "No valid temperature data",
        16,
        30
      );

      return;
    }

    const values =
      series
        .map(item => item.value)
        .filter(
          value =>
            Number.isFinite(value)
        );

    if (values.length === 0) {
      ctx.font =
        "12px sans-serif";

      ctx.fillText(
        "No valid temperature data",
        16,
        30
      );

      return;
    }

    const padding = {
      top: 14,
      right: 12,
      bottom: 30,
      left: 34
    };

    const chartWidth =
      width -
      padding.left -
      padding.right;

    const chartHeight =
      height -
      padding.top -
      padding.bottom;

    let min =
      Math.min(...values);

    let max =
      Math.max(...values);

    /*
      Avoid a completely flat graph when all values
      genuinely happen to be similar.
    */
    if (max === min) {
      min -= 1;
      max += 1;
    }

    const range =
      max - min;

    /*
      Grid.
    */
    ctx.font =
      "10px sans-serif";

    ctx.textAlign =
      "right";

    for (let i = 0; i <= 3; i++) {
      const ratio =
        i / 3;

      const y =
        padding.top +
        chartHeight * ratio;

      const value =
        max -
        range * ratio;

      ctx.globalAlpha =
        0.16;

      ctx.beginPath();

      ctx.moveTo(
        padding.left,
        y
      );

      ctx.lineTo(
        width - padding.right,
        y
      );

      ctx.stroke();

      ctx.globalAlpha =
        0.65;

      ctx.fillText(
        `${value.toFixed(0)}°`,
        padding.left - 6,
        y + 3
      );
    }

    ctx.globalAlpha = 1;

    /*
      Temperature line.
    */
    ctx.beginPath();

    series.forEach(
      (item, index) => {
        const value =
          item.value;

        const x =
          padding.left +
          (
            index /
            Math.max(
              1,
              series.length - 1
            )
          ) *
          chartWidth;

        const y =
          padding.top +
          (
            (max - value) /
            range
          ) *
          chartHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    );

    ctx.lineWidth = 2;

    ctx.stroke();


    /*
      Points.
    */
    series.forEach(
      (item, index) => {
        const value =
          item.value;

        const x =
          padding.left +
          (
            index /
            Math.max(
              1,
              series.length - 1
            )
          ) *
          chartWidth;

        const y =
          padding.top +
          (
            (max - value) /
            range
          ) *
          chartHeight;

        ctx.beginPath();

        ctx.arc(
          x,
          y,
          2.8,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }
    );


    /*
      Month labels.
    */
    ctx.textAlign =
      "center";

    ctx.font =
      "9px sans-serif";

    series.forEach(
      (item, index) => {
        if (
          index === 0 ||
          index === series.length - 1 ||
          index % 2 === 0
        ) {
          const x =
            padding.left +
            (
              index /
              Math.max(
                1,
                series.length - 1
              )
            ) *
            chartWidth;

          ctx.fillText(
            item.label,
            x,
            height - 8
          );
        }
      }
    );

    /* Highlight the month containing the Explorer's selected observation. */
    if (selectedExplorerDate && series.length) {
      const selectedMonth = Number(String(selectedExplorerDate).slice(5,7)) - 1;
      const selectedYear = Number(String(selectedExplorerDate).slice(0,4));
      const firstDate = series[0]?.date ? String(series[0].date) : "";
      const chartYear = firstDate ? Number(firstDate.slice(0,4)) : selectedYear;
      if (selectedYear === chartYear && selectedMonth >= 0) {
        const index = Math.min(series.length - 1, Math.max(0, selectedMonth));
        const x = padding.left + (index / Math.max(1, series.length - 1)) * chartWidth;
        ctx.save();
        ctx.globalAlpha = .7;
        ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.moveTo(x,padding.top); ctx.lineTo(x,padding.top+chartHeight); ctx.stroke();
        ctx.restore();
      }
    }

  }


  /* =======================================================
     INSIGHT
     ======================================================= */

  function generateInsight(data) {
    const temp =
      data.statistics.T2M;

    const rain =
      data.statistics.PRECTOTCORR;

    const wind =
      data.statistics.WS10M;

    const messages = [];

    if (
      temp?.average !== null &&
      Number.isFinite(temp?.average)
    ) {
      messages.push(
        `The mean daily air temperature over the requested period was approximately ${temp.average.toFixed(1)} °C.`
      );
    }

    if (
      rain?.average !== null &&
      Number.isFinite(rain?.average)
    ) {
      messages.push(
        `Average corrected precipitation was ${rain.average.toFixed(1)} mm/day across valid observations.`
      );
    }

    if (
      wind?.average !== null &&
      Number.isFinite(wind?.average)
    ) {
      messages.push(
        `Average 10 m wind speed was ${wind.average.toFixed(1)} m/s.`
      );
    }

    if (messages.length === 0) {
      return `
        NASA returned no valid measurements
        from which to generate an interpretation.
      `;
    }

    return messages.join(" ");
  }


  /* =======================================================
     NO DATA
     ======================================================= */

  function showNoDataState(message) {
    const content =
      document.getElementById(
        "teiContent"
      );

    if (!content) return;

    content.innerHTML = `
      <div class="tei-error">

        <div class="tei-error-icon">
          DATA
        </div>

        <div class="tei-error-title">
          NO VALID NASA DATA
        </div>

        <div class="tei-error-text">
          ${escapeHTML(message)}
        </div>

        <div class="tei-error-note">
          TIME EARTH will not invent a value
          when NASA reports missing data.
        </div>

      </div>
    `;
  }


  /* =======================================================
     ERROR
     ======================================================= */

  function showErrorState(error) {
    const content =
      document.getElementById(
        "teiContent"
      );

    if (!content) return;

    const message =
      error?.message ||
      "Unknown NASA POWER error.";

    content.innerHTML = `
      <div class="tei-error">

        <div class="tei-error-icon">
          !
        </div>

        <div class="tei-error-title">
          NASA REQUEST FAILED
        </div>

        <div class="tei-error-text">
          ${escapeHTML(message)}
        </div>

        <button
          id="teiRetry"
          class="tei-retry"
        >
          RETRY
        </button>

      </div>
    `;

    const retry =
      document.getElementById(
        "teiRetry"
      );

    if (retry) {
      retry.addEventListener(
        "click",
        () => {
          if (
            latestObservation?.latitude !== undefined &&
            latestObservation?.longitude !== undefined
          ) {
            handleMapClick({
              latlng: {
                lat:
                  latestObservation.latitude,

                lng:
                  latestObservation.longitude
              }
            });
          }
        }
      );
    }
  }


  /* =======================================================
     STATUS
     ======================================================= */

  function setStatus(
    title,
    message
  ) {
    const content =
      document.getElementById(
        "teiContent"
      );

    if (!content) return;

    content.innerHTML = `
      <div class="tei-empty">

        <div class="tei-empty-icon">
          ⌖
        </div>

        <div class="tei-empty-title">
          ${escapeHTML(title)}
        </div>

        <div class="tei-empty-text">
          ${escapeHTML(message)}
        </div>

      </div>
    `;
  }


  /* =======================================================
     MAP MARKER
     ======================================================= */

  function placeObservationMarker(
    latitude,
    longitude
  ) {
    if (!map) return;

    if (observationMarker) {
      map.removeLayer(
        observationMarker
      );
    }

    observationMarker =
      L.circleMarker(
        [latitude, longitude],
        {
          radius: 8,

          weight: 2,

          opacity: 1,

          fillOpacity: 0.35,

          className:
            "time-earth-observation-marker"
        }
      );

    observationMarker.addTo(map);

    observationMarker.bindTooltip(
      "NASA POWER observation point",
      {
        direction: "top",
        offset: [0, -8]
      }
    );
  }


  /* =======================================================
     HELPERS
     ======================================================= */

  function normalizeLongitude(longitude) {
    let result = longitude;

    while (result > 180) {
      result -= 360;
    }

    while (result < -180) {
      result += 360;
    }

    return result;
  }


  function formatPowerDate(date) {
    const year =
      date.getUTCFullYear();

    const month =
      String(
        date.getUTCMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        date.getUTCDate()
      ).padStart(2, "0");

    return `${year}${month}${day}`;
  }


  function formatDisplayDate(
    dateKey
  ) {
    if (
      !dateKey ||
      dateKey.length !== 8
    ) {
      return dateKey;
    }

    return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
  }


  function formatMonth(
    monthKey
  ) {
    const year =
      Number(
        monthKey.slice(0, 4)
      );

    const month =
      Number(
        monthKey.slice(4, 6)
      ) - 1;

    const date =
      new Date(
        Date.UTC(
          year,
          month,
          1
        )
      );

    return date.toLocaleDateString(
      "en-US",
      {
        month: "short"
      }
    );
  }


  function formatCoordinate(
    value,
    latitude
  ) {
    if (!Number.isFinite(value)) {
      return "N/A";
    }

    const direction =
      latitude
        ? value >= 0
          ? "N"
          : "S"
        : value >= 0
          ? "E"
          : "W";

    return `${Math.abs(value).toFixed(3)}° ${direction}`;
  }


  function formatNumber(
    value,
    unit
  ) {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(value)
    ) {
      return "N/A";
    }

    let decimals = 1;

    if (
      unit === "kWh/m²/day"
    ) {
      decimals = 2;
    }

    return `${value.toFixed(decimals)} ${unit}`;
  }


  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }


  /* =======================================================
     WINDOW RESIZE
     ======================================================= */

  window.addEventListener(
    "resize",
    () => {
      if (
        latestObservation?.monthlyTemperature
      ) {
        drawTemperatureChart(
          latestObservation.monthlyTemperature
        );
      }
    }
  );


  /* =======================================================
     PUBLIC DEBUG API
     ======================================================= */

  /*
    This is intentionally exposed so we can inspect the
    most recent REAL NASA response from the browser console.

    Example:
      TIME_EARTH_POWER.last()
  */

  window.TIME_EARTH_POWER = {
    last() {
      return latestObservation;
    },

    buildRequest(
      latitude,
      longitude
    ) {
      return buildPowerRequest(
        Number(latitude),
        normalizeLongitude(
          Number(longitude)
        )
      );
    },

    parseResponse(data) {
      return parsePowerResponse(data);
    },

    selectedDate() {
      return selectedExplorerDate;
    }
  };


  /* =======================================================
     INIT
     ======================================================= */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }

})();
/* =========================================================
   TIME EARTH — NASA AI ASSISTANT
   Add this at the VERY BOTTOM of earth-intelligence.js
========================================================= */

(function () {

    "use strict";

    const NASA_AI_API = "http://localhost:3000/api/nasa/ask";

    let conversation = [];

    let currentContext = {
        location: null,
        year: null,
        observationDate: null,
        datasetKey: null,
        datasetName: null,
        datasetType: null,
        platform: null,
        instrument: null,
        product: null
    };


    /* =====================================================
       CREATE AI BUTTON
    ===================================================== */

    function createAIButton() {

        if (document.getElementById("timeEarthAIButton")) {
            return;
        }

        /*
         * Try to place the button next to the existing
         * "Explore this place" button.
         */

        const storyButton =
            document.getElementById("storyButton");

        const button = document.createElement("button");

        button.id = "timeEarthAIButton";
        button.type = "button";
        button.className = "story-button";

        button.innerHTML = `
            <span>✦</span>

            <div>
                <strong>Ask NASA AI</strong>
                <small>Understand this Earth data</small>
            </div>

            <span>→</span>
        `;

        button.addEventListener("click", openNASAIA);


        if (storyButton && storyButton.parentElement) {

            storyButton.parentElement.insertBefore(
                button,
                storyButton.nextSibling
            );

        } else {

            /*
             * Fallback:
             * Put the button in the main document.
             */

            document.body.appendChild(button);

        }
    }


    /* =====================================================
       CREATE AI PANEL
    ===================================================== */

    function createAIPanel() {

        if (document.getElementById("timeEarthAI")) {
            return;
        }

        const panel = document.createElement("aside");

        panel.id = "timeEarthAI";

        panel.innerHTML = `

            <div class="tei-ai-header">

                <div>

                    <div class="tei-ai-eyebrow">
                        TIME EARTH
                    </div>

                    <h2>
                        NASA AI
                    </h2>

                </div>

                <button
                    id="closeNASAIA"
                    class="tei-ai-close"
                    type="button"
                    aria-label="Close NASA AI"
                >
                    ×
                </button>

            </div>


            <div
                id="nasaAIContext"
                class="tei-ai-context"
            >
                NASA Earth Intelligence
            </div>


            <div
                id="nasaAIMessages"
                class="tei-ai-messages"
            >

                <div class="tei-ai-welcome">

                    <div class="tei-ai-welcome-title">
                        Ask about this place.
                    </div>

                    <p>
                        I can explain NASA observations,
                        environmental measurements,
                        satellite data, and what the
                        numbers mean.
                    </p>

                    <div class="tei-ai-examples">

                        <button
                            type="button"
                            data-question="What is the average temperature here?"
                        >
                            What is the average temperature here?
                        </button>

                        <button
                            type="button"
                            data-question="What does the NASA data tell me about this location?"
                        >
                            What does the NASA data tell me?
                        </button>

                        <button
                            type="button"
                            data-question="What should I understand from the environmental conditions here?"
                        >
                            Explain the environmental conditions.
                        </button>

                    </div>

                </div>

            </div>


            <div class="tei-ai-input-area">

                <div class="tei-ai-input-row">

                    <input
                        id="nasaAIInput"
                        type="text"
                        placeholder="Ask about this place..."
                        autocomplete="off"
                    />

                    <button
                        id="nasaAISend"
                        type="button"
                        aria-label="Send question"
                    >
                        →
                    </button>

                </div>

                <div class="tei-ai-disclaimer">
                    Answers are grounded in NASA data available
                    to TIME EARTH and may include NASA web sources.
                </div>

            </div>

        `;

        document.body.appendChild(panel);


        /* Close button */

        document
            .getElementById("closeNASAIA")
            ?.addEventListener(
                "click",
                closeNASAIA
            );


        /* Send button */

        document
            .getElementById("nasaAISend")
            ?.addEventListener(
                "click",
                askNASAIA
            );


        /* Enter key */

        document
            .getElementById("nasaAIInput")
            ?.addEventListener(
                "keydown",
                function (event) {

                    if (event.key === "Enter") {

                        event.preventDefault();

                        askNASAIA();

                    }

                }
            );


        /* Example questions */

        document
            .querySelectorAll(
                "#timeEarthAI [data-question]"
            )
            .forEach(function (button) {

                button.addEventListener(
                    "click",
                    function () {

                        const question =
                            button.dataset.question;

                        const input =
                            document.getElementById(
                                "nasaAIInput"
                            );

                        if (!input) return;

                        input.value = question;

                        input.focus();

                    }
                );

            });

    }


    /* =====================================================
       AI STYLES
    ===================================================== */

    function createAIStyles() {

        if (
            document.getElementById(
                "timeEarthAIStyles"
            )
        ) {
            return;
        }

        const style =
            document.createElement("style");

        style.id = "timeEarthAIStyles";

        style.textContent = `

            /* =========================================
               NASA AI PANEL
            ========================================= */

            #timeEarthAI {

                position: fixed;

                top: 0;
                right: 0;

                width: min(
                    430px,
                    100vw
                );

                height: 100vh;

                background:
                    rgba(
                        10,
                        20,
                        18,
                        0.98
                    );

                color: #ffffff;

                z-index: 99999;

                display: flex;

                flex-direction: column;

                transform:
                    translateX(105%);

                transition:
                    transform 0.3s
                    ease;

                box-shadow:
                    -12px 0 40px
                    rgba(
                        0,
                        0,
                        0,
                        0.35
                    );

                border-left:
                    1px solid
                    rgba(
                        255,
                        255,
                        255,
                        0.08
                    );

                font-family:
                    inherit;

            }


            #timeEarthAI.visible {

                transform:
                    translateX(0);

            }


            /* =========================================
               HEADER
            ========================================= */

            .tei-ai-header {

                display: flex;

                align-items: center;

                justify-content:
                    space-between;

                padding:
                    22px 22px 16px;

                border-bottom:
                    1px solid
                    rgba(
                        255,
                        255,
                        255,
                        0.08
                    );

            }


            .tei-ai-eyebrow {

                font-size:
                    10px;

                letter-spacing:
                    0.18em;

                opacity:
                    0.55;

                margin-bottom:
                    4px;

            }


            .tei-ai-header h2 {

                margin:
                    0;

                font-size:
                    22px;

                font-weight:
                    600;

            }


            .tei-ai-close {

                width:
                    36px;

                height:
                    36px;

                border:
                    1px solid
                    rgba(
                        255,
                        255,
                        255,
                        0.12
                    );

                border-radius:
                    50%;

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.05
                    );

                color:
                    #ffffff;

                font-size:
                    24px;

                line-height:
                    1;

                cursor:
                    pointer;

            }


            .tei-ai-close:hover {

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.12
                    );

            }


            /* =========================================
               CONTEXT
            ========================================= */

            .tei-ai-context {

                margin:
                    14px 18px 4px;

                padding:
                    10px 12px;

                border-radius:
                    10px;

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.05
                    );

                color:
                    rgba(
                        255,
                        255,
                        255,
                        0.7
                    );

                font-size:
                    12px;

                line-height:
                    1.5;

            }


            /* =========================================
               MESSAGES
            ========================================= */

            .tei-ai-messages {

                flex:
                    1;

                overflow-y:
                    auto;

                padding:
                    18px;

            }


            .tei-ai-welcome {

                padding:
                    16px;

                border:
                    1px solid
                    rgba(
                        255,
                        255,
                        255,
                        0.08
                    );

                border-radius:
                    14px;

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.035
                    );

            }


            .tei-ai-welcome-title {

                font-size:
                    16px;

                font-weight:
                    600;

                margin-bottom:
                    7px;

            }


            .tei-ai-welcome p {

                margin:
                    0 0 16px;

                color:
                    rgba(
                        255,
                        255,
                        255,
                        0.65
                    );

                font-size:
                    13px;

                line-height:
                    1.6;

            }


            /* =========================================
               EXAMPLES
            ========================================= */

            .tei-ai-examples {

                display:
                    flex;

                flex-direction:
                    column;

                gap:
                    8px;

            }


            .tei-ai-examples button {

                border:
                    1px solid
                    rgba(
                        255,
                        255,
                        255,
                        0.1
                    );

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.035
                    );

                color:
                    rgba(
                        255,
                        255,
                        255,
                        0.78
                    );

                padding:
                    10px 12px;

                border-radius:
                    9px;

                text-align:
                    left;

                cursor:
                    pointer;

                font-size:
                    12px;

                line-height:
                    1.4;

            }


            .tei-ai-examples button:hover {

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.09
                    );

            }


            /* =========================================
               MESSAGE BUBBLES
            ========================================= */

            .tei-ai-message {

                max-width:
                    88%;

                margin-bottom:
                    12px;

                padding:
                    11px 13px;

                border-radius:
                    13px;

                font-size:
                    13px;

                line-height:
                    1.6;

                white-space:
                    pre-wrap;

                word-break:
                    break-word;

            }


            .tei-ai-message.user {

                margin-left:
                    auto;

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.12
                    );

                color:
                    #ffffff;

                border-bottom-right-radius:
                    4px;

            }


            .tei-ai-message.assistant {

                margin-right:
                    auto;

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.055
                    );

                color:
                    rgba(
                        255,
                        255,
                        255,
                        0.86
                    );

                border:
                    1px solid
                    rgba(
                        255,
                        255,
                        255,
                        0.07
                    );

                border-bottom-left-radius:
                    4px;

            }


            /* =========================================
               INPUT
            ========================================= */

            .tei-ai-input-area {

                padding:
                    14px 16px 16px;

                border-top:
                    1px solid
                    rgba(
                        255,
                        255,
                        255,
                        0.08
                    );

                background:
                    rgba(
                        0,
                        0,
                        0,
                        0.15
                    );

            }


            .tei-ai-input-row {

                display:
                    flex;

                gap:
                    8px;

            }


            #nasaAIInput {

                flex:
                    1;

                min-width:
                    0;

                border:
                    1px solid
                    rgba(
                        255,
                        255,
                        255,
                        0.12
                    );

                border-radius:
                    10px;

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.06
                    );

                color:
                    #ffffff;

                padding:
                    11px 12px;

                outline:
                    none;

                font-family:
                    inherit;

                font-size:
                    13px;

            }


            #nasaAIInput::placeholder {

                color:
                    rgba(
                        255,
                        255,
                        255,
                        0.4
                    );

            }


            #nasaAIInput:focus {

                border-color:
                    rgba(
                        255,
                        255,
                        255,
                        0.3
                    );

            }


            #nasaAISend {

                width:
                    44px;

                min-width:
                    44px;

                border:
                    none;

                border-radius:
                    10px;

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.12
                    );

                color:
                    #ffffff;

                font-size:
                    20px;

                cursor:
                    pointer;

            }


            #nasaAISend:hover {

                background:
                    rgba(
                        255,
                        255,
                        255,
                        0.2
                    );

            }


            #nasaAISend:disabled {

                opacity:
                    0.5;

                cursor:
                    wait;

            }


            .tei-ai-disclaimer {

                margin-top:
                    8px;

                color:
                    rgba(
                        255,
                        255,
                        255,
                        0.35
                    );

                font-size:
                    9px;

                line-height:
                    1.4;

                text-align:
                    center;

            }


            /* =========================================
               MOBILE
            ========================================= */

            @media (
                max-width: 600px
            ) {

                #timeEarthAI {

                    width:
                        100vw;

                }

            }

        `;

        document.head.appendChild(style);

    }


    /* =====================================================
       OPEN AI
    ===================================================== */

    function openNASAIA() {

        createAIPanel();

        const panel =
            document.getElementById(
                "timeEarthAI"
            );

        if (!panel) {
            return;
        }

        panel.classList.add("visible");

        updateAIContext();

        const input =
            document.getElementById(
                "nasaAIInput"
            );

        setTimeout(
            function () {

                input?.focus();

            },
            150
        );

    }


    /* =====================================================
       CLOSE AI
    ===================================================== */

    function closeNASAIA() {

        const panel =
            document.getElementById(
                "timeEarthAI"
            );

        if (!panel) {
            return;
        }

        panel.classList.remove(
            "visible"
        );

    }


    /* =====================================================
       ADD MESSAGE
    ===================================================== */

    function addMessage(
        role,
        text
    ) {

        const messages =
            document.getElementById(
                "nasaAIMessages"
            );

        if (!messages) {
            return;
        }


        /*
         * Remove welcome screen once
         * the conversation starts.
         */

        const welcome =
            messages.querySelector(
                ".tei-ai-welcome"
            );

        if (welcome) {

            welcome.remove();

        }


        const message =
            document.createElement(
                "div"
            );

        message.className =
            "tei-ai-message " +
            (
                role === "user"
                    ? "user"
                    : "assistant"
            );


        /*
         * textContent is intentional.
         * It prevents AI output from being
         * interpreted as HTML.
         */

        message.textContent =
            text;


        messages.appendChild(
            message
        );


        messages.scrollTop =
            messages.scrollHeight;


        return message;

    }


    /* =====================================================
       GET CURRENT TIME EARTH CONTEXT
    ===================================================== */

    function getCurrentContext() {

        const state =
            window.TIME_EARTH_STATE;


        if (state) {

            if (
                state.location
            ) {

                currentContext.location =
                    state.location;

            }


            if (
                state.currentYear
            ) {

                currentContext.year =
                    state.currentYear;

            }


            if (
                state.currentLayer
            ) {

                currentContext.datasetKey =
                    state.currentLayer;

            }


            if (
                state.dataset
            ) {

                currentContext.datasetName =
                    state.dataset.name ||
                    currentContext.datasetName;

                currentContext.datasetType =
                    state.dataset.type ||
                    currentContext.datasetType;

                currentContext.platform =
                    state.dataset.platform ||
                    currentContext.platform;

                currentContext.instrument =
                    state.dataset.instrument ||
                    currentContext.instrument;

                currentContext.product =
                    state.dataset.id ||
                    currentContext.product;

            }

        }


        /*
         * Some versions of TIME EARTH may expose
         * the selected date globally.
         */

        if (
            window.TIME_EARTH_SELECTED_DATE
        ) {

            currentContext.observationDate =
                window.TIME_EARTH_SELECTED_DATE;

        }


        return currentContext;

    }


    /* =====================================================
       UPDATE CONTEXT DISPLAY
    ===================================================== */

    function updateAIContext(
        event
    ) {

        const detail =
            event?.detail || {};


        if (
            detail.location
        ) {

            currentContext.location =
                detail.location;

        }


        if (
            detail.dataset
        ) {

            currentContext.datasetName =
                detail.dataset.name ||
                currentContext.datasetName;

            currentContext.datasetType =
                detail.dataset.type ||
                currentContext.datasetType;

            currentContext.platform =
                detail.dataset.platform ||
                currentContext.platform;

            currentContext.instrument =
                detail.dataset.instrument ||
                currentContext.instrument;

            currentContext.product =
                detail.dataset.id ||
                currentContext.product;

        }


        if (
            detail.year
        ) {

            currentContext.year =
                detail.year;

        }


        if (
            detail.date
        ) {

            currentContext.observationDate =
                detail.date;

        }


        const context =
            document.getElementById(
                "nasaAIContext"
            );

        if (!context) {
            return;
        }


        const ctx =
            getCurrentContext();


        const locationName =
            ctx.location?.name ||
            "Selected location";


        const year =
            ctx.year ||
            new Date()
                .getFullYear();


        const datasetName =
            ctx.datasetName ||
            "NASA data";


        context.textContent =
            `${locationName} · ${year} · ${datasetName}`;

    }


    /* =====================================================
       ASK NASA AI
    ===================================================== */

    async function askNASAIA() {

        const input =
            document.getElementById(
                "nasaAIInput"
            );


        if (!input) {
            return;
        }


        const question =
            input.value.trim();


        if (!question) {
            return;
        }


        /*
         * Get the latest TIME EARTH state.
         */

        const context =
            getCurrentContext();


        /*
         * Check location.
         */

        if (
            !context.location ||
            typeof context.location.latitude !==
                "number" ||
            typeof context.location.longitude !==
                "number"
        ) {

            addMessage(
                "assistant",
                "Please select a location in TIME EARTH first."
            );

            return;

        }


        /*
         * Show user's question.
         */

        addMessage(
            "user",
            question
        );


        input.value = "";


        /*
         * Disable send button.
         */

        const sendButton =
            document.getElementById(
                "nasaAISend"
            );


        if (sendButton) {

            sendButton.disabled =
                true;

            sendButton.textContent =
                "…";

        }


        /*
         * Show loading message.
         */

        const loadingMessage =
            addMessage(
                "assistant",
                "Analyzing NASA data..."
            );


        try {

            const year =
                Number(
                    context.year
                ) ||
                new Date()
                    .getFullYear();


            const response =
                await fetch(
                    NASA_AI_API,
                    {
                        method:
                            "POST",

                        headers:
                            {
                                "Content-Type":
                                    "application/json"
                            },

                        body:
                            JSON.stringify(
                                {
                                    question:
                                        question,

                                    location:
                                        context.location,

                                    explorer:
                                        {
                                            year:
                                                year,

                                            observationDate:
                                                context.observationDate ||
                                                null,

                                            datasetKey:
                                                context.datasetKey ||
                                                null,

                                            datasetName:
                                                context.datasetName ||
                                                null,

                                            datasetType:
                                                context.datasetType ||
                                                null,

                                            platform:
                                                context.platform ||
                                                null,

                                            instrument:
                                                context.instrument ||
                                                null,

                                            product:
                                                context.product ||
                                                null
                                        },

                                    conversation:
                                        conversation
                                }
                            )
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    "NASA AI request failed."
                );

            }


            const answer =
                data.answer ||
                "I couldn't generate an answer.";


            /*
             * Save conversation.
             */

            conversation.push(
                {
                    role:
                        "user",

                    content:
                        question
                },

                {
                    role:
                        "assistant",

                    content:
                        answer
                }
            );


            /*
             * Replace loading message.
             */

            if (
                loadingMessage
            ) {

                loadingMessage.textContent =
                    answer;

            }


        } catch (error) {

            console.error(
                "[TIME EARTH] NASA AI error:",
                error
            );


            if (
                loadingMessage
            ) {

                loadingMessage.textContent =
                    "I couldn't reach NASA AI. Make sure your TIME EARTH server is running with `npm start`.";

            }

        } finally {

            if (sendButton) {

                sendButton.disabled =
                    false;

                sendButton.textContent =
                    "→";

            }

        }

    }


    /* =====================================================
       LISTEN FOR TIME EARTH EVENTS
    ===================================================== */

    window.addEventListener(
        "timeEarthDateChanged",
        function (event) {

            if (
                event.detail?.date
            ) {

                window.TIME_EARTH_SELECTED_DATE =
                    event.detail.date;

            }


            updateAIContext(
                event
            );

        }
    );


    window.addEventListener(
        "timeEarthDatasetChanged",
        function (event) {

            updateAIContext(
                event
            );

        }
    );


    window.addEventListener(
        "timeEarthMapReady",
        function () {

            updateAIContext();

        }
    );


    /* =====================================================
       INITIALIZE
    ===================================================== */

    function initializeNASAIA() {

        createAIStyles();

        createAIButton();

        /*
         * Do not open the panel automatically.
         * The user opens it with the button.
         */

        updateAIContext();

    }


    /*
     * TIME EARTH may load its UI dynamically,
     * so initialize after DOM is ready.
     */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            initializeNASAIA
        );

    } else {

        initializeNASAIA();

    }


    /* =====================================================
       PUBLIC API
    ===================================================== */

    window.openTIMEEARTHAI =
        openNASAIA;

    window.closeTIMEEARTHAI =
        closeNASAIA;


})();