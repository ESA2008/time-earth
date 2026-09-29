document.addEventListener("DOMContentLoaded", () => {

    "use strict";

    /* =========================================================
       TIME EARTH — PLACE EXPLORER
       NASA GIBS + EARTH INTELLIGENCE
    ========================================================== */


    /* =========================================================
       OPTIONAL NASA FIRMS KEY

       Leave empty unless you later add FIRMS.
    ========================================================== */

    const FIRMS_MAP_KEY = "";


    /* =========================================================
       GET LOCATION
    ========================================================== */

    const params =
        new URLSearchParams(
            window.location.search
        );

    const placeName =
        params.get("name") ||
        "SELECTED LOCATION";

    const region =
        params.get("region") ||
        "";

    const country =
        params.get("country") ||
        "";

    const latitude =
        Number(params.get("lat"));

    const longitude =
        Number(params.get("lon"));

    const countryCode =
        (params.get("countryCode") || params.get("iso3") || "").toUpperCase();


    /* =========================================================
       VALIDATE LOCATION
    ========================================================== */

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {

        document.body.innerHTML = `
            <div style="
                min-height:100vh;
                background:#07090c;
                color:white;
                display:flex;
                align-items:center;
                justify-content:center;
                font-family:Arial,sans-serif;
                text-align:center;
                padding:40px;
            ">
                <div>

                    <h1>
                        Location not found
                    </h1>

                    <p style="
                        margin-top:12px;
                        opacity:.5;
                    ">
                        Please return to TIME EARTH
                        and select a location first.
                    </p>

                </div>
            </div>
        `;

        return;
    }


    /* =========================================================
       DOM
    ========================================================== */

    const mapElement =
        document.getElementById("map");

    const loading =
        document.getElementById("loading");

    const headerLocation =
        document.getElementById("headerLocation");

    const headerCoordinates =
        document.getElementById("headerCoordinates");

    const heroLocation =
        document.getElementById("heroLocation");

    const heroRegion =
        document.getElementById("heroRegion");

    const mapLocationName =
        document.getElementById("mapLocationName");

    const infoCountry =
        document.getElementById("infoCountry");

    const infoRegion =
        document.getElementById("infoRegion");

    const infoLatitude =
        document.getElementById("infoLatitude");

    const infoLongitude =
        document.getElementById("infoLongitude");

    const timelineSlider =
        document.getElementById("timelineSlider");

    const timelineDate =
        document.getElementById("timelineDate");

    const datasetName =
        document.getElementById("datasetName");

    const currentPlatform =
        document.getElementById("currentPlatform");

    const currentInstrument =
        document.getElementById("currentInstrument");

    const modalDataset =
        document.getElementById("modalDataset");

    const modalType =
        document.getElementById("modalType");

    const modalDate =
        document.getElementById("modalDate");

    const dataPlatform =
        document.getElementById("dataPlatform");

    const dataInstrument =
        document.getElementById("dataInstrument");

    const dataProduct =
        document.getElementById("dataProduct");


    /* =========================================================
       LOCATION UI
    ========================================================== */

    const coordinateText =
        `${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`;

    if (headerLocation) {

        headerLocation.textContent =
            placeName.toUpperCase();

    }

    if (headerCoordinates) {

        headerCoordinates.textContent =
            coordinateText;

    }

    if (heroLocation) {

        heroLocation.textContent =
            placeName;

    }

    if (heroRegion) {

        heroRegion.textContent =
            region ||
            country ||
            "Earth";

    }

    if (mapLocationName) {

        mapLocationName.textContent =
            placeName;

    }

    if (infoCountry) {

        infoCountry.textContent =
            country || "—";

    }

    if (infoRegion) {

        infoRegion.textContent =
            region || "—";

    }

    if (infoLatitude) {

        infoLatitude.textContent =
            `${latitude.toFixed(5)}°`;

    }

    if (infoLongitude) {

        infoLongitude.textContent =
            `${longitude.toFixed(5)}°`;

    }


    /* =========================================================
       LEAFLET CHECK
    ========================================================== */

    if (typeof L === "undefined") {

        console.error(
            "Leaflet was not loaded."
        );

        if (loading) {

            loading.classList.add(
                "hidden"
            );

        }

        if (mapElement) {

            mapElement.innerHTML = `
                <div style="
                    height:100%;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    color:white;
                    text-align:center;
                    font-family:Arial,sans-serif;
                ">

                    <div>

                        <h2>
                            Map library failed to load
                        </h2>

                        <p style="
                            margin-top:10px;
                            opacity:.5;
                        ">
                            Leaflet could not be loaded.
                        </p>

                    </div>

                </div>
            `;

        }

        return;
    }


    /* =========================================================
       NASA GIBS
    ========================================================== */

    const GIBS_WMS =
        "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi";


    /* =========================================================
       NASA DATASETS
    ========================================================== */

    const DATASETS = {

        truecolor: {

            id:
                "MODIS_Terra_CorrectedReflectance_TrueColor",

            name:
                "True Color",

            shortName:
                "True Color",

            description:
                "Natural-color satellite imagery.",

            platform:
                "Terra",

            instrument:
                "MODIS",

            type:
                "Daily",

            mode:
                "daily",

            opacity:
                1,

            icon:
                "🌍",

            intelligence:
                "This view shows Earth in natural-looking colors. It is useful for visually examining clouds, coastlines, vegetation patterns, water bodies and major landscape features."

        },


        vegetation: {

            id:
                "MODIS_Terra_NDVI_8Day",

            name:
                "Vegetation / NDVI",

            shortName:
                "NDVI",

            description:
                "Normalized Difference Vegetation Index.",

            platform:
                "Terra",

            instrument:
                "MODIS",

            type:
                "Rolling 8-Day",

            mode:
                "8day",

            opacity:
                0.85,

            icon:
                "🌱",

            intelligence:
                "NDVI is used to observe vegetation greenness and condition. Stronger vegetation signals generally correspond to healthier or denser green vegetation, while weaker signals can indicate sparse vegetation, bare surfaces or vegetation stress."

        },


        temperature: {

            id:
                "MODIS_Terra_L3_Land_Surface_Temp_8Day_Day",

            name:
                "Land Surface Temperature",

            shortName:
                "Surface Temperature",

            description:
                "Land surface temperature observed from space.",

            platform:
                "Terra",

            instrument:
                "MODIS",

            type:
                "8-Day",

            mode:
                "8day",

            opacity:
                0.85,

            icon:
                "🌡️",

            intelligence:
                "Land Surface Temperature represents the temperature of the Earth's surface observed by the satellite. It can reveal spatial patterns associated with heat, dry surfaces, urban areas, vegetation and water."

        },


        precipitation: {

            id:
                "IMERG_Precipitation_Rate",

            name:
                "Precipitation",

            shortName:
                "Precipitation",

            description:
                "NASA GPM IMERG precipitation observations.",

            platform:
                "GPM",

            instrument:
                "IMERG",

            type:
                "Daily",

            mode:
                "daily",

            opacity:
                0.75,

            icon:
                "🌧️",

            intelligence:
                "IMERG estimates precipitation using observations from the Global Precipitation Measurement mission. The dataset helps reveal where precipitation is occurring and how rainfall patterns vary across Earth."

        },


        fires: {

            id:
                "MODIS_Terra_Thermal_Anomalies_All",

            name:
                "Fires & Thermal Anomalies",

            shortName:
                "Thermal Anomalies",

            description:
                "MODIS thermal anomalies.",

            platform:
                "Terra",

            instrument:
                "MODIS",

            type:
                "Daily",

            mode:
                "daily",

            opacity:
                0.95,

            icon:
                "🔥",

            intelligence:
                "Thermal anomaly observations can identify unusually warm locations detected by MODIS. These observations are commonly associated with active fires, although a thermal anomaly is not automatically proof of a fire."

        },


        nightlights: {

            id:
                "VIIRS_Black_Marble",

            name:
                "Night Lights",

            shortName:
                "Night Lights",

            description:
                "NASA Black Marble nighttime observations.",

            platform:
                "Suomi NPP",

            instrument:
                "VIIRS",

            type:
                "Annual",

            mode:
                "annual",

            opacity:
                0.95,

            icon:
                "🌃",

            intelligence:
                "Nighttime satellite observations reveal patterns of artificial light across Earth's surface. They can help visualize settlements, infrastructure and changes in nighttime illumination."

        },


        aerosols: {

            id:
                "MODIS_Terra_Aerosol",

            name:
                "Aerosols",

            shortName:
                "Aerosols",

            description:
                "Aerosol optical depth.",

            platform:
                "Terra",

            instrument:
                "MODIS",

            type:
                "Daily",

            mode:
                "daily",

            opacity:
                0.8,

            icon:
                "🌫️",

            intelligence:
                "Aerosol observations describe particles suspended in the atmosphere. Aerosols can originate from sources such as dust, smoke and other atmospheric processes."

        }

    };


    /* =========================================================
       GLOBAL STATE
    ========================================================== */

    let map = null;

    let marker = null;

    window.TIME_EARTH_MAP = null;
    window.TIME_EARTH_STATE = null;

    let inspectionMarker = null;

    let nasaLayer = null;

    let currentLayerKey =
        "truecolor";

    let currentYear =
        Number(
            timelineSlider?.value
        ) || 2020;

    let playTimer =
        null;

    let inspectedLocation = null;


    /* =========================================================
       IMPORTANT
       
       Expose the Leaflet map globally.

       This allows the Earth Intelligence system
       to communicate with the Explorer.
    ========================================================== */

    window.TIME_EARTH_MAP =
        null;


    /* =========================================================
       LOADING
    ========================================================== */

    function showLoading(show) {

        if (!loading)
            return;

        if (show) {

            loading.classList.remove(
                "hidden"
            );

        } else {

            loading.classList.add(
                "hidden"
            );

        }

    }


    /* =========================================================
       NASA OBSERVATION DATE SYSTEM

       The old version used a fixed July 15 date for every
       daily/8-day product. This keeps the same timeline UI,
       but resolves the requested year against the actual
       time dimension published by NASA GIBS.
    ========================================================== */

    const capabilityCache = new Map();
    const resolvedDateCache = new Map();
    let currentObservationDate = null;
    let dateRequestToken = 0;

    function isoDate(value) {
        if (!value) return null;
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString().slice(0, 10);
    }

    function parseISODateList(text) {
        const values = [];
        if (!text) return values;
        for (const token of text.split(/[,\s]+/).filter(Boolean)) {
            if (/^\d{4}-\d{2}-\d{2}/.test(token)) {
                const date = isoDate(token);
                if (date) values.push(date);
            }
        }
        return values;
    }

    function expandISOInterval(token, limit=6000) {
        const match = token.match(/^(\d{4}-\d{2}-\d{2})(?:T[^\/]+)?\/(\d{4}-\d{2}-\d{2})(?:T[^\/]+)?\/(P[^\/]+)$/);
        if (!match) return [];
        const start = new Date(match[1] + 'T00:00:00Z');
        const end = new Date(match[2] + 'T00:00:00Z');
        const period = match[3];
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
        const m = period.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/);
        if (!m) return [];
        const years = Number(m[1] || 0), months = Number(m[2] || 0), days = Number(m[3] || 0);
        const out=[]; let cursor=new Date(start); let guard=0;
        while (cursor <= end && guard++ < limit) {
            out.push(cursor.toISOString().slice(0,10));
            if (years) cursor.setUTCFullYear(cursor.getUTCFullYear()+years);
            if (months) cursor.setUTCMonth(cursor.getUTCMonth()+months);
            if (days) cursor.setUTCDate(cursor.getUTCDate()+days);
            if (!years && !months && !days) break;
        }
        return out;
    }

    async function getGIBSTimeValues(dataset) {
        if (capabilityCache.has(dataset.id)) return capabilityCache.get(dataset.id);
        const promise = (async () => {
            const url = GIBS_WMS + '?service=WMS&request=GetCapabilities&version=1.1.1';
            const response = await fetch(url, { cache: 'force-cache' });
            if (!response.ok) throw new Error(`GIBS capabilities HTTP ${response.status}`);
            const xml = await response.text();
            const doc = new DOMParser().parseFromString(xml, 'text/xml');
            const layers = [...doc.querySelectorAll('Layer')];
            const layer = layers.find(node => node.querySelector(':scope > Name')?.textContent?.trim() === dataset.id);
            if (!layer) throw new Error(`GIBS layer not found: ${dataset.id}`);
            const dimension = [...layer.querySelectorAll(':scope > Dimension, :scope > Extent')].find(node =>
                (node.getAttribute('name') || '').toLowerCase() === 'time'
            );
            const raw = dimension?.textContent?.trim() || '';
            const dates = new Set();
            for (const token of raw.split(/[,\s]+/).filter(Boolean)) {
                const expanded = expandISOInterval(token);
                if (expanded.length) expanded.forEach(d => dates.add(d));
                else parseISODateList(token).forEach(d => dates.add(d));
            }
            return [...dates].sort();
        })();
        capabilityCache.set(dataset.id, promise);
        try { return await promise; } catch (e) { capabilityCache.delete(dataset.id); throw e; }
    }

    function fallbackObservationDate(dataset, year) {
        if (dataset.mode === 'annual') return `${year}-01-01`;
        if (dataset.mode === '8day') return `${year}-07-15`;
        return `${year}-07-15`;
    }

    async function resolveObservationDate(dataset, year) {
        const cacheKey = `${dataset.id}:${year}`;
        if (resolvedDateCache.has(cacheKey)) return resolvedDateCache.get(cacheKey);
        const target = new Date(`${year}-07-15T00:00:00Z`).getTime();
        try {
            const dates = await getGIBSTimeValues(dataset);
            const candidates = dates.filter(d => d.startsWith(String(year)));
            const pool = candidates.length ? candidates : dates;
            if (pool.length) {
                let best = pool[0], bestDistance = Infinity;
                for (const date of pool) {
                    const distance = Math.abs(new Date(date+'T00:00:00Z').getTime() - target);
                    if (distance < bestDistance) { best=date; bestDistance=distance; }
                }
                resolvedDateCache.set(cacheKey, best);
                return best;
            }
        } catch (error) {
            console.warn('[TIME EARTH] GIBS date discovery failed; using safe fallback.', error);
        }
        const fallback = fallbackObservationDate(dataset, year);
        resolvedDateCache.set(cacheKey, fallback);
        return fallback;
    }

    function getRequestedDate(dataset, year) {
        const cached = resolvedDateCache.get(`${dataset.id}:${year}`);
        return cached || fallbackObservationDate(dataset, year);
    }

    function updateTimelineText(date = currentObservationDate || getRequestedDate(DATASETS[currentLayerKey], currentYear)) {
        if (!timelineDate || !date) return;
        timelineDate.textContent = date;
    }

    /* =========================================================
       INITIALIZE MAP
    ========================================================== */

    function initializeMap() {

        map =
            L.map(
                "map",
                {
                    zoomControl:
                        false,

                    worldCopyJump:
                        true
                }
            );
            window.TIME_EARTH_MAP = map;

            window.TIME_EARTH_STATE = {
            get currentLayer() {
                return currentLayerKey;
            },

            get currentYear() {
                return currentYear;
            },

            get dataset() {
                return DATASETS[currentLayerKey];
            },

            get location() {
                return {
                name: placeName,
                country: country,
                region: region,
                latitude: latitude,
                longitude: longitude
                };
            }
            };

            window.dispatchEvent(
            new CustomEvent("timeEarthMapReady")
            );


        /*
           IMPORTANT:
           Expose map to other TIME EARTH systems.
        */

        window.TIME_EARTH_MAP =
            map;


        /*
           Also expose the current explorer state.
        */

        window.TIME_EARTH_STATE = {

            get currentLayer() {

                return currentLayerKey;

            },

            get currentYear() {

                return currentYear;

            },

            get currentObservationDate() {
                return currentObservationDate;
            },

            get dataset() {

                return DATASETS[
                    currentLayerKey
                ];

            },

            get location() {

                return {
                    name:
                        placeName,

                    country:
                        country,

                    region:
                        region,

                    latitude:
                        latitude,

                    longitude:
                        longitude
                };

            }

        };


        /* =====================================================
           DARK CARTO BASEMAP

           KEEP YOUR CARTO KEY HERE IF YOU HAVE ONE.
        ====================================================== */

        const CARTO_API_KEY = "cb1_43n7_1_dd698366fdfbb8963f886c6c";


        const base =
            L.tileLayer(
                `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
                {

                    maxZoom:
                        20,

                    attribution:
                        '&copy; OpenStreetMap contributors, &copy; CARTO'

                }
            );


        base.addTo(map);


        /* =====================================================
           EXACT LOCATION
        ====================================================== */

        map.setView(
            [
                latitude,
                longitude
            ],
            7,
            {
                animate:
                    false
            }
        );


        /* =====================================================
           MAIN LOCATION MARKER
        ====================================================== */

        const icon =
            L.divIcon({

                className:
                    "time-earth-marker",

                html: `
                    <div style="
                        width:18px;
                        height:18px;
                        border-radius:50%;
                        background:#ffffff;
                        border:4px solid rgba(255,255,255,.35);
                        box-shadow:
                            0 0 0 2px rgba(0,0,0,.4),
                            0 0 22px rgba(255,255,255,.9);
                    "></div>
                `,

                iconSize:
                    [
                        18,
                        18
                    ],

                iconAnchor:
                    [
                        9,
                        9
                    ]

            });


        marker =
            L.marker(
                [
                    latitude,
                    longitude
                ],
                {
                    icon
                }
            )
            .addTo(map);


        marker.bindTooltip(
            placeName,
            {
                direction:
                    "top"
            }
        );


        /* =====================================================
           ZOOM BUTTONS
        ====================================================== */

        document
            .getElementById("zoomIn")
            ?.addEventListener(
                "click",
                () => {

                    map.zoomIn();

                }
            );


        document
            .getElementById("zoomOut")
            ?.addEventListener(
                "click",
                () => {

                    map.zoomOut();

                }
            );


        /*
           Notify other scripts that map is ready.
        */

        window.dispatchEvent(
            new CustomEvent(
                "timeEarthMapReady"
            )
        );

    }


    /* =========================================================
       NASA WMS
    ========================================================== */

    function createNASAOverlay(
        dataset,
        date
    ) {

        return L.tileLayer.wms(
            GIBS_WMS,
            {

                layers:
                    dataset.id,

                styles:
                    "",

                format:
                    "image/png",

                transparent:
                    true,

                version:
                    "1.1.1",

                TIME:
                    date,

                opacity:
                    dataset.opacity,

                maxZoom:
                    9,

                attribution:
                    "NASA GIBS"

            }
        );

    }


    /* =========================================================
       PROPERTY PANEL
    ========================================================== */

    function updateProperties(
        key,
        date
    ) {

        const dataset =
            DATASETS[key];

        if (!dataset)
            return;


        if (datasetName) {

            datasetName.textContent =
                dataset.name;

        }


        if (currentPlatform) {

            currentPlatform.textContent =
                dataset.platform;

        }


        if (currentInstrument) {

            currentInstrument.textContent =
                dataset.instrument;

        }


        if (modalDataset) {

            modalDataset.textContent =
                dataset.name;

        }


        if (modalType) {

            modalType.textContent =
                dataset.type;

        }


        if (modalDate) {

            modalDate.textContent =
                date;

        }


        if (dataPlatform) {

            dataPlatform.textContent =
                dataset.platform;

        }


        if (dataInstrument) {

            dataInstrument.textContent =
                dataset.instrument;

        }


        if (dataProduct) {

            dataProduct.textContent =
                dataset.id;

        }


        updateTimelineText();


        /*
           Tell Earth Intelligence that
           the dataset changed.
        */

        window.dispatchEvent(
            new CustomEvent(
                "timeEarthDatasetChanged",
                {
                    detail: {

                        key:
                            key,

                        dataset:
                            dataset,

                        date:
                            date

                    }
                }
            )
        );

    }


    /* =========================================================
       LAYER ERROR
    ========================================================== */

    function showLayerError(
        dataset
    ) {

        showLoading(false);

        console.warn(
            "NASA GIBS could not display:",
            dataset.name
        );

        if (timelineDate) {

            timelineDate.textContent =
                `${currentYear} — NASA data unavailable`;

        }

    }


    /* =========================================================
       LOAD NASA LAYER
    ========================================================== */

    const nasaLayers = new Map();
    let overlayMode = false;
    let boundaryLayer = null;
    let compareState = null;

    function createPaneIfNeeded(name, zIndex) {
        if (!map) return;
        if (!map.getPane(name)) {
            map.createPane(name);
            map.getPane(name).style.zIndex = zIndex;
        }
    }

    function createNASAOverlay(dataset, date, pane='overlayPane') {
        return L.tileLayer.wms(GIBS_WMS, {
            layers: dataset.id,
            styles: '',
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            TIME: date,
            opacity: dataset.opacity ?? 1,
            maxZoom: 12,
            pane,
            attribution: 'NASA GIBS'
        });
    }

    function clearNASAOverlays() {
        for (const layer of nasaLayers.values()) {
            if (map?.hasLayer(layer)) map.removeLayer(layer);
        }
        nasaLayers.clear();
        nasaLayer = null;
    }

    function setLayerActive(key, active) {
        const dataset = DATASETS[key];
        if (!dataset || !map) return;
        if (active) {
            const existing = nasaLayers.get(key);
            if (existing) {
                if (!map.hasLayer(existing)) existing.addTo(map);
                return existing;
            }
            const date = getRequestedDate(dataset, currentYear);
            const layer = createNASAOverlay(dataset, date);
            layer.on('tileerror', e => console.warn('[TIME EARTH] NASA GIBS tile error', e));
            layer.addTo(map);
            nasaLayers.set(key, layer);
            return layer;
        }
        const layer = nasaLayers.get(key);
        if (layer && map.hasLayer(layer)) map.removeLayer(layer);
        nasaLayers.delete(key);
        return null;
    }

    async function loadLayer(key, year=currentYear, options={}) {
        const dataset = DATASETS[key];
        if (!dataset) return;
        const token = ++dateRequestToken;
        currentLayerKey = key;
        currentYear = Number(year);
        if (timelineSlider) timelineSlider.value = currentYear;
        showLoading(true);
        const date = await resolveObservationDate(dataset, currentYear);
        if (token !== dateRequestToken) return;
        currentObservationDate = date;
        updateProperties(key, date);
        updateTimelineText(date);

        if (!overlayMode) clearNASAOverlays();
        const layer = createNASAOverlay(dataset, date);
        nasaLayer = layer;
        nasaLayers.set(key, layer);
        let tileLoaded = false;
        layer.once('load', () => { tileLoaded=true; showLoading(false); });
        layer.on('tileerror', event => console.warn('NASA GIBS tile error:', event));
        layer.addTo(map);
        setTimeout(() => { if (!tileLoaded) showLayerError(dataset, date); }, 6500);

        document.querySelectorAll('.layer-card').forEach(card => {
            card.classList.toggle('active', card.dataset.layer === key);
        });
        refreshLayerControls();
        await loadAdministrativeBoundary();
        window.dispatchEvent(new CustomEvent('timeEarthDateChanged', { detail:{
            date, year:currentYear, key, dataset, location:{name:placeName,country,region,latitude,longitude}
        }}));
    }

    function showLayerError(dataset, date) {
        showLoading(false);
        if (timelineDate) timelineDate.textContent = `${date || currentYear} — observation unavailable`;
        showInlineNotice(`NASA observation unavailable for ${date || currentYear}. Try another year.`);
    }

    /* =========================================================
       LAYER BUTTONS + OVERLAY CONTROLS
    ========================================================== */

    document.querySelectorAll('.layer-card').forEach(card => {
        card.addEventListener('click', () => {
            const key = card.dataset.layer;
            if (!DATASETS[key]) return;
            if (overlayMode) {
                const isActive = nasaLayers.has(key);
                if (isActive && nasaLayers.size > 1) setLayerActive(key, false);
                else if (!isActive) setLayerActive(key, true);
                currentLayerKey = key;
                updateProperties(key, getRequestedDate(DATASETS[key], currentYear));
                refreshLayerControls();
            } else {
                loadLayer(key, currentYear);
            }
        });
    });

    if (timelineSlider) {
        timelineSlider.addEventListener('input', () => {
            currentYear = Number(timelineSlider.value);
            timelineDate.textContent = String(currentYear);
        });
        timelineSlider.addEventListener('change', () => loadLayer(currentLayerKey, Number(timelineSlider.value)));
    }

    function showInlineNotice(message) {
        let notice = document.getElementById('timeEarthNotice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id='timeEarthNotice';
            notice.className='time-earth-notice';
            document.body.appendChild(notice);
        }
        notice.textContent=message;
        notice.classList.add('visible');
        clearTimeout(notice._timer);
        notice._timer=setTimeout(()=>notice.classList.remove('visible'),5000);
    }

    function ensureAdvancedControls() {
        const section=document.querySelector('.layers-section');
        if (!section || document.getElementById('advancedLayerControls')) return;
        const box=document.createElement('div');
        box.id='advancedLayerControls';
        box.className='advanced-layer-controls';
        box.innerHTML=`
          <div class="advanced-row">
            <span>OVERLAY MODE</span>
            <button id="overlayToggle" class="mini-toggle" type="button">OFF</button>
          </div>
          <div id="activeLayerControls" class="active-layer-controls"></div>
          <button id="layerInfoButton" class="what-looking-button" type="button">ⓘ What am I looking at?</button>`;
        section.appendChild(box);
        document.getElementById('overlayToggle').addEventListener('click',()=>{
            overlayMode=!overlayMode;
            const b=document.getElementById('overlayToggle');
            b.textContent=overlayMode?'ON':'OFF'; b.classList.toggle('on',overlayMode);
            if (!overlayMode) {
                const keep=nasaLayers.get(currentLayerKey);
                for (const [k,l] of nasaLayers) if (l!==keep && map.hasLayer(l)) map.removeLayer(l);
                for (const k of [...nasaLayers.keys()]) if (k!==currentLayerKey) nasaLayers.delete(k);
            }
            refreshLayerControls();
        });
        document.getElementById('layerInfoButton').addEventListener('click',()=>openLayerInfo(currentLayerKey));
    }

    function refreshLayerControls() {
        ensureAdvancedControls();
        const holder=document.getElementById('activeLayerControls');
        if (!holder) return;
        holder.innerHTML='';
        for (const [key,layer] of nasaLayers) {
            const dataset=DATASETS[key];
            const row=document.createElement('div'); row.className='opacity-row';
            row.innerHTML=`<span>${dataset.shortName || dataset.name}</span><input type="range" min="0" max="1" step="0.05" value="${layer.options.opacity ?? 1}" aria-label="${dataset.name} opacity"><b>${Math.round((layer.options.opacity ?? 1)*100)}%</b>`;
            const input=row.querySelector('input'), value=row.querySelector('b');
            input.addEventListener('input',()=>{ const v=Number(input.value); layer.setOpacity(v); value.textContent=Math.round(v*100)+'%'; });
            holder.appendChild(row);
        }
    }

    function openLayerInfo(key) {
        const d=DATASETS[key];
        if (!d) return;
        const modal=document.getElementById('dataModal');
        if (!modal) return;
        if (modalDataset) modalDataset.textContent=d.name;
        if (modalType) modalType.textContent=d.type;
        if (modalDate) modalDate.textContent=currentObservationDate || getRequestedDate(d,currentYear);
        if (dataPlatform) dataPlatform.textContent=d.platform;
        if (dataInstrument) dataInstrument.textContent=d.instrument;
        if (dataProduct) dataProduct.textContent=d.id;
        const description=modal.querySelector('.modal-description');
        if (description) description.textContent=d.intelligence || d.description || 'NASA Earth observation layer.';
        modal.classList.add('visible');
    }

    ensureAdvancedControls();

    /* =========================================================
       PLAY TIMELINE
    ========================================================== */

    const playButton =
        document.getElementById(
            "playButton"
        );


    if (playButton) {

        playButton.addEventListener(
            "click",
            () => {

                /*
                   STOP
                */

                if (playTimer) {

                    clearInterval(
                        playTimer
                    );

                    playTimer =
                        null;

                    playButton.textContent =
                        "▶";

                    return;

                }


                /*
                   START
                */

                playButton.textContent =
                    "Ⅱ";


                playTimer =
                    setInterval(
                        () => {

                            currentYear++;


                            if (
                                currentYear >
                                Number(
                                    timelineSlider.max
                                )
                            ) {

                                currentYear =
                                    Number(
                                        timelineSlider.min
                                    );

                            }


                            if (
                                timelineSlider
                            ) {

                                timelineSlider.value =
                                    currentYear;

                            }


                            loadLayer(
                                currentLayerKey,
                                currentYear
                            );

                        },
                        3000
                    );

            }
        );

    }


    /* =========================================================
       BEFORE / AFTER COMPARISON
    ========================================================== */

    const compareButton=document.getElementById('compareButton');
    const comparisonSection=document.getElementById('comparisonSection');
    const comparisonOldDate=document.getElementById('comparisonOldDate');
    const comparisonNewDate=document.getElementById('comparisonNewDate');
    const closeComparison=document.getElementById('closeComparison');

    async function openComparison() {
        const dataset=DATASETS[currentLayerKey];
        if (!dataset || !map) return;
        const oldYear=Math.max(Number(timelineSlider?.min || 2000), currentYear-5);
        showLoading(true);
        const [oldDate,newDate]=await Promise.all([resolveObservationDate(dataset,oldYear),resolveObservationDate(dataset,currentYear)]);
        currentObservationDate=newDate;
        if (comparisonOldDate) comparisonOldDate.textContent=oldDate;
        if (comparisonNewDate) comparisonNewDate.textContent=newDate;
        comparisonSection?.classList.add('visible');
        createComparisonLayers(dataset,oldDate,newDate);
        showLoading(false);
    }

    function createComparisonLayers(dataset,oldDate,newDate) {
        destroyComparisonLayers();
        createPaneIfNeeded('timeEarthCompareOld',430);
        createPaneIfNeeded('timeEarthCompareNew',440);
        const oldLayer=createNASAOverlay(dataset,oldDate,'timeEarthCompareOld');
        const newLayer=createNASAOverlay(dataset,newDate,'timeEarthCompareNew');
        compareState={oldLayer,newLayer,oldDate,newDate,position:50};
        oldLayer.addTo(map); newLayer.addTo(map);
        applyComparisonClip();
        ensureComparisonControls();
    }

    function applyComparisonClip() {
        if (!compareState) return;
        const pane=map.getPane('timeEarthCompareNew');
        if (!pane) return;
        const p=compareState.position ?? 50;
        pane.style.clipPath=`inset(0 0 0 ${p}%)`;
        pane.style.webkitClipPath=`inset(0 0 0 ${p}%)`;
    }

    function destroyComparisonLayers() {
        if (!compareState) return;
        for (const l of [compareState.oldLayer,compareState.newLayer]) if (l && map?.hasLayer(l)) map.removeLayer(l);
        compareState=null;
        const pane=map?.getPane('timeEarthCompareNew'); if (pane) { pane.style.clipPath=''; pane.style.webkitClipPath=''; }
        document.getElementById('comparisonRange')?.remove();
    }

    function ensureComparisonControls() {
        if (!comparisonSection || document.getElementById('comparisonRange')) return;
        const wrap=document.createElement('div'); wrap.className='comparison-slider-wrap';
        wrap.innerHTML=`<label>SWIPE COMPARISON <span id="comparisonRangeValue">50%</span></label><input id="comparisonRange" type="range" min="5" max="95" value="50">`;
        comparisonSection.appendChild(wrap);
        const input=wrap.querySelector('input'), value=wrap.querySelector('span');
        input.addEventListener('input',()=>{ compareState.position=Number(input.value); value.textContent=input.value+'%'; applyComparisonClip(); });
    }

    compareButton?.addEventListener('click',openComparison);
    closeComparison?.addEventListener('click',()=>{ comparisonSection?.classList.remove('visible'); destroyComparisonLayers(); });
    window.addEventListener('resize',applyComparisonClip);

    /* =========================================================
       DATA MODAL
    ========================================================== */

    const dataModal =
        document.getElementById(
            "dataModal"
        );

    const aboutDataButton =
        document.getElementById(
            "aboutDataButton"
        );

    const closeModal =
        document.getElementById(
            "closeModal"
        );


    if (aboutDataButton) {

        aboutDataButton.addEventListener(
            "click",
            () => {

                dataModal
                    ?.classList
                    .add(
                        "visible"
                    );

            }
        );

    }


    if (closeModal) {

        closeModal.addEventListener(
            "click",
            () => {

                dataModal
                    ?.classList
                    .remove(
                        "visible"
                    );

            }
        );

    }


    if (dataModal) {

        dataModal.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    dataModal
                ) {

                    dataModal
                        .classList
                        .remove(
                            "visible"
                        );

                }

            }
        );

    }


    /* =========================================================
       FULLSCREEN
    ========================================================== */

    const fullscreenButton =
        document.getElementById(
            "fullscreenButton"
        );


    if (fullscreenButton) {

        fullscreenButton.addEventListener(
            "click",
            async () => {

                try {

                    if (
                        !document.fullscreenElement
                    ) {

                        await document
                            .documentElement
                            .requestFullscreen();

                    } else {

                        await document
                            .exitFullscreen();

                    }

                } catch (error) {

                    console.warn(
                        "Fullscreen error:",
                        error
                    );

                }

            }
        );

    }


    /* =========================================================
       BACK BUTTON
    ========================================================== */

    document
        .getElementById(
            "backButton"
        )
        ?.addEventListener(
            "click",
            () => {

                window.location.href =
                    "index.html";

            }
        );


    /* =========================================================
       EARTH STORY
    ========================================================== */

    let storyState=null;

    function ensureStoryUI() {
        if (document.getElementById('earthStoryModal')) return;
        const el=document.createElement('div');
        el.id='earthStoryModal'; el.className='earth-story-modal';
        el.innerHTML=`
          <div class="earth-story-box">
            <div class="story-top"><div><span class="section-eyebrow">EARTH STORY</span><h2 id="storyTitle">A place through time</h2></div><button id="storyClose" class="small-button">CLOSE</button></div>
            <div class="story-progress"><div id="storyProgressBar"></div></div>
            <div class="story-year" id="storyYear">—</div>
            <p id="storyCaption">Preparing NASA observations…</p>
            <div class="story-actions"><button id="storyPrev" class="small-button">← PREVIOUS</button><button id="storyPause" class="small-button">PAUSE</button><button id="storyNext" class="small-button">NEXT →</button></div>
          </div>`;
        document.body.appendChild(el);
        document.getElementById('storyClose').onclick=closeStory;
        document.getElementById('storyPrev').onclick=()=>storyStep(-1);
        document.getElementById('storyNext').onclick=()=>storyStep(1);
        document.getElementById('storyPause').onclick=toggleStoryPause;
    }

    async function openStory() {
        ensureStoryUI();
        const dataset=DATASETS[currentLayerKey] || DATASETS.truecolor;
        storyState={datasetKey:currentLayerKey || 'truecolor', years:[2000,2005,2010,2015,2020,currentYear].filter((y,i,a)=>a.indexOf(y)===i),index:0,playing:true};
        document.getElementById('earthStoryModal').classList.add('visible');
        await storyStep(0);
    }

    async function storyStep(delta) {
        if (!storyState) return;
        storyState.index=Math.max(0,Math.min(storyState.years.length-1,storyState.index+(delta||0)));
        const year=storyState.years[storyState.index];
        const dataset=DATASETS[storyState.datasetKey];
        const date=await resolveObservationDate(dataset,year);
        await loadLayer(storyState.datasetKey,year,{story:true});
        const title=document.getElementById('storyTitle'), y=document.getElementById('storyYear'), caption=document.getElementById('storyCaption'), bar=document.getElementById('storyProgressBar');
        if(title) title.textContent=`${placeName}: an Earth story`;
        if(y) y.textContent=`${year} · ${date}`;
        if(caption) caption.textContent=dataset.intelligence || dataset.description || 'NASA Earth observation';
        if(bar) bar.style.width=`${((storyState.index+1)/storyState.years.length)*100}%`;
        if(storyState.playing && storyState.index < storyState.years.length-1) { clearTimeout(storyState.timer); storyState.timer=setTimeout(()=>storyStep(1),4200); }
        else if (storyState.index===storyState.years.length-1) storyState.playing=false;
    }

    function toggleStoryPause() {
        if(!storyState) return;
        storyState.playing=!storyState.playing;
        const btn=document.getElementById('storyPause'); if(btn) btn.textContent=storyState.playing?'PAUSE':'PLAY';
        if(storyState.playing) storyStep(0); else clearTimeout(storyState.timer);
    }

    function closeStory() {
        clearTimeout(storyState?.timer); storyState=null; document.getElementById('earthStoryModal')?.classList.remove('visible');
    }

    document.getElementById('storyButton')?.addEventListener('click',openStory);

    /* =========================================================
       ADMINISTRATIVE BOUNDARY
    ========================================================== */

    async function getISO3() {
        if (countryCode && countryCode.length===3) return countryCode;
        const mapCodes={ethiopia:'ETH',kenya:'KEN',uganda:'UGA',tanzania:'TZA',rwanda:'RWA',nigeria:'NGA',ghana:'GHA',unitedstates:'USA',usa:'USA',unitedkingdom:'GBR',uk:'GBR',france:'FRA',germany:'DEU',india:'IND',china:'CHN'};
        const normalized=country.toLowerCase().replace(/[^a-z]/g,'');
        if(mapCodes[normalized]) return mapCodes[normalized];
        try {
            const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10`,{headers:{'Accept':'application/json'}});
            if(!r.ok) throw new Error('reverse geocode failed');
            const d=await r.json();
            return d.address?.['ISO3166-1-alpha3'] || d.address?.country_code?.toUpperCase() || null;
        } catch(e) { return null; }
    }

    async function loadAdministrativeBoundary() {
        if(!map || !region) return;
        try {
            const iso3=await getISO3(); if(!iso3 || iso3.length!==3) return;
            const meta=await fetch(`https://www.geoboundaries.org/api/current/gbOpen/${iso3}/ADM1/`).then(r=>{if(!r.ok) throw new Error('boundary metadata failed'); return r.json();});
            const url=meta.simplifiedGeometryGeoJSON || meta.gjDownloadURL; if(!url) return;
            const geo=await fetch(url).then(r=>{if(!r.ok) throw new Error('boundary geojson failed'); return r.json();});
            if(boundaryLayer && map.hasLayer(boundaryLayer)) map.removeLayer(boundaryLayer);
            boundaryLayer=L.geoJSON(geo,{style:{color:'#38bdf8',weight:1.2,opacity:.45,fillOpacity:0.02},filter:feature=>{const p=feature?.properties||{}; const names=Object.values(p).filter(v=>typeof v==='string').map(v=>v.toLowerCase()); const target=region.toLowerCase(); return names.some(v=>v===target || v.includes(target) || target.includes(v));}}).addTo(map);
        } catch(e) { console.warn('[TIME EARTH] Administrative boundary unavailable',e); }
    }

    /* =========================================================
       RETURN TO LOCATION
    ========================================================== */
    function addReturnLocationControl() {
        if(document.getElementById('returnLocationButton')) return;
        const button=document.createElement('button'); button.id='returnLocationButton'; button.className='return-location-control'; button.title='Return to selected location'; button.textContent='⌖';
        button.onclick=()=>map?.flyTo([latitude,longitude],7,{duration:.7});
        document.querySelector('.map-section')?.appendChild(button);
    }
    addReturnLocationControl();

    /* =========================================================
       INITIALIZE
    ========================================================== */

    initializeMap();

    updateTimelineText();

    loadLayer(
        "truecolor",
        currentYear
    );


    /* =========================================================
       DEBUG
    ========================================================== */

    console.log(
        "TIME EARTH Explorer initialized."
    );

    console.log(
        "Location:",
        placeName,
        latitude,
        longitude
    );

    console.log(
        "NASA GIBS:",
        GIBS_WMS
    );

});