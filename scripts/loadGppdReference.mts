import { loadIndiaGppdReference } from "../server/gppdReference";

const loaded = await loadIndiaGppdReference();
if (!loaded) throw new Error("The official India GPPD reference load did not complete.");
console.log("Official India GPPD reference load completed.");
