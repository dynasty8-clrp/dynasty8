let toastRoot = null;

function getRoot() {
  if (toastRoot) return toastRoot;
  toastRoot = document.createElement("div");
  toastRoot.className = "toast-stack";
  document.body.appendChild(toastRoot);
  return toastRoot;
}

export function showToast({
  title = "Done",
  message = "",
  type = "success",
  duration = 3200
} = {}) {
  const root = getRoot();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon =
    type === "success" ? "✓" : type === "error" ? "!" : type === "warning" ? "!" : "i";

  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-copy">
      <strong></strong>
      <span></span>
    </div>
    <button class="toast-close" type="button" aria-label="Close">×</button>
  `;

  toast.querySelector("strong").textContent = title;
  toast.querySelector("span").textContent = message;
  root.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 220);
  };

  toast.querySelector(".toast-close").onclick = close;
  setTimeout(close, duration);
}
