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

const search = document.getElementById("repoSearch");
const typeFilter = document.getElementById("repoTypeFilter");
const list = document.getElementById("repoList");
let repossessions = [];
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

function formatDateUS(dateString) {
  if (!dateString) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split("-");
    return `${month}/${day}/${year}`;
  }
  return dateString;
}

function planLink(repo) {
  if (!repo.paymentPlanId) return null;

  let page = "houses.html";

  if (repo.propertyType === "warehouse") {
    page = "warehouses.html";
  } else if (repo.propertyType === "business") {
    page = "businesses.html";
  }

  return `${page}?plan=${encodeURIComponent(repo.paymentPlanId)}`;
}

async function restoreRepossession(repoId) {
  const repo = repossessions.find(item => item.id === repoId);
  if (!repo || !repo.paymentPlanId) return;
  const plan = plans.find(item => item.id === repo.paymentPlanId);

  const confirmed = await showConfirm({
    title: "Restore This Property?",
    message: `${repo.clientName}'s property will be removed from Repossessions and returned to active payment plans.`,
    type: "warning",
    confirmText: "Restore Property",
    cancelText: "Cancel"
  });
  if (!confirmed) return;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "paymentPlans", repo.paymentPlanId), {
      status: "active",
      repossessedAt: null,
      repossessionReason: null,
      updatedAt: serverTimestamp()
    });
    batch.delete(doc(db, "repossessions", repo.id));

    const activityRef = doc(collection(db, "activityLog"));
    batch.set(activityRef, {
      paymentPlanId: repo.paymentPlanId,
      action: "repossession_reversed",
      message: "Repossession was reversed and the plan was restored to active.",
      actor: "Staff",
      createdAt: serverTimestamp()
    });

    await batch.commit();
    showToast({
      title: "Repossession Reversed",
      message: `${repo.clientName}'s plan is active again.`,
      type: "success"
    });
  } catch (error) {
    console.error("Restore repossession failed:", error);
    await showAlert({ title: "Could Not Restore Property", message: "The repossession could not be reversed.", type: "error" });
  }
}

function render() {
  const term = search.value.trim().toLowerCase();
  const type = typeFilter.value;

  let shown = [...repossessions];
  if (type !== "all") shown = shown.filter(repo => repo.propertyType === type);
  if (term) {
    shown = shown.filter(repo =>
      [repo.clientName, repo.citizenId, repo.propertyId, repo.reason, repo.phone].some(value =>
        String(value || "").toLowerCase().includes(term)
      )
    );
  }

  shown.sort((a, b) => String(b.dateRepossessed || "").localeCompare(String(a.dateRepossessed || "")));

  if (!shown.length) {
    list.innerHTML = `<div class="empty-state">No repossession records found.</div>`;
    return;
  }

  list.innerHTML = shown.map(repo => {
    const link = planLink(repo);
    const planExists = repo.paymentPlanId && plans.some(plan => plan.id === repo.paymentPlanId);
    return `
      <article class="repo-card">
        <div class="plan-top">
          <div>
            <p class="eyebrow">${escapeHtml(repo.propertyType?.toUpperCase() || "PROPERTY")} #${escapeHtml(repo.propertyId)}</p>
            <h3>${escapeHtml(repo.clientName)}</h3>
            <p class="muted">Citizen ID: ${escapeHtml(repo.citizenId)}</p>
          </div>
          <span class="status-pill repossessed">Repossessed</span>
        </div>

        <dl class="detail-list">
          <div><dt>Date Repossessed</dt><dd>${formatDateUS(repo.dateRepossessed)}</dd></div>
          <div><dt>Phone</dt><dd>${escapeHtml(repo.phone || "Not provided")}</dd></div>
          <div><dt>Amount Paid</dt><dd>${money(repo.amountPaid)}</dd></div>
          <div><dt>Balance at Repossession</dt><dd>${money(repo.remainingBalance)}</dd></div>
          <div class="wide"><dt>Reason</dt><dd>${escapeHtml(repo.reason || "No reason recorded")}</dd></div>
          ${repo.notes ? `<div class="wide"><dt>Notes</dt><dd>${escapeHtml(repo.notes)}</dd></div>` : ""}
        </dl>

        <div class="card-actions multi-actions">
          ${link ? `<a class="btn btn-primary" href="${link}">View Original Plan</a>` : ""}
          ${planExists ? `<button class="btn btn-ghost restore-repo" data-id="${repo.id}">Restore Plan</button>` : ""}
        </div>
      </article>`;
  }).join("");

  list.querySelectorAll(".restore-repo").forEach(button => {
    button.addEventListener("click", () => restoreRepossession(button.dataset.id));
  });
}

search.addEventListener("input", render);
typeFilter.addEventListener("change", render);

onSnapshot(collection(db, "repossessions"), snapshot => {
  repossessions = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  render();
});

onSnapshot(collection(db, "paymentPlans"), snapshot => {
  plans = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  render();
});
