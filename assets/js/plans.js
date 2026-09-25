import "./auth-guard.js";
import { db } from "./firebase.js";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { showAlert, showConfirm, showPrompt } from "./ui-modal.js";
import { showToast } from "./toast.js";

const propertyType = document.querySelector("main").dataset.propertyType;
const modal = document.getElementById("planModal");
const editModal = document.getElementById("editPlanModal");
const form = document.getElementById("planForm");
const editForm = document.getElementById("editPlanForm");
const list = document.getElementById("plansList");
const search = document.getElementById("planSearch");
const statusFilter = document.getElementById("statusFilter");
const sortPlans = document.getElementById("sortPlans");

if (statusFilter && !statusFilter.querySelector('option[value="onhold"]')) {
  const holdOption = document.createElement("option");
  holdOption.value = "onhold";
  holdOption.textContent = "On Hold";
  statusFilter.appendChild(holdOption);
}
const dateInput = document.getElementById("firstPaymentDate");
const dateButton = document.getElementById("openDatePicker");
const editDateInput = document.getElementById("editFirstPaymentDate");
const editDateButton = document.getElementById("openEditDatePicker");
const viewPlanModal = document.getElementById("viewPlanModal");
const planDetails = document.getElementById("planDetails");

let plans = [];
let payments = [];
let contactLogs = [];
let activityLogs = [];
let openPlanId = null;
let editingPlanId = null;

const money = (value = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));

function getTodayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateUS(dateString) {
  if (!dateString) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split("-");
    return `${month}/${day}/${year}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) {
    const [month, day, year] = dateString.split("/");
    return `${month.padStart(2, "0")}/${day.padStart(2, "0")}/${year}`;
  }
  return dateString;
}

function formatTimestampUS(value) {
  if (!value) return "Pending";
  let date = null;
  if (typeof value.toDate === "function") date = value.toDate();
  else if (value.seconds) date = new Date(value.seconds * 1000);
  else if (value instanceof Date) date = value;
  else date = new Date(value);

  if (!date || Number.isNaN(date.getTime())) return "Pending";

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function convertUSDateToISO(dateString) {
  if (!dateString) return "";
  const match = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  let [, month, day, year] = match;
  month = month.padStart(2, "0");
  day = day.padStart(2, "0");

  const testDate = new Date(`${year}-${month}-${day}T12:00:00`);
  if (
    Number.isNaN(testDate.getTime()) ||
    testDate.getFullYear() !== Number(year) ||
    testDate.getMonth() + 1 !== Number(month) ||
    testDate.getDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function parseISODate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetween(earlierISO, laterISO) {
  const earlier = parseISODate(earlierISO);
  const later = parseISODate(laterISO);
  return Math.round((later - earlier) / 86400000);
}

function addDaysISO(isoDate, daysToAdd) {
  const date = parseISODate(isoDate);
  date.setDate(date.getDate() + Number(daysToAdd || 0));
  return toISODate(date);
}

function addMonthsClamped(isoDate, monthsToAdd) {
  const source = parseISODate(isoDate);
  const originalDay = source.getDate();
  const firstOfTarget = new Date(
    source.getFullYear(),
    source.getMonth() + monthsToAdd,
    1,
    12,
    0,
    0
  );
  const lastDayOfTarget = new Date(
    firstOfTarget.getFullYear(),
    firstOfTarget.getMonth() + 1,
    0,
    12,
    0,
    0
  ).getDate();
  firstOfTarget.setDate(Math.min(originalDay, lastDayOfTarget));
  return toISODate(firstOfTarget);
}

function getInstallmentDueDate(firstDate, frequency, index) {
  if (frequency === "monthly") return addMonthsClamped(firstDate, index);
  const date = parseISODate(firstDate);
  const daysToAdd = frequency === "biweekly" ? index * 14 : index * 7;
  date.setDate(date.getDate() + daysToAdd);
  return toISODate(date);
}

function buildInstallments(remainingBalance, count, firstDate, frequency) {
  if (remainingBalance <= 0 || count <= 0) return [];
  const baseAmount = Math.floor(remainingBalance / count);
  const remainder = remainingBalance - baseAmount * count;

  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    amount: baseAmount + (index === count - 1 ? remainder : 0),
    dueDate: getInstallmentDueDate(firstDate, frequency, index),
    paid: false,
    paidDate: null
  }));
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

function getInstallmentStatus(installment) {
  if (installment.paid) return "paid";
  const today = getTodayISO();
  if (installment.dueDate < today) return "overdue";
  if (installment.dueDate === today) return "due";
  return "upcoming";
}

function getMissedInstallments(plan) {
  if (plan?.onHold) return [];
  if (!Array.isArray(plan.installments)) return [];
  return plan.installments.filter(item => getInstallmentStatus(item) === "overdue");
}

function getMissedCount(plan) {
  return getMissedInstallments(plan).length;
}

function getOldestOverdueDays(plan) {
  const missed = getMissedInstallments(plan);
  if (!missed.length) return 0;
  const oldest = [...missed].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return daysBetween(oldest.dueDate, getTodayISO());
}

function planHasOverdue(plan) {
  return getMissedCount(plan) > 0;
}

function planHasDueToday(plan) {
  if (plan?.onHold) return false;
  return Array.isArray(plan.installments) &&
    plan.installments.some(item => getInstallmentStatus(item) === "due");
}

function getNextUnpaidInstallment(plan) {
  if (!Array.isArray(plan.installments)) return null;
  return plan.installments.find(item => !item.paid) || null;
}

function getFrequencyLabel(value) {
  if (value === "biweekly") return "Every 2 Weeks";
  if (value === "monthly") return "Monthly";
  if (value === "weekly") return "Weekly";
  return "Not set";
}

function timestampSortValue(value) {
  if (!value) return 0;
  if (value.seconds) return value.seconds * 1000;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getPlanPayments(planId) {
  return payments
    .filter(payment => payment.paymentPlanId === planId)
    .sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
}

function getPlanContacts(planId) {
  return contactLogs
    .filter(item => item.paymentPlanId === planId)
    .sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
}

function getPlanActivity(planId) {
  return activityLogs
    .filter(item => item.paymentPlanId === planId)
    .sort((a, b) => timestampSortValue(b.createdAt) - timestampSortValue(a.createdAt));
}

function addActivityToBatch(batch, paymentPlanId, action, message, metadata = {}) {
  const activityRef = doc(collection(db, "activityLog"));
  batch.set(activityRef, {
    paymentPlanId,
    action,
    message,
    metadata,
    actor: "Staff",
    createdAt: serverTimestamp()
  });
}

async function copyText(value, label = "Value") {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(String(value));
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = String(value);
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast({ title: "Copied", message: `${label} copied to clipboard.`, type: "success" });
}

let datePicker = null;
let editDatePicker = null;

if (window.flatpickr && dateInput) {
  datePicker = window.flatpickr(dateInput, {
    dateFormat: "m/d/Y",
    allowInput: true,
    disableMobile: true,
    monthSelectorType: "static"
  });
}

if (window.flatpickr && editDateInput) {
  editDatePicker = window.flatpickr(editDateInput, {
    dateFormat: "m/d/Y",
    allowInput: true,
    disableMobile: true,
    monthSelectorType: "static"
  });
}

if (dateButton && datePicker) dateButton.addEventListener("click", () => datePicker.open());
if (editDateButton && editDatePicker) editDateButton.addEventListener("click", () => editDatePicker.open());

document.getElementById("openPlanModal").addEventListener("click", () => {
  modal.classList.remove("hidden");
});

document.querySelectorAll("[data-close-modal]").forEach(el => {
  el.addEventListener("click", () => modal.classList.add("hidden"));
});

document.querySelectorAll("[data-close-view-plan]").forEach(el => {
  el.addEventListener("click", () => {
    viewPlanModal.classList.add("hidden");
    openPlanId = null;
  });
});

document.querySelectorAll("[data-close-edit-plan]").forEach(el => {
  el.addEventListener("click", () => {
    editModal.classList.add("hidden");
    editingPlanId = null;
  });
});

["totalPrice", "downPayment", "installments"].forEach(id => {
  document.getElementById(id).addEventListener("input", updatePreview);
});

function updatePreview() {
  const total = Number(document.getElementById("totalPrice").value || 0);
  const down = Number(document.getElementById("downPayment").value || 0);
  const count = Math.max(1, Number(document.getElementById("installments").value || 1));
  const remaining = Math.max(0, total - down);
  document.getElementById("remainingPreview").textContent = money(remaining);
  document.getElementById("installmentPreview").textContent = money(remaining / count);
}

form.addEventListener("submit", async event => {
  event.preventDefault();

  const totalPrice = Number(document.getElementById("totalPrice").value || 0);
  const downPayment = Number(document.getElementById("downPayment").value || 0);
  const installmentCount = Math.max(1, Number(document.getElementById("installments").value || 1));
  const paymentFrequency = document.getElementById("paymentFrequency").value;
  const remainingBalance = Math.max(0, totalPrice - downPayment);
  const dateValue = dateInput.value.trim();
  const firstPaymentDate = convertUSDateToISO(dateValue);

  if (downPayment > totalPrice) {
    await showAlert({
      title: "Check Down Payment",
      message: "The down payment cannot be higher than the total property price.",
      type: "warning"
    });
    return;
  }

  if (!dateValue || firstPaymentDate === null) {
    await showAlert({
      title: "Payment Date Required",
      message: "Please choose the first payment date before creating this plan.",
      type: "warning"
    });
    dateInput.focus();
    return;
  }

  const installmentSchedule = buildInstallments(
    remainingBalance,
    installmentCount,
    firstPaymentDate,
    paymentFrequency
  );

  try {
    const planRef = doc(collection(db, "paymentPlans"));
    const batch = writeBatch(db);
    const clientName = document.getElementById("clientName").value.trim();

    batch.set(planRef, {
      clientName,
      phone: document.getElementById("phone").value.trim(),
      citizenId: document.getElementById("citizenId").value.trim(),
      propertyId: document.getElementById("propertyId").value.trim(),
      propertyType,
      totalPrice,
      downPayment,
      remainingBalance,
      installmentCount,
      installmentAmount: installmentCount > 0 ? remainingBalance / installmentCount : 0,
      paymentFrequency,
      firstPaymentDate,
      installments: installmentSchedule,
      notes: document.getElementById("notes").value.trim(),
      amountPaid: downPayment,
      status: remainingBalance <= 0 ? "completed" : "active",
      createdAt: serverTimestamp(),
      completedAt: remainingBalance <= 0 ? serverTimestamp() : null,
      onHold: false,
      holdReason: null,
      holdStartedDate: null,
      holdStartedAt: null,
      holdDaysApplied: 0
    });

    addActivityToBatch(
      batch,
      planRef.id,
      "plan_created",
      `Payment plan created for ${clientName}.`,
      { propertyType, propertyId: document.getElementById("propertyId").value.trim() }
    );

    await batch.commit();

    form.reset();
    if (datePicker) datePicker.clear();
    document.getElementById("downPayment").value = 0;
    document.getElementById("installments").value = 1;
    document.getElementById("paymentFrequency").value = "weekly";
    document.getElementById("paymentFrequency").dispatchEvent(new Event("change", { bubbles: true }));
    updatePreview();
    modal.classList.add("hidden");

    showToast({
      title: "Plan Created",
      message: `${clientName}'s payment plan is now active.`,
      type: "success"
    });
  } catch (error) {
    console.error("Plan creation failed:", error);
    await showAlert({
      title: "Could Not Create Plan",
      message: "The plan could not be saved. Please try again.",
      type: "error"
    });
  }
});

async function markInstallmentPaid(planId, installmentIndex) {
  const plan = plans.find(item => item.id === planId);
  if (!plan || !Array.isArray(plan.installments) || plan.installments[installmentIndex]?.paid) return;

  const installment = plan.installments[installmentIndex];
  const confirmed = await showConfirm({
    title: "Mark Instalment Paid?",
    message: `Record ${money(installment.amount)} as paid for instalment #${installment.number}?`,
    type: "warning",
    confirmText: "Mark Paid",
    cancelText: "Cancel"
  });
  if (!confirmed) return;

  const installments = plan.installments.map((item, index) =>
    index === installmentIndex
      ? { ...item, paid: true, paidDate: getTodayISO() }
      : { ...item }
  );

  const paidInstallmentsTotal = installments
    .filter(item => item.paid)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const amountPaid = Number(plan.downPayment || 0) + paidInstallmentsTotal;
  const remainingBalance = Math.max(0, Number(plan.totalPrice || 0) - amountPaid);
  const completed = installments.every(item => item.paid) || remainingBalance <= 0;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "paymentPlans", planId), {
      installments,
      amountPaid,
      remainingBalance,
      status: completed ? "completed" : "active",
      completedAt: completed ? serverTimestamp() : null,
      ...(completed ? {
        onHold: false,
        holdReason: null,
        holdStartedDate: null,
        holdStartedAt: null
      } : {})
    });

    const paymentRef = doc(collection(db, "payments"));
    batch.set(paymentRef, {
      paymentPlanId: planId,
      installmentIndex,
      installmentNumber: installment.number,
      amount: installment.amount,
      dueDate: installment.dueDate,
      paidDate: getTodayISO(),
      createdAt: serverTimestamp()
    });

    addActivityToBatch(
      batch,
      planId,
      "payment_recorded",
      `${money(installment.amount)} recorded for instalment #${installment.number}.`,
      { installmentNumber: installment.number, amount: installment.amount }
    );

    await batch.commit();
    showToast({
      title: completed ? "Plan Completed" : "Payment Recorded",
      message: completed
        ? "The final payment was recorded and the plan is now complete."
        : `${money(installment.amount)} has been added to the payment history.`,
      type: "success"
    });
  } catch (error) {
    console.error("Payment update failed:", error);
    await showAlert({
      title: "Payment Not Saved",
      message: "The payment could not be recorded. Please try again.",
      type: "error"
    });
  }
}

async function reversePayment(payment) {
  const plan = plans.find(item => item.id === payment.paymentPlanId);
  if (!plan || !Array.isArray(plan.installments)) return;

  const index = Number.isInteger(payment.installmentIndex)
    ? payment.installmentIndex
    : Number(payment.installmentNumber || 1) - 1;
  const current = plan.installments[index];
  if (!current) return;

  const confirmed = await showConfirm({
    title: "Undo This Payment?",
    message: `This will mark instalment #${current.number} as unpaid again and add the amount back to the balance.`,
    type: "warning",
    confirmText: "Undo Payment",
    cancelText: "Cancel",
    danger: true
  });
  if (!confirmed) return;

  const installments = plan.installments.map((item, itemIndex) =>
    itemIndex === index ? { ...item, paid: false, paidDate: null } : { ...item }
  );
  const paidInstallmentsTotal = installments
    .filter(item => item.paid)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const amountPaid = Number(plan.downPayment || 0) + paidInstallmentsTotal;
  const remainingBalance = Math.max(0, Number(plan.totalPrice || 0) - amountPaid);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "paymentPlans", plan.id), {
      installments,
      amountPaid,
      remainingBalance,
      status: "active",
      completedAt: null
    });
    batch.delete(doc(db, "payments", payment.id));
    addActivityToBatch(
      batch,
      plan.id,
      "payment_reversed",
      `Payment for instalment #${current.number} was reversed.`,
      { installmentNumber: current.number, amount: current.amount }
    );
    await batch.commit();

    showToast({
      title: "Payment Reversed",
      message: `Instalment #${current.number} is unpaid again.`,
      type: "warning"
    });
  } catch (error) {
    console.error("Payment reversal failed:", error);
    await showAlert({
      title: "Could Not Undo Payment",
      message: "The payment could not be reversed. Please try again.",
      type: "error"
    });
  }
}

async function addContactNote(plan) {
  const note = await showPrompt({
    title: "Add Contact Note",
    message: `Add a chase/contact update for ${plan.clientName}.`,
    placeholder: "e.g. Called — no answer. Will try again tomorrow.",
    type: "info",
    confirmText: "Add Note",
    cancelText: "Cancel",
    multiline: true
  });
  if (!note) return;

  try {
    const batch = writeBatch(db);
    const contactRef = doc(collection(db, "contactLogs"));
    batch.set(contactRef, {
      paymentPlanId: plan.id,
      note,
      createdAt: serverTimestamp(),
      date: getTodayISO(),
      actor: "Staff"
    });
    addActivityToBatch(batch, plan.id, "contact_note_added", "A contact/chase note was added.");
    await batch.commit();

    showToast({ title: "Contact Note Added", message: "The chase history has been updated.", type: "success" });
  } catch (error) {
    console.error("Contact note failed:", error);
    await showAlert({ title: "Could Not Add Note", message: "The contact note could not be saved.", type: "error" });
  }
}

function openEditPlan(plan) {
  editingPlanId = plan.id;
  document.getElementById("editClientName").value = plan.clientName || "";
  document.getElementById("editPhone").value = plan.phone || "";
  document.getElementById("editCitizenId").value = plan.citizenId || "";
  document.getElementById("editPropertyId").value = plan.propertyId || "";
  document.getElementById("editPaymentFrequency").value = plan.paymentFrequency || "weekly";
  document.getElementById("editPaymentFrequency").dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("editNotes").value = plan.notes || "";

  const firstDate = plan.firstPaymentDate ? formatDateUS(plan.firstPaymentDate) : "";
  if (editDatePicker) editDatePicker.setDate(firstDate, false, "m/d/Y");
  else editDateInput.value = firstDate;

  editModal.classList.remove("hidden");
}

editForm.addEventListener("submit", async event => {
  event.preventDefault();
  const plan = plans.find(item => item.id === editingPlanId);
  if (!plan) return;

  const firstPaymentDate = convertUSDateToISO(editDateInput.value.trim());
  if (!firstPaymentDate) {
    await showAlert({
      title: "Check Payment Date",
      message: "Please enter the first payment date as MM/DD/YYYY.",
      type: "warning"
    });
    return;
  }

  const paymentFrequency = document.getElementById("editPaymentFrequency").value;
  const holdDaysApplied = Number(plan.holdDaysApplied || 0);
  const installments = Array.isArray(plan.installments)
    ? plan.installments.map((item, index) =>
        item.paid
          ? { ...item }
          : {
              ...item,
              dueDate: addDaysISO(
                getInstallmentDueDate(firstPaymentDate, paymentFrequency, index),
                holdDaysApplied
              )
            }
      )
    : [];

  const updates = {
    clientName: document.getElementById("editClientName").value.trim(),
    phone: document.getElementById("editPhone").value.trim(),
    citizenId: document.getElementById("editCitizenId").value.trim(),
    propertyId: document.getElementById("editPropertyId").value.trim(),
    paymentFrequency,
    firstPaymentDate,
    notes: document.getElementById("editNotes").value.trim(),
    installments,
    updatedAt: serverTimestamp()
  };

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "paymentPlans", plan.id), updates);
    addActivityToBatch(batch, plan.id, "plan_edited", "Plan details were edited.");
    await batch.commit();
    editModal.classList.add("hidden");
    editingPlanId = null;
    showToast({ title: "Plan Updated", message: "The plan details have been saved.", type: "success" });
  } catch (error) {
    console.error("Plan edit failed:", error);
    await showAlert({ title: "Could Not Save Changes", message: "The plan could not be updated.", type: "error" });
  }
});

async function putPlanOnHold(planId) {
  const plan = plans.find(item => item.id === planId);
  if (!plan || plan.status !== "active" || plan.onHold) return;

  const confirmed = await showConfirm({
    title: "Put Payment Plan On Hold?",
    message: "While this plan is on hold it will stay visible, but it will not appear as overdue or in Payments to Chase.",
    type: "warning",
    confirmText: "Put On Hold",
    cancelText: "Cancel"
  });
  if (!confirmed) return;

  const reason = await showPrompt({
    title: "Reason for Hold",
    message: "Add a short reason for pausing this payment plan.",
    placeholder: "e.g. Customer granted a temporary payment break",
    type: "warning",
    confirmText: "Confirm Hold",
    cancelText: "Cancel",
    multiline: true
  });
  if (!reason) return;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "paymentPlans", plan.id), {
      onHold: true,
      holdReason: reason,
      holdStartedDate: getTodayISO(),
      holdStartedAt: serverTimestamp()
    });
    addActivityToBatch(
      batch,
      plan.id,
      "plan_put_on_hold",
      `Payment plan put on hold: ${reason}`
    );
    await batch.commit();

    showToast({
      title: "Plan On Hold",
      message: `${plan.clientName}'s payment schedule is now paused.`,
      type: "warning"
    });
  } catch (error) {
    console.error("Hold update failed:", error);
    await showAlert({
      title: "Could Not Put Plan On Hold",
      message: "The payment plan could not be paused. Please try again.",
      type: "error"
    });
  }
}

async function resumePlan(planId) {
  const plan = plans.find(item => item.id === planId);
  if (!plan || plan.status !== "active" || !plan.onHold) return;

  const confirmed = await showConfirm({
    title: "Resume Payment Plan?",
    message: "The remaining instalment due dates will be moved forward by the number of days this plan was on hold.",
    type: "info",
    confirmText: "Resume Plan",
    cancelText: "Cancel"
  });
  if (!confirmed) return;

  const today = getTodayISO();
  const holdStartedDate = plan.holdStartedDate || today;
  const daysHeld = Math.max(0, daysBetween(holdStartedDate, today));
  const installments = Array.isArray(plan.installments)
    ? plan.installments.map(item =>
        item.paid || !item.dueDate
          ? { ...item }
          : { ...item, dueDate: addDaysISO(item.dueDate, daysHeld) }
      )
    : [];

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "paymentPlans", plan.id), {
      onHold: false,
      holdReason: null,
      holdStartedDate: null,
      holdStartedAt: null,
      holdDaysApplied: Number(plan.holdDaysApplied || 0) + daysHeld,
      installments,
      resumedAt: serverTimestamp()
    });
    addActivityToBatch(
      batch,
      plan.id,
      "plan_resumed",
      daysHeld
        ? `Payment plan resumed after ${daysHeld} day${daysHeld === 1 ? "" : "s"} on hold. Remaining due dates were moved forward.`
        : "Payment plan resumed."
    );
    await batch.commit();

    showToast({
      title: "Plan Resumed",
      message: daysHeld
        ? `Remaining payment dates were moved forward by ${daysHeld} day${daysHeld === 1 ? "" : "s"}.`
        : "The payment plan is active again.",
      type: "success"
    });
  } catch (error) {
    console.error("Resume update failed:", error);
    await showAlert({
      title: "Could Not Resume Plan",
      message: "The payment plan could not be resumed. Please try again.",
      type: "error"
    });
  }
}

async function repossessPlan(planId) {
  const plan = plans.find(item => item.id === planId);
  if (!plan) return;

  const confirmed = await showConfirm({
    title: "Repossess Property?",
    message: `Are you sure you want to repossess ${plan.clientName}'s ${plan.propertyType}? It will be removed from active plans and moved to Repossessions.`,
    type: "warning",
    confirmText: "Repossess",
    cancelText: "Cancel",
    danger: true
  });
  if (!confirmed) return;

  const reason = await showPrompt({
    title: "Repossession Reason",
    message: "Enter the reason this property is being repossessed.",
    placeholder: "e.g. Missed Instalment Payments x2",
    type: "warning",
    confirmText: "Confirm Repossession",
    cancelText: "Cancel",
    multiline: true
  });
  if (!reason) return;

  try {
    const batch = writeBatch(db);
    const repoRef = doc(collection(db, "repossessions"));
    batch.set(repoRef, {
      clientName: plan.clientName || "",
      citizenId: plan.citizenId || "",
      propertyId: plan.propertyId || "",
      propertyType: plan.propertyType || "",
      phone: plan.phone || "",
      reason,
      dateRepossessed: getTodayISO(),
      notes: plan.notes || "",
      paymentPlanId: plan.id,
      totalPrice: Number(plan.totalPrice || 0),
      amountPaid: Number(plan.amountPaid || 0),
      remainingBalance: Number(plan.remainingBalance || 0),
      createdAt: serverTimestamp()
    });

    batch.update(doc(db, "paymentPlans", plan.id), {
      status: "repossessed",
      repossessedAt: serverTimestamp(),
      repossessionReason: reason,
      onHold: false,
      holdReason: null,
      holdStartedDate: null,
      holdStartedAt: null
    });

    addActivityToBatch(batch, plan.id, "property_repossessed", `Property repossessed: ${reason}`);
    await batch.commit();

    viewPlanModal.classList.add("hidden");
    openPlanId = null;
    showToast({
      title: "Property Repossessed",
      message: `${plan.clientName}'s property is now in Repossessions.`,
      type: "success"
    });
  } catch (error) {
    console.error("Repossession failed:", error);
    await showAlert({ title: "Something Went Wrong", message: "The property could not be repossessed.", type: "error" });
  }
}

async function archivePlan(planId) {
  const plan = plans.find(item => item.id === planId);
  if (!plan) return;

  const confirmed = await showConfirm({
    title: "Archive This Plan?",
    message: "Use this when a plan was entered in error or should no longer be active. It can be restored later from Completed → Archived.",
    type: "warning",
    confirmText: "Archive Plan",
    cancelText: "Cancel",
    danger: true
  });
  if (!confirmed) return;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "paymentPlans", plan.id), {
      status: "archived",
      archivedAt: serverTimestamp(),
      onHold: false,
      holdReason: null,
      holdStartedDate: null,
      holdStartedAt: null
    });
    addActivityToBatch(batch, plan.id, "plan_archived", "Payment plan was archived.");
    await batch.commit();

    viewPlanModal.classList.add("hidden");
    openPlanId = null;
    showToast({ title: "Plan Archived", message: "The plan was removed from the active list.", type: "warning" });
  } catch (error) {
    console.error("Archive failed:", error);
    await showAlert({ title: "Could Not Archive Plan", message: "The plan could not be archived.", type: "error" });
  }
}

function openPlanDetails(planId) {
  const plan = plans.find(item => item.id === planId);
  if (!plan) return;
  openPlanId = planId;
  renderPlanDetails(plan);
  viewPlanModal.classList.remove("hidden");
}

function renderPlanDetails(plan) {
  const installments = Array.isArray(plan.installments) ? plan.installments : [];
  const nextPayment = getNextUnpaidInstallment(plan);
  const missed = getMissedInstallments(plan);
  const missedAmount = missed.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const planPayments = getPlanPayments(plan.id);
  const contacts = getPlanContacts(plan.id);
  const activity = getPlanActivity(plan.id);
  const isActive = plan.status === "active";
  const isOnHold = isActive && plan.onHold === true;
  const canReversePayments = plan.status === "active" || plan.status === "completed";

  const scheduleHtml = installments.length
    ? `
      <div class="schedule-wrap">
        <table class="schedule-table">
          <thead>
            <tr><th>#</th><th>Due Date</th><th>Amount</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            ${installments.map((installment, index) => {
              const status = installment.paid
                ? "paid"
                : isOnHold
                  ? "hold"
                  : getInstallmentStatus(installment);
              const label = status === "paid"
                ? "Paid"
                : status === "hold"
                  ? "On Hold"
                  : status === "overdue"
                    ? "Overdue"
                    : status === "due"
                      ? "Due Today"
                      : "Upcoming";
              return `
                <tr>
                  <td>${installment.number}</td>
                  <td>${formatDateUS(installment.dueDate)}</td>
                  <td><strong>${money(installment.amount)}</strong></td>
                  <td><span class="installment-status ${status}">${label}</span></td>
                  <td class="schedule-action">
                    ${installment.paid
                      ? installment.paidDate
                        ? `<span class="paid-date">Paid ${formatDateUS(installment.paidDate)}</span>`
                        : `<span class="paid-date">Paid</span>`
                      : isActive
                        ? `<button class="btn btn-primary btn-small mark-installment-paid" data-plan-id="${plan.id}" data-installment-index="${index}">Mark Paid</button>`
                        : ""}
                  </td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`
    : `<div class="empty-state compact-empty">This plan was created before individual instalments were added.</div>`;

  const paymentHistoryHtml = `
    <div class="record-list">
      ${Number(plan.downPayment || 0) > 0 ? `
        <div class="record-row">
          <div><strong>Down Payment</strong><span>Initial payment</span></div>
          <div class="record-amount">${money(plan.downPayment)}</div>
        </div>` : ""}
      ${planPayments.length ? planPayments.map(payment => `
        <div class="record-row">
          <div>
            <strong>Instalment #${escapeHtml(payment.installmentNumber)}</strong>
            <span>Paid ${formatDateUS(payment.paidDate)} • Due ${formatDateUS(payment.dueDate)}</span>
          </div>
          <div class="record-row-actions">
            <strong class="record-amount">${money(payment.amount)}</strong>
            ${canReversePayments ? `<button class="mini-action danger undo-payment" data-payment-id="${payment.id}">Undo</button>` : ""}
          </div>
        </div>`).join("") : `<div class="mini-empty">No instalment payments have been recorded yet.</div>`}
    </div>`;

  const contactsHtml = contacts.length
    ? contacts.map(item => `
      <div class="timeline-item">
        <span class="timeline-dot contact"></span>
        <div><strong>${escapeHtml(item.note)}</strong><small>${formatTimestampUS(item.createdAt)}</small></div>
      </div>`).join("")
    : `<div class="mini-empty">No contact notes yet.</div>`;

  const activityHtml = activity.length
    ? activity.slice(0, 20).map(item => `
      <div class="timeline-item">
        <span class="timeline-dot"></span>
        <div><strong>${escapeHtml(item.message || item.action)}</strong><small>${formatTimestampUS(item.createdAt)}</small></div>
      </div>`).join("")
    : `<div class="mini-empty">No activity recorded yet.</div>`;

  planDetails.innerHTML = `
    <div class="plan-details-heading detail-heading-row">
      <div>
        <p class="eyebrow">${escapeHtml(plan.propertyType?.toUpperCase() || "PROPERTY")} #${escapeHtml(plan.propertyId)}</p>
        <h2>${escapeHtml(plan.clientName)}</h2>
        <div class="identity-line">
          <span>Citizen ID: ${escapeHtml(plan.citizenId)}</span>
          <button class="copy-btn" data-copy="${escapeHtml(plan.citizenId)}" data-label="Citizen ID">Copy</button>
          ${plan.phone ? `<span>• ${escapeHtml(plan.phone)}</span><button class="copy-btn" data-copy="${escapeHtml(plan.phone)}" data-label="Phone number">Copy</button>` : ""}
          <span>• Property ID: ${escapeHtml(plan.propertyId)}</span>
          <button class="copy-btn" data-copy="${escapeHtml(plan.propertyId)}" data-label="Property ID">Copy</button>
        </div>
      </div>
      <span class="status-pill ${plan.status === "completed" ? "completed" : plan.status === "repossessed" ? "repossessed" : plan.status === "archived" ? "archived" : isOnHold ? "hold" : planHasOverdue(plan) ? "bad" : planHasDueToday(plan) ? "due" : "good"}">
        ${plan.status === "active" ? (isOnHold ? "On Hold" : planHasOverdue(plan) ? "Overdue" : planHasDueToday(plan) ? "Due Today" : "Active") : escapeHtml(plan.status || "Unknown")}
      </span>
    </div>

    <div class="plan-summary-grid">
      <div><span>Total Price</span><strong>${money(plan.totalPrice)}</strong></div>
      <div><span>Paid</span><strong>${money(plan.amountPaid)}</strong></div>
      <div><span>Remaining</span><strong>${money(plan.remainingBalance)}</strong></div>
      <div class="${missed.length ? "summary-danger" : ""}"><span>Missed Payments</span><strong>${missed.length}</strong><small>${missed.length ? `${money(missedAmount)} overdue` : "Up to date"}</small></div>
    </div>

    ${isOnHold ? `
      <div class="hold-banner">
        <div>
          <span class="hold-banner-label">PAYMENT PLAN ON HOLD</span>
          <strong>${escapeHtml(plan.holdReason || "No reason provided")}</strong>
          <small>On hold since ${formatDateUS(plan.holdStartedDate || getTodayISO())}</small>
        </div>
        <button class="btn btn-hold resume-plan">Resume Plan</button>
      </div>` : ""}

    <div class="plan-meta-row">
      <div><span>Frequency</span><strong>${getFrequencyLabel(plan.paymentFrequency)}</strong></div>
      <div><span>Next Payment</span><strong>${isOnHold ? "Paused while plan is on hold" : nextPayment ? `${money(nextPayment.amount)} • ${formatDateUS(nextPayment.dueDate)}` : "None"}</strong></div>
    </div>

    ${isActive ? `
      <div class="plan-quick-actions">
        <button class="btn btn-ghost edit-plan">Edit Plan</button>
        <button class="btn btn-primary add-contact-note">+ Add Contact Note</button>
        ${isOnHold ? "" : `<button class="btn btn-hold hold-plan">Put On Hold</button>`}
      </div>` : `
      <div class="plan-quick-actions">
        <button class="btn btn-primary add-contact-note">+ Add Contact Note</button>
      </div>`}

    <section class="plan-section-block">
      <div class="section-title-row"><div><p class="eyebrow">PAYMENT SCHEDULE</p><h3>Instalments</h3></div></div>
      ${scheduleHtml}
    </section>

    <section class="plan-section-block">
      <div class="section-title-row"><div><p class="eyebrow">PAYMENT HISTORY</p><h3>Recorded Payments</h3></div></div>
      ${paymentHistoryHtml}
    </section>

    <section class="plan-section-block two-column-history">
      <div>
        <div class="section-title-row"><div><p class="eyebrow">CHASE HISTORY</p><h3>Contact Notes</h3></div></div>
        <div class="timeline-list">${contactsHtml}</div>
      </div>
      <div>
        <div class="section-title-row"><div><p class="eyebrow">AUDIT LOG</p><h3>Recent Activity</h3></div></div>
        <div class="timeline-list">${activityHtml}</div>
      </div>
    </section>

    ${plan.notes ? `<div class="plan-notes-block"><span>Notes</span><p>${escapeHtml(plan.notes)}</p></div>` : ""}

    ${isActive ? `
      <div class="plan-danger-zone">
        <div>
          <span>Property Actions</span>
          <p>Archive a plan entered in error, or repossess the property and move it to the Repossessions page.</p>
        </div>
        <div class="danger-actions">
          <button class="btn btn-ghost archive-plan">Archive Plan</button>
          <button class="btn btn-danger repossess-plan">Repossess Property</button>
        </div>
      </div>` : ""}
  `;

  planDetails.querySelectorAll(".mark-installment-paid").forEach(button => {
    button.addEventListener("click", () =>
      markInstallmentPaid(button.dataset.planId, Number(button.dataset.installmentIndex))
    );
  });

  planDetails.querySelectorAll(".undo-payment").forEach(button => {
    button.addEventListener("click", () => {
      const payment = payments.find(item => item.id === button.dataset.paymentId);
      if (payment) reversePayment(payment);
    });
  });

  planDetails.querySelectorAll(".copy-btn").forEach(button => {
    button.addEventListener("click", () => copyText(button.dataset.copy, button.dataset.label));
  });

  planDetails.querySelector(".add-contact-note")?.addEventListener("click", () => addContactNote(plan));
  planDetails.querySelector(".edit-plan")?.addEventListener("click", () => openEditPlan(plan));
  planDetails.querySelector(".hold-plan")?.addEventListener("click", () => putPlanOnHold(plan.id));
  planDetails.querySelector(".resume-plan")?.addEventListener("click", () => resumePlan(plan.id));
  planDetails.querySelector(".repossess-plan")?.addEventListener("click", () => repossessPlan(plan.id));
  planDetails.querySelector(".archive-plan")?.addEventListener("click", () => archivePlan(plan.id));
}

function sortPlanList(items, mode) {
  const sorted = [...items];
  const nextDate = plan => getNextUnpaidInstallment(plan)?.dueDate || "9999-12-31";

  if (mode === "next") return sorted.sort((a, b) => nextDate(a).localeCompare(nextDate(b)));
  if (mode === "balance") return sorted.sort((a, b) => Number(b.remainingBalance || 0) - Number(a.remainingBalance || 0));
  if (mode === "name") return sorted.sort((a, b) => String(a.clientName || "").localeCompare(String(b.clientName || "")));
  if (mode === "overdue") {
    return sorted.sort((a, b) => {
      const missedDiff = getMissedCount(b) - getMissedCount(a);
      if (missedDiff) return missedDiff;
      return getOldestOverdueDays(b) - getOldestOverdueDays(a);
    });
  }

  return sorted.sort((a, b) => {
    const aMissed = getMissedCount(a);
    const bMissed = getMissedCount(b);
    if (aMissed !== bMissed) return bMissed - aMissed;
    const aDue = planHasDueToday(a) ? 1 : 0;
    const bDue = planHasDueToday(b) ? 1 : 0;
    if (aDue !== bDue) return bDue - aDue;
    return nextDate(a).localeCompare(nextDate(b));
  });
}

function render() {
  const term = search.value.trim().toLowerCase();
  const filter = statusFilter.value;
  const sortMode = sortPlans.value;

  let shown = plans.filter(plan => plan.propertyType === propertyType && plan.status === "active");

  if (term) {
    shown = shown.filter(plan =>
      [plan.clientName, plan.citizenId, plan.propertyId, plan.phone].some(value =>
        String(value || "").toLowerCase().includes(term)
      )
    );
  }

  if (filter === "overdue") shown = shown.filter(planHasOverdue);
  if (filter === "uptodate") shown = shown.filter(plan => !planHasOverdue(plan));
  if (filter === "duetoday") shown = shown.filter(planHasDueToday);
  if (filter === "onhold") shown = shown.filter(plan => plan.onHold === true);

  shown = sortPlanList(shown, sortMode);

  if (!shown.length) {
    list.innerHTML = `<div class="empty-state">No active ${propertyType} payment plans found.</div>`;
    return;
  }

  list.innerHTML = shown.map(plan => {
    const paid = Number(plan.amountPaid || plan.downPayment || 0);
    const total = Number(plan.totalPrice || 0);
    const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    const isOnHold = plan.onHold === true;
    const overdue = planHasOverdue(plan);
    const dueToday = planHasDueToday(plan);
    const nextPayment = getNextUnpaidInstallment(plan);
    const missedCount = getMissedCount(plan);
    const statusClass = isOnHold ? "hold" : overdue ? "bad" : dueToday ? "due" : "good";
    const statusText = isOnHold ? "On Hold" : overdue ? "Overdue" : dueToday ? "Due Today" : "Active";

    return `
      <article class="plan-card">
        <div class="plan-top">
          <div>
            <p class="eyebrow">${propertyType.toUpperCase()} #${escapeHtml(plan.propertyId)}</p>
            <h3>${escapeHtml(plan.clientName)}</h3>
            <p class="muted">Citizen ID: ${escapeHtml(plan.citizenId)}${plan.phone ? ` • ${escapeHtml(plan.phone)}` : ""}</p>
          </div>
          <span class="status-pill ${statusClass}">${statusText}</span>
        </div>

        ${missedCount ? `<div class="missed-warning"><strong>${missedCount} missed payment${missedCount === 1 ? "" : "s"}</strong><span>Oldest is ${getOldestOverdueDays(plan)} day${getOldestOverdueDays(plan) === 1 ? "" : "s"} late</span></div>` : ""}

        <div class="money-row">
          <div><span>Paid</span><strong>${money(paid)}</strong></div>
          <div><span>Remaining</span><strong>${money(plan.remainingBalance)}</strong></div>
        </div>

        <div class="progress"><span style="width:${percent}%"></span></div>
        <p class="progress-label">${percent}% paid of ${money(total)}</p>

        <div class="next-payment-box">
          <span>Next Payment</span>
          <strong>${isOnHold ? "Payment schedule paused" : nextPayment ? `${money(nextPayment.amount)} • ${formatDateUS(nextPayment.dueDate)}` : "No payment scheduled"}</strong>
        </div>

        ${isOnHold ? `<div class="hold-card-note"><strong>On Hold</strong><span>${escapeHtml(plan.holdReason || "Payment plan temporarily paused")}</span></div>` : ""}
        ${plan.notes ? `<p class="notes">${escapeHtml(plan.notes)}</p>` : ""}

        <div class="card-actions">
          <button class="btn btn-primary view-plan" data-id="${plan.id}">View Plan</button>
        </div>
      </article>`;
  }).join("");

  list.querySelectorAll(".view-plan").forEach(button => {
    button.addEventListener("click", () => openPlanDetails(button.dataset.id));
  });
}

function refreshOpenPlan() {
  if (!openPlanId) return;
  const openPlan = plans.find(plan => plan.id === openPlanId);
  if (!openPlan) {
    viewPlanModal.classList.add("hidden");
    openPlanId = null;
    return;
  }
  renderPlanDetails(openPlan);
}

function handleRequestedPlan() {
  const requestedPlanId = new URLSearchParams(window.location.search).get("plan");
  if (!requestedPlanId || openPlanId) return;
  const requestedPlan = plans.find(plan => plan.id === requestedPlanId);
  if (!requestedPlan) return;
  openPlanDetails(requestedPlanId);
  window.history.replaceState({}, "", window.location.pathname);
}

search.addEventListener("input", render);
statusFilter.addEventListener("change", render);
sortPlans.addEventListener("change", render);

onSnapshot(collection(db, "paymentPlans"), snapshot => {
  plans = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  render();
  handleRequestedPlan();
  refreshOpenPlan();
});

onSnapshot(collection(db, "payments"), snapshot => {
  payments = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  refreshOpenPlan();
});

onSnapshot(collection(db, "contactLogs"), snapshot => {
  contactLogs = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  refreshOpenPlan();
});

onSnapshot(collection(db, "activityLog"), snapshot => {
  activityLogs = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  refreshOpenPlan();
});
