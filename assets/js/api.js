
document.addEventListener("DOMContentLoaded", () => {
  // -------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const fmt = (n) =>
    Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const escapeHtml = (s = "") =>
    s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  // -------------------------------------------------------
  // STATE
  // -------------------------------------------------------
  let invoices = [];
  let draft = null;

  // -------------------------------------------------------
  // DOM references
  // -------------------------------------------------------
  const ui = {
    num: $("#invoiceNumber"),
    date: $("#issueDate"),
    name: $("#clientName"),
    email: $("#clientEmail"),
    taxPct: $("#taxPct"),
    lines: $("#linesBody"),

    subtotal: $("#subtotal"),
    taxAmt: $("#taxAmt"),
    total: $("#grandTotal"),

    newInv: $("#newInvoiceBtn"),
    save: $("#saveInvoice"),
    print: $("#printInvoice"),
    download: $("#downloadInvoice"),
    downloadAll: $("#downloadAll"),
    clearAll: $("#clearAll"),
    list: $("#invoicesList"),
    addLine: $("#addLine"),
  };

  // -------------------------------------------------------
  // LINE ITEMS
  // -------------------------------------------------------
  function addLineRow(data) {
    const tpl = $("#lineRowTpl");
    const frag = tpl.content.cloneNode(true);
    const row = $("tr", frag);

    $(".li-desc", row).value = data?.description || "";
    $(".li-qty", row).value = data?.qty || 1;
    $(".li-price", row).value = data?.price || 0;

    ui.lines.appendChild(row);
    bindLineEvents(row);
    recalcTotals();
  }

  function bindLineEvents(row) {
    const desc = $(".li-desc", row);
    const qty = $(".li-qty", row);
    const price = $(".li-price", row);
    const totalCell = $(".li-total", row);

    const update = () => {
      const t = (Number(qty.value) || 0) * (Number(price.value) || 0);
      totalCell.textContent = fmt(t);
      recalcTotals();
    };

    qty.addEventListener("input", update);
    price.addEventListener("input", update);
    desc.addEventListener("input", saveDraft);

    $(".removeItem", row).addEventListener("click", () => {
      row.remove();
      recalcTotals();
      saveDraft();
    });
  }

  // -------------------------------------------------------
  // FORM → OBJECT
  // -------------------------------------------------------
  function gatherForm() {
    return {
      invoiceNumber: ui.num.value || `INV-${Date.now()}`,
      issueDate: ui.date.value || new Date().toISOString().slice(0, 10),
      clientName: ui.name.value || "",
      clientEmail: ui.email.value || "",
      taxPct: Number(ui.taxPct.value || 0),
      lines: $$(".linesBody tr", ui.lines).map((r) => ({
        description: $(".li-desc", r).value,
        qty: Number($(".li-qty", r).value || 0),
        price: Number($(".li-price", r).value || 0),
      })),
    };
  }

  // -------------------------------------------------------
  // CALCULATE TOTALS
  // -------------------------------------------------------
  function recalcTotals() {
    const items = gatherForm().lines;
    const subtotal = items.reduce((s, l) => s + l.qty * l.price, 0);
    const taxAmt = (subtotal * (Number(ui.taxPct.value) || 0)) / 100;

    ui.subtotal.textContent = fmt(subtotal);
    ui.taxAmt.textContent = fmt(taxAmt);
    ui.total.textContent = fmt(subtotal + taxAmt);
  }

  // -------------------------------------------------------
  // SAVE + LOAD
  // -------------------------------------------------------
  function saveDraft() {
    draft = gatherForm();
  }

  function loadDraft() {
    if (!draft) return;
    loadInvoiceIntoEditor(draft);
  }

  function saveInvoice() {
    const inv = gatherForm();
    inv.id = "inv-" + Date.now();
    inv.createdAt = new Date().toISOString();

    invoices.unshift(inv);
    draft = null;
    renderList();
    alert("Saved: " + inv.invoiceNumber);
  }

  function loadInvoiceIntoEditor(inv) {
    ui.num.value = inv.invoiceNumber;
    ui.date.value = inv.issueDate;
    ui.name.value = inv.clientName;
    ui.email.value = inv.clientEmail;
    ui.taxPct.value = inv.taxPct;

    ui.lines.innerHTML = "";
    (inv.lines || []).forEach((l) => addLineRow(l));

    recalcTotals();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // -------------------------------------------------------
  // LIST RENDER
  // -------------------------------------------------------
  function totalOf(inv) {
    const s = inv.lines.reduce((a, l) => a + l.qty * l.price, 0);
    return s + (s * (inv.taxPct || 0)) / 100;
  }

  function renderList() {
    ui.list.innerHTML = "";

    if (!invoices.length) {
      ui.list.innerHTML = '<div class="muted">No invoices yet</div>';
      return;
    }

    invoices.forEach((inv) => {
      const card = document.createElement("div");
      card.className = "invoice-card";
      card.innerHTML = `
        <div>
          <div class="title">${inv.invoiceNumber} — ${inv.clientName}</div>
          <div class="small muted">${inv.issueDate} • ${inv.lines.length} items</div>
        </div>

        <div class="right">
          <div class="primary-total">${fmt(totalOf(inv))}</div>
          <div class="right-btns">
            <button class="view ghost">View</button>
            <button class="export ghost">JSON</button>
            <button class="del ghost">Delete</button>
          </div>
        </div>
      `;

      $(".view", card).addEventListener("click", () =>
        loadInvoiceIntoEditor(inv)
      );
      $(".export", card).addEventListener("click", () =>
        downloadJSON(inv)
      );
      $(".del", card).addEventListener("click", () => {
        if (confirm("Delete?")) {
          invoices = invoices.filter((i) => i.id !== inv.id);
          renderList();
        }
      });

      ui.list.appendChild(card);
    });
  }

  // -------------------------------------------------------
  // EXPORTING
  // -------------------------------------------------------
  function downloadJSON(obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = (obj.invoiceNumber || "invoice") + ".json";
    a.click();

    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------
  // PRINTING — NEW CLEAN VERSION (NO INLINE SCRIPTS)
  // -------------------------------------------------------
  function makePrintableHTML(inv) {
    const rows = inv.lines
      .map(
        (l) => `
          <tr>
            <td>${escapeHtml(l.description)}</td>
            <td class="r">${l.qty}</td>
            <td class="r">${fmt(l.price)}</td>
            <td class="r">${fmt(l.qty * l.price)}</td>
          </tr>
        `
      )
      .join("");

    const subtotal = inv.lines.reduce((s, l) => s + l.qty * l.price, 0);
    const taxAmt = (subtotal * inv.taxPct) / 100;
    const total = subtotal + taxAmt;

    return `
      <html>
      <head>
        <title>${escapeHtml(inv.invoiceNumber)}</title>
        <style>
          body { font-family: Arial; padding: 28px; }
          .r { text-align:right; }
          table { width:100%; border-collapse: collapse; }
          td,th { border-bottom:1px solid #ccc; padding:6px; }
        </style>
      </head>
      <body>
        <h2>Invoice — ${escapeHtml(inv.invoiceNumber)}</h2>
        <p>Issue date: ${inv.issueDate}</p>
        <p>Bill to: <strong>${escapeHtml(inv.clientName)}</strong> — ${escapeHtml(inv.clientEmail)}</p>

        <table>
          <thead>
            <tr>
              <th>Description</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <h3 style="text-align:right;margin-top:20px">
          Subtotal: ${fmt(subtotal)} <br>
          Tax (${inv.taxPct}%): ${fmt(taxAmt)} <br>
          <strong>Total: ${fmt(total)}</strong>
        </h3>
      </body>
      </html>
    `;
  }

  function printInvoice() {
    const inv = gatherForm();
    const w = window.open("", "_blank");
    w.document.write(makePrintableHTML(inv));
    w.document.close();
    w.onload = () => w.print();
  }

  // -------------------------------------------------------
  // EVENT WIRING
  // -------------------------------------------------------
  ui.addLine.addEventListener("click", () => addLineRow());
  ui.taxPct.addEventListener("input", () => {
    recalcTotals();
    saveDraft();
  });

  ui.save.addEventListener("click", saveInvoice);
  ui.newInv.addEventListener("click", () => {
    draft = null;
    ui.lines.innerHTML = "";
    ui.num.value = "";
    ui.date.value = "";
    ui.name.value = "";
    ui.email.value = "";
    ui.taxPct.value = 0;
    addLineRow();
    recalcTotals();
  });

  ui.downloadAll.addEventListener("click", () =>
    downloadJSON({ invoices })
  );
  ui.clearAll.addEventListener("click", () => {
    if (confirm("Clear all invoices?")) {
      invoices = [];
      renderList();
    }
  });

  ui.print.addEventListener("click", printInvoice);
  ui.download.addEventListener("click", () =>
    downloadJSON(gatherForm())
  );

  // -------------------------------------------------------
  // INIT
  // -------------------------------------------------------
  addLineRow();
  renderList();
  setInterval(saveDraft, 2000);
});
