window.PlanningSpec = (function () {
  const STATUS_WIDTH = "18ch";
  const PRIMARY_TITLE_WIDTH = "28ch";

  function buildRollingQuarterOptions() {
    const currentYear = new Date().getFullYear();
    const options = ["--"];
    for (let yearOffset = 0; yearOffset <= 2; yearOffset += 1) {
      const shortYear = String(currentYear + yearOffset).slice(-2);
      for (let quarter = 1; quarter <= 4; quarter += 1) {
        options.push(`${shortYear}-Q${quarter}`);
      }
    }
    return options;
  }

  const APP_CONFIG = {
    storage: { engine: "localStorage", namespace: "planning_usp", version: 12, dataKey: "planning_usp_data_v12" },
    fieldTypes: {
      text: { defaultValue: "", defaultAlign: "left", defaultDisplayMode: "text", defaultEditorMode: "inline" },
      status: { defaultValue: "gray", defaultAlign: "center", defaultDisplayMode: "button", defaultEditorMode: "click_to_toggle" },
      date: { defaultValue: "", defaultAlign: "center", defaultDisplayMode: "button", defaultEditorMode: "click_to_edit" },
      veckonummer: { defaultValue: "--", defaultAlign: "center", defaultDisplayMode: "button", defaultEditorMode: "click_to_edit" },
      kvartal: { defaultValue: "--", defaultAlign: "center", defaultDisplayMode: "button", defaultEditorMode: "click_to_edit" },
      pdf: { defaultValue: null, defaultAlign: "center", defaultDisplayMode: "button", defaultEditorMode: "button_only" },
      excel: { defaultValue: null, defaultAlign: "center", defaultDisplayMode: "button", defaultEditorMode: "button_only" }
    },
    dropdowns: {
      dropdown_dig_prod_kategori: { options: ["B2B-intro", "B2C-intro"], filterEnabled: true, filterOptions: ["B2B-intro", "B2C-intro"] },
      dropdown_product_kategori: { options: ["matta", "colonnade", "tapestry", "SoftAss", "packaging"], filterEnabled: true, filterOptions: ["Alla", "matta", "colonnade", "tapestry", "SoftAss", "packaging"] },
      dropdown_dev_kategori: { options: ["matta", "colonnade", "tapestry", "softAss", "packaging"], filterEnabled: true, filterOptions: ["Alla", "matta", "colonnade", "tapestry", "softAss", "packaging"] },
      dropdown_dev_syfte: { options: ["Anisa", "Dream Home", "Iera Living", "Khanna", "Texti Alpacca"], filterEnabled: true, filterOptions: ["Alla", "Anisa", "Dream Home", "Iera Living", "Khanna", "Texti Alpacca"] },
      dropdown_design_collection: { options: ["26-FALL", "27-spring", "27-fall", "28-spring", "28-fall"], filterEnabled: true, filterOptions: ["All", "26-FALL", "27-spring", "27-fall", "28-spring", "28-fall"] },
      dropdown_cdmp_typ: { options: ["High End", "Standard", "Kontor"], filterEnabled: true, filterOptions: ["All", "High End", "Standard", "Kontor"] },
      dropdown_pre_dev_kategori: { options: ["Anisa", "Dream Home", "Iera Living", "Khanna", "Texti Alpacca"], filterEnabled: true, filterOptions: ["Alla", "Anisa", "Dream Home", "Iera Living", "Khanna", "Texti Alpacca"] },
      dropdown_todo_kategori: { options: ["Privat", "Todo Planning", "Info", "Shopify", "Butler", "Marknad"], filterEnabled: true, filterOptions: ["Alla", "Privat", "Todo Planning", "Info", "Shopify", "Butler", "Marknad"] },
      dropdown_saljintro_kvartal: { options: buildRollingQuarterOptions(), filterEnabled: false },
      dropdown_saljintro_vecka: { options: ["--", "v01", "v02", "v03", "v04", "v05", "v06", "v07", "v08", "v09", "v10", "v11", "v12", "v13", "v14", "v15", "v16", "v17", "v18", "v19", "v20", "v21", "v22", "v23", "v24", "v25", "v26", "v27", "v28", "v29", "v30", "v31", "v32", "v33", "v34", "v35", "v36", "v37", "v38", "v39", "v40", "v41", "v42", "v43", "v44", "v45", "v46", "v47", "v48", "v49", "v50", "v51", "v52", "v53"], filterEnabled: false }
    },
    rowTodoConfig: {
    },
    tables: {
      "PRE DEV": { id: "pre_dev", dbTable: "pre_dev", title: "PRE Design", columns: [
        { name: "Utv idé", field: "utv_ide", type: "text", key: true, width: PRIMARY_TITLE_WIDTH, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Supplier", field: "kategori", type: "dropdown_pre_dev_kategori", width: "16ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Beskrivning", field: "beskrivning", type: "text", width: "34ch", mods: { align: "left", displayMode: "textarea", readonly: false } },
        { name: "Sample", field: "sample_test", type: "status", width: STATUS_WIDTH, renderFromField: "sample_test_slut_datum", dateDisplayMode: "week", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false } },
        { name: "Sample datum", field: "sample_test_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" },
        { name: "Sample slut", field: "sample_test_slut_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" }
      ]},
      "UTVECKLING": { id: "utveckling", dbTable: "utveckling", title: "Design", columns: [
        { name: "Namn", field: "produktide", type: "text", key: true, width: PRIMARY_TITLE_WIDTH, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_dev_kategori", width: "14ch", hiddenInTable: true, mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Supplier", field: "syfte", type: "dropdown_dev_syfte", width: "16ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Beskrivning", field: "beskrivning", type: "text", width: "34ch", mods: { align: "left", displayMode: "textarea", readonly: false } },
        { name: "Collection", field: "collection", type: "dropdown_design_collection", width: "13ch", mods: { align: "left", displayMode: "select", readonly: false }, default: "27-spring" },
        { name: "Prissättning", field: "prissattning", type: "status", width: STATUS_WIDTH, statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false } },
        { name: "Sample datum", field: "sample_test_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" },
        { name: "Sample slut", field: "sample_test_slut_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" },
        { name: "Fullsize", field: "stort_sample", type: "status", width: STATUS_WIDTH, renderFromField: "stort_sample_slut_datum", dateDisplayMode: "week", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false } },
        { name: "Fullsize slut", field: "stort_sample_slut_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" },
        { name: "Q-test", field: "q_test", type: "status", width: STATUS_WIDTH, statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false } }
      ]},
      "SÄLJINTRO": { id: "saljintro", dbTable: "saljintro", title: "SÄLJINTRO", columns: [
        { name: "Produkt", field: "produkt", type: "text", key: true, width: PRIMARY_TITLE_WIDTH, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Beskrivning/Status", field: "beskrivning_status", type: "text", width: "32ch", multiline: true, mods: { align: "left", displayMode: "textarea", readonly: false } },
        { name: "Kategori", field: "kategori", type: "dropdown_product_kategori", width: "17ch", hiddenInTable: true, mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Koll. Q", field: "koll_q", type: "dropdown_saljintro_kvartal", width: "10ch", mods: { align: "center", displayMode: "select", readonly: false }, default: "--" },
        { name: "Sample lev", field: "po_beslut", type: "status", width: STATUS_WIDTH, renderFromField: "po_beslut_slut_datum", dateDisplayMode: "week", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false } },
        { name: "PO Sample slut", field: "po_beslut_slut_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" },
        { name: "PO datum", field: "po_beslut_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" },
        { name: "B2B-intro", field: "b2b_ready", type: "status", width: STATUS_WIDTH, renderFromField: "po_beslut_slut_datum", dateDisplayMode: "weekReadonly", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "Lager Lev", field: "po_lager", type: "status", width: STATUS_WIDTH, renderFromField: "po_lager_slut_datum", dateDisplayMode: "week", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "PO Lager datum", field: "po_lager_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" },
        { name: "PO Lager slut", field: "po_lager_slut_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" },
        { name: "B2C-intro", field: "shopify_ready", type: "status", width: STATUS_WIDTH, renderFromField: "po_lager_slut_datum", dateDisplayMode: "weekReadonly", statusLabel: " ", hideStatusLabel: true, lockManualStatus: true, mods: { align: "center", readonly: true }, default: "gray" },
        { name: "B2C-ready datum", field: "shopify_ready_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: true }, default: "" },
        { name: "B2C-ready slut", field: "shopify_ready_slut_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: true }, default: "" }
      ]},

      "DIG PROD": { id: "dig_prod", dbTable: "dig_prod", title: "DIG PROD", columns: [
        { name: "PRODUKTNAMN", field: "produktnamn", type: "text", key: true, sortable: true, width: "32ch", digprodCategories: ["B2B-intro", "B2C-intro"], mods: { align: "left", displayMode: "text", readonly: true } },
        { name: "Kategori", field: "kategori", type: "dropdown_dig_prod_kategori", width: "17ch", hiddenInTable: true, defaultFilter: "B2B-intro", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "TIDPLAN", field: "tidplan", type: "digprod_plan", width: "11ch", digprodCategories: ["B2B-intro", "B2C-intro"], mods: { align: "center", displayMode: "button", readonly: false } },
        { name: "SPEC PRODUKT", field: "spec_produkt", type: "status", width: "13ch", digprodCategories: ["B2B-intro"], statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "SPEC VARIANT", field: "spec_variant", type: "status", width: "13ch", digprodCategories: ["B2B-intro"], statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "PDP COPY", field: "text_copy", type: "status", width: "12ch", digprodCategories: ["B2B-intro"], statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "BRANDBOOK", field: "copy_to_b2c", type: "status", width: "13ch", digprodCategories: ["B2B-intro"], statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "PACKSHOT", field: "packshot", type: "status", width: "11ch", digprodCategories: ["B2C-intro"], statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
                { name: "KAMPANJ", field: "kampanj", type: "status", width: "11ch", digprodCategories: ["B2C-intro"], statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "MEDIA/PRESS", field: "media", type: "status", width: "13ch", digprodCategories: ["B2C-intro"], statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
                { name: "UTSKICK", field: "utskick", type: "status", width: "10ch", digprodCategories: ["B2B-intro", "B2C-intro"], statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "KOMMENTAR", field: "kommentar", type: "text", width: "34ch", multiline: true, digprodCategories: ["B2B-intro", "B2C-intro"], mods: { align: "left", displayMode: "textarea", readonly: false }, default: "" },
        { name: "Klart", field: "klart", type: "status", width: "9ch", hiddenInTable: true, statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "Klart datum", field: "klart_datum", type: "date", width: "15ch", hiddenInTable: true, mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: true }, default: "" }
      ]},
      "PROJEKT": {
        id: "projekt",
        dbTable: "planning_projects",
        title: "PROJEKT",
        customView: "projects",
        activityDbTable: "planning_project_activities",
        categories: ["CDM Projects", "Butler", "Shopify", "Admin", "ToDo Planning", "Marknad", "Sälj"],
        columns: []
      },
      "CDMP": { id: "cdmp", dbTable: "cdmp", title: "Cappelen Dimyr Projects", navTitle: "CDMP", columns: [
        { name: "Namn", field: "namn", type: "text", key: true, width: PRIMARY_TITLE_WIDTH, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Beskrivning", field: "beskrivning", type: "text", width: "34ch", multiline: true, mods: { align: "left", displayMode: "textarea", readonly: false } },
        { name: "Typ", field: "typ", type: "dropdown_cdmp_typ", width: "14ch", mods: { align: "left", displayMode: "select", readonly: false }, default: "High End" },
        { name: "Offert", field: "offert", type: "text", width: "10ch", mods: { align: "center", displayMode: "excel_link", readonly: false } },
        { name: "Provmattor", field: "provmattor", type: "text", width: "10ch", mods: { align: "center", displayMode: "provmattor_table", readonly: false } },
        { name: "Prel Beslut", field: "prel_beslut_datum", type: "date", width: "15ch", dateDisplayMode: "week", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" },
        { name: "Prel LEV", field: "prel_lev_datum", type: "date", width: "15ch", dateDisplayMode: "week", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" }
      ]},

      "INKÖP": { id: "inkop", dbTable: "inkop", title: "INKÖP", columns: [
        { name: "Status", field: "status", type: "status", width: "9ch", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "Beskrivning", field: "beskrivning", type: "text", key: true, width: "42ch", multiline: true, mods: { align: "left", displayMode: "textarea", readonly: false } },
        { name: "Klart", field: "klart_datum", type: "date", width: "15ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" }
      ]},
      "SÄLJ": { id: "salj", dbTable: "salj", title: "SÄLJ", columns: [
        { name: "Status", field: "status", type: "status", width: "9ch", statusLabel: " ", hideStatusLabel: true, mods: { align: "center", readonly: false }, default: "gray" },
        { name: "Beskrivning", field: "beskrivning", type: "text", key: true, width: "42ch", multiline: true, mods: { align: "left", displayMode: "textarea", readonly: false } },
        { name: "Klart", field: "klart_datum", type: "date", width: "15ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "" }
      ]},
      "STATISTICS": {
        id: "statistics",
        title: "FSG",
        customView: "statistics",
        columns: []
      },
      "TODO": { id: "todo", dbTable: "todo", title: "TODO", columns: [
        { name: "Kategori", field: "kategori", type: "dropdown_todo_kategori", width: "17ch", mods: { align: "left", displayMode: "select", readonly: false } },
        { name: "Beskrivning", field: "beskrivning", type: "text", key: true, width: "42ch", multiline: true, mods: { align: "left", displayMode: "textarea", readonly: false } },
        { name: "Klart", field: "klart_datum", type: "date", width: "15ch", mods: { overdue: true, align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "-- -- -- " }
      ]},
      "RUTINER": { id: "rutiner", dbTable: "rutiner", title: "RUTINER", columns: [
        { name: "Rutin", field: "rutin", type: "text", key: true, mods: { align: "left", displayMode: "text", readonly: false } },
        { name: "Dokument", field: "document", type: "pdf", width: "14ch", mods: { align: "center", editorMode: "click_to_edit", displayMode: "button", readonly: false }, default: "---" }
      ]}
    }
  };

  const SAMPLE_ROWS = {
    "PRE DEV": [{ utv_ide: "", kategori: "Anisa", beskrivning: "", sample_test: "gray", sample_test_datum: "", sample_test_slut_datum: "", utvardering: "", is_done: false }],
    "UTVECKLING": [{ produktide: "", kategori: "matta", syfte: "Anisa", beskrivning: "", collection: "27-spring", sample_test: "gray", sample_test_datum: "", sample_test_slut_datum: "", stort_sample: "gray", stort_sample_slut_datum: "", q_test: "gray", prissattning: "gray", is_done: false }],
    "SÄLJINTRO": [{ produkt: "", beskrivning_status: "", kategori: "matta", koll_q: "--", po_beslut: "gray", po_beslut_datum: "", po_beslut_slut_datum: "", po_lager: "gray", po_lager_datum: "", po_lager_slut_datum: "", b2b_ready: "gray", b2b_ready_datum: "", b2b_ready_slut_datum: "", shopify_ready: "gray", shopify_ready_datum: "", shopify_ready_slut_datum: "", b2b_intro: "--", is_done: false }],
    "DIG PROD": [{ produktnamn: "", kategori: "B2B-intro", kommentar: "", spec_produkt: "gray", spec_variant: "gray", text_copy: "gray", bild: "gray", copy_to_b2c: "gray", packshot: "gray", miljo: "gray", kampanj: "gray", media: "gray", update_b2b: "gray", utskick: "gray", is_done: false }],
    "CDMP": [{ namn: "", beskrivning: "", typ: "High End", offert: "", provmattor: "", prel_beslut_datum: "", prel_lev_datum: "", is_done: false }],
    "INKÖP": [{ status: "gray", beskrivning: "", klart_datum: "", is_done: false }],
    "SÄLJ": [{ status: "gray", beskrivning: "", klart_datum: "", is_done: false }],
    "STATISTICS": [],
    "TODO": [{ kategori: "Privat", beskrivning: "", klart_datum: "-- -- -- ", is_done: false }],
    "RUTINER": [{ rutin: "", document: "---", is_done: false }]
  };

  return { APP_CONFIG: APP_CONFIG, SAMPLE_ROWS: SAMPLE_ROWS };
})();
