(function () {
  // Source: i18n-iso-countries (locale FR) — code ISO alpha-2 + libellé
  const CDN = "https://cdn.jsdelivr.net/npm/i18n-iso-countries@7.14.0/langs/fr.json";
  let countries = []; // [{ code, name }]
  let loadPromise = null;

  function loadCountries() {
    if (countries.length) return Promise.resolve(countries);
    if (loadPromise) return loadPromise;
    loadPromise = fetch(CDN)
      .then((r) => {
        if (!r.ok) throw new Error("Impossible de charger la liste des pays");
        return r.json();
      })
      .then((map) => {
        countries = Object.entries(map)
          .map(([code, name]) => ({ code, name: String(name) }))
          .sort((a, b) => a.name.localeCompare(b.name, "fr"));
        return countries;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
    return loadPromise;
  }

  window.gekasLoadCountries = loadCountries;

  window.gekasInitCountrySelect = function (inputOrSelect, opts = {}) {
    const preferredCode = (opts.preferredCode || "CD").toUpperCase();
    const host = document.createElement("div");
    host.className = "gp-country";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "gp-country-input";
    input.placeholder = opts.placeholder || "Rechercher un pays…";
    input.autocomplete = "off";
    input.spellcheck = false;
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = opts.name || "country";
    hidden.required = true;
    const list = document.createElement("ul");
    list.className = "gp-country-list";
    list.hidden = true;

    const source = inputOrSelect;
    if (source && source.parentNode) {
      source.parentNode.insertBefore(host, source);
      source.remove();
    }
    host.appendChild(input);
    host.appendChild(hidden);
    host.appendChild(list);

    let openQuery = "";

    function renderList(q) {
      const query = (q || "").trim().toLowerCase();
      const items = countries
        .filter((c) => {
          if (!query) return true;
          return (
            c.name.toLowerCase().includes(query) ||
            c.code.toLowerCase().includes(query)
          );
        })
        .slice(0, query ? 40 : 250);
      list.innerHTML = items
        .map(
          (c) =>
            `<li role="option" data-code="${c.code}" data-name="${c.name.replace(/"/g, "&quot;")}">
              <span class="gp-country-name">${c.name}</span>
              <span class="gp-country-code">${c.code}</span>
            </li>`
        )
        .join("");
      list.hidden = items.length === 0;
    }

    function pick(code, name) {
      input.value = name;
      hidden.value = code;
      openQuery = "";
      list.hidden = true;
    }

    function ensurePreferred() {
      const pref = countries.find((c) => c.code === preferredCode);
      if (pref) pick(pref.code, pref.name);
    }

    loadCountries()
      .then(() => ensurePreferred())
      .catch(() => {
        input.placeholder = "Liste des pays indisponible";
      });

    input.addEventListener("focus", () => {
      // Ne pas filtrer avec le libellé complet sélectionné : afficher toute la liste
      openQuery = "";
      renderList("");
    });

    input.addEventListener("input", () => {
      hidden.value = "";
      openQuery = input.value;
      renderList(openQuery);
    });

    list.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li");
      if (!li) return;
      e.preventDefault();
      pick(li.getAttribute("data-code"), li.getAttribute("data-name"));
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        list.hidden = true;
        if (!hidden.value && input.value.trim()) {
          const exact = countries.find(
            (c) => c.name.toLowerCase() === input.value.trim().toLowerCase()
          );
          if (exact) pick(exact.code, exact.name);
        } else if (hidden.value) {
          const selected = countries.find((c) => c.code === hidden.value);
          if (selected) input.value = selected.name;
        }
      }, 150);
    });

    return {
      getValue: () => hidden.value,
      getLabel: () => input.value,
      el: host,
      validate: () => Boolean(hidden.value),
    };
  };
})();
