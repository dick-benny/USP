window.PlanningSpec = (function () {
  const APP_CONFIG = {
    storage: { engine: "localStorage", namespace: "planning_usp", version: 5, dataKey: "planning_usp_data_v5" },
    fieldTypes: {
      text: { defaultValue: "", defaultAlign: "left", defaultDisplayMode: "text", defaultEditorMode: "inline" },
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
      dropdown_todo_kategori: { options: ["Allmänt", "Info", "Kontor", "ShopifyB2B", "Shopify B2C", "Sälj/Marknad", "Logistik", "System utv"], filterEnabled: true, filterOptions: ["Alla", "Allmänt", "Info", "Kontor", "ShopifyB2B", "Shopify B2C", "Sälj/Marknad", "Logistik", "System utv"] },
      dropdown_action_std: { options: ["Action", "Done", "Ta bort"], filterEnabled: false, actions: { "Action": { effect: "none" }, "Done": { effect: "mark_done" }, "Ta bort": { effect: "delete_row" } } },
      dropdown_action_tabort: { options: ["Action", "Ta bort"], filterEnabled: false, actions: { "Action": { effect: "none" }, "Ta bort": { effect: "delete_row" } } }
    },
    tables: {
      "PRE DEV": { id: "pre_dev", dbTable: "pre_dev", title: "PRE DEV", columns: [
        { name: "Utv idé", field: "utv_ide", type: "text", key: true, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_pre_dev_kategori", width: "14ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Design-Po", field: "design_po", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Sample test", field: "sample_test", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Utvärdering", field: "utvardering", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Action", field: "_action", type: "dropdown_action_std", mods: { align: "center", displayMode: "select", readonly: false } }
      ]},
      "UTVECKLING": { id: "utveckling", dbTable: "utveckling", title: "UTVECKLING", columns: [
        { name: "Produktidé", field: "produktide", type: "text", key: true, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_dev_kategori", width: "14ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Syfte", field: "syfte", type: "dropdown_dev_syfte", width: "14ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Design-Po", field: "design_po", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Sample test", field: "sample_test", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Stort sample", field: "stort_sample", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Q-test", field: "q_test", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Prissättning", field: "prissattning", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Action", field: "_action", type: "dropdown_action_std", mods: { align: "center", displayMode: "select", readonly: false } }
      ]},
      "SÄLJINTRO": { id: "saljintro", dbTable: "saljintro", title: "SÄLJINTRO", columns: [
        { name: "Produkt", field: "produkt", type: "text", key: true, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_product_kategori", width: "17ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Koll. Q", field: "koll_q", type: "kvartal", width: "8ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "--" },
        { name: "PO beslut", field: "po_beslut", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Media", field: "media", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "B2B-ready", field: "b2b_ready", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Shopify-ready", field: "shopify_ready", type: "text", mods: { align: "left", displayMode: "text", readonly: false }, default: "Redo?" },
        { name: "B2B-intro", field: "b2b_intro", type: "veckonummer", width: "10ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "--" },
        { name: "Drop", field: "drop_vecka", type: "veckonummer", width: "10ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "--" },
        { name: "Action", field: "_action", type: "dropdown_action_std", mods: { align: "center", displayMode: "select", readonly: false } }
      ]},
      "PROJEKT": { id: "projekt", dbTable: "projekt", title: "PROJEKT", columns: [
        { name: "Projektnamn", field: "projektnamn", type: "text", key: true, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_project_kategori", width: "17ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Start", field: "start_datum", type: "date", width: "15ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false } },
        { name: "Aktuell", field: "aktuell", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Nästa", field: "nasta", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kommande", field: "kommande", type: "text", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Slut", field: "slut_datum", type: "date", width: "15ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false } },
        { name: "Action", field: "_action", type: "dropdown_action_std", mods: { align: "center", displayMode: "select", readonly: false } }
      ]},
      "TODO": { id: "todo", dbTable: "todo", title: "TODO", columns: [
        { name: "Kategori", field: "kategori", type: "dropdown_todo_kategori", width: "17ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Beskrivning", field: "beskrivning", type: "text", key: true, width: "100%", mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Klart", field: "klart_datum", type: "date", width: "15ch", mods: { overdue: true, align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "-- -- -- " },
        { name: "Action", field: "_action", type: "dropdown_action_tabort", mods: { align: "center", displayMode: "select", readonly: false } }
      ]},
      "RUTINER": { id: "rutiner", dbTable: "rutiner", title: "RUTINER", columns: [
        { name: "Rutin", field: "rutin", type: "text", key: true, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Dokument", field: "document", type: "pdf", width: "14ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "---" },
        { name: "Action", field: "_action", type: "dropdown_action_tabort", mods: { align: "center", displayMode: "select", readonly: false } }
      ]}
    }
  };

  const SAMPLE_ROWS = {
    "PRE DEV": [{ utv_ide: "", kategori: "färg", design_po: "", sample_test: "", utvardering: "", _action: "Action", is_done: false }],
    "UTVECKLING": [{ produktide: "", kategori: "matta", syfte: "kund", design_po: "", sample_test: "", stort_sample: "", q_test: "", prissattning: "", _action: "Action", is_done: false }],
    "SÄLJINTRO": [{ produkt: "", kategori: "matta", koll_q: "--", po_beslut: "", media: "", b2b_ready: "", shopify_ready: "Redo?", b2b_intro: "--", drop_vecka: "--", _action: "Action", is_done: false }],
    "PROJEKT": [{ projektnamn: "", kategori: "volymprojekt", start_datum: "", aktuell: "", nasta: "", kommande: "", slut_datum: "", _action: "Action", is_done: false }],
    "TODO": [{ kategori: "Allmänt", beskrivning: "", klart_datum: "-- -- -- ", _action: "Action", is_done: false }],
    "RUTINER": [{ rutin: "", document: "---", _action: "Action", is_done: false }]
  };

  return { APP_CONFIG: APP_CONFIG, SAMPLE_ROWS: SAMPLE_ROWS };
})();
