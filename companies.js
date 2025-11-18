// companies.js
// Initial company dataset for Cultivate Connect (fictional, India-like names)

window.CC_COMPANIES = [
  { symbol: "GHF", name: "GreenHarvest Fertilizers Ltd.", sector: "Fertilizers", sharePrice: 124.50, volatility: 1.8, corrDemand: 0.65, corrSupply: -0.25 },
  { symbol: "BCN", name: "BharatCrop Nutrients Pvt. Ltd.", sector: "Fertilizers", sharePrice: 98.75, volatility: 1.6, corrDemand: 0.60, corrSupply: -0.20 },
  { symbol: "CSC", name: "CropShield Chemicals India", sector: "Pesticides", sharePrice: 210.00, volatility: 2.2, corrDemand: 0.55, corrSupply: -0.15 },
  { symbol: "AGP", name: "AgroGuard Crop Protection Ltd.", sector: "Pesticides", sharePrice: 72.20, volatility: 2.6, corrDemand: 0.58, corrSupply: -0.18 },
  { symbol: "HMS", name: "HybridMax Seeds Corporation", sector: "Seeds", sharePrice: 310.00, volatility: 2.8, corrDemand: 0.72, corrSupply: -0.10 },
  { symbol: "GAB", name: "GenAgro BioSeeds Pvt. Ltd.", sector: "Seeds", sharePrice: 145.30, volatility: 2.5, corrDemand: 0.68, corrSupply: -0.12 },
  { symbol: "EGB", name: "EarthGen BioFertilizers", sector: "Bio-Fertilizers", sharePrice: 56.75, volatility: 2.0, corrDemand: 0.50, corrSupply: -0.10 },
  { symbol: "SSL", name: "SoilSense Laboratories", sector: "SoilHealth", sharePrice: 86.10, volatility: 1.7, corrDemand: 0.45, corrSupply: -0.08 },
  { symbol: "ATM", name: "AgroTech Machinery Works Ltd.", sector: "Machinery", sharePrice: 420.00, volatility: 3.2, corrDemand: 0.35, corrSupply: 0.10 },
  { symbol: "FDR", name: "FarmDrive Robotics & Equipment", sector: "Machinery", sharePrice: 255.50, volatility: 3.6, corrDemand: 0.40, corrSupply: 0.05 },
  { symbol: "AQF", name: "AquaFlow Irrigation Systems", sector: "Irrigation", sharePrice: 132.40, volatility: 1.9, corrDemand: 0.50, corrSupply: -0.05 },
  { symbol: "AGS", name: "AgriSense IoT Analytics", sector: "AgriIoT", sharePrice: 198.00, volatility: 2.9, corrDemand: 0.55, corrSupply: -0.02 }
];

// persist initial dataset to localStorage if not present
(function ensureCompaniesPersisted() {
  const key = "cc_companies_master";
  if (!localStorage.getItem(key)) {
    // add bookkeeping fields: history (array) and float (available shares) optionally
    const now = Date.now();
    const companies = window.CC_COMPANIES.map(c => ({
      ...c,
      marketCap: Math.round(c.sharePrice * (1000000 / (8 + Math.random()*8))), // rough synthetic market cap
      floatShares: Math.round((1000000 + Math.random() * 4000000)), // synthetic float
      history: [{ timestamp: now, price: c.sharePrice }],
    }));
    localStorage.setItem(key, JSON.stringify(companies));
  }
})();
