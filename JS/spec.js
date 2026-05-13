window.PlanningSpec = (function () {
  const STATUS_WIDTH = "18ch";
  const PRIMARY_TITLE_WIDTH = "28ch";

  /*
   * SPEC EXTENSIONS
   * hiddenInTable: true
   *   Field is hidden in the table but still visible in NyRad/Öppna.
   *
   * renderFromField: "<field>"
   *   Status button renders another field value, usually a date, instead of label text.
   *
   * hideStatusLabel: true
   *   Status button shows only the dot unless renderFromField has a value.
   *
   * lockManualStatus: true
   *   Prevents manual status toggling in table/detail. Used when status is set by automation.
   *
   * autoStatusField / autoStatusValue
   *   When a date/value is manually set, another status field can be updated automatically.
   */

  const APP_CONFIG = {
    storage: { engine: "localStorage", namespace: "planning_usp", version: 12, dataKey: "planning_usp_data_v12" },
    fieldTypes: {
      text: { defaultValue: "", defaultAlign: "left", defaultDisplayMode: "text", defaultEditorMode: "inline" },
      status: { defaultValue: "gray", defaultAlign: "center", defaultDisplayMode: "button", defaultEditorMode: "click_to_toggle" },
      date: { defaultValue: "", defaultAlign: "center", defaultDisplayMode: "button", defaultEditorMode: "click_to_edit" },
      veckonummer: { defaultValue: "--", defaultAlign: "center", defaultDisplayMode: "button", defaultEditorMode: "click_to_edit" },
      kvartal: { defaultValue: "--", defaultAlign: "center", defaultDisplayMode: "button", defaultEditorMode: "click_to_edit" },
      pdf: { defaultValue: null, defaultAlign: "center", defaultDisplayMode: "button", defaultEditorMode: "button_only" }
    },
    dropdowns: {
      dropdown_dig_prod_kategori: { options: ["B2B-ready", "Shopify-ready"], filterEnabled: true, filterOptions: ["Alla", "B2B-ready", "Shopify-ready"] },
      dropdown_product_kategori: { options: ["matta", "colonnade", "tapestry", "SoftAss", "packaging"], filterEnabled: true, filterOptions: ["Alla", "matta", "colonnade", "tapestry", "SoftAss", "packaging"] },
      dropdown_dev_kategori: { options: ["matta", "colonnade", "tapestry", "softAss", "packaging"], filterEnabled: true, filterOptions: ["Alla", "matta", "colonnade", "tapestry", "softAss", "packaging"] },
      dropdown_dev_syfte: { options: ["kund", "samarbete", "produkt"], filterEnabled: true, filterOptions: ["Alla", "kund", "samarbete", "produkt"] },
      dropdown_pre_dev_kategori: { options: ["färg", "kvalitet", "garn"], filterEnabled: true, filterOptions: ["Alla", "färg", "kvalitet", "garn"] },
      dropdown_todo_kategori: { options: ["Privat", "Info", "Shopify", "Butler"], filterEnabled: true, filterOptions: ["Alla", "Privat", "Info", "Shopify", "Butler"] }
    },
    rowTodoConfig: {
      "PRE DEV": {
        categories: ["Alla", "Design-PO", "Sample test", "Utvärdering"]
      },
      "UTVECKLING": {
        categories: ["Alla", "Design-PO", "Sample test", "Stort sample", "Q-test", "Prissättning"]
      },
      "SÄLJINTRO": {
        categories: ["Alla", "Koll. Q", "PO beslut", "B2B-ready", "Shopify-ready", "B2B-intro", "Drop"]
      }
    },
    tables: {
      // --- Product flow tables ---
      "PRE DEV": { id: "pre_dev", dbTable: "pre_dev", title: "PRE DEV", columns: [
        { name: "Utv idé", field: "utv_ide", type: "text", key: true, width: PRIMARY_TITLE_WIDTH, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_pre_dev_kategori", width: "14ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Design", field: "design_po", type: "status", width: STATUS_WIDTH, statusLabel: "Skickad?", mods: { align: "center", readonly: false } },
        { name: "Design sample", field: "sample_test", type: "status", width: STATUS_WIDTH, statusLabel: "Klar?", mods: { align: "center", readonly: false } },
        { name: "Utvärdering", field: "utvardering", type: "status", width: STATUS_WIDTH, statusLabel: "Omdöme?", mods: { align: "center", readonly: false } }
      ]},
      "UTVECKLING": { id: "utveckling", dbTable: "utveckling", title: "UTVECKLING", columns: [
        { name: "Namn", field: "produktide", type: "text", key: true, width: PRIMARY_TITLE_WIDTH, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_dev_kategori", width: "14ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Syfte", field: "syfte", type: "dropdown_dev_syfte", width: "14ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Design", field: "design_po", type: "status", width: STATUS_WIDTH, statusLabel: "Skickad?", mods: { align: "center", readonly: false } },
        { name: "Design Sample", field: "sample_test", type: "status", width: STATUS_WIDTH, statusLabel: "Klar?", mods: { align: "center", readonly: false } },
        { name: "Fullsize", field: "stort_sample", type: "status", width: STATUS_WIDTH, statusLabel: "PO skickad?", mods: { align: "center", readonly: false } },
        { name: "Q-test", field: "q_test", type: "status", width: STATUS_WIDTH, statusLabel: "Godkänd?", mods: { align: "center", readonly: false } },
        { name: "Prissättning", field: "prissattning", type: "status", width: STATUS_WIDTH, statusLabel: "Beslutat?", mods: { align: "center", readonly: false } }
      ]},
      "SÄLJINTRO": { id: "saljintro", dbTable: "saljintro", title: "SÄLJINTRO", columns: [
        { name: "Produkt", field: "produkt", type: "text", key: true, width: PRIMARY_TITLE_WIDTH, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_product_kategori", width: "17ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Koll. Q", field: "koll_q", type: "kvartal", width: "8ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "--" },
        { name: "PO beslut", field: "po_beslut", type: "status", width: STATUS_WIDTH, renderFromField: "po_beslut_datum", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false } },
        { name: "PO datum", field: "po_beslut_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" },
       
        { name: "B2B-ready", field: "b2b_ready", type: "status", width: STATUS_WIDTH, renderFromField: "b2b_ready_datum", statusLabel: " ", hideStatusLabel: true, lockManualStatus: true, mods: { align: "center", readonly: false } },
        { name: "B2B-ready datum", field: "b2b_ready_datum", type: "date", width: "15ch", hiddenInTable: true, autoStatusField: "b2b_ready", autoStatusValue: "yellow", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" },
        { name: "B2B-intro", field: "b2b_intro", type: "veckonummer", width: "10ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "--" },
        { name: "Shopify-ready", field: "shopify_ready", type: "status", width: STATUS_WIDTH, renderFromField: "shopify_ready_datum", statusLabel: " ", hideStatusLabel: true, lockManualStatus: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "Shopify-ready datum", field: "shopify_ready_datum", type: "date", width: "15ch", hiddenInTable: true, autoStatusField: "shopify_ready", autoStatusValue: "yellow", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" },
        { name: "Drop", field: "drop_vecka", type: "veckonummer", width: "10ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "--" }
      ]},

      "DIG PROD": { id: "dig_prod", dbTable: "dig_prod", title: "DIG PROD", columns: [
        { name: "Produktnamn", field: "produktnamn", type: "text", key: true, width: "32ch", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_dig_prod_kategori", width: "17ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "P-info", field: "p_info", type: "status", width: "9ch", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "Metafält", field: "metafalt", type: "status", width: "9ch", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "Copy", field: "copy", type: "status", width: "9ch", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "Packshot", field: "packshot", type: "status", width: "9ch", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" }
      ]},
      // --- Worklist tables ---
      "INKÖP": { id: "inkop", dbTable: "inkop", title: "INKÖP", columns: [
        { name: "Status", field: "status", type: "status", width: "9ch", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "Beskrivning", field: "beskrivning", type: "text", key: true, width: "100%", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Klart", field: "klart_datum", type: "date", width: "15ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" }
      ]},
      "MARKNAD": { id: "marknad", dbTable: "marknad", title: "MARKNAD", columns: [
        { name: "Status", field: "status", type: "status", width: "9ch", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "Beskrivning", field: "beskrivning", type: "text", key: true, width: "100%", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Klart", field: "klart_datum", type: "date", width: "15ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" }
      ]},
      "SÄLJ": { id: "salj", dbTable: "salj", title: "SÄLJ", columns: [
        { name: "Status", field: "status", type: "status", width: "9ch", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "Beskrivning", field: "beskrivning", type: "text", key: true, width: "100%", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Klart", field: "klart_datum", type: "date", width: "15ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" }
      ]},
      // --- Utility tables ---
      "TODO": { id: "todo", dbTable: "todo", title: "TODO", columns: [
        { name: "Kategori", field: "kategori", type: "dropdown_todo_kategori", width: "17ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Beskrivning", field: "beskrivning", type: "text", key: true, width: "100%", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Klart", field: "klart_datum", type: "date", width: "15ch", mods: { overdue: true, align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "-- -- -- " }
      ]},
      "RUTINER": { id: "rutiner", dbTable: "rutiner", title: "RUTINER", columns: [
        { name: "Rutin", field: "rutin", type: "text", key: true, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Dokument", field: "document", type: "pdf", width: "14ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "---" }
      ]}
    }
  };

  const SAMPLE_ROWS = {
    "PRE DEV": [{ utv_ide: "", kategori: "färg", design_po: "gray", sample_test: "gray", utvardering: "gray", is_done: false }],
    "UTVECKLING": [{ produktide: "", kategori: "matta", syfte: "kund", design_po: "gray", sample_test: "gray", stort_sample: "gray", q_test: "gray", prissattning: "gray", is_done: false }],
    "SÄLJINTRO": [{ produkt: "", kategori: "matta", koll_q: "--", po_beslut: "gray", po_beslut_datum: "", b2b_ready: "gray", b2b_ready_datum: "", shopify_ready: "gray", shopify_ready_datum: "", b2b_intro: "--", drop_vecka: "--", is_done: false }],
    "DIG PROD": [{ produktnamn: "", kategori: "B2B-ready", p_info: "gray", metafalt: "gray", copy: "gray", packshot: "gray", is_done: false }],
    "INKÖP": [{ status: "gray", beskrivning: "", klart_datum: "", is_done: false }],
    "MARKNAD": [{ status: "gray", beskrivning: "", klart_datum: "", is_done: false }],
    "SÄLJ": [{ status: "gray", beskrivning: "", klart_datum: "", is_done: false }],
    "TODO": [{ kategori: "Allmänt", beskrivning: "", klart_datum: "-- -- -- ", is_done: false }],
    "RUTINER": [{ rutin: "", document: "---", is_done: false }]
  };

  return { APP_CONFIG: APP_CONFIG, SAMPLE_ROWS: SAMPLE_ROWS };
})();