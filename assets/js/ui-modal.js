let modalRoot = null;

function createModalRoot() {
  if (modalRoot) return modalRoot;

  modalRoot = document.createElement("div");
  modalRoot.className = "site-popup hidden";
  modalRoot.innerHTML = `
    <div class="site-popup-backdrop"></div>
    <div class="site-popup-card">
      <button class="site-popup-close" type="button" aria-label="Close">×</button>
      <div class="site-popup-icon"></div>
      <p class="eyebrow site-popup-eyebrow">DYNASTY 8</p>
      <h2 class="site-popup-title"></h2>
      <p class="site-popup-message"></p>
      <div class="site-popup-field hidden">
        <input class="site-popup-input" type="text" autocomplete="off" />
        <textarea class="site-popup-textarea hidden" rows="5"></textarea>
      </div>
      <div class="site-popup-actions"></div>
    </div>
  `;

  document.body.appendChild(modalRoot);
  return modalRoot;
}

function openPopup() {
  createModalRoot();
  modalRoot.classList.remove("hidden");
  document.body.classList.add("popup-open");
}

function closePopup() {
  if (!modalRoot) return;
  modalRoot.classList.add("hidden");
  document.body.classList.remove("popup-open");
}

function setType(type) {
  const icon = modalRoot.querySelector(".site-popup-icon");
  modalRoot.classList.remove(
    "popup-success",
    "popup-error",
    "popup-warning",
    "popup-info"
  );
  modalRoot.classList.add(`popup-${type}`);

  icon.textContent =
    type === "success" ? "✓" : type === "info" ? "i" : "!";
}

function setContent(title, message, type) {
  openPopup();
  setType(type);
  modalRoot.querySelector(".site-popup-title").textContent = title;
  modalRoot.querySelector(".site-popup-message").textContent = message;
}

export function showAlert({
  title = "Notice",
  message = "",
  type = "info",
  buttonText = "Okay"
} = {}) {
  return new Promise(resolve => {
    setContent(title, message, type);

    const field = modalRoot.querySelector(".site-popup-field");
    const actions = modalRoot.querySelector(".site-popup-actions");
    field.classList.add("hidden");

    actions.innerHTML = `
      <button type="button" class="btn btn-primary popup-main-btn">${buttonText}</button>
    `;

    const finish = () => {
      closePopup();
      resolve();
    };

    actions.querySelector(".popup-main-btn").onclick = finish;
    modalRoot.querySelector(".site-popup-close").onclick = finish;
    modalRoot.querySelector(".site-popup-backdrop").onclick = finish;
  });
}

export function showConfirm({
  title = "Are you sure?",
  message = "",
  type = "warning",
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false
} = {}) {
  return new Promise(resolve => {
    setContent(title, message, type);

    const field = modalRoot.querySelector(".site-popup-field");
    const actions = modalRoot.querySelector(".site-popup-actions");
    field.classList.add("hidden");

    actions.innerHTML = `
      <button type="button" class="btn btn-ghost popup-cancel-btn">${cancelText}</button>
      <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"} popup-confirm-btn">${confirmText}</button>
    `;

    const finish = result => {
      closePopup();
      resolve(result);
    };

    actions.querySelector(".popup-cancel-btn").onclick = () => finish(false);
    actions.querySelector(".popup-confirm-btn").onclick = () => finish(true);
    modalRoot.querySelector(".site-popup-close").onclick = () => finish(false);
    modalRoot.querySelector(".site-popup-backdrop").onclick = () => finish(false);
  });
}

export function showPrompt({
  title = "Enter Details",
  message = "",
  placeholder = "",
  type = "info",
  confirmText = "Save",
  cancelText = "Cancel",
  multiline = false
} = {}) {
  return new Promise(resolve => {
    setContent(title, message, type);

    const field = modalRoot.querySelector(".site-popup-field");
    const input = modalRoot.querySelector(".site-popup-input");
    const textarea = modalRoot.querySelector(".site-popup-textarea");
    const actions = modalRoot.querySelector(".site-popup-actions");

    field.classList.remove("hidden");
    input.classList.toggle("hidden", multiline);
    textarea.classList.toggle("hidden", !multiline);

    const activeField = multiline ? textarea : input;
    input.value = "";
    textarea.value = "";
    activeField.placeholder = placeholder;

    actions.innerHTML = `
      <button type="button" class="btn btn-ghost popup-cancel-btn">${cancelText}</button>
      <button type="button" class="btn btn-primary popup-confirm-btn">${confirmText}</button>
    `;

    const finish = result => {
      closePopup();
      activeField.onkeydown = null;
      resolve(result);
    };

    actions.querySelector(".popup-cancel-btn").onclick = () => finish(null);
    actions.querySelector(".popup-confirm-btn").onclick = () =>
      finish(activeField.value.trim());
    modalRoot.querySelector(".site-popup-close").onclick = () => finish(null);
    modalRoot.querySelector(".site-popup-backdrop").onclick = () => finish(null);

    if (!multiline) {
      activeField.onkeydown = event => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(activeField.value.trim());
        }
      };
    }

    setTimeout(() => activeField.focus(), 50);
  });
}
