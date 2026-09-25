import "./auth-guard.js";
import { db } from "./firebase.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { showToast } from "./toast.js";

const activePlansCount = document.getElementById("activePlansCount");
const overduePaymentsCount = document.getElementById("overduePaymentsCount");
const overdueAmount = document.getElementById("overdueAmount");
const dueTodayCount = document.getElementById("dueTodayCount");
const upcomingPaymentsCount = document.getElementById("upcomingPaymentsCount");
const completedPlansCount = document.getElementById("completedPlansCount");
const repossessionsCount = document.getElementById("repossessionsCount");
const overdueBadge = document.getElementById("overdueBadge");
const priorityBanner = document.getElementById("priorityBanner");
const priorityBannerText = document.getElementById("priorityBannerText");
const priorityAccountsList = document.getElementById("priorityAccountsList");
const overduePaymentsList = document.getElementById("overduePaymentsList");
const dueTodayList = document.getElementById("dueTodayList");
const upcomingPaymentsList = document.getElementById("upcomingPaymentsList");

let plans = [];
let repossessions = [];

const money = (value = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));

function getTodayISO() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function formatDateUS(dateString) {
  if (!dateString) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split("-");
    return `${month}/${day}/${year}`;
  }
  return dateString;
}

function getDaysDifference(fromDate, toDate) {
  return Math.round((parseISODate(toDate) - parseISODate(fromDate)) / 86400000);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function getPlanLink(plan) {
  const page = plan.propertyType === "warehouse" ? "warehouses.html" : "houses.html";
  return `${page}?plan=${encodeURIComponent(plan.id)}`;
}

function getAllUnpaidPayments() {
  const payments = [];
  plans.filter(plan => plan.status === "active" && !plan.onHold).forEach(plan => {
    if (!Array.isArray(plan.installments)) return;
    plan.installments.forEach((installment, installmentIndex) => {
      if (installment.paid || !installment.dueDate) return;
      payments.push({
        plan,
        planId: plan.id,
        installment,
        installmentIndex,
        dueDate: installment.dueDate,
        amount: Number(installment.amount || 0)
      });
    });
  });
  return payments;
}

function getPlanOverduePayments(plan) {
  if (plan?.onHold) return [];
  const today = getTodayISO();
  if (!Array.isArray(plan.installments)) return [];
  return plan.installments.filter(item => !item.paid && item.dueDate && item.dueDate < today);
}

function getOldestLateDays(plan) {
  const overdue = getPlanOverduePayments(plan);
  if (!overdue.length) return 0;
  const oldest = [...overdue].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return Math.abs(getDaysDifference(getTodayISO(), oldest.dueDate));
}

function createPaymentRow(payment, type) {
  const plan = payment.plan;
  const today = getTodayISO();
  let timingHtml = "";

  if (type === "overdue") {
    const daysLate = Math.abs(getDaysDifference(today, payment.dueDate));
    timingHtml = `<span class="payment-late">${daysLate} day${daysLate === 1 ? "" : "s"} overdue</span>`;
  } else if (type === "today") {
    timingHtml = `<span class="payment-today">Due Today</span>`;
  } else {
    const daysUntil = getDaysDifference(today, payment.dueDate);
    timingHtml = `<span class="payment-upcoming">In ${daysUntil} day${daysUntil === 1 ? "" : "s"}</span>`;
  }

  return `
    <article class="dashboard-payment-row">
      <div class="payment-person">
        <p class="eyebrow">${escapeHtml(plan.propertyType?.toUpperCase() || "PROPERTY")} #${escapeHtml(plan.propertyId)}</p>
        <h3>${escapeHtml(plan.clientName)}</h3>
        <p class="muted">Citizen ID: ${escapeHtml(plan.citizenId)}</p>
      </div>
      <div class="payment-contact">
        <span>Phone</span>
        <div class="inline-copy-value">
          <strong>${plan.phone ? escapeHtml(plan.phone) : "Not provided"}</strong>
          ${plan.phone ? `<button class="copy-btn dashboard-copy" data-copy="${escapeHtml(plan.phone)}">Copy</button>` : ""}
        </div>
      </div>
      <div class="payment-info"><span>Payment</span><strong>${money(payment.amount)}</strong></div>
      <div class="payment-info"><span>Due Date</span><strong>${formatDateUS(payment.dueDate)}</strong>${timingHtml}</div>
      <div class="payment-row-action"><a href="${getPlanLink(plan)}" class="btn btn-primary">View Plan</a></div>
    </article>`;
}

function createPriorityRow(plan) {
  const overdue = getPlanOverduePayments(plan);
  const overdueAmount = overdue.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const lateDays = getOldestLateDays(plan);
  return `
    <article class="priority-account-row">
      <div>
        <p class="eyebrow">${escapeHtml(plan.propertyType?.toUpperCase() || "PROPERTY")} #${escapeHtml(plan.propertyId)}</p>
        <h3>${escapeHtml(plan.clientName)}</h3>
        <p class="muted">${overdue.length} missed payment${overdue.length === 1 ? "" : "s"} • ${lateDays} day${lateDays === 1 ? "" : "s"} late</p>
      </div>
      <div class="priority-money"><span>Overdue</span><strong>${money(overdueAmount)}</strong></div>
      <div class="priority-contact"><span>Phone</span><strong>${plan.phone ? escapeHtml(plan.phone) : "Not provided"}</strong></div>
      <a class="btn btn-danger" href="${getPlanLink(plan)}">Chase Account</a>
    </article>`;
}

function emptyState(message) {
  return `<div class="dashboard-empty">${message}</div>`;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast({ title: "Copied", message: "Phone number copied to clipboard.", type: "success" });
}

function bindCopyButtons() {
  document.querySelectorAll(".dashboard-copy").forEach(button => {
    button.addEventListener("click", () => copyText(button.dataset.copy));
  });
}

function renderDashboard() {
  const today = getTodayISO();
  const activePlans = plans.filter(plan => plan.status === "active");
  const completedPlans = plans.filter(plan => plan.status === "completed");
  const allPayments = getAllUnpaidPayments();

  const overduePayments = allPayments
    .filter(payment => payment.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paymentsDueToday = allPayments.filter(payment => payment.dueDate === today);
  const upcomingPayments = allPayments
    .filter(payment => {
      if (payment.dueDate <= today) return false;
      const daysUntil = getDaysDifference(today, payment.dueDate);
      return daysUntil >= 1 && daysUntil <= 7;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const priorityAccounts = activePlans
    .filter(plan => {
      const overdue = getPlanOverduePayments(plan);
      return overdue.length >= 2 || getOldestLateDays(plan) >= 7;
    })
    .sort((a, b) => {
      const missedDiff = getPlanOverduePayments(b).length - getPlanOverduePayments(a).length;
      return missedDiff || getOldestLateDays(b) - getOldestLateDays(a);
    });

  const overdueTotal = overduePayments.reduce((sum, payment) => sum + payment.amount, 0);

  activePlansCount.textContent = activePlans.length;
  overduePaymentsCount.textContent = overduePayments.length;
  overdueAmount.textContent = `${money(overdueTotal)} outstanding`;
  dueTodayCount.textContent = paymentsDueToday.length;
  upcomingPaymentsCount.textContent = upcomingPayments.length;
  completedPlansCount.textContent = completedPlans.length;
  repossessionsCount.textContent = repossessions.length;
  overdueBadge.textContent = `${overduePayments.length} overdue`;

  if (priorityAccounts.length) {
    priorityBanner.classList.remove("hidden");
    priorityBannerText.textContent = `${priorityAccounts.length} account${priorityAccounts.length === 1 ? " needs" : "s need"} urgent attention — 2+ missed payments or 7+ days overdue.`;
    priorityAccountsList.innerHTML = priorityAccounts.map(createPriorityRow).join("");
  } else {
    priorityBanner.classList.add("hidden");
    priorityAccountsList.innerHTML = emptyState("No high-priority accounts right now.");
  }

  overduePaymentsList.innerHTML = overduePayments.length
    ? overduePayments.map(payment => createPaymentRow(payment, "overdue")).join("")
    : emptyState("No overdue payments. Everything is currently up to date.");
  dueTodayList.innerHTML = paymentsDueToday.length
    ? paymentsDueToday.map(payment => createPaymentRow(payment, "today")).join("")
    : emptyState("No payments are due today.");
  upcomingPaymentsList.innerHTML = upcomingPayments.length
    ? upcomingPayments.map(payment => createPaymentRow(payment, "upcoming")).join("")
    : emptyState("No payments are due within the next seven days.");

  bindCopyButtons();
}

onSnapshot(collection(db, "paymentPlans"), snapshot => {
  plans = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  renderDashboard();
});

onSnapshot(collection(db, "repossessions"), snapshot => {
  repossessions = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  renderDashboard();
});
