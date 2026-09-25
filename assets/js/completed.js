import "./auth-guard.js";
import { db } from "./firebase.js";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { showConfirm, showAlert } from "./ui-modal.js";
import { showToast } from "./toast.js";

const search = document.getElementById("recordSearch");
const typeFilter = document.getElementById("typeFilter");
const statusFilter = document.getElementById("recordStatusFilter");
const list = document.getElementById("completedList");
let plans = [];

const money = (value = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatTimestampUS(value) {
  if (!value) return "";
  const date = typeof value.toDate === "function"
    ? value.toDate()
    : value.seconds
      ? new Date(value.seconds * 1000)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  }).format(date);
}

function planLink(plan) {
  return `${plan.propertyType === "warehouse" ? "warehouses.html" : "houses.html"}?plan=${encodeURIComponent(plan.id)}`;
}

async function restoreArchivedPlan(planId) {
  const plan = plans.find(item => item.id === planId);
  if (!plan) return;

  const confirmed = await showConfirm({
    title: "Restore Archived Plan?",
    message: `${plan.clientName}'s plan will return to the active ${plan.propertyType} page.`,
    type: "warning",
    confirmText: "Restore Plan",
    cancelText: "Cancel"
  });
  if (!confirmed) return;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "paymentPlans", plan.id), {
      status: "active",
      archivedAt: null,
      updatedAt: serverTimestamp()
    });
    const activityRef = doc(collection(db, "activityLog"));
    batch.set(activityRef, {
      paymentPlanId: plan.id,
      action: "plan_restored",
      message: "Archived plan was restored to active plans.",
      actor: "Staff",
      createdAt: serverTimestamp()
    });
    await batch.commit();
    showToast({ title: "Plan Restored", message: "The plan is active again.", type: "success" });
  } catch (error) {
    console.error("Restore failed:", error);
    await showAlert({ title: "Could Not Restore Plan", message: "The archived plan could not be restored.", type: "error" });
  }
}

function render() {
  const term = search.value.trim().toLowerCase();
  const type = typeFilter.value;
  const status = statusFilter.value;

  let shown = plans.filter(plan => ["completed", "archived"].includes(plan.status));
  if (status !== "all") shown = shown.filter(plan => plan.status === status);
  if (type !== "all") shown = shown.filter(plan => plan.propertyType === type);
  if (term) {
    shown = shown.filter(plan =>
      [plan.clientName, plan.citizenId, plan.propertyId, plan.phone].some(value =>
        String(value || "").toLowerCase().includes(term)
      )
    );
  }

  shown.sort((a, b) => String(a.clientName || "").localeCompare(String(b.clientName || "")));

  if (!shown.length) {
    list.innerHTML = `<div class="empty-state">No matching completed or archived plans found.</div>`;
    return;
  }

  list.innerHTML = shown.map(plan => {
    const archived = plan.status === "archived";
    return `
      <article class="plan-card record-card">
        <div class="plan-top">
          <div>
            <p class="eyebrow">${escapeHtml(plan.propertyType?.toUpperCase() || "PROPERTY")} #${escapeHtml(plan.propertyId)}</p>
            <h3>${escapeHtml(plan.clientName)}</h3>
            <p class="muted">Citizen ID: ${escapeHtml(plan.citizenId)}</p>
          </div>
          <span class="status-pill ${archived ? "archived" : "completed"}">${archived ? "Archived" : "Completed"}</span>
        </div>

        <div class="detail-list compact-details">
          <div><dt>Purchase Price</dt><dd>${money(plan.totalPrice)}</dd></div>
          <div><dt>Paid</dt><dd>${money(plan.amountPaid || plan.totalPrice)}</dd></div>
          <div><dt>${archived ? "Archived" : "Completed"}</dt><dd>${formatTimestampUS(archived ? plan.archivedAt : plan.completedAt) || "—"}</dd></div>
          <div><dt>Phone</dt><dd>${escapeHtml(plan.phone || "Not provided")}</dd></div>
        </div>

        <div class="card-actions multi-actions">
          <a class="btn btn-primary" href="${planLink(plan)}">View Plan</a>
          ${archived ? `<button class="btn btn-ghost restore-archived" data-id="${plan.id}">Restore Plan</button>` : ""}
        </div>
      </article>`;
  }).join("");

  list.querySelectorAll(".restore-archived").forEach(button => {
    button.addEventListener("click", () => restoreArchivedPlan(button.dataset.id));
  });
}

search.addEventListener("input", render);
typeFilter.addEventListener("change", render);
statusFilter.addEventListener("change", render);

onSnapshot(collection(db, "paymentPlans"), snapshot => {
  plans = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  render();
});
