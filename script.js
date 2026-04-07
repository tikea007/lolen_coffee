const ENDPOINT = "https://script.google.com/macros/s/AKfycbyvMERwFYL_BS8qhyvdYGreFc1-9ZVoDq3kk7lgleoAnycgcyoEaGRiL_obu-dDlSpZ7g/exec";

let sessionPass = sessionStorage.getItem("lolan_pass") || "";
let myChart = null;
let currentItem = null;
let currentPrice = 0;
let currentPay = null;
let grossRevenue = 0;
let expenseList = [];

const FOOD_NAMES = ["Nom Banh Chok", "Loklak Fried Rice", "Mareas Prov Fried Rice"];
const getTodayKey = () => "lolan_exp_" + new Date().toDateString();

// ── LOGIN ────────────────────────────────────────────────
async function checkLogin() {
    const pin = document.getElementById("passInput").value || sessionPass;
    const ok = await loadDashboard(pin);
    if (ok) {
        sessionPass = pin;
        sessionStorage.setItem("lolan_pass", pin);
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("mainApp").style.display = "block";
    } else {
        document.getElementById("loginError").style.display = "block";
    }
}
document.getElementById("passInput").addEventListener("keydown", e => {
    if (e.key === "Enter") checkLogin();
});

// ── MENU ─────────────────────────────────────────────────
function selectItem(name, price, btn) {
    document.querySelectorAll(".item-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentItem = name;
    currentPrice = price;
    document.getElementById("selectedName").innerText = name;
    checkForm();
}

function setPayment(method) {
    currentPay = method;
    document.getElementById("btnCash").className = "pay-btn" + (method === "Cash" ? " active cash" : "");
    document.getElementById("btnABA").className = "pay-btn" + (method === "ABA" ? " active aba" : "");
    checkForm();
}

function checkForm() {
    const qty = parseInt(document.getElementById("qtyInput").value) || 0;
    const total = currentPrice * qty;
    document.getElementById("priceDisplay").innerText = total > 0 ? total.toLocaleString() + " ៛" : "0 ៛";
    if (currentItem && currentPay && qty > 0) {
        document.getElementById("submitBtn").disabled = false;
        document.getElementById("finalItem").value = `${currentItem} | ${currentPay} | ${qty}`;
        document.getElementById("finalPrice").value = total;
    } else {
        document.getElementById("submitBtn").disabled = true;
    }
}

// ── EXPENSES ─────────────────────────────────────────────
// Sync with the database (no longer using localStorage for expenses)
async function addExpense() {
    const noteEl = document.getElementById("expenseNote");
    const amtEl = document.getElementById("expenseAmt");
    const note = noteEl.value.trim();
    const amt = amtEl.value;

    if (!note || !amt) return;

    const params = new URLSearchParams();
    params.append("pass", sessionPass);
    params.append("type", "expense");
    params.append("note", note);
    params.append("amount", amt);

    try {
        await fetch(ENDPOINT, { method: "POST", body: params });
        noteEl.value = "";
        amtEl.value = "";
        noteEl.focus();
        await loadDashboard(sessionPass);
    } catch (e) {
        console.error("Expense error:", e);
    }
}




function renderExpenses() {
    const container = document.getElementById("expenseList");
    const totalExp = expenseList.reduce((s, e) => s + e.amt, 0);

    document.getElementById("expenseDisplay").innerText = totalExp.toLocaleString() + " ៛";

    const net = grossRevenue - totalExp;
    const netUsd = net / 4000;
    
    const np = document.getElementById("netProfit");
    const npUsd = document.getElementById("netProfitUsd");
    
    np.innerText = net.toLocaleString() + " ៛";
    npUsd.innerText = "$" + netUsd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    const profitColor = net >= 0 ? "#2e7d32" : "#d84315";
    np.style.color = profitColor;
    if (npUsd) npUsd.style.color = profitColor;

    if (expenseList.length === 0) {
        container.innerHTML = '<div class="expense-empty">No expenses added yet.</div>';
        return;
    }
    container.innerHTML = expenseList.map((e, i) => `
        <div class="expense-item">
            <span class="expense-item-note">${i + 1}. ${e.note}</span>
            <div class="expense-item-right">
                <span class="expense-item-price">${e.amt.toLocaleString()} ៛</span>
            </div>
        </div>
    `).join("");
}

// ── DASHBOARD ────────────────────────────────────────────
// GAS serializes Dates as "Date(ms)" strings — this helper parses both formats
function parseGASDate(ts) {
    if (!ts) return null;
    // Handle GAS format: "Date(1234567890000)"
    const m = String(ts).match(/Date\((\d+)\)/);
    if (m) return new Date(Number(m[1]));
    // Handle ISO string or anything else
    const d = new Date(ts);
    return isNaN(d) ? null : d;
}

async function loadDashboard(pass) {
    try {
        // Single request — returns sales + expenses together for maximum speed
        const res = await fetch(`${ENDPOINT}?pass=${encodeURIComponent(pass)}&_cb=${Date.now()}`);
        const json = await res.json();

        if (!json.auth) return false;

        const salesData = json.sales || [];
        const expData = json.expenses || [];
        const today = new Date().toDateString();

        let revCash = 0, revABA = 0, dCount = 0, fCount = 0, counts = {};

        salesData.forEach(s => {
            const d = parseGASDate(s.timestamp);
            if (!d || d.toDateString() !== today) return;
            const price = Number(s.price);
            const parts = (s.item || "").split(" | ");
            const name = parts[0];
            const pay = parts[1] || "Cash";
            const qty = Number(parts[2]) || 1;

            if (pay === "ABA") revABA += price; else revCash += price;
            if (FOOD_NAMES.includes(name)) fCount += qty; else dCount += qty;
            counts[name] = (counts[name] || 0) + qty;
        });

        // Sync expenseList from sheet — using parseGASDate to handle GAS timestamp format
        expenseList = expData
            .filter(e => { const d = parseGASDate(e.timestamp); return d && d.toDateString() === today; })
            .map(e => ({ note: e.note, amt: Number(e.amount) }));

        grossRevenue = revCash + revABA;

        document.getElementById("qtyDrinks").innerText = dCount;
        document.getElementById("qtyFoods").innerText = fCount;
        document.getElementById("qtyTotal").innerText = dCount + fCount;
        document.getElementById("revCash").innerText = revCash.toLocaleString() + " ៛";
        document.getElementById("revABA").innerText = revABA.toLocaleString() + " ៛";
        document.getElementById("revTotal").innerText = grossRevenue.toLocaleString() + " ៛";

        renderExpenses();
        renderChart(counts);
        return true;
    } catch (err) {
        console.error("loadDashboard error:", err);
        return false;
    }
}

function renderChart(counts) {
    const ctx = document.getElementById("salesChart").getContext("2d");
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: Object.keys(counts),
            datasets: [{ data: Object.values(counts), backgroundColor: "#799468", borderRadius: 6 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

// ── RECORD SALE ──────────────────────────────────────────
document.getElementById("salesForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("submitBtn");
    btn.disabled = true; btn.innerText = "Saving…";

    const params = new URLSearchParams(new FormData(e.target));
    params.append("pass", sessionPass);
    params.append("type", "sale");

    try {
        const res = await fetch(ENDPOINT, { method: "POST", body: params });
        const text = await res.text();

        if (text.trim() === "Success") {
            document.getElementById("status").innerHTML = "<span style='color:#2e7d32; font-size:14px;'>✓ Sale recorded!</span>";
            currentItem = null; currentPrice = 0; currentPay = null;
            document.getElementById("selectedName").innerText = "—";
            document.getElementById("qtyInput").value = "1";
            document.getElementById("priceDisplay").innerText = "0 ៛";
            document.querySelectorAll(".item-btn").forEach(b => b.classList.remove("active"));
            document.getElementById("btnCash").className = "pay-btn";
            document.getElementById("btnABA").className = "pay-btn";
            checkForm();
            await loadDashboard(sessionPass);
        } else {
            document.getElementById("status").innerHTML = "<span style='color:#e53935; font-size:14px;'>✗ Not saved: " + text.trim() + "</span>";
            btn.disabled = false; btn.innerText = "Record Sale";
        }
    } catch (err) {
        alert("Network error — sale not saved!");
        btn.disabled = false; btn.innerText = "Record Sale";
    }

    setTimeout(() => {
        document.getElementById("status").innerHTML = "";
        btn.innerText = "Record Sale";
    }, 3000);
});

// ── KEYBOARD SHORTCUTS ───────────────────────────────────
document.getElementById("expenseNote").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("expenseAmt").focus();
});
document.getElementById("expenseAmt").addEventListener("keydown", e => {
    if (e.key === "Enter") addExpense();
});

// ── PRINT & LOGOUT ───────────────────────────────────────
function printReport() {
    document.getElementById("printDate").innerText =
        new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    setTimeout(() => {
        window.print();
    }, 500);
}
function logout() { sessionStorage.clear(); location.reload(); }

// ── INIT ─────────────────────────────────────────────────
if (sessionPass) checkLogin();