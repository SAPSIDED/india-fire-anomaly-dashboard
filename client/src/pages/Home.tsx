/**
 * SENTINEL CARTOGRAPHY — a forensic, asymmetric India thermal-intelligence workbench.
 * Use graphite, mineral teal, Signal Ember, contour motifs, deliberate evidence-led motion, and DM Mono data labels.
 */
import { useRef, useState } from "react";
import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  CloudSun,
  Copy,
  Database,
  ExternalLink,
  Factory,
  Flame,
  Layers3,
  LocateFixed,
  MapPin,
  ScanLine,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Wind,
  X,
} from "lucide-react";

type Hotspot = {
  id: string;
  facility: string;
  place: string;
  coords: string;
  frp: string;
  confidence: string;
  recency: string;
  score: number;
  outcome: string;
  location: { lat: number; lng: number };
};

const hotspots: Hotspot[] = [
  {
    id: "IN-27.13-73.33",
    facility: "Illustrative industrial candidate",
    place: "Western India industrial corridor",
    coords: "27.13°N · 73.33°E",
    frp: "32 MW",
    confidence: "Nominal",
    recency: "Observed 2h 14m ago",
    score: 82,
    outcome: "Escalate for verification",
    location: { lat: 27.13, lng: 73.33 },
  },
  {
    id: "IN-22.31-70.82",
    facility: "Illustrative static heat source",
    place: "Gujarat process zone",
    coords: "22.31°N · 70.82°E",
    frp: "11 MW",
    confidence: "High",
    recency: "Observed 3h 02m ago",
    score: 28,
    outcome: "Likely routine heat",
    location: { lat: 22.31, lng: 70.82 },
  },
  {
    id: "IN-28.57-77.18",
    facility: "Illustrative urban-edge candidate",
    place: "Northern India industrial fringe",
    coords: "28.57°N · 77.18°E",
    frp: "18 MW",
    confidence: "Nominal",
    recency: "Observed 1h 26m ago",
    score: 66,
    outcome: "Needs contextual review",
    location: { lat: 28.57, lng: 77.18 },
  },
];

const conditionFamilies = [
  {
    number: "01",
    title: "Acquisition & sensor integrity",
    conditions: "Product version; satellite/platform; acquisition time in UTC and local IST; day/night; confidence class; Bright_ti4 and Bright_ti5; FRP availability; scan and track footprint; view/solar zenith and azimuth; glint; adjacent cloud/water; fire-mask class; algorithm QA bits; NRT/RT/standard status; missing granule and manoeuvre flags.",
  },
  {
    number: "02",
    title: "Geolocation & spatial uncertainty",
    conditions: "Point-versus-footprint treatment; geolocation-quality flag; edge-of-swath distortion; pixel area; coordinate precision; overlap with industrial polygon, works, building, tank farm, power plant, landfill, mine, kiln or port; boundary distance; overlap fraction; OSM feature age, completeness and geometry validity.",
  },
  {
    number: "03",
    title: "Time, recurrence & change",
    conditions: "First-seen time; recency; number of detections over rolling 1/7/30/365-day windows; observation opportunity count; expected seasonal/hourly pattern; consecutive passes; detection gap; baseline median and MAD; FRP/brightness slope; level shift; persistence cluster; static-mask intersection; maintenance-shutdown calendar when available.",
  },
  {
    number: "04",
    title: "Industrial process & routine heat",
    conditions: "Facility type; known flare, kiln, blast furnace, refinery, cement, steel, petrochemical, power, waste-to-energy, landfill, brick kiln, mine or incinerator status; flare stack / storage tank / chimney cues; operating hours; licensed capacity; known heat-source inventory; power or gas infrastructure proximity; night-light baseline; process-specific normal regime.",
  },
  {
    number: "05",
    title: "Non-industrial confounders",
    conditions: "Crop-residue burning; vegetation fire; forest fire; cremation ground; volcano/geothermal source; solar-glint or hot bare ground; offshore vessel or platform; water pixel; super-heated smoke artefact; agricultural season; nearby fire perimeter; vegetation and crop mask; road/rail ignition corridor; fireworks or festival timing where evidence exists.",
  },
  {
    number: "06",
    title: "Atmosphere, weather & plume context",
    conditions: "Cloud and smoke obscuration; precipitation; humidity; temperature; wind speed and direction at multiple heights; mixing height; heatwave / dry spell; lightning; dust or fog; visibility; radar/nowcast; wind alignment from candidate to smoke/aerosol signal; forecast conditions affecting spread or exposure.",
  },
  {
    number: "07",
    title: "Exposure, consequence & escalation",
    conditions: "Distance to residences, schools, hospitals, roads, railways, ports, water bodies and protected areas; population and worker exposure; hazardous-material / chemical-process flag; critical-infrastructure dependence; downwind population; neighbouring facility density; emergency-access distance; district warning state; risk tier and escalation time target.",
  },
  {
    number: "08",
    title: "Corroboration & decision governance",
    conditions: "Second satellite/pass agreement; optical or high-resolution image check; aerosol/smoke proxy; air-quality change; local authority/industrial alert; media or validated incident feed; human analyst review; provenance and source timestamp; model version; uncertainty interval; false-positive/false-negative feedback; retained audit trail and abstain rule.",
  },
];

function TinyTrend() {
  return (
    <svg className="tiny-trend" viewBox="0 0 330 86" role="img" aria-label="Illustrative rise above a facility-specific thermal baseline">
      <defs>
        <linearGradient id="lineGlow" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#72d7cf" stopOpacity="0.15" />
          <stop offset="0.65" stopColor="#72d7cf" />
          <stop offset="1" stopColor="#ff5a36" />
        </linearGradient>
      </defs>
      <path d="M0 68 C33 67 45 66 73 68 S120 64 148 65 S198 66 218 58 S246 60 265 37 S297 21 330 9" fill="none" stroke="url(#lineGlow)" strokeWidth="3" />
      <path d="M0 63 L330 63" stroke="rgba(211,225,218,.24)" strokeDasharray="4 5" />
      <circle cx="330" cy="9" r="5" fill="#ff5a36" />
    </svg>
  );
}

export default function Home() {
  const [selected, setSelected] = useState<Hotspot>(hotspots[0]);
  const [activeLayer, setActiveLayer] = useState("Thermal");
  const [verifierOpen, setVerifierOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const mapMarkers = useRef<google.maps.MVCObject[]>([]);
  const corroboration = trpc.corroboration.run.useMutation();

  const openVerifier = (hotspot = selected) => {
    setSelected(hotspot);
    setVerifierOpen(true);
    corroboration.mutate({
      detectionId: hotspot.id,
      lat: hotspot.location.lat,
      lng: hotspot.location.lng,
    });
  };

  const copyLink = async () => {
    await navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const onMapReady = (map: google.maps.Map) => {
    map.setOptions({
      disableDefaultUI: true,
      zoomControl: true,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#142529" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#9eb2ae" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#142529" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b1a22" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#284245" }] },
        { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1a3034" }] },
      ],
    });
    map.setCenter({ lat: 22.4, lng: 78.2 });
    map.setZoom(5);
    if (import.meta.env.DEV) {
      (window as Window & { __indiaFireMap?: google.maps.Map }).__indiaFireMap = map;
    }

    const infoWindow = new google.maps.InfoWindow();
    const markerIcon = (color: string) => ({
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42"><circle cx="21" cy="21" r="17" fill="${color}" fill-opacity=".18" stroke="${color}" stroke-width="1.5"/><circle cx="21" cy="21" r="8" fill="${color}" stroke="white" stroke-width="3"/></svg>`)}`,
      scaledSize: new google.maps.Size(42, 42),
      anchor: new google.maps.Point(21, 21),
    });

    hotspots.forEach(hotspot => {
      const color = hotspot.score > 70 ? "#ff5a36" : "#ffb258";
      const marker = new google.maps.Marker({
        map,
        position: hotspot.location,
        title: `${hotspot.place} — click to verify`,
        icon: markerIcon(color),
        zIndex: hotspot.score,
      });
      const zone = new google.maps.Circle({
        map,
        center: hotspot.location,
        radius: hotspot.score > 70 ? 9_000 : 6_000,
        strokeColor: color,
        strokeOpacity: 0.72,
        strokeWeight: 1,
        fillColor: color,
        fillOpacity: 0.09,
        clickable: true,
      });
      const showSummary = () => {
        infoWindow.setContent(`<div style="font-family:Arial,sans-serif;min-width:205px;color:#12201d"><strong>${hotspot.place}</strong><div style="margin-top:6px;font-family:monospace;font-size:11px">${hotspot.coords} · FRP ${hotspot.frp}</div><div style="margin-top:8px;color:#a6402c;font-size:11px">Click the zone to run industrial-fire checks</div></div>`);
        infoWindow.open({ map, anchor: marker, shouldFocus: false });
      };
      const verifyZone = () => {
        infoWindow.close();
        openVerifier(hotspot);
      };
      marker.addListener("mouseover", showSummary);
      marker.addListener("mouseout", () => infoWindow.close());
      marker.addListener("click", verifyZone);
      zone.addListener("mouseover", showSummary);
      zone.addListener("mouseout", () => infoWindow.close());
      zone.addListener("click", verifyZone);
      mapMarkers.current.push(marker, zone);
    });
  };

  return (
    <div className="sentinel-page">
      <header className="command-header">
        <a className="brand-lockup" href="#top" aria-label="India Fire Anomaly Intelligence home">
          <img src="/manus-storage/sentinel-contour-mark_ba2d7e8a.png" alt="Sentinel contour mark" />
          <span>INDIA / FIRE ANOMALY<br /><b>INTELLIGENCE</b></span>
        </a>
        <nav className="command-nav" aria-label="Primary navigation">
          <a href="#workbench">Workbench</a>
          <a href="#conditions">Conditions</a>
          <a href="#methods">Methods</a>
          <a href="#sources">Sources</a>
        </nav>
        <div className="header-actions">
          <button onClick={copyLink} className="quiet-action"><Copy size={14} /> {copied ? "Copied" : "Share"}</button>
          <button onClick={() => window.print()} className="quiet-action"><ExternalLink size={14} /> Save brief</button>
          <span className="nrt-indicator"><i /> RESEARCH PROTOTYPE</span>
        </div>
      </header>

      <main id="top">
        <section className="intro-strip" aria-label="Research premise">
          <div>
            <p className="eyebrow">SIH RESEARCH WORKBENCH · INDIA</p>
            <h1>A hot pixel is <em>evidence.</em><br />Not yet an incident.</h1>
            <span className="intro-coordinate"><i /> FIELD EXTENT · 68°E–98°E / 8°N–37°N</span>
          </div>
          <p className="intro-note">A research-led interface for screening NASA FIRMS thermal anomalies against facility context, persistence, observation quality and potential consequence before an industrial-fire hazard is escalated.</p>
          <a href="#conditions" className="data-cta">Read the condition catalogue <ArrowRight size={16} /></a>
        </section>

        <section id="workbench" className="workbench-section" aria-label="Thermal anomaly tracker demonstration">
          <div className="map-workbench">
            <div className="map-topline">
              <div className="map-title"><ScanLine size={17} /><span>THERMAL OBSERVATION FIELD</span><b>Illustrative UI · not a live incident feed</b></div>
              <div className="coordinate-readout"><LocateFixed size={15} /> INDIA / VIEWPORT <span>20.59°N · 78.96°E</span></div>
            </div>
            <div className="map-stage">
              <MapView className="india-map" initialCenter={{ lat: 22.4, lng: 78.2 }} initialZoom={5} onMapReady={onMapReady} />
              <div className="map-scanlines" aria-hidden="true" />
              <div className="map-grid" aria-hidden="true" />
              <div className="india-atlas-stamp"><b>IND / OBSERVATION GRID</b><span>68°E–98°E · 8°N–37°N</span><i /></div>
              <div className="monsoon-context"><CloudSun size={14} /><span>MONSOON CONTEXT</span><b>Weather covariate: review</b></div>
              <div className="map-legend">
                <span><i className="legend-dot ember" /> Candidate anomaly</span>
                <span><i className="legend-dot teal" /> Context data</span>
                <span><i className="legend-line" /> Industrial boundary</span>
              </div>
              <div className="map-attribution">BASE MAP © GOOGLE · ANALYTIC OVERLAYS DEMONSTRATIVE</div>
            </div>
            <div className="layer-row" aria-label="Demonstrative layers">
              {["Thermal", "OSM context", "Persistence", "Exposure"].map(layer => (
                <button key={layer} onClick={() => setActiveLayer(layer)} className={activeLayer === layer ? "active" : ""}>
                  {layer === "Thermal" && <Flame size={14} />}
                  {layer === "OSM context" && <Layers3 size={14} />}
                  {layer === "Persistence" && <Activity size={14} />}
                  {layer === "Exposure" && <ShieldAlert size={14} />}
                  {layer}
                </button>
              ))}
              <span className="layer-status"><i /> {activeLayer} evidence layer active</span>
            </div>
          </div>

          <aside className="investigation-rail" aria-label="Selected hotspot analysis">
            <div className="rail-heading">
              <span className="eyebrow">SELECTED OBSERVATION</span>
              <span className={`score-pill ${selected.score > 70 ? "hot" : "cool"}`}>{selected.score}/100</span>
            </div>
            <h2>{selected.facility}</h2>
            <p className="facility-location"><MapPin size={14} /> {selected.place}</p>
            <div className="observation-code">
              <span>{selected.id}</span><span>{selected.coords}</span>
            </div>

            <div className="metric-strip">
              <div><small>FRP</small><b>{selected.frp}</b></div>
              <div><small>CONFIDENCE</small><b>{selected.confidence}</b></div>
              <div><small>RECENCY</small><b>{selected.recency.replace("Observed ", "")}</b></div>
            </div>

            <div className="evidence-path">
              <p>SCREENING PATH</p>
              <div className="path-node done"><span>01</span><b>Thermal pixel</b><small>Quality gate passed</small></div>
              <div className="path-link" />
              <div className="path-node done"><span>02</span><b>OSM context</b><small>Industrial proximity</small></div>
              <div className="path-link" />
              <div className="path-node active"><span>03</span><b>Facility baseline</b><small>Change detected</small></div>
              <div className="path-link" />
              <div className="path-node pending"><span>04</span><b>Corroboration</b><small>Required to confirm</small></div>
            </div>

            <div className="decision-card">
              <span><AlertTriangle size={15} /> SCREENING OUTCOME</span>
              <strong>{selected.outcome}</strong>
              <p>Satellite and map evidence prioritise this candidate. They do not prove an on-site fire.</p>
              <button onClick={() => openVerifier()}>Run concurrent condition check <ChevronRight size={16} /></button>
            </div>
          </aside>
        </section>

        <section className="research-band" aria-label="Research principles">
          <div className="band-visual">
            <img src="/manus-storage/data-fusion-schematic-bg_3b012eb3.jpg" alt="Abstract scientific map sheets and heat-source contours" />
            <div className="band-visual-label"><Sparkles size={15} /> FUSE · EXPLAIN · ESCALATE</div>
          </div>
          <div className="research-copy">
            <p className="eyebrow">THE RESEARCH CLAIM</p>
            <h2>Classify the <em>change</em>, not just the heat.</h2>
            <p>FIRMS reports active-fire detections and thermal anomalies; its own documentation lists volcanoes and gas flares among thermal sources. A fire-hazard tracker therefore needs an auditable chain from satellite observation, through local industrial context and facility-relative behaviour, to a carefully worded operational outcome.</p>
            <blockquote>“Candidate industrial fire hazard” is a prioritisation label. Confirmation needs independent corroboration.</blockquote>
            <div className="source-chips"><span>NASA FIRMS / VIIRS 375 m</span><span>OSM / facility context</span><span>IMD / meteorological context</span></div>
          </div>
        </section>

        <section id="conditions" className="conditions-section">
          <div className="section-heading split-heading">
            <div><p className="eyebrow">THE FULL SCREENING SURFACE</p><h2>Conditions to evaluate<br />before you alert.</h2></div>
            <p>Use the following as a **comprehensive design catalogue**, not a fixed rulebook. Start with the minimum viable gates in bold within the site, then calibrate thresholds by facility type, satellite geometry and verified local outcomes.</p>
          </div>
          <div className="validation-ruler" aria-label="Evidence path">
            <span>00 / INPUT</span><i /><span>01 / QUALITY</span><i /><span>02 / PLACE</span><i /><span>03 / CHANGE</span><i /><span>04 / VERIFY</span>
          </div>
          <div className="conditions-grid">
            {conditionFamilies.map((family, index) => (
              <article className="condition-card" key={family.number}>
                <span className="condition-number">{family.number}</span>
                <div><h3>{family.title}</h3><p>{family.conditions}</p></div>
                <span className="condition-index">0{index + 1}</span>
              </article>
            ))}
          </div>
        </section>

        <section id="methods" className="methods-section">
          <div className="methods-intro">
            <p className="eyebrow">COMPUTATIONAL STATISTICS</p>
            <h2>Use several small models—<br />each with a job.</h2>
            <div className="method-coordinates"><span>MODEL BAY / INDIA</span><span>Δx / Δt / Δrisk</span></div>
            <p>A reliable system should not be a black-box classifier. It should combine robust facility baselines, spatial joins, density clusters, change detection and a calibrated risk model; each output should expose its contribution and uncertainty.</p>
            <img src="/manus-storage/industrial-heat-context_23373336.jpg" alt="Thermal composite of an industrial estate" />
          </div>
          <div className="method-stack">
            <article className="method-card primary-method">
              <div><span className="method-kicker">CORE SCORE</span><h3>Facility-relative robust anomaly score</h3></div>
              <div className="formula">z<sub>robust</sub> = (x<sub>t</sub> − median<sub>facility, season, pass</sub>) / (1.4826 × MAD)</div>
              <p>Use separate baselines for each facility-cell, satellite, day/night pass and season. Robust median/MAD handling reduces the influence of routine high-heat operations, while a baseline count prevents an under-observed site from appearing unusually quiet.</p>
              <TinyTrend />
              <span className="illustrative-label">Illustrative facility-relative trend · not an observed event series</span>
            </article>
            <article className="method-card">
              <span className="method-kicker">SPACE + TIME</span><h3>ST-DBSCAN / HDBSCAN</h3><p>Cluster recurrent observations into static industrial sources, flare fields or recurring biomass-fire zones. Leave isolated points as noise; cluster stability becomes an explanatory feature.</p>
            </article>
            <article className="method-card">
              <span className="method-kicker">CHANGE DETECTION</span><h3>EWMA + CUSUM</h3><p>Track sustained departures rather than reacting to one pixel. EWMA smooths noisy values; one- or two-sided CUSUM accumulates evidence of a level shift above the facility baseline.</p>
            </article>
            <article className="method-card">
              <span className="method-kicker">EVENT PROBABILITY</span><h3>Bayesian / calibrated classifier</h3><p>Estimate P(hazard | evidence) from quality, recurrence, context, exposure and corroboration features. Calibrate with verified cases and present a probability band—not a categorical certainty.</p>
            </article>
            <article className="method-card">
              <span className="method-kicker">RARE-COUNT CHECK</span><h3>Poisson or negative-binomial rate test</h3><p>Model detections per facility and observation opportunity. A count spike matters only when it exceeds the expected rate after accounting for overdispersion, cloud coverage and pass availability.</p>
            </article>
          </div>
        </section>

        <section className="implementation-section">
          <div className="implementation-hero">
            <img src="/manus-storage/india-industrial-corridor_ffd9699b.jpg" alt="Stylized satellite view of an India industrial corridor at night" />
            <span className="corridor-stamp">CORRIDOR TRACE · WEST ↔ NORTH ↔ EAST</span>
            <div><p className="eyebrow">BUILD PATH FOR THE LIVE SYSTEM</p><h2>Separate the tracker<br />from the inference engine.</h2><p>For a working SIH demonstration, the page should retrieve only pre-processed candidate records. The scheduled data service holds source keys, caches raw responses, computes baselines, and preserves every intermediate decision.</p></div>
          </div>
          <div className="architecture-grid">
            <article><Database size={19} /><h3>1. Ingest & archive</h3><p>Pull FIRMS area records; preserve raw CSV/JSON, request time, product/version, source URL, hash and ingestion status. Cache OSM queries with bounding box and query revision.</p></article>
            <article><Layers3 size={19} /><h3>2. Normalise & spatially join</h3><p>Convert UTC to IST while retaining UTC; deduplicate repeated records; represent the detection as a footprint; use PostGIS/Shapely point/footprint-to-polygon joins with a boundary uncertainty band.</p></article>
            <article><SlidersHorizontal size={19} /><h3>3. Baseline & score</h3><p>Maintain a facility-cell baseline by satellite/pass/season. Apply QA gates, persistence masking, change detection and exposure weighting. Store score components, uncertainty and decision reason.</p></article>
            <article><CircleHelp size={19} /><h3>4. Verify & improve</h3><p>Send only high-priority candidates to analyst review; record verdict and evidence. Monitor precision, recall, time-to-review and calibration drift before changing alert thresholds.</p></article>
          </div>
          <div className="architecture-note"><Wind size={16} /><span><b>Automation decision:</b> periodic public-data checks are deterministic; run them as managed background jobs with a small database and dashboard controls. Do not describe satellite polling as sub-second “live” monitoring—FIRMS global VIIRS availability is documented as within three hours of observation.</span></div>
        </section>

        <section id="sources" className="sources-section">
          <div className="section-heading"><p className="eyebrow">EVIDENCE BASE</p><h2>Sources, caveats & responsible language.</h2><p>This prototype is a research interface. It does not call FIRMS, OSM or IMD live; it demonstrates the information architecture and conditional logic required before connecting those sources.</p></div>
          <div className="source-status-line"><span>VERIFIABLE INPUTS ONLY</span><i /><span>PROVENANCE RETAINED</span><i /><span>ABSTAIN WHEN UNCERTAIN</span></div>
          <div className="source-list">
            <a href="https://firms.modaps.eosdis.nasa.gov/descriptions/FIRMS_VIIRS_Firehotspots.html" target="_blank" rel="noreferrer"><b>[1]</b><span>NASA FIRMS · VIIRS fires and thermal anomalies: fields, confidence interpretation, timing, FRP and caveats.</span><ExternalLink size={15} /></a>
            <a href="https://ladsweb.modaps.eosdis.nasa.gov/archive/Document%20Archive/Science%20Data%20Product%20Documentation/VIIRS_C2_AF-375m_User_Guide_1.2.pdf" target="_blank" rel="noreferrer"><b>[2]</b><span>VIIRS Collection 2 375 m Active Fire Product User’s Guide, June 2025.</span><ExternalLink size={15} /></a>
            <a href="https://www.earthdata.nasa.gov/news/blog/firms-releases-new-features-identify-active-fires-type" target="_blank" rel="noreferrer"><b>[3]</b><span>NASA Earthdata · Static Thermal Anomalies layers and industrial/natural heat source interpretation.</span><ExternalLink size={15} /></a>
            <a href="https://wiki.openstreetmap.org/wiki/Tag:landuse%3Dindustrial" target="_blank" rel="noreferrer"><b>[4]</b><span>OpenStreetMap Wiki · `landuse=industrial` semantics and mapping scope.</span><ExternalLink size={15} /></a>
            <a href="https://api.imd.gov.in/public/api_reference.html" target="_blank" rel="noreferrer"><b>[5]</b><span>India Meteorological Department · public weather, nowcast, warning, rainfall, radar and lightning APIs.</span><ExternalLink size={15} /></a>
            <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC8915930/" target="_blank" rel="noreferrer"><b>[6]</b><span>Franklin et al. (2019) · spatiotemporal clustering for satellite-observed flaring.</span><ExternalLink size={15} /></a>
            <a href="https://www.nature.com/articles/s41597-024-03461-3" target="_blank" rel="noreferrer"><b>[7]</b><span>Ma et al. (2024) · global industrial heat-source dataset using spatial-temporal clustering and multi-source validation.</span><ExternalLink size={15} /></a>
          </div>
          <div className="disclaimer"><ShieldAlert size={17} /><p><b>Safe conclusion language:</b> “screened candidate”, “likely routine heat”, “insufficient satellite evidence”, or “escalate for independent verification”. Do not label a thermal detection “an industrial fire” until supported by independent, time-aligned evidence and applicable authority protocols.</p></div>
        </section>
      </main>

      <footer><span>INDIA FIRE ANOMALY INTELLIGENCE · SIH RESEARCH PROTOTYPE</span><span>Designed as an evidence-first interface.</span></footer>

      {verifierOpen && (
        <div className="verification-overlay" role="dialog" aria-modal="true" aria-labelledby="verifier-title">
          <div className="verification-modal">
            <button className="modal-close" onClick={() => setVerifierOpen(false)} aria-label="Close verifier"><X size={19} /></button>
            <div className="modal-header"><span className="eyebrow">CONCURRENT CONDITIONAL VERIFICATION</span><h2 id="verifier-title">Is this heat anomaly industrial?</h2><p>{selected.facility} · {selected.id} · {selected.coords}</p></div>
            {corroboration.isPending && <div className="verification-progress live"><span>Querying FIRMS, OSM industrial context, 7-day persistence, and weather concurrently…</span><i /></div>}
            {corroboration.isError && <div className="source-error">Live evidence could not be loaded. The verifier will not issue an industrial-fire conclusion.</div>}
            {corroboration.data && <>
              <div className="check-list live-evidence">
                <div className={`verification-row revealed ${corroboration.data.firmsCurrent.state === "available" ? "pass" : "review"}`}><span className="check-state">{corroboration.data.firmsCurrent.state === "available" ? <Check size={15} /> : <CircleHelp size={15} />}</span><div><b>NASA FIRMS · NOAA-20 thermal evidence</b><p>{corroboration.data.firmsCurrent.detail}</p></div><small>{corroboration.data.firmsCurrent.state.toUpperCase()}</small></div>
                <div className={`verification-row revealed ${corroboration.data.firmsIndependentCurrent.state === "available" ? "pass" : "review"}`}><span className="check-state">{corroboration.data.firmsIndependentCurrent.state === "available" ? <Check size={15} /> : <CircleHelp size={15} />}</span><div><b>Independent satellite · SNPP VIIRS</b><p>{corroboration.data.firmsIndependentCurrent.detail}</p></div><small>{corroboration.data.firmsIndependentCurrent.state.toUpperCase()}</small></div>
                <div className={`verification-row revealed ${corroboration.data.industrial.state === "available" ? "pass" : "review"}`}><span className="check-state">{corroboration.data.industrial.state === "available" ? <Check size={15} /> : <CircleHelp size={15} />}</span><div><b>OSM · industrial context</b><p>{corroboration.data.industrial.detail}</p></div><small>{corroboration.data.industrial.state.toUpperCase()}</small></div>
                <div className={`verification-row revealed ${corroboration.data.firmsHistory.state === "available" ? "pass" : "review"}`}><span className="check-state">{corroboration.data.firmsHistory.state === "available" ? <Check size={15} /> : <CircleHelp size={15} />}</span><div><b>FIRMS · 7-day persistence</b><p>{corroboration.data.firmsHistory.detail}</p></div><small>{corroboration.data.firmsHistory.state.toUpperCase()}</small></div>
                <div className={`verification-row revealed ${corroboration.data.weather.state === "available" ? "pass" : "review"}`}><span className="check-state">{corroboration.data.weather.state === "available" ? <Check size={15} /> : <CircleHelp size={15} />}</span><div><b>Weather · independent context</b><p>{corroboration.data.weather.detail}</p></div><small>{corroboration.data.weather.state.toUpperCase()}</small></div>
                <div className={`verification-row revealed ${corroboration.data.independentCorroboration.state === "cross_platform_match" ? "pass" : "review"}`}><span className="check-state">{corroboration.data.independentCorroboration.state === "cross_platform_match" ? <Check size={15} /> : <CircleHelp size={15} />}</span><div><b>Independent satellite corroboration</b><p>{corroboration.data.independentCorroboration.detail}</p></div><small>{corroboration.data.independentCorroboration.state.toUpperCase()}</small></div>
              </div>
              <div className={`modal-result ${corroboration.data.conclusion.level}`}><span><AlertTriangle size={16} /> LIVE SCREENING RESULT</span><h3>{corroboration.data.conclusion.title}</h3><p>{corroboration.data.conclusion.detail}</p><button onClick={() => setVerifierOpen(false)}>Return to map <ArrowRight size={16} /></button></div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
