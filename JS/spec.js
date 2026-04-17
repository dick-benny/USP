window.PlanningSpec = (function () {
  const STATUS_WIDTH = "18ch";
  const PRIMARY_TITLE_WIDTH = "28ch";

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
      dropdown_product_kategori: { options: ["matta", "colonnade", "tapestry", "SoftAss", "packaging"], filterEnabled: true, filterOptions: ["Alla", "matta", "colonnade", "tapestry", "SoftAss", "packaging"] },
      dropdown_project_kategori: { options: ["volymprojekt", "Shopifyprojekt", "samarbetsprojekt", "kundprojekt"], filterEnabled: true, filterOptions: ["Alla", "volymprojekt", "Shopifyprojekt", "samarbetsprojekt", "kundprojekt"] },
      dropdown_dev_kategori: { options: ["matta", "colonnade", "tapestry", "softAss", "packaging"], filterEnabled: true, filterOptions: ["Alla", "matta", "colonnade", "tapestry", "softAss", "packaging"] },
      dropdown_dev_syfte: { options: ["kund", "samarbete", "produkt"], filterEnabled: true, filterOptions: ["Alla", "kund", "samarbete", "produkt"] },
      dropdown_pre_dev_kategori: { options: ["färg", "kvalitet", "garn"], filterEnabled: true, filterOptions: ["Alla", "färg", "kvalitet", "garn"] },
      dropdown_todo_kategori: { options: ["Allmänt", "Info", "Kontor", "ShopifyB2B", "Shopify B2C", "Sälj/Marknad", "Logistik", "System utv"], filterEnabled: true, filterOptions: ["Alla", "Allmänt", "Info", "Kontor", "ShopifyB2B", "Shopify B2C", "Sälj/Marknad", "Logistik", "System utv"] }
    },
    tables: {
      "PRE DEV": { id: "pre_dev", dbTable: "pre_dev", title: "PRE DEV", columns: [
        { name: "Utv idé", field: "utv_ide", type: "text", key: true, width: PRIMARY_TITLE_WIDTH, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_pre_dev_kategori", width: "14ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Design-PO", field: "design_po", type: "status", width: STATUS_WIDTH, statusLabel: "Skickad?", mods: { align: "center", readonly: false } },
        { name: "Sample test", field: "sample_test", type: "status", width: STATUS_WIDTH, statusLabel: "Klar?", mods: { align: "center", readonly: false } },
        { name: "Utvärdering", field: "utvardering", type: "status", width: STATUS_WIDTH, statusLabel: "Omdöme?", mods: { align: "center", readonly: false } }
      ]},
      "UTVECKLING": { id: "utveckling", dbTable: "utveckling", title: "UTVECKLING", columns: [
        { name: "Produktidé", field: "produktide", type: "text", key: true, width: PRIMARY_TITLE_WIDTH, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_dev_kategori", width: "14ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Syfte", field: "syfte", type: "dropdown_dev_syfte", width: "14ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Design-PO", field: "design_po", type: "status", width: STATUS_WIDTH, statusLabel: "Skickad?", mods: { align: "center", readonly: false } },
        { name: "Sample test", field: "sample_test", type: "status", width: STATUS_WIDTH, statusLabel: "Klar?", mods: { align: "center", readonly: false } },
        { name: "Stort sample", field: "stort_sample", type: "status", width: STATUS_WIDTH, statusLabel: "PO skickad?", mods: { align: "center", readonly: false } },
        { name: "Q-test", field: "q_test", type: "status", width: STATUS_WIDTH, statusLabel: "Godkänd?", mods: { align: "center", readonly: false } },
        { name: "Prissättning", field: "prissattning", type: "status", width: STATUS_WIDTH, statusLabel: "Beslutat?", mods: { align: "center", readonly: false } }
      ]},
      "SÄLJINTRO": { id: "saljintro", dbTable: "saljintro", title: "SÄLJINTRO", columns: [
        { name: "Produkt", field: "produkt", type: "text", key: true, width: PRIMARY_TITLE_WIDTH, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_product_kategori", width: "17ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Koll. Q", field: "koll_q", type: "kvartal", width: "8ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "--" },
        { name: "PO beslut", field: "po_beslut", type: "status", width: STATUS_WIDTH, statusLabel: "PO Skickad", mods: { align: "center", readonly: false } },
        { name: "Media", field: "media", type: "status", width: STATUS_WIDTH, statusLabel: "FOTO/AI klar", mods: { align: "center", readonly: false } },
        { name: "B2B-ready", field: "b2b_ready", type: "status", width: STATUS_WIDTH, statusLabel: "KLAR", mods: { align: "center", readonly: false } },
        { name: "Shopify-ready", field: "shopify_ready", type: "status", width: STATUS_WIDTH, statusLabel: "KLAR", mods: { align: "center", readonly: false }, default: "gray" },
        { name: "B2B-intro", field: "b2b_intro", type: "veckonummer", width: "10ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "--" },
        { name: "Drop", field: "drop_vecka", type: "veckonummer", width: "10ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "--" }
      ]},
      "PROJEKT": { id: "projekt", dbTable: "projekt", title: "PROJEKT", columns: [
        { name: "Projektnamn", field: "projektnamn", type: "text", key: true, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_project_kategori", width: "17ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Start", field: "start_datum", type: "date", width: "15ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false } },
        { name: "Aktuell", field: "aktuell", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Nästa", field: "nasta", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kommande", field: "kommande", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Slut", field: "slut_datum", type: "date", width: "15ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false } }
      ]},
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
    "SÄLJINTRO": [{ produkt: "", kategori: "matta", koll_q: "--", po_beslut: "gray", media: "gray", b2b_ready: "gray", shopify_ready: "gray", b2b_intro: "--", drop_vecka: "--", is_done: false }],
    "PROJEKT": [{ projektnamn: "", kategori: "volymprojekt", start_datum: "", aktuell: "", nasta: "", kommande: "", slut_datum: "", is_done: false }],
    "TODO": [{ kategori: "Allmänt", beskrivning: "", klart_datum: "-- -- -- ", is_done: false }],
    "RUTINER": [{ rutin: "", document: "---", is_done: false }]
  };

  return { APP_CONFIG: APP_CONFIG, SAMPLE_ROWS: SAMPLE_ROWS };
})();