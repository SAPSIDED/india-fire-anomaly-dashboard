/**
 * FireGuard presentation layer. The map, verifier, authentication, and data bindings
 * intentionally remain unchanged; this file only reshapes how that information is presented.
 */
import { useRef, useState, type FormEvent } from "react";
import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { AlertTriangle, Check, ChevronRight, CircleHelp, Copy, ExternalLink, MapPin, X } from "lucide-react";

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
  { number: "01", title: "Acquisition integrity", conditions: "Platform, acquisition time, confidence class, brightness values, FRP, footprint, viewing geometry, glint, cloud and product-quality status." },
  { number: "02", title: "Location context", conditions: "Footprint uncertainty, industrial overlap, facility boundary distance, industrial assets, map completeness and geolocation quality." },
  { number: "03", title: "Temporal behaviour", conditions: "First-seen time, recurrence windows, observation opportunities, seasonal pattern, consecutive passes, baseline departure and persistence clusters." },
  { number: "04", title: "Routine process heat", conditions: "Known flare, kiln, refinery, steel, power, waste, mine or incineration context, operating regime and normal heat-source inventory." },
  { number: "05", title: "Competing explanations", conditions: "Vegetation fire, crop burning, geothermal source, hot ground, vessel activity, water pixels, agricultural season and nearby fire perimeter." },
  { number: "06", title: "Atmosphere and plume", conditions: "Cloud and smoke, rainfall, humidity, wind direction, mixing height, heatwave, lightning, visibility and downwind alignment." },
  { number: "07", title: "Exposure and consequence", conditions: "Distance to people and sensitive receptors, hazardous-material context, critical infrastructure, downwind population and emergency access." },
  { number: "08", title: "Corroboration governance", conditions: "Second-satellite agreement, image review, authority input, human analyst review, timestamps, provenance, uncertainty and abstention rules." },
];

type HistoryEvidence = {
  state: "available" | "cached" | "unavailable";
  detections: number;
  dailyDetections: Array<{ date: string; detections: number }>;
  checkedAt: string;
  detail: string;
};

function HistoricalAnalysis({ history, selected }: { history?: HistoryEvidence; selected: Hotspot }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const points = history?.dailyDetections ?? [];
  const peak = Math.max(1, ...points.map(point => point.detections));
  const active = points.find(point => point.date === selectedDate) ?? points[points.length - 1];
  const liveHistory = history?.state === "available" || history?.state === "cached";
  const activeLabel = active ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${active.date}T00:00:00Z`)) : "No date-level records";
  const activeValue = active ? `${active.detections} detection${active.detections === 1 ? "" : "s"}` : "—";

  return (
    <article className="history-panel interactive-history-panel">
      <div className="history-heading"><div><p className="eyebrow">HISTORICAL ANALYSIS</p><h3>Source-backed observation history.</h3></div><span className={`history-source ${history?.state ?? "not_queried"}`}>{history ? history.state.toUpperCase() : "NOT QUERIED"}</span></div>
      <p className="history-target">{selected.id} · 7-DAY FIRMS WINDOW</p>
      <div className="history-stat-grid" aria-label="Seven-day history statistics">
        <div><span>DETECTIONS</span><b>{liveHistory ? history.detections : "—"}</b></div>
        <div><span>ACTIVE DAYS</span><b>{liveHistory ? points.length : "—"}</b></div>
        <div><span>PEAK DAY</span><b>{activeValue}</b></div>
      </div>
      <div className="history-chart-wrap">
        {points.length > 0 ? <div className="history-bars" role="list" aria-label="Daily source-provided FIRMS detections. Select a day for its count.">{points.map(point => <button key={point.date} type="button" role="listitem" className={active?.date === point.date ? "active" : ""} onClick={() => setSelectedDate(point.date)} aria-pressed={active?.date === point.date} aria-label={`${point.date}: ${point.detections} FIRMS detections`}><i style={{ height: `${Math.max(10, Math.round((point.detections / peak) * 100))}%` }} /><span>{new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}</span></button>)}</div> : <div className="history-empty"><b>{liveHistory ? "No local FIRMS detections in the returned seven-day history." : "Run source verification to load live seven-day FIRMS history."}</b><span>The chart only renders daily counts present in the official source response; it does not fill or simulate missing dates.</span></div>}
      </div>
      <div className="history-selection" aria-live="polite"><span>SELECTED DAY</span><strong>{activeLabel}</strong><small>{active ? `${activeValue} in the local 8 km screening radius.` : history?.detail ?? "No history source has been requested for this target."}</small></div>
      <p className="history-caveat">Historical recurrence can support a routine-heat explanation. It does not establish the source or confirm an incident.</p>
    </article>
  );
}

function ThermalIllustration({ selected }: { selected: Hotspot }) {
  return (
    <div className="thermal-illustration" aria-label="Illustrative satellite thermal analysis screen">
      <div className="thermal-illustration-topline"><span>THERMAL FIELD / DEMONSTRATION</span><span>INDIA SECTOR</span></div>
      <div className="thermal-plot" aria-hidden="true">
        <span className="contour contour-a" /><span className="contour contour-b" /><span className="contour contour-c" />
        <span className="thermal-marker moderate" /><span className="thermal-marker elevated" /><span className="thermal-marker critical selected" />
        <span className="analysis-ring" /><span className="analysis-crosshair" />
        <span className="map-coordinate x-axis">72°E</span><span className="map-coordinate y-axis">24°N</span>
      </div>
      <div className="thermal-readout">
        <div><small>SELECTED TARGET</small><b>{selected.id}</b></div>
        <div><small>COORDINATE</small><b>{selected.coords}</b></div>
        <div><small>FIRE RADIATIVE POWER</small><b>{selected.frp}</b></div>
        <div><small>SCREENING STATE</small><b>REQUIRES EVIDENCE</b></div>
      </div>
      <div className="thermal-scale"><span>BACKGROUND</span><i /><i /><i /><b>HIGH THERMAL SIGNAL</b></div>
    </div>
  );
}

export default function Home() {
  const [selected, setSelected] = useState<Hotspot>(hotspots[0]);
  const [activeLayer, setActiveLayer] = useState("Thermal");
  const [verifierOpen, setVerifierOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [authorityForm, setAuthorityForm] = useState({
    sourceType: "authority" as "authority" | "facility",
    sourceName: "",
    sourceUrl: "",
    incidentReference: "",
    reportedAt: "",
    details: "",
  });
  const mapMarkers = useRef<google.maps.MVCObject[]>([]);
  const thermalFieldRef = useRef<HTMLDivElement>(null);
  const { user, isAuthenticated } = useAuth();
  const corroboration = trpc.corroboration.run.useMutation();
  const authorityRecord = trpc.incidentEvidence.record.useMutation();

  const runVerifier = (hotspot = selected) => {
    corroboration.mutate({ detectionId: hotspot.id, lat: hotspot.location.lat, lng: hotspot.location.lng });
  };

  const openVerifier = (hotspot = selected) => {
    setSelected(hotspot);
    setVerifierOpen(true);
    runVerifier(hotspot);
  };

  const submitAuthorityEvidence = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reportedAt = new Date(authorityForm.reportedAt);
    if (Number.isNaN(reportedAt.getTime())) return;
    authorityRecord.mutate({
      detectionId: selected.id,
      lat: selected.location.lat,
      lng: selected.location.lng,
      sourceType: authorityForm.sourceType,
      sourceName: authorityForm.sourceName,
      sourceUrl: authorityForm.sourceUrl,
      incidentReference: authorityForm.incidentReference,
      reportedAt: reportedAt.toISOString(),
      details: authorityForm.details,
    }, {
      onSuccess: () => {
        setAuthorityForm({ sourceType: "authority", sourceName: "", sourceUrl: "", incidentReference: "", reportedAt: "", details: "" });
        runVerifier(selected);
      },
    });
  };

  const copyLink = async () => {
    await navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const moveThermalField = (event: React.PointerEvent<HTMLDivElement>) => {
    const field = thermalFieldRef.current;
    if (!field) return;
    field.style.setProperty("--thermal-x", `${Math.round((event.clientX / window.innerWidth) * 100)}%`);
    field.style.setProperty("--thermal-y", `${Math.round((event.clientY / window.innerHeight) * 100)}%`);
  };

  const onMapReady = (map: google.maps.Map) => {
    map.setOptions({
      disableDefaultUI: true,
      zoomControl: true,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#eee8df" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#59676d" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#f6f0e8" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#bdd5df" }] },
        { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#e6dacb" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#dbc7b9" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#d5b3a4" }] },
        { featureType: "poi", elementType: "geometry", stylers: [{ color: "#dce4d6" }] },
        { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#aeb7ab" }] },
      ],
    });
    map.setCenter({ lat: 22.4, lng: 78.2 });
    map.setZoom(5);
    if (import.meta.env.DEV) (window as Window & { __indiaFireMap?: google.maps.Map }).__indiaFireMap = map;

    const infoWindow = new google.maps.InfoWindow();
    const markerIcon = (color: string) => ({
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42"><circle cx="21" cy="21" r="17" fill="${color}" fill-opacity=".13" stroke="${color}" stroke-width="1.5"/><circle cx="21" cy="21" r="7" fill="${color}" stroke="#f2eee6" stroke-width="2.5"/></svg>`)}`,
      scaledSize: new google.maps.Size(42, 42),
      anchor: new google.maps.Point(21, 21),
    });

    hotspots.forEach(hotspot => {
      const color = hotspot.score > 70 ? "#d46b63" : "#e0ac68";
      const marker = new google.maps.Marker({ map, position: hotspot.location, title: `${hotspot.place} — click to verify`, icon: markerIcon(color), zIndex: hotspot.score });
      const zone = new google.maps.Circle({ map, center: hotspot.location, radius: hotspot.score > 70 ? 9_000 : 6_000, strokeColor: color, strokeOpacity: 0.72, strokeWeight: 1, fillColor: color, fillOpacity: 0.07, clickable: true });
      const showSummary = () => {
        infoWindow.setContent(`<div style="font-family:Arial,sans-serif;min-width:205px;color:#4f5a5d"><strong>${hotspot.place}</strong><div style="margin-top:6px;font-family:monospace;font-size:11px">${hotspot.coords} · FRP ${hotspot.frp}</div><div style="margin-top:8px;color:#b65f58;font-size:11px">Click the zone to start source verification</div></div>`);
        infoWindow.open({ map, anchor: marker, shouldFocus: false });
      };
      const verifyZone = () => { infoWindow.close(); openVerifier(hotspot); };
      marker.addListener("mouseover", showSummary); marker.addListener("mouseout", () => infoWindow.close()); marker.addListener("click", verifyZone);
      zone.addListener("mouseover", showSummary); zone.addListener("mouseout", () => infoWindow.close()); zone.addListener("click", verifyZone);
      mapMarkers.current.push(marker, zone);
    });
  };

  return (
    <div className="fireguard-page" onPointerMove={moveThermalField}>
      <div ref={thermalFieldRef} className="thermal-field" aria-hidden="true"><i /><i /><i /></div>
      <header className="mission-header">
        <a className="brand-lockup" href="#top" aria-label="FireGuard India home"><img src="/manus-storage/sentinel-contour-mark_ba2d7e8a.png" alt="FireGuard contour mark" /><span>FIREGUARD / INDIA<small>THERMAL INTELLIGENCE</small></span></a>
        <nav className="mission-nav" aria-label="Primary navigation"><a href="#workbench">Analysis field</a><a href="#pipeline">Method</a><a href="#conditions">Conditions</a><a href="#sources">Sources</a></nav>
        <div className="mission-actions"><button onClick={copyLink}>{copied ? "Link copied" : "Share brief"}</button><button onClick={() => window.print()}>Print brief</button><span><i /> RESEARCH PROTOTYPE</span></div>
      </header>

      <main id="top">
        <section className="mission-hero" aria-label="FireGuard mission overview">
          <div className="hero-copy"><p className="eyebrow">SATELLITE THERMAL INTELLIGENCE / INDIA</p><h1>See the heat.<br /><em>Understand the source.</em></h1><p>Satellite observations can identify thermal anomalies. FireGuard keeps the next question explicit: what does the location, recurrence, independent satellite evidence and incident provenance indicate?</p><div className="hero-actions"><a href="#workbench">Open analysis field <ChevronRight size={15} /></a><span>NO CLAIM WITHOUT EVIDENCE</span></div></div>
          <ThermalIllustration selected={selected} />
        </section>

        <section id="workbench" className="analysis-field" aria-label="Thermal anomaly analysis workbench">
          <div className="section-cap"><div><p className="eyebrow">ACTIVE ANALYSIS FIELD</p><h2>From thermal signal to an evidence-backed screen.</h2></div><p>The markers are illustrative map candidates. Opening one preserves its geographic position and starts the unchanged concurrent verification flow.</p></div>
          <div className="workbench-shell">
            <div className="map-workbench">
              <div className="map-topline"><span>OBSERVATION MAP</span><span>INDIA / 68°E–98°E / 8°N–37°N</span><b>BASE MAP + ANALYTIC OVERLAYS</b></div>
              <div className="map-stage"><MapView className="india-map" initialCenter={{ lat: 22.4, lng: 78.2 }} initialZoom={5} onMapReady={onMapReady} /><div className="map-frame-label"><b>THERMAL ANOMALY FIELD</b><span>Click a geographic target to verify</span></div><div className="map-legend"><span><i className="legend-dot critical" /> Critical signal</span><span><i className="legend-dot elevated" /> Elevated signal</span><span><i className="legend-line" /> Investigation radius</span></div><div className="map-attribution">GOOGLE BASE MAP · DEMONSTRATIVE TARGETS</div></div>
              <div className="layer-row" aria-label="Demonstrative layers">{["Thermal", "OSM context", "Persistence", "Exposure"].map(layer => <button key={layer} onClick={() => setActiveLayer(layer)} className={activeLayer === layer ? "active" : ""}>{layer}</button>)}<span>{activeLayer} layer selected</span></div>
            </div>
            <aside className="analysis-rail" aria-label="Selected anomaly analysis"><div className="rail-topline"><span>SELECTED TARGET</span><b className={selected.score > 70 ? "critical" : "elevated"}>{selected.score}/100</b></div><h3>{selected.facility}</h3><p className="target-location"><MapPin size={13} /> {selected.place}</p><div className="target-code"><span>{selected.id}</span><span>{selected.coords}</span></div><dl className="instrument-grid"><div><dt>FRP</dt><dd>{selected.frp}</dd></div><div><dt>CONFIDENCE</dt><dd>{selected.confidence}</dd></div><div><dt>RECENCY</dt><dd>{selected.recency.replace("Observed ", "")}</dd></div></dl><div className="screening-ladder"><p>INVESTIGATION PATH</p><div><b>01</b><span>Thermal observation<small>Signal available</small></span></div><div><b>02</b><span>Geographic context<small>Industrial proximity</small></span></div><div><b>03</b><span>Historical behaviour<small>Baseline and recurrence</small></span></div><div><b>04</b><span>Independent evidence<small>Required for conclusion</small></span></div></div><div className="screening-callout"><span>SCREENING STATUS</span><strong>{selected.outcome}</strong><p>A thermal candidate is not a confirmed industrial fire. Review the actual source responses before escalation.</p><button onClick={() => openVerifier()}>Run source verification <ChevronRight size={15} /></button></div></aside>
          </div>
        </section>

        <section id="pipeline" className="investigation-section" aria-label="Thermal investigation method"><div className="section-cap"><div><p className="eyebrow">INVESTIGATION PIPELINE</p><h2>A thermal anomaly does not explain itself.</h2></div><p>Every assessment keeps acquisition, context and corroboration separate so the conclusion can be reviewed rather than merely accepted.</p></div><ol className="investigation-flow"><li><b>01</b><div><h3>Thermal signal</h3><p>Something unusual was observed.</p></div></li><li><b>02</b><div><h3>Location context</h3><p>What exists around the coordinate?</p></div></li><li><b>03</b><div><h3>Temporal behaviour</h3><p>Does the signal recur in place?</p></div></li><li><b>04</b><div><h3>Satellite evidence</h3><p>Does a second source agree?</p></div></li><li><b>05</b><div><h3>Screened outcome</h3><p>What can responsibly be said?</p></div></li></ol></section>

        <section className="evidence-board" aria-label="Data, spatial, and historical analysis"><div className="source-flow"><p className="eyebrow">EVIDENCE INPUTS</p><div><span>NASA FIRMS<small>Thermal detection</small></span><i /><span>OPENSTREETMAP<small>Location context</small></span><i /><span>HISTORICAL OBSERVATIONS<small>Temporal behaviour</small></span><i /><span>WEATHER CONTEXT<small>Environmental conditions</small></span></div><b>CONCURRENT SCREENING</b></div><div className="evidence-grid"><article className="classification-panel"><p className="eyebrow">CLASSIFICATION INTERFACE</p><h2>Observed heat is not its source.</h2><div className="classification-state"><span>SCREENING CLASS</span><strong>INDUSTRIAL / FIRE / OTHER / UNCERTAIN</strong><small>Demonstration of evidence categories. Live verifier results remain source-backed.</small></div><ul><li><i /> Industrial setting nearby</li><li><i /> Recurrence assessed over time</li><li><i /> Cross-platform check recorded</li><li><i /> Authority evidence required for confirmation</li></ul></article><HistoricalAnalysis selected={selected} history={corroboration.data?.detectionId === selected.id ? corroboration.data.firmsHistory : undefined} /><article className="spatial-panel"><p className="eyebrow">SPATIAL RELATIONSHIP</p><div className="spatial-link"><b>THERMAL<br />ANOMALY</b><i /><span>LOCAL<br />CONTEXT</span><i /><strong>INDUSTRIAL<br />ASSET</strong></div><p>Map context helps establish proximity, not causation. The verifier retains the location and source state for review.</p></article></div></section>

        <section id="conditions" className="conditions-section"><div className="section-cap"><div><p className="eyebrow">SCREENING CONDITIONS</p><h2>Conditions before escalation.</h2></div><p>This catalogue makes the uncertainty surface visible. Thresholds must remain calibrated against verified outcomes and facility-specific behaviour.</p></div><div className="condition-register">{conditionFamilies.map(family => <article key={family.number}><b>{family.number}</b><div><h3>{family.title}</h3><p>{family.conditions}</p></div></article>)}</div></section>

        <section className="methods-section"><div className="methods-lead"><p className="eyebrow">ANALYTIC FRAMEWORK</p><h2>Several modest tests, each with a defined role.</h2><p>FireGuard’s research approach favours interpretable signals over a black-box conclusion: robust baselines, spatial joins, recurrence, change and evidence provenance.</p></div><div className="method-register"><article><b>BASELINE</b><h3>Robust anomaly score</h3><p>Compare observations to facility, season and pass-specific behaviour.</p></article><article><b>SPACE + TIME</b><h3>Recurrence clustering</h3><p>Separate stable thermal sources from isolated observations.</p></article><article><b>CHANGE</b><h3>Level-shift review</h3><p>Track sustained departures rather than one pixel alone.</p></article><article><b>UNCERTAINTY</b><h3>Calibrated screening</h3><p>Preserve evidence state and withhold unsupported conclusions.</p></article></div></section>

        <section className="roadmap-section"><p className="eyebrow">EXTENSION PATH / NOT CURRENT PRODUCT CAPABILITY</p><div><span>Satellite thermal detection</span><i /><span>Geospatial context</span><i /><span>Persistence analysis</span><i /><span>Industrial asset identification</span><i /><span>Sensor and incident integration</span><i /><span>Early-warning response</span></div></section>

        <section id="sources" className="sources-section"><div className="section-cap"><div><p className="eyebrow">EVIDENCE BASE</p><h2>Sources and caveats.</h2></div><p>The live verifier presents individual source states and abstains when the required current evidence is unavailable.</p></div><div className="source-list"><a href="https://firms.modaps.eosdis.nasa.gov/descriptions/FIRMS_VIIRS_Firehotspots.html" target="_blank" rel="noreferrer"><b>01</b><span>NASA FIRMS · Thermal anomaly observations, confidence, timing and radiative-power caveats.</span><ExternalLink size={15} /></a><a href="https://wiki.openstreetmap.org/wiki/Tag:landuse%3Dindustrial" target="_blank" rel="noreferrer"><b>02</b><span>OpenStreetMap · Industrial land-use and facility context.</span><ExternalLink size={15} /></a><a href="https://api.imd.gov.in/public/api_reference.html" target="_blank" rel="noreferrer"><b>03</b><span>India Meteorological Department · Weather, nowcast and related public information.</span><ExternalLink size={15} /></a><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC8915930/" target="_blank" rel="noreferrer"><b>04</b><span>Spatiotemporal clustering research for satellite-observed persistent heat sources.</span><ExternalLink size={15} /></a></div><div className="safety-note"><AlertTriangle size={16} /><p><b>Responsible conclusion language:</b> screened candidate, likely routine heat, insufficient satellite evidence, or escalate for independent verification. A confirmed industrial incident requires independent, time-aligned incident evidence.</p></div></section>
      </main>

      <footer><span>FIREGUARD / INDIA · SATELLITE THERMAL INTELLIGENCE</span><span>EVIDENCE-FIRST RESEARCH PROTOTYPE</span></footer>

      {verifierOpen && <div className="verification-overlay" role="dialog" aria-modal="true" aria-labelledby="verifier-title"><div className="verification-modal"><button className="modal-close" onClick={() => setVerifierOpen(false)} aria-label="Close verifier"><X size={18} /></button><div className="modal-header"><span className="eyebrow">CONCURRENT SOURCE VERIFICATION</span><h2 id="verifier-title">Check the evidence behind this target.</h2><p>{selected.facility} · {selected.id} · {selected.coords}</p></div>{corroboration.isPending && <div className="verification-progress live"><span>Querying FIRMS, OSM context, persistence and weather concurrently…</span><i /></div>}{corroboration.isError && <div className="source-error">The live verifier encountered a recoverable request error. The selection is retained and no industrial-fire conclusion will be issued from incomplete evidence; retry this target.</div>}{corroboration.data && <><div className="check-list live-evidence"><div className={`verification-row revealed ${corroboration.data.firmsCurrent.state === "available" ? "pass" : "review"}`}><span className="check-state">{corroboration.data.firmsCurrent.state === "available" ? <Check size={14} /> : <CircleHelp size={14} />}</span><div><b>NASA FIRMS · NOAA-20 thermal evidence</b><p>{corroboration.data.firmsCurrent.detail}</p></div><small>{corroboration.data.firmsCurrent.state.toUpperCase()}</small></div><div className={`verification-row revealed ${corroboration.data.firmsIndependentCurrent.state === "available" ? "pass" : "review"}`}><span className="check-state">{corroboration.data.firmsIndependentCurrent.state === "available" ? <Check size={14} /> : <CircleHelp size={14} />}</span><div><b>Independent satellite · NOAA-21 VIIRS</b><p>{corroboration.data.firmsIndependentCurrent.detail}</p></div><small>{corroboration.data.firmsIndependentCurrent.state.toUpperCase()}</small></div><div className={`verification-row revealed ${corroboration.data.industrial.state === "available" ? "pass" : "review"}`}><span className="check-state">{corroboration.data.industrial.state === "available" ? <Check size={14} /> : <CircleHelp size={14} />}</span><div><b>Industrial context</b><p>{corroboration.data.industrial.detail}</p></div><small>{corroboration.data.industrial.state.toUpperCase()}</small></div><div className={`verification-row revealed ${corroboration.data.firmsHistory.state === "available" ? "pass" : "review"}`}><span className="check-state">{corroboration.data.firmsHistory.state === "available" ? <Check size={14} /> : <CircleHelp size={14} />}</span><div><b>FIRMS · 7-day persistence</b><p>{corroboration.data.firmsHistory.detail}</p></div><small>{corroboration.data.firmsHistory.state.toUpperCase()}</small></div><div className={`verification-row revealed ${corroboration.data.weather.state === "available" ? "pass" : "review"}`}><span className="check-state">{corroboration.data.weather.state === "available" ? <Check size={14} /> : <CircleHelp size={14} />}</span><div><b>Weather context</b><p>{corroboration.data.weather.detail}</p></div><small>{corroboration.data.weather.state.toUpperCase()}</small></div><div className={`verification-row revealed ${corroboration.data.independentCorroboration.state === "cross_platform_match" ? "pass" : "review"}`}><span className="check-state">{corroboration.data.independentCorroboration.state === "cross_platform_match" ? <Check size={14} /> : <CircleHelp size={14} />}</span><div><b>Independent satellite corroboration</b><p>{corroboration.data.independentCorroboration.detail}</p></div><small>{corroboration.data.independentCorroboration.state.toUpperCase()}</small></div><div className={`verification-row revealed ${corroboration.data.incidentEvidence.records.length > 0 ? "pass" : "review"}`}><span className="check-state">{corroboration.data.incidentEvidence.records.length > 0 ? <Check size={14} /> : <CircleHelp size={14} />}</span><div><b>Authority or facility incident evidence</b><p>{corroboration.data.incidentEvidence.detail}</p></div><small>{corroboration.data.incidentEvidence.records.length > 0 ? "RECORDED" : corroboration.data.incidentEvidence.state.toUpperCase()}</small></div></div><div className={`modal-result ${corroboration.data.conclusion.level}`}><span><AlertTriangle size={15} /> LIVE SCREENING RESULT</span><h3>{corroboration.data.conclusion.title}</h3><p>{corroboration.data.conclusion.detail}</p><small className="evidence-meta">Checked {new Date(corroboration.data.checkedAt).toLocaleTimeString()} · source state and freshness are individually labelled</small><button onClick={() => setVerifierOpen(false)}>Return to field <ChevronRight size={15} /></button></div><section className="authority-evidence-panel" aria-label="Authoritative incident evidence"><p className="eyebrow">CONTROLLED CONFIRMATION PATH</p><h3>Authority or verified-facility record</h3><p>Confirmation requires a time-aligned report from an official authority or verified facility representative. The provenance record expires after 48 hours and does not replace the source report.</p>{user?.role === "admin" ? <form onSubmit={submitAuthorityEvidence}><div className="authority-evidence-grid"><label>Source type<select value={authorityForm.sourceType} onChange={event => setAuthorityForm(current => ({ ...current, sourceType: event.target.value as "authority" | "facility" }))}><option value="authority">Official authority</option><option value="facility">Verified facility</option></select></label><label>Source name<input required minLength={3} value={authorityForm.sourceName} onChange={event => setAuthorityForm(current => ({ ...current, sourceName: event.target.value }))} placeholder="e.g., district fire service" /></label><label>Report reference<input required minLength={3} value={authorityForm.incidentReference} onChange={event => setAuthorityForm(current => ({ ...current, incidentReference: event.target.value }))} placeholder="case or bulletin number" /></label><label>Reported at (local)<input required type="datetime-local" value={authorityForm.reportedAt} onChange={event => setAuthorityForm(current => ({ ...current, reportedAt: event.target.value }))} /></label></div><label className="authority-evidence-full">HTTPS source URL<input required type="url" value={authorityForm.sourceUrl} onChange={event => setAuthorityForm(current => ({ ...current, sourceUrl: event.target.value }))} placeholder="https://…" /></label><label className="authority-evidence-full">Verification notes<textarea required minLength={20} maxLength={2000} value={authorityForm.details} onChange={event => setAuthorityForm(current => ({ ...current, details: event.target.value }))} placeholder="State the time/location linkage and how the source was independently checked." /></label>{authorityRecord.isError && <p className="authority-evidence-error">{authorityRecord.error.message}</p>}<button type="submit" disabled={authorityRecord.isPending}>{authorityRecord.isPending ? "Recording provenance…" : "Record verified external evidence"}</button></form> : <div className="authority-evidence-gate"><p>{isAuthenticated ? "This signed-in account is not authorised to record incident evidence." : "Only the project administrator can record evidence after signing in."}</p>{!isAuthenticated && <button type="button" onClick={startLogin}>Sign in for controlled evidence entry</button>}</div>}</section></>}</div></div>}
    </div>
  );
}
