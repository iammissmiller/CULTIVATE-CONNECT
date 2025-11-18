// userData.js
// FUTURE-PROOF USER DATA CREATOR (Farmer + Investor + Consumer)

// Generic creator function
function createUserDataByRole(role, defaultData) {
    const users = JSON.parse(localStorage.getItem("cc_users")) || [];

    users.forEach(user => {
        if (user.role !== role) return;

        const key = `cc_user_data_${user.username}`;

        // Avoid overwriting existing user data
        if (localStorage.getItem(key)) return;

        // Create data for this user
        localStorage.setItem(key, JSON.stringify(defaultData));
    });
}


// =============================
// FARMER DATA
// =============================
createUserDataByRole("farmer", {
    role: "farmer",
    wallet: 10000,
    crops: [],
    listings: [],
    purchases: [],
    soilHealth: {},
    notifications: []
});


// =============================
// INVESTOR DATA
// =============================
createUserDataByRole("investor", {
    role: "investor",
    wallet: 50000,
    investments: [],
    portfolioValue: 0,
    returnsHistory: [],
    notifications: []
});


// =============================
// CONSUMER DATA
// =============================
createUserDataByRole("consumer", {
    role: "consumer",
    wallet: 5000,
    cart: [],
    orders: [],
    wishlist: [],
    notifications: []
});
