/* =========================================================
   TIME EARTH
   MAIN JAVASCRIPT
========================================================= */


/* =========================================================
   ELEMENTS
========================================================= */

const globeContainer =
    document.getElementById("globe-container");

const locationSearch =
    document.getElementById("locationSearch");

const searchResults =
    document.getElementById("searchResults");

const locationLabel =
    document.getElementById("location-label");

const locationName =
    document.getElementById("location-name");

const locationCountry =
    document.getElementById("location-country");

const closeLocation =
    document.getElementById("closeLocation");

const exploreLocation =
    document.getElementById("exploreLocation");

const nasaStatus =
    document.getElementById("nasa-status");

const nasaStatusText =
    document.getElementById("nasa-status-text");

const dataLoadingOverlay =
    document.getElementById("data-loading-overlay");

const dataLoadingTitle =
    document.getElementById("data-loading-title");

const explorer =
    document.getElementById("explorer");

const globePage =
    document.getElementById("globePage");

const backToEarth =
    document.getElementById("backToEarth");

const explorerLocation =
    document.getElementById("explorerLocation");

const explorerLocationMeta =
    document.getElementById("explorerLocationMeta");

const explorerCoordinates =
    document.getElementById("explorerCoordinates");

const mapLocationName =
    document.getElementById("mapLocationName");

const mapLayerTitle =
    document.getElementById("mapLayerTitle");

const mapLoading =
    document.getElementById("mapLoading");

const fullscreenMap =
    document.getElementById("fullscreenMap");

const mapStage =
    document.querySelector(".map-stage");

const timelineSlider =
    document.getElementById("timelineSlider");

const timelineProgress =
    document.getElementById("timelineProgress");

const timelineDot =
    document.getElementById("timelineDot");

const timelineYear =
    document.getElementById("timelineYear");

const timelineDate =
    document.getElementById("timelineDate");

const selectedDateLarge =
    document.getElementById("selectedDateLarge");

const selectedDateDescription =
    document.getElementById(
        "selectedDateDescription"
    );

const aboutDataToggle =
    document.getElementById("aboutDataToggle");

const aboutData =
    document.getElementById("aboutData");

const aboutArrow =
    document.getElementById("aboutArrow");

const dataDataset =
    document.getElementById("dataDataset");

const dataPlatform =
    document.getElementById("dataPlatform");

const dataInstrument =
    document.getElementById("dataInstrument");

const dataProduct =
    document.getElementById("dataProduct");


/* =========================================================
   THREE.JS
========================================================= */

const scene =
    new THREE.Scene();


const camera =
    new THREE.PerspectiveCamera(
        45,
        window.innerWidth /
            window.innerHeight,
        0.1,
        100
    );


const HOME_CAMERA_Z = 2.6;
const CINEMATIC_CAMERA_Z = 1.55;


camera.position.set(
    0,
    0,
    HOME_CAMERA_Z
);


const renderer =
    new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });


renderer.setPixelRatio(
    Math.min(
        window.devicePixelRatio,
        2
    )
);


renderer.setSize(
    window.innerWidth,
    window.innerHeight
);


renderer.outputColorSpace =
    THREE.SRGBColorSpace;


globeContainer.appendChild(
    renderer.domElement
);


/* =========================================================
   LIGHTING
========================================================= */

const ambientLight =
    new THREE.AmbientLight(
        0xffffff,
        1.2
    );


scene.add(
    ambientLight
);


const directionalLight =
    new THREE.DirectionalLight(
        0xffffff,
        2
    );


directionalLight.position.set(
    4,
    2,
    5
);


scene.add(
    directionalLight
);


/* =========================================================
   EARTH
========================================================= */

const earthGroup =
    new THREE.Group();


scene.add(
    earthGroup
);


const earthGeometry =
    new THREE.SphereGeometry(
        1,
        96,
        96
    );


const textureLoader =
    new THREE.TextureLoader();


let earthTexture = null;


function createEarth() {

    const material =
        new THREE.MeshPhongMaterial({

            color: 0x285b8f,

            shininess: 5,

            specular: 0x222222

        });


    const earth =
        new THREE.Mesh(
            earthGeometry,
            material
        );


    earthGroup.add(
        earth
    );


    return earth;

}


const earth =
    createEarth();


textureLoader.load(

    "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",

    function(texture) {

        earthTexture =
            texture;

        earth.material.map =
            texture;

        earth.material.color.set(
            0xffffff
        );

        earth.material.needsUpdate =
            true;

    },

    undefined,

    function() {

        console.log(
            "Earth texture could not be loaded. Using fallback."
        );

    }

);


/* =========================================================
   ATMOSPHERE
========================================================= */

const atmosphereGeometry =
    new THREE.SphereGeometry(
        1.035,
        64,
        64
    );


const atmosphereMaterial =
    new THREE.MeshBasicMaterial({

        color: 0x1687ff,

        transparent: true,

        opacity: 0.075,

        side: THREE.BackSide

    });


const atmosphere =
    new THREE.Mesh(
        atmosphereGeometry,
        atmosphereMaterial
    );


earthGroup.add(
    atmosphere
);


/* =========================================================
   STARS
========================================================= */

const starGeometry =
    new THREE.BufferGeometry();


const starCount = 5000;


const starPositions =
    new Float32Array(
        starCount * 3
    );


for (
    let i = 0;
    i < starCount * 3;
    i++
) {

    starPositions[i] =
        (Math.random() - 0.5) * 20;

}


starGeometry.setAttribute(

    "position",

    new THREE.BufferAttribute(
        starPositions,
        3
    )

);


const starMaterial =
    new THREE.PointsMaterial({

        color: 0xffffff,

        size: 0.018,

        transparent: true,

        opacity: 0.7

    });


const stars =
    new THREE.Points(
        starGeometry,
        starMaterial
    );


scene.add(
    stars
);


/* =========================================================
   GLOBE MARKER
========================================================= */

let marker = null;
let markerGlow = null;


function createMarker() {

    if (marker) return;


    const markerGeometry =
        new THREE.SphereGeometry(
            0.022,
            20,
            20
        );


    const markerMaterial =
        new THREE.MeshBasicMaterial({
            color: 0x38bdf8
        });


    marker =
        new THREE.Mesh(
            markerGeometry,
            markerMaterial
        );


    earthGroup.add(
        marker
    );


    const glowGeometry =
        new THREE.SphereGeometry(
            0.045,
            20,
            20
        );


    const glowMaterial =
        new THREE.MeshBasicMaterial({

            color: 0x38bdf8,

            transparent: true,

            opacity: 0.22

        });


    markerGlow =
        new THREE.Mesh(
            glowGeometry,
            glowMaterial
        );


    earthGroup.add(
        markerGlow
    );

}


function removeMarker() {

    if (!marker) return;


    earthGroup.remove(
        marker
    );


    earthGroup.remove(
        markerGlow
    );


    marker.geometry.dispose();
    marker.material.dispose();

    markerGlow.geometry.dispose();
    markerGlow.material.dispose();


    marker = null;
    markerGlow = null;

}


/* =========================================================
   LAT/LON → VECTOR
========================================================= */

function latLonToVector3(
    lat,
    lon,
    radius = 1
) {

    const phi =
        (90 - lat) *
        Math.PI /
        180;


    const theta =
        (lon + 180) *
        Math.PI /
        180;


    return new THREE.Vector3(

        -radius *
            Math.sin(phi) *
            Math.cos(theta),

        radius *
            Math.cos(phi),

        radius *
            Math.sin(phi) *
            Math.sin(theta)

    );

}


/* =========================================================
   VECTOR → LAT/LON
========================================================= */

function vector3ToLatLon(
    vector
) {

    const point =
        vector
            .clone()
            .normalize();


    const lat =
        Math.asin(
            point.y
        ) *
        180 /
        Math.PI;


    let lon =
        Math.atan2(
            point.z,
            -point.x
        ) *
        180 /
        Math.PI -
        180;


    if (lon > 180)
        lon -= 360;


    if (lon < -180)
        lon += 360;


    return {
        lat,
        lon
    };

}


/* =========================================================
   LOCATION QUATERNION
========================================================= */

function getLocationQuaternion(
    lat,
    lon
) {

    const locationVector =
        latLonToVector3(
            lat,
            lon,
            1
        ).normalize();


    const front =
        new THREE.Vector3(
            0,
            0,
            1
        );


    const quaternion =
        new THREE.Quaternion();


    quaternion.setFromUnitVectors(
        locationVector,
        front
    );


    return quaternion;

}


/* =========================================================
   LOCATION HELPERS
========================================================= */

function getLocationRegion(
    place
) {

    const address =
        place?.address || {};


    return (

        address.state ||

        address.region ||

        address.province ||

        address.state_district ||

        address.county ||

        ""

    );

}


function getShortName(
    place
) {

    const address =
        place?.address || {};


    return (

        address.city ||

        address.town ||

        address.village ||

        address.municipality ||

        address.county ||

        place?.name ||

        place?.display_name
            ?.split(",")[0] ||

        "Selected location"

    );

}


/* =========================================================
   NASA STATUS
========================================================= */

function setNASAStatus(
    text,
    active = false
) {

    if (!nasaStatusText || !nasaStatus)
        return;


    nasaStatusText.textContent =
        text;


    nasaStatus.classList.toggle(
        "active",
        active
    );

}


/* =========================================================
   LOCATION LABEL
========================================================= */

function updateLocationLabel(
    place
) {

    if (!place) return;


    const name =
        place.name ||
        "Selected location";


    const region =
        place.region ||
        "";


    const country =
        place.country ||
        "";


    let subtitle = "";


    if (
        region &&
        country
    ) {

        subtitle =
            `${region} · ${country}`;

    }

    else if (country) {

        subtitle =
            country;

    }

    else {

        subtitle =
            "Selected location";

    }


    locationName.textContent =
        name.toUpperCase();


    locationCountry.textContent =
        subtitle;

}


/* =========================================================
   LOCATION LABEL POSITION
========================================================= */

function updateLocationLabelPosition() {

    if (
        !marker ||
        !hasSelection ||
        flightActive
    ) {

        return;

    }


    const worldPosition =
        new THREE.Vector3();


    marker.getWorldPosition(
        worldPosition
    );


    const projected =
        worldPosition
            .clone()
            .project(camera);


    const x =
        (
            projected.x *
            0.5 +
            0.5
        ) *
        window.innerWidth;


    const y =
        (
            -projected.y *
            0.5 +
            0.5
        ) *
        window.innerHeight;


    locationLabel.style.left =
        `${x + 18}px`;


    locationLabel.style.top =
        `${y - 18}px`;

}


/* =========================================================
   SET MARKER
========================================================= */

function setMarker(
    lat,
    lon
) {

    if (!marker)
        createMarker();


    const position =
        latLonToVector3(
            lat,
            lon,
            1.045
        );


    marker.position.copy(
        position
    );


    markerGlow.position.copy(
        position
    );

}


/* =========================================================
   FLIGHT
========================================================= */

let hasSelection = false;

let flightActive = false;

let dragging = false;

let searchRequestId = 0;


window.selectedPlace = null;


let flightStages = [];

let currentFlightStage = 0;

let stageStartTime = 0;


const AFRICA_CENTER = {
    lat: 2,
    lon: 20
};


function startFlightForPlace(
    place
) {

    if (!place) return;


    hasSelection = true;

    flightActive = true;

    dragging = false;


    locationLabel.classList.add(
        "hidden"
    );


    exploreLocation.classList.add(
        "hidden"
    );


    setNASAStatus(
        "LOCATING...",
        true
    );


    setMarker(
        place.lat,
        place.lon
    );


    const destinationQuaternion =
        getLocationQuaternion(
            place.lat,
            place.lon
        );


    const africaQuaternion =
        getLocationQuaternion(
            AFRICA_CENTER.lat,
            AFRICA_CENTER.lon
        );


    const regionQuaternion =
        getLocationQuaternion(
            place.lat * 0.65,
            place.lon * 0.65
        );


    flightStages = [

        {
            quaternion:
                africaQuaternion,

            cameraZ: 2.35,

            duration: 2300,

            startQuaternion:
                earthGroup.quaternion.clone(),

            startCameraZ:
                camera.position.z

        },

        {
            quaternion:
                regionQuaternion,

            cameraZ: 1.95,

            duration: 1900

        },

        {
            quaternion:
                destinationQuaternion,

            cameraZ:
                CINEMATIC_CAMERA_Z,

            duration: 2800

        }

    ];


    currentFlightStage = 0;

    stageStartTime =
        performance.now();

}


/* =========================================================
   EASING
========================================================= */

function easeInOutCubic(
    t
) {

    return t < 0.5

        ? 4 * t * t * t

        : 1 -
            Math.pow(
                -2 * t + 2,
                3
            ) /
            2;

}


/* =========================================================
   UPDATE FLIGHT
========================================================= */

function updateFlight(
    now
) {

    if (
        !flightActive ||
        !flightStages.length
    ) {

        return;

    }


    const stage =
        flightStages[
            currentFlightStage
        ];


    const elapsed =
        now -
        stageStartTime;


    const progress =
        Math.min(
            elapsed /
            stage.duration,
            1
        );


    const eased =
        easeInOutCubic(
            progress
        );


    if (
        stage.startQuaternion
    ) {

        earthGroup.quaternion
            .copy(
                stage.startQuaternion
            )
            .slerp(
                stage.quaternion,
                eased
            );

    }

    else {

        earthGroup.quaternion.slerp(
            stage.quaternion,
            eased
        );

    }


    const startZ =
        stage.startCameraZ ??
        camera.position.z;


    camera.position.z =
        THREE.MathUtils.lerp(
            startZ,
            stage.cameraZ,
            eased
        );


    if (
        progress >= 1
    ) {

        currentFlightStage++;


        if (
            currentFlightStage >=
            flightStages.length
        ) {

            finishFlight();

        }

        else {

            const nextStage =
                flightStages[
                    currentFlightStage
                ];


            nextStage.startQuaternion =
                earthGroup.quaternion.clone();


            nextStage.startCameraZ =
                camera.position.z;


            stageStartTime =
                now;

        }

    }

}


/* =========================================================
   FINISH FLIGHT
========================================================= */

function finishFlight() {

    flightActive = false;


    if (
        window.selectedPlace
    ) {

        earthGroup.quaternion.copy(

            getLocationQuaternion(

                window.selectedPlace.lat,

                window.selectedPlace.lon

            )

        );


        camera.position.z =
            CINEMATIC_CAMERA_Z;

    }


    updateLocationLabel(
        window.selectedPlace
    );


    locationLabel.classList.remove(
        "hidden"
    );


    exploreLocation.classList.remove(
        "hidden"
    );


    const placeName =
        window.selectedPlace?.name ||
        "SELECTED LOCATION";


    const country =
        window.selectedPlace?.country ||
        "";


    setNASAStatus(

        country

            ? `${placeName} · ${country}`

            : placeName,

        true

    );


    updateLocationLabelPosition();

}


/* =========================================================
   SEARCH
========================================================= */

let searchTimeout = null;


locationSearch.addEventListener(
    "input",
    () => {

        clearTimeout(
            searchTimeout
        );


        const query =
            locationSearch.value.trim();


        if (
            query.length < 2
        ) {

            searchResults.innerHTML =
                "";

            return;

        }


        searchTimeout =
            setTimeout(
                () => {

                    searchPlaces(
                        query
                    );

                },
                300
            );

    }
);


async function searchPlaces(
    query
) {

    const requestId =
        ++searchRequestId;


    try {

        const url =
            "https://nominatim.openstreetmap.org/search" +

            "?format=jsonv2" +

            "&q=" +
            encodeURIComponent(query) +

            "&limit=6" +

            "&addressdetails=1" +

            "&accept-language=en";


        const response =
            await fetch(
                url
            );


        if (
            !response.ok
        ) {

            throw new Error(
                "Search failed"
            );

        }


        const places =
            await response.json();


        if (
            requestId !==
            searchRequestId
        ) {

            return;

        }


        renderSearchResults(
            places
        );

    }

    catch(error) {

        console.error(
            "Location search error:",
            error
        );


        searchResults.innerHTML =
            "";

    }

}


/* =========================================================
   RENDER SEARCH RESULTS
========================================================= */

function renderSearchResults(
    places
) {

    searchResults.innerHTML =
        "";


    places.forEach(
        place => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "search-result";


            const name =
                getShortName(
                    place
                );


            const region =
                getLocationRegion(
                    place
                );


            const country =
                place?.address?.country ||
                "";


            item.innerHTML = `

                <div class="search-result-name">
                    ${escapeHTML(name)}
                </div>

                <div class="search-result-meta">
                    ${escapeHTML(
                        [
                            region,
                            country
                        ]
                        .filter(Boolean)
                        .join(" · ")
                    )}
                </div>

            `;


            item.addEventListener(
                "click",
                () => {

                    selectPlace(
                        place
                    );

                }
            );


            searchResults.appendChild(
                item
            );

        }
    );

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(
    value
) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =========================================================
   SELECT SEARCH RESULT
========================================================= */

function selectPlace(
    place
) {

    const name =
        getShortName(
            place
        );


    const region =
        getLocationRegion(
            place
        );


    const country =
        place?.address?.country ||
        "";


    const lat =
        Number(
            place.lat
        );


    const lon =
        Number(
            place.lon
        );


    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
    ) {

        console.error(
            "Invalid coordinates:",
            place
        );

        return;

    }


    window.selectedPlace = {

        name,

        region,

        country,

        lat,

        lon

    };


    locationSearch.value =
        `${name}${country ? ", " + country : ""}`;


    searchResults.innerHTML =
        "";


    startFlightForPlace(
        window.selectedPlace
    );

}


/* =========================================================
   CLICK OUTSIDE SEARCH
========================================================= */

document.addEventListener(
    "click",
    event => {

        if (
            !event.target.closest(
                ".nav-search"
            )
        ) {

            searchResults.innerHTML =
                "";

        }

    }
);


/* =========================================================
   GLOBE CLICK
========================================================= */

const raycaster =
    new THREE.Raycaster();


const pointer =
    new THREE.Vector2();


globeContainer.addEventListener(
    "pointerdown",
    event => {

        dragging = false;


        pointer.x =
            (
                event.clientX /
                window.innerWidth
            ) *
            2 -
            1;


        pointer.y =
            -(
                event.clientY /
                window.innerHeight
            ) *
            2 +
            1;

    }
);


globeContainer.addEventListener(
    "pointermove",
    event => {

        if (
            Math.abs(
                event.movementX
            ) > 2 ||

            Math.abs(
                event.movementY
            ) > 2
        ) {

            dragging = true;

        }

    }
);


globeContainer.addEventListener(
    "click",
    async event => {

        if (
            dragging ||
            flightActive
        ) {

            return;

        }


        pointer.x =
            (
                event.clientX /
                window.innerWidth
            ) *
            2 -
            1;


        pointer.y =
            -(
                event.clientY /
                window.innerHeight
            ) *
            2 +
            1;


        raycaster.setFromCamera(
            pointer,
            camera
        );


        const intersections =
            raycaster.intersectObject(
                earth
            );


        if (
            !intersections.length
        ) {

            return;

        }


        const hit =
            intersections[0];


        const localPoint =
            earth.worldToLocal(
                hit.point.clone()
            );


        const coordinates =
            vector3ToLatLon(
                localPoint
            );


        await reverseGeocode(
            coordinates.lat,
            coordinates.lon
        );

    }
);


/* =========================================================
   REVERSE GEOCODING
========================================================= */

async function reverseGeocode(
    lat,
    lon
) {

    try {

        setNASAStatus(
            "IDENTIFYING LOCATION...",
            true
        );


        const url =
            "https://nominatim.openstreetmap.org/reverse" +

            "?format=jsonv2" +

            "&lat=" +
            encodeURIComponent(lat) +

            "&lon=" +
            encodeURIComponent(lon) +

            "&zoom=18" +

            "&addressdetails=1" +

            "&accept-language=en";


        const response =
            await fetch(
                url
            );


        if (
            !response.ok
        ) {

            throw new Error(
                "Reverse geocoding failed"
            );

        }


        const place =
            await response.json();


        const name =
            getShortName(
                place
            );


        const region =
            getLocationRegion(
                place
            );


        const country =
            place?.address?.country ||
            "";


        window.selectedPlace = {

            name,

            region,

            country,

            lat,

            lon

        };


        locationSearch.value =
            `${name}${country ? ", " + country : ""}`;


        startFlightForPlace(
            window.selectedPlace
        );

    }

    catch(error) {

        console.error(
            "Reverse geocoding error:",
            error
        );


        setNASAStatus(
            "LOCATION NOT FOUND",
            false
        );

    }

}


/* =========================================================
   DRAG GLOBE
========================================================= */

let previousPointerX = null;
let previousPointerY = null;


globeContainer.addEventListener(
    "pointerdown",
    event => {

        if (flightActive)
            return;


        previousPointerX =
            event.clientX;


        previousPointerY =
            event.clientY;

    }
);


globeContainer.addEventListener(
    "pointermove",
    event => {

        if (
            previousPointerX === null ||
            previousPointerY === null ||
            flightActive
        ) {

            return;

        }


        if (
            event.buttons !== 1
        ) {

            return;

        }


        const deltaX =
            event.clientX -
            previousPointerX;


        const deltaY =
            event.clientY -
            previousPointerY;


        if (
            Math.abs(deltaX) > 1 ||
            Math.abs(deltaY) > 1
        ) {

            dragging = true;

        }


        earthGroup.rotation.y +=
            deltaX * 0.005;


        earthGroup.rotation.x +=
            deltaY * 0.0025;


        earthGroup.rotation.x =
            THREE.MathUtils.clamp(
                earthGroup.rotation.x,
                -0.8,
                0.8
            );


        previousPointerX =
            event.clientX;


        previousPointerY =
            event.clientY;

    }
);


window.addEventListener(
    "pointerup",
    () => {

        previousPointerX = null;

        previousPointerY = null;

    }
);


/* =========================================================
   WHEEL ZOOM
========================================================= */

globeContainer.addEventListener(
    "wheel",
    event => {

        if (flightActive)
            return;


        camera.position.z +=
            event.deltaY *
            0.0015;


        camera.position.z =
            THREE.MathUtils.clamp(
                camera.position.z,
                1.35,
                3.5
            );

    },
    {
        passive: true
    }
);


/* =========================================================
   CLEAR LOCATION
========================================================= */

closeLocation.addEventListener(
    "click",
    () => {

        clearSelection();

    }
);


function clearSelection() {

    hasSelection = false;

    flightActive = false;

    removeMarker();


    locationLabel.classList.add(
        "hidden"
    );


    exploreLocation.classList.add(
        "hidden"
    );


    locationSearch.value =
        "";


    searchResults.innerHTML =
        "";


    window.selectedPlace =
        null;


    setNASAStatus(
        "STANDBY",
        false
    );


    camera.position.z =
        HOME_CAMERA_Z;

}


/* =========================================================
   NASA EXPLORER
   IMPORTANT:

   NASA GIBS MAP CODE HAS BEEN MOVED TO explorer.js.

   DO NOT put WMTS/WMS tile code here.

   This file is responsible only for:
   - selecting a location
   - storing its exact coordinates
   - opening explorer.html
========================================================= */


/* =========================================================
   OPEN EXPLORER
========================================================= */

exploreLocation.addEventListener(
    "click",
    () => {

        if (
            !window.selectedPlace
        ) {

            return;

        }


        openExplorer();

    }
);


function openExplorer() {

    const place =
        window.selectedPlace;


    if (!place) {

        return;

    }


    const lat =
        Number(place.lat);


    const lon =
        Number(place.lon);


    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
    ) {

        console.error(
            "Cannot open Explorer: invalid coordinates.",
            place
        );

        return;

    }


    dataLoadingTitle.textContent =
        "CONNECTING TO NASA EARTH OBSERVATION DATA";


    dataLoadingOverlay.classList.remove(
        "hidden"
    );


    /*
        IMPORTANT:

        We now pass the EXACT selected
        latitude and longitude to
        explorer.html.

        Example:

        explorer.html?
        name=Addis%20Ababa&
        region=Addis%20Ababa&
        country=Ethiopia&
        lat=9.03&
        lon=38.74
    */


    const params =
        new URLSearchParams({

            name:
                place.name || "",

            region:
                place.region || "",

            country:
                place.country || "",

            lat:
                String(lat),

            lon:
                String(lon)

        });


    const explorerURL =
        `explorer.html?${params.toString()}`;


    /*
        Small cinematic loading delay.
    */

    setTimeout(
        () => {

            window.location.href =
                explorerURL;

        },
        650
    );

}


/* =========================================================
   WINDOW RESIZE
========================================================= */

window.addEventListener(
    "resize",
    () => {

        camera.aspect =
            window.innerWidth /
            window.innerHeight;


        camera.updateProjectionMatrix();


        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

    }
);


/* =========================================================
   CAMERA RETURN
========================================================= */

let returningHome = false;

let homeReturnStart = 0;

let homeReturnQuaternion =
    new THREE.Quaternion();

let homeReturnCameraZ = 0;


function updateCameraReturn(
    now
) {

    if (!returningHome)
        return;


    const duration =
        1400;


    const progress =
        Math.min(
            (
                now -
                homeReturnStart
            ) /
            duration,
            1
        );


    const eased =
        easeInOutCubic(
            progress
        );


    earthGroup.quaternion
        .copy(
            homeReturnQuaternion
        )
        .slerp(
            new THREE.Quaternion(),
            eased
        );


    camera.position.z =
        THREE.MathUtils.lerp(
            homeReturnCameraZ,
            HOME_CAMERA_Z,
            eased
        );


    if (
        progress >= 1
    ) {

        returningHome = false;

    }

}


/* =========================================================
   RETURN EARTH HOME
========================================================= */

function returnEarthHome() {

    returningHome = true;

    homeReturnStart =
        performance.now();

    homeReturnQuaternion =
        earthGroup.quaternion.clone();

    homeReturnCameraZ =
        camera.position.z;

}


/* =========================================================
   ANIMATION
========================================================= */

let lastTime =
    performance.now();


function animate(
    now
) {

    requestAnimationFrame(
        animate
    );


    const delta =
        now -
        lastTime;


    lastTime =
        now;


    /*
        Normal Earth rotation
    */

    if (
        !dragging &&
        !hasSelection &&
        !flightActive &&
        !returningHome
    ) {

        earthGroup.rotation.y +=
            0.0018;

    }


    updateFlight(
        now
    );


    updateCameraReturn(
        now
    );


    /*
        Marker pulse
    */

    if (
        marker &&
        markerGlow
    ) {

        const pulse =
            1 +
            Math.sin(
                now * 0.004
            ) *
            0.25;


        markerGlow.scale.setScalar(
            pulse
        );

    }


    updateLocationLabelPosition();


    renderer.render(
        scene,
        camera
    );

}


animate(
    performance.now()
);