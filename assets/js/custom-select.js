document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("select").forEach(select => {
    if (select.dataset.customised) return;
    select.dataset.customised = "true";

    const wrapper = document.createElement("div");
    wrapper.className = "custom-select";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "custom-select-button";

    const label = document.createElement("span");
    const arrow = document.createElement("span");
    arrow.className = "custom-select-arrow";
    arrow.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    `;

    button.append(label, arrow);

    const menu = document.createElement("div");
    menu.className = "custom-select-menu";

    const updateLabel = () => {
      const selected = select.options[select.selectedIndex];
      label.textContent = selected ? selected.textContent : "";
    };

    const updateOptions = () => {
      menu.innerHTML = "";

      Array.from(select.options).forEach(option => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "custom-select-option";
        item.textContent = option.textContent;
        item.disabled = option.disabled;

        if (option.value === select.value) item.classList.add("selected");

        item.addEventListener("click", () => {
          if (option.disabled) return;
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          updateLabel();
          updateOptions();
          wrapper.classList.remove("open");
        });

        menu.appendChild(item);
      });
    };

    button.addEventListener("click", event => {
      event.stopPropagation();

      document.querySelectorAll(".custom-select.open").forEach(openSelect => {
        if (openSelect !== wrapper) openSelect.classList.remove("open");
      });

      updateLabel();
      updateOptions();
      wrapper.classList.toggle("open");
    });

    select.addEventListener("change", () => {
      updateLabel();
      updateOptions();
    });

    const form = select.closest("form");
    if (form) {
      form.addEventListener("reset", () => {
        setTimeout(() => {
          updateLabel();
          updateOptions();
        });
      });
    }

    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select, button, menu);
    updateLabel();
    updateOptions();
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".custom-select.open").forEach(select => {
      select.classList.remove("open");
    });
  });
});
