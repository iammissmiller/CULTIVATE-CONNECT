// companiesEngine.js
// Advanced, balanced market engine for Cultivate Connect
// - Requires companies initial dataset persisted under "cc_companies_master" (see companies.js)
// - Stores market snapshots under "cc_companies_market_history"
// - Reads farmer supply (cc_user_data_farmer_*), consumer demand (cc_user_data_consumer_*), investor wallets/investments
//
// Public API (window.CCCompaniesEngine):
//   startCompaniesMarket()        // start engine loop
//   stopCompaniesMarket()         // stop engine
//   forceUpdate()                 // run one update immediately and return snapshot
//   getCompanies()                // lightweight company list
//   getCompany(symbol)            // full company object
//   getMarketSnapshots()          // array of snapshots
//   buyShares(username,symbol,opts)// opts: {amount} or {shares}
//   sellShares(username,symbol,opts)// opts: {shares} or {sellAll:true}
//   getPortfolio(username)        // user's portfolio summary
//
// Balanced behavior: moderate volatility, realistic momentum & sector sensitivity.

(function () {
  const COMP_KEY = "cc_companies_master";
  const MARKET_HISTORY_KEY = "cc_companies_market_history";
  const UPDATE_MS = 4000;        // engine tick
  const SNAP_MAX = 400;         // keep snapshots
  const PRICE_MIN = 0.01;
  const MAX_MOVE = 0.12;        // max % move per tick
  const MOMENTUM_WEIGHT = 0.18; // how much past momentum influences change
  const SECTOR_SENSITIVITY = 0.9; // how strongly sector demand/supply affects companies
  const POOL_INFLUENCE_DIV = 500000; // scale factor for investment pool influence
  const VOL_NOISE_SCALE = 0.01; // random noise base scale

  let companies = null;        // in-memory companies loaded from localStorage
  let intervalId = null;

  // -------------------------
  // Utilities
  // -------------------------
  function now() { return Date.now(); }
  function readCompanies() {
    const raw = localStorage.getItem(COMP_KEY);
    companies = raw ? JSON.parse(raw) : [];
    return companies;
  }
  function writeCompanies() {
    if (!companies) return;
    localStorage.setItem(COMP_KEY, JSON.stringify(companies));
  }
  function getSnapshots() {
    try { return JSON.parse(localStorage.getItem(MARKET_HISTORY_KEY) || "[]"); }
    catch(e){ return []; }
  }
  function pushSnapshot(snap) {
    try {
      const arr = getSnapshots();
      arr.push(snap);
      if (arr.length > SNAP_MAX) arr.splice(0, arr.length - SNAP_MAX);
      localStorage.setItem(MARKET_HISTORY_KEY, JSON.stringify(arr));
    } catch(e){ console.warn(e); }
  }

  // -------------------------
  // Product -> Sector mapping (robust)
  // -------------------------
  const PRODUCT_SECTOR_MAP = [
    { keywords: ["fertil", "npk", "urea", "nutri", "manure"], sector: "Fertilizers" },
    { keywords: ["seed", "hybrid", "kaveri", "wheat", "rice", "maize", "tomato", "potato"], sector: "Seeds" },
    { keywords: ["pestic", "pest", "herbicid", "fungicid", "insect"], sector: "Pesticides" },
    { keywords: ["bio", "microbe", "biofert", "organic"], sector: "Bio-Fertilizers" },
    { keywords: ["soil", "test"], sector: "SoilHealth" },
    { keywords: ["tractor","plough","harvest","machin","equipment"], sector: "Machinery" },
    { keywords: ["irrig", "drip", "sprinkl", "water"], sector: "Irrigation" },
    { keywords: ["iot","sensor","analytics","telemetry","data"], sector: "AgriIoT" }
  ];
  function detectSector(title = "") {
    const s = String(title || "").toLowerCase();
    for (const m of PRODUCT_SECTOR_MAP) {
      for (const kw of m.keywords) {
        if (s.includes(kw)) return m.sector;
      }
    }
    // fallback heuristics
    if (s.includes("wheat")||s.includes("rice")||s.includes("maize")||s.includes("tomato")) return "Seeds";
    return "Other";
  }

  // -------------------------
  // Read supply/demand from localStorage
  // -------------------------
  function listKeys(prefix) {
    const out = [];
    for (let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) out.push(k);
    }
    return out;
  }

  function getSupplyByProduct() {
    const map = {};
    listKeys("cc_user_data_farmer_").forEach(k => {
      try {
        const f = JSON.parse(localStorage.getItem(k));
        if (!f || !Array.isArray(f.listings)) return;
        f.listings.forEach(it => {
          const title = String(it.title || it.name || "unknown").trim();
          const qty = Number(it.qty || it.quantity || 0) || 0;
          map[title] = (map[title] || 0) + qty;
        });
      } catch(e){}
    });
    return map;
  }

  function getDemandByProduct() {
    const map = {};
    listKeys("cc_user_data_consumer_").forEach(k => {
      try {
        const c = JSON.parse(localStorage.getItem(k));
        if (!c || !Array.isArray(c.purchases)) return;
        c.purchases.forEach(p => {
          const title = String(p.name || p.item || p.product || "unknown").trim();
          const qty = Number(p.qty || p.quantity || 0) || 0;
          map[title] = (map[title] || 0) + qty;
        });
      } catch(e){}
    });
    return map;
  }

  // Aggregate sector-level demand & supply
  function aggregateSectorSignals() {
    const supply = getSupplyByProduct();
    const demand = getDemandByProduct();
    const sectors = {};
    function ensure(sec){ if(!sectors[sec]) sectors[sec] = { supply:0, demand:0 }; }
    Object.entries(supply).forEach(([title, qty]) => {
      const sec = detectSector(title);
      ensure(sec); sectors[sec].supply += qty;
    });
    Object.entries(demand).forEach(([title, qty]) => {
      const sec = detectSector(title);
      ensure(sec); sectors[sec].demand += qty;
    });
    return sectors;
  }

  // investment pool (sum of investor invested amounts) - influences bullish pressure
  function getInvestmentPool() {
    let sum = 0;
    listKeys("cc_user_data_investor_").forEach(k => {
      try {
        const inv = JSON.parse(localStorage.getItem(k));
        if (!inv || !Array.isArray(inv.investments)) return;
        inv.investments.forEach(i => sum += Number(i.invested || i.amount || 0) || 0);
      } catch(e){}
    });
    return sum;
  }

  // -------------------------
  // Math helpers
  // -------------------------
  function randn_bm() {
    // Box-Muller approx normal
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // -------------------------
  // Core: compute price change percent for a company
  // -------------------------
  function computePctChange(company, sectorSignal, investmentPool) {
    // Inputs:
    //  - company: object with sharePrice, volatility, corrDemand, corrSupply, history
    //  - sectorSignal: {demand, supply} for that company's sector (may be undefined)
    //  - investmentPool: numeric (sum of invested money across investors)

    const lastPrice = Number(company.sharePrice || 1);
    const hist = company.history || [];
    const prevPrice = hist.length > 0 ? hist[hist.length - 1].price : lastPrice;
    const recentMomentum = prevPrice ? (lastPrice - prevPrice) / prevPrice : 0;

    // sector effect
    let sectorEffect = 0;
    if (sectorSignal) {
      const d = Number(sectorSignal.demand || 0);
      const s = Number(sectorSignal.supply || 0);
      const denom = Math.max(1, s);
      sectorEffect = (d - s) / denom; // positive when demand > supply
    }

    // apply company-specific correlations (bounded)
    const corrD = Number(company.corrDemand || 0.5);
    const corrS = Number(company.corrSupply || -0.2);

    // directional influence (sector * company sensitivity)
    const directional = sectorEffect * (corrD - corrS) * SECTOR_SENSITIVITY;

    // momentum contribution
    const momentumContribution = recentMomentum * MOMENTUM_WEIGHT;

    // investment pool impact (scaled)
    const poolImpact = (investmentPool / Math.max(1, POOL_INFLUENCE_DIV)) * ( (company.sector && typeof company.sector === 'string') ? 1 : 0.5 );

    // random noise scaled by volatility
    const noise = randn_bm() * (Math.max(0.2, Number(company.volatility || 1)) / 100) * VOL_NOISE_SCALE * 10;

    // combine
    let pct = directional + momentumContribution + poolImpact + noise;

    // clamp
    if (pct > MAX_MOVE) pct = MAX_MOVE;
    if (pct < -MAX_MOVE) pct = -MAX_MOVE;

    // small dampening by company size (marketCap)
    const sizeFactor = Math.min(1, (company.marketCap || 1) / (5e9)); // larger caps move less
    pct = pct * (1 - (sizeFactor * 0.45));

    return pct;
  }

  // -------------------------
  // Step the market once
  // -------------------------
  function stepMarketOnce() {
    // ensure companies loaded
    if (!companies) readCompanies();

    const sectorSignals = aggregateSectorSignals();
    const pool = getInvestmentPool();
    const snapshot = { timestamp: now(), companies: [] };

    companies.forEach(c => {
      const secSig = sectorSignals[c.sector] || null;
      const pct = computePctChange(c, secSig, pool);
      const newPrice = Math.max(PRICE_MIN, Number((c.sharePrice * (1 + pct)).toFixed(4)));

      // update history
      c.history = c.history || [];
      c.history.push({ timestamp: now(), price: newPrice });
      if (c.history.length > 2000) c.history = c.history.slice(-2000);

      // update price
      c.sharePrice = Number(newPrice.toFixed(4));

      snapshot.companies.push({ symbol: c.symbol, price: c.sharePrice, sector: c.sector });
    });

    // persist
    writeCompanies();
    pushSnapshot(snapshot);

    return snapshot;
  }

  // -------------------------
  // Public portfolio functions (buy/sell)
  // -------------------------
  function buyShares(username, symbol, opts = {}) {
    try {
      readCompanies();
      const company = companies.find(c => c.symbol === symbol);
      if (!company) return { success:false, message:"Company not found" };

      const key = `cc_user_data_${username}`;
      let user = JSON.parse(localStorage.getItem(key));
      if (!user) return { success:false, message:"Investor user not found" };

      const price = Number(company.sharePrice);
      let shares = 0;
      let cost = 0;

      if (opts.shares != null) {
        shares = Number(opts.shares);
        cost = Number((shares * price).toFixed(2));
      } else if (opts.amount != null) {
        cost = Number(opts.amount); // INR amount to spend
        shares = Number((cost / price).toFixed(6)); // allow fractional
      } else {
        return { success:false, message: "Provide amount or shares" };
      }

      if (cost > (user.wallet || 0)) return { success:false, message: "Insufficient wallet" };

      // deduct wallet
      user.wallet = Number((user.wallet - cost).toFixed(2));
      user.investments = user.investments || [];

      const existing = user.investments.find(i => i.symbol === symbol && i.status === "active");
      if (existing) {
        // weighted avg
        const totalShares = existing.shares + shares;
        const totalInvested = (existing.avgPrice * existing.shares) + cost;
        existing.shares = Number(totalShares.toFixed(6));
        existing.avgPrice = Number((totalInvested / totalShares).toFixed(4));
        existing.invested = Number((existing.invested + cost).toFixed(2));
      } else {
        user.investments.push({
          id: "INV" + Math.floor(Math.random()*1e9),
          symbol,
          shares: Number(shares.toFixed(6)),
          avgPrice: Number(price.toFixed(4)),
          invested: Number(cost.toFixed(2)),
          status: "active",
          date: now()
        });
      }

      // record transaction
      user.transactions = user.transactions || [];
      user.transactions.push({ id: "TR" + Math.floor(Math.random()*1e9), symbol, type: "buy", shares, price, cost, date: now() });

      localStorage.setItem(key, JSON.stringify(user));

      return { success:true, message:"Bought shares", executed:{ shares, price, cost } };
    } catch(e) {
      return { success:false, message: e.message || String(e) };
    }
  }

  function sellShares(username, symbol, opts = {}) {
    try {
      readCompanies();
      const company = companies.find(c => c.symbol === symbol);
      if (!company) return { success:false, message:"Company not found" };

      const key = `cc_user_data_${username}`;
      let user = JSON.parse(localStorage.getItem(key));
      if (!user) return { success:false, message:"Investor user not found" };

      user.investments = user.investments || [];
      const existing = user.investments.find(i => i.symbol === symbol && i.status === "active");
      if (!existing) return { success:false, message:"No active holding" };

      const price = Number(company.sharePrice);
      let sharesToSell = 0;

      if (opts.sellAll) sharesToSell = existing.shares;
      else if (opts.shares != null) sharesToSell = Math.min(existing.shares, Number(opts.shares));
      else return { success:false, message: "Provide shares or sellAll:true" };

      const proceeds = Number((sharesToSell * price).toFixed(2));
      existing.shares = Number((existing.shares - sharesToSell).toFixed(6));
      existing.invested = Number((existing.avgPrice * existing.shares).toFixed(2));
      if (existing.shares <= 0.000001) {
        existing.status = "sold";
        existing.shares = 0;
      }

      user.wallet = Number((Number(user.wallet || 0) + proceeds).toFixed(2));
      user.transactions = user.transactions || [];
      user.transactions.push({ id: "TR" + Math.floor(Math.random()*1e9), symbol, type: "sell", shares: sharesToSell, price, proceeds, date: now() });

      localStorage.setItem(key, JSON.stringify(user));
      return { success:true, message:"Sold shares", executed:{ shares: sharesToSell, price, proceeds } };
    } catch(e) {
      return { success:false, message: e.message || String(e) };
    }
  }

  // -------------------------
  // Portfolio / getters
  // -------------------------
  function getCompanies() {
    readCompanies();
    // return lightweight snapshot
    return companies.map(c => ({
      symbol: c.symbol,
      name: c.name,
      sector: c.sector,
      sharePrice: c.sharePrice,
      volatility: c.volatility,
      marketCap: c.marketCap
    }));
  }

  function getCompany(symbol) {
    readCompanies();
    return companies.find(c => c.symbol === symbol) || null;
  }

  function getPortfolio(username) {
    const key = `cc_user_data_${username}`;
    const user = JSON.parse(localStorage.getItem(key));
    if (!user) return null;
    const invs = (user.investments || []).map(inv => {
      const c = getCompany(inv.symbol);
      const currentValue = Number(((c ? c.sharePrice : 0) * inv.shares).toFixed(2));
      const profit = Number((currentValue - inv.invested).toFixed(2));
      const roi = inv.invested > 0 ? Number(((profit / inv.invested) * 100).toFixed(2)) : 0;
      return { ...inv, currentValue, profit, roi };
    });
    const wallet = Number(user.wallet || 0);
    const portfolioValue = invs.reduce((s,i)=>s + i.currentValue, 0);
    return { wallet, investments: invs, portfolioValue, totalValue: Number((wallet + portfolioValue).toFixed(2)) };
  }

  // -------------------------
  // Start / stop / force update
  // -------------------------
  function stepAndReturnSnapshot() {
    const snap = stepMarketOnce();
    return snap;
  }

  function startCompaniesMarket() {
    if (intervalId) return;
    readCompanies();
    // seed initial snapshot if needed
    const existing = getSnapshots();
    if (!existing || existing.length === 0) {
      pushSnapshot({ timestamp: now(), companies: companies.map(c => ({ symbol: c.symbol, price: c.sharePrice, sector: c.sector })) });
    }
    intervalId = setInterval(() => {
      stepMarketOnce();
    }, UPDATE_MS);
    console.log("Companies market engine started (balanced)");
  }

  function stopCompaniesMarket() {
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
    console.log("Companies market engine stopped");
  }

  // -------------------------
  // Expose API
  // -------------------------
  // Apply market activity from consumer purchases
  function applyMarketActivity(amount) {
    readCompanies(); // ensure companies loaded
    if (!companies || companies.length === 0) return;
    
    companies.forEach(c => {
      // use a small fraction of amount to move price
      const adj = (amount / 5000) * (c.volatility || 1);
      c.sharePrice = Number(Math.max(PRICE_MIN, (c.sharePrice || 1) + adj).toFixed(4));
    });
    
    // persist changes
    writeCompanies();
    
    // trigger a market snapshot
    const snapshot = { timestamp: now(), companies: companies.map(c => ({ symbol: c.symbol, price: c.sharePrice, sector: c.sector })) };
    pushSnapshot(snapshot);
  }

  window.CCCompaniesEngine = {
    startCompaniesMarket,
    stopCompaniesMarket,
    forceUpdate: stepAndReturnSnapshot,
    getCompanies,
    getCompany,
    getMarketSnapshots: getSnapshots,
    buyShares,
    sellShares,
    getPortfolio,
    applyMarketActivity,
    // internal helpers exposed for debugging (optional)
    _aggregateSectorSignals: aggregateSectorSignals,
    _getSupplyByProduct: getSupplyByProduct,
    _getDemandByProduct: getDemandByProduct
  };

  // initialize in memory
  readCompanies();

})();
