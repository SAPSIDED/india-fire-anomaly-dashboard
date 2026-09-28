import React from "react";

type Guidance = { fireType: string; sourceUrl: string; sourceName: string; measures: string[] };

const guidanceByClassification: Guidance[] = [
  {
    fireType: "INDUSTRIAL FIRE",
    sourceUrl: "https://peso.gov.in/web/en/contact",
    sourceName: "PESO · Contact",
    measures: [
      "Conduct regular inspection and maintenance of electrical, mechanical, and process equipment.",
      "Maintain appropriate fire detection, alarm, sprinkler, and suppression systems.",
      "Strictly control the storage and handling of flammable chemicals, fuels, gases, and other combustible materials.",
      "Use hot-work permit procedures for welding, cutting, and other ignition-producing activities.",
      "Keep emergency exits, fire lanes, hydrants, and firefighting equipment accessible at all times.",
      "Conduct periodic fire drills and train workers in fire-prevention and emergency procedures.",
    ],
  },
  {
    fireType: "WILDFIRE",
    sourceUrl: "https://fsiforestfire.gov.in/",
    sourceName: "Forest Survey of India · Forest Fire",
    measures: [
      "Maintain vegetation clearance and firebreaks around vulnerable infrastructure and settlements.",
      "Remove accumulated dry vegetation and other combustible fuel near high-risk areas.",
      "Restrict unnecessary open flames and outdoor burning during periods of high fire risk.",
      "Maintain roads and access routes for firefighting and emergency vehicles.",
      "Monitor high-risk forest areas during periods of extreme heat, drought, and strong winds.",
      "Maintain early-warning and fire-detection systems where available.",
    ],
  },
  {
    fireType: "AGRICULTURAL BURNING",
    sourceUrl: "https://cpcb.gov.in/query-form1.php",
    sourceName: "CPCB · Query Form",
    measures: [
      "Prefer crop-residue management alternatives such as mulching, incorporation into soil, composting, or suitable residue-management equipment instead of open burning.",
      "Avoid burning during strong winds or other conditions that can allow flames to spread rapidly.",
      "Maintain cleared boundaries or firebreaks around areas where burning is legally permitted.",
      "Keep water, firefighting tools, and personnel available whenever controlled burning is undertaken.",
      "Monitor the burn continuously and completely extinguish it before leaving the area.",
      "Maintain agricultural machinery and electrical equipment to reduce accidental ignition.",
    ],
  },
  {
    fireType: "MINING FIRE",
    sourceUrl: "https://www.labour.gov.in/en/lodge-your-complaint",
    sourceName: "Ministry of Labour & Employment · Lodge Your Complaint",
    measures: [
      "Monitor combustible gases, temperature, smoke, and other fire indicators in high-risk areas.",
      "Maintain effective mine ventilation and regularly inspect ventilation systems.",
      "Control the accumulation of combustible coal, dust, oil, and other materials.",
      "Regularly inspect electrical equipment, machinery, cables, and power systems for faults or overheating.",
      "Follow strict hot-work, equipment-isolation, and permit-to-work procedures.",
      "Maintain appropriate fire detection, suppression equipment, escape routes, and worker training.",
    ],
  },
];

export function PreventiveMeasures({ classification: _classification }: { classification?: string | null }) {
  return (
    <section id="preparedness" className="preparedness-section" aria-labelledby="preparedness-title">
      <div className="section-cap">
        <div>
          <p className="eyebrow">PREPAREDNESS REFERENCE</p>
          <h2 id="preparedness-title">PREVENTIVE MEASURES BY FIRE TYPE</h2>
        </div>
        <p>Recommended preventive measures for all four supported fire-type classifications. Documentation only; this does not change classification or confirm an incident.</p>
      </div>

      <div className="preparedness-table-wrap">
        <table className="preparedness-table" aria-label="Preventive measures by fire type">
          <thead>
            <tr>
              <th scope="col">FIRE TYPES</th>
              <th scope="col">PREVENTIVE MEASURES</th>
            </tr>
          </thead>
          <tbody>
            {guidanceByClassification.map(({ fireType, sourceUrl, sourceName, measures }) => (
              <tr key={fireType}>
                <th scope="row"><span className="preparedness-source-name">{fireType}</span></th>
                <td data-label="PREVENTIVE MEASURES">
                  <div className="preparedness-source">
                    <span className="preparedness-source-label">WEBSITE YOU CAN REACH OUT TO</span>
                    <a className="preparedness-source-link" href={sourceUrl} target="_blank" rel="noreferrer" aria-label={`${fireType}: ${sourceName}`}>{sourceName}</a>
                  </div>
                  <ul className="preparedness-measures">
                    {measures.map(measure => <li key={measure}>{measure}</li>)}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
