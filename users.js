// users.js
// This file stores 10 fixed login accounts in localStorage

const defaultUsers = [
  // Farmers
  { username: "farmer_rao", password: "pass1", role: "farmer" },
  { username: "farmer_arya", password: "pass2", role: "farmer" },
  { username: "farmer_shant", password: "pass3", role: "farmer" },
  { username: "farmer_alpha", password: "pass12", role: "farmer" },
  { username: "farmer_beta", password: "pass23", role: "farmer" },

  // Consumers
  { username: "consumer_gita", password: "pass4", role: "consumer" },
  { username: "consumer_raj", password: "pass5", role: "consumer" },
  { username: "consumer_soni", password: "pass6", role: "consumer" },
  { username: "consumer_sine", password: "pass6", role: "consumer" },
  { username: "consumer_cos", password: "pass6", role: "consumer" },

  // Investors
  { username: "investor_kapil", password: "pass7", role: "investor" },
  { username: "investor_nisha", password: "pass8", role: "investor" },
  { username: "investor_nishant", password: "pass8", role: "investor" },
  { username: "investor_nishika", password: "pass8", role: "investor" },
  // Extra 2 for total 10 users
  { username: "consumer_arun", password: "pass9", role: "consumer" },
  { username: "farmer_dev", password: "pass10", role: "farmer" }
];

// Save only ONCE
if (!localStorage.getItem("cc_users")) {
  localStorage.setItem("cc_users", JSON.stringify(defaultUsers));
}
