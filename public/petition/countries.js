/* Pays (noms FR) pour le sélecteur searchable */
window.GEKAS_COUNTRIES_FR = [
  "Afghanistan","Afrique du Sud","Albanie","Algérie","Allemagne","Andorre","Angola","Antigua-et-Barbuda","Arabie saoudite","Argentine","Arménie","Australie","Autriche","Azerbaïdjan",
  "Bahamas","Bahreïn","Bangladesh","Barbade","Belgique","Belize","Bénin","Bhoutan","Biélorussie","Birmanie","Bolivie","Bosnie-Herzégovine","Botswana","Brésil","Brunei","Bulgarie","Burkina Faso","Burundi",
  "Cambodge","Cameroun","Canada","Cap-Vert","Chili","Chine","Chypre","Colombie","Comores","Congo-Brazzaville","Corée du Nord","Corée du Sud","Costa Rica","Côte d'Ivoire","Croatie","Cuba",
  "Danemark","Djibouti","Dominique",
  "Égypte","Émirats arabes unis","Équateur","Érythrée","Espagne","Estonie","Eswatini","États-Unis","Éthiopie",
  "Fidji","Finlande","France",
  "Gabon","Gambie","Géorgie","Ghana","Grèce","Grenade","Guatemala","Guinée","Guinée équatoriale","Guinée-Bissau","Guyana",
  "Haïti","Honduras","Hongrie",
  "Inde","Indonésie","Irak","Iran","Irlande","Islande","Israël","Italie",
  "Jamaïque","Japon","Jordanie",
  "Kazakhstan","Kenya","Kirghizistan","Kiribati","Koweït",
  "Laos","Lesotho","Lettonie","Liban","Liberia","Libye","Liechtenstein","Lituanie","Luxembourg",
  "Macédoine du Nord","Madagascar","Malaisie","Malawi","Maldives","Mali","Malte","Maroc","Marshall","Maurice","Mauritanie","Mexique","Micronésie","Moldavie","Monaco","Mongolie","Monténégro","Mozambique",
  "Namibie","Nauru","Népal","Nicaragua","Niger","Nigeria","Norvège","Nouvelle-Zélande",
  "Oman","Ouganda","Ouzbékistan",
  "Pakistan","Palaos","Palestine","Panama","Papouasie-Nouvelle-Guinée","Paraguay","Pays-Bas","Pérou","Philippines","Pologne","Portugal",
  "Qatar",
  "République centrafricaine","République démocratique du Congo","République dominicaine","République tchèque","Roumanie","Royaume-Uni","Russie","Rwanda",
  "Saint-Kitts-et-Nevis","Saint-Marin","Saint-Vincent-et-les-Grenadines","Sainte-Lucie","Salomon","Salvador","Samoa","São Tomé-et-Príncipe","Sénégal","Serbie","Seychelles","Sierra Leone","Singapour","Slovaquie","Slovénie","Somalie","Soudan","Soudan du Sud","Sri Lanka","Suède","Suisse","Suriname","Syrie",
  "Tadjikistan","Tanzanie","Tchad","Thaïlande","Timor oriental","Togo","Tonga","Trinité-et-Tobago","Tunisie","Turkménistan","Turquie","Tuvalu",
  "Ukraine","Uruguay",
  "Vanuatu","Vatican","Venezuela","Viêt Nam",
  "Yémen",
  "Zambie","Zimbabwe"
];

window.gekasInitCountrySelect = function (inputOrSelect, opts = {}) {
  const preferred = opts.preferred || "République démocratique du Congo";
  const host = document.createElement("div");
  host.className = "gp-country";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "gp-country-input";
  input.placeholder = opts.placeholder || "Rechercher un pays…";
  input.autocomplete = "off";
  input.setAttribute("aria-autocomplete", "list");
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

  function renderList(q) {
    const query = (q || "").trim().toLowerCase();
    const items = window.GEKAS_COUNTRIES_FR.filter((c) => !query || c.toLowerCase().includes(query)).slice(0, 12);
    list.innerHTML = items
      .map((c) => `<li role="option" data-value="${c.replace(/"/g, "&quot;")}">${c}</li>`)
      .join("");
    list.hidden = items.length === 0;
  }

  function pick(value) {
    input.value = value;
    hidden.value = value;
    list.hidden = true;
  }

  if (preferred) pick(preferred);

  input.addEventListener("focus", () => renderList(input.value));
  input.addEventListener("input", () => {
    hidden.value = "";
    renderList(input.value);
  });
  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    e.preventDefault();
    pick(li.getAttribute("data-value"));
  });
  input.addEventListener("blur", () => {
    setTimeout(() => {
      list.hidden = true;
      if (!hidden.value && input.value) {
        const exact = window.GEKAS_COUNTRIES_FR.find(
          (c) => c.toLowerCase() === input.value.trim().toLowerCase()
        );
        if (exact) pick(exact);
      }
    }, 150);
  });

  return {
    getValue: () => hidden.value,
    el: host,
    validate: () => Boolean(hidden.value),
  };
};
