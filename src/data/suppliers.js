/* =========================================================================
   MODULE: suppliers.js
   Pre-built search URLs for major suppliers per region — SAMPLE data.
   These don't query an API — they open the supplier's own search with the
   material name, so prices are always live on the supplier side. Erasable
   and user-replaceable at runtime via data/pricing-providers.js.
   ========================================================================= */
export const SAMPLE_SUPPLIERS = {
  AU: [
    // ---- LOCAL — Far North Queensland (Cairns region) ----
    { name: "Cairns Hardware", tier: "Local (FNQ)", url: (q) => `https://www.cairnshardware.com.au/?s=${encodeURIComponent(q)}`,
      coverage: "Heavy building, timber, plasterboard, steel, roofing — trade drive-thrus across FNQ" },
    { name: "Dynamic Timbers (Cairns)", tier: "Local (FNQ)", url: () => `https://dynamictimbers.com.au/`,
      coverage: "Timber yard, roof trusses, wall frames, masonry — Cairns / Innisfail / Tolga" },
    { name: "Rankine Timber & Truss", tier: "Local (FNQ)", url: () => `https://www.rankinetimber.com.au/`,
      coverage: "Trusses, frames, hardwood & pine, flooring, decking, fencing" },
    { name: "Metroll Cairns", tier: "Local (FNQ)", url: () => `https://www.metroll.com.au/map_location/cairns-branch/`,
      coverage: "Locally-made roofing, cladding, rainwater & structural steel" },

    // ---- NATIONAL — trade suppliers (deliver to FNQ from down south) ----
    { name: "Reece", tier: "National trade", url: (q) => `https://www.reece.com.au/search?query=${encodeURIComponent(q)}`,
      coverage: "Plumbing, bathroom, hot water, HVAC-R — 600+ branches" },
    { name: "Tradelink", tier: "National trade", url: (q) => `https://tradelink.com.au/search?q=${encodeURIComponent(q)}`,
      coverage: "Plumbing, bathroom, kitchen" },
    { name: "Stratco", tier: "National trade", url: (q) => `https://www.stratco.com.au/search?q=${encodeURIComponent(q)}`,
      coverage: "Roofing, sheds, fencing, structural steel, patios" },
    { name: "Metroll", tier: "National trade", url: () => `https://www.metroll.com.au/`,
      coverage: "Steel roofing, walling, purlins, rainwater — 30 branches nationally" },
    { name: "Bowens", tier: "National trade", url: (q) => `https://www.bowens.com.au/?s=${encodeURIComponent(q)}`,
      coverage: "Timber & building materials, frames & trusses" },
    { name: "Dahlsens", tier: "National trade", url: () => `https://www.dahlsens.com.au/`,
      coverage: "Building materials, frames & trusses for builders" },

    // ---- GENERAL — retail (homeowners + top-ups) ----
    { name: "Bunnings Warehouse", tier: "General retail", url: (q) => `https://www.bunnings.com.au/search/products?q=${encodeURIComponent(q)}`,
      coverage: "Timber, hardware, paint, tools, garden, fittings" },
    { name: "Mitre 10", tier: "General retail", url: (q) => `https://www.mitre10.com.au/search?q=${encodeURIComponent(q)}`,
      coverage: "General hardware, timber, paint — independent network" },
    { name: "Total Tools", tier: "General retail", url: (q) => `https://www.totaltools.com.au/search?q=${encodeURIComponent(q)}`,
      coverage: "Power tools, hand tools, accessories" },
    { name: "Kennards Hire", tier: "Equipment hire", url: (q) => `https://www.kennards.com.au/search?q=${encodeURIComponent(q)}`,
      coverage: "Excavators, scaffolding, scissor lifts, compaction" },
    { name: "Coates Hire", tier: "Equipment hire", url: (q) => `https://www.coates.com.au/search?q=${encodeURIComponent(q)}`,
      coverage: "Earthmoving, access, propping, site services" },
  ],
  US: [
    { name: "The Home Depot", url: (q) => `https://www.homedepot.com/s/${encodeURIComponent(q)}`,
      coverage: "Lumber, tools, hardware, appliances" },
    { name: "Lowe's", url: (q) => `https://www.lowes.com/search?searchTerm=${encodeURIComponent(q)}`,
      coverage: "Lumber, hardware, appliances, garden" },
    { name: "Ferguson", url: (q) => `https://www.ferguson.com/search/?searchString=${encodeURIComponent(q)}`,
      coverage: "Plumbing, HVAC, lighting" },
    { name: "Menards", url: (q) => `https://www.menards.com/main/search.html?search=${encodeURIComponent(q)}`,
      coverage: "General building supplies (Midwest US)" },
    { name: "Sunbelt Rentals", url: (q) => `https://www.sunbeltrentals.com/equipment/search/?keywords=${encodeURIComponent(q)}`,
      coverage: "Equipment hire" },
  ],
  UK: [
    { name: "Wickes", url: (q) => `https://www.wickes.co.uk/search?text=${encodeURIComponent(q)}`,
      coverage: "Timber, hardware, kitchens, bathrooms" },
    { name: "Screwfix", url: (q) => `https://www.screwfix.com/search?search=${encodeURIComponent(q)}`,
      coverage: "Trade fittings, tools, electrical, plumbing" },
    { name: "B&Q", url: (q) => `https://www.diy.com/search?term=${encodeURIComponent(q)}`,
      coverage: "General hardware, garden, paint" },
    { name: "Travis Perkins", url: (q) => `https://www.travisperkins.co.uk/search?q=${encodeURIComponent(q)}`,
      coverage: "Timber, building materials, heavy-side" },
    { name: "Toolstation", url: (q) => `https://www.toolstation.com/search?q=${encodeURIComponent(q)}`,
      coverage: "Tools, fixings, electrical" },
    { name: "HSS Hire", url: (q) => `https://www.hss.com/hire/search?q=${encodeURIComponent(q)}`,
      coverage: "Equipment hire" },
  ],
};
