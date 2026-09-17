const boqSource = await Deno.readTextFile(
  new URL("../js/boq.js", import.meta.url),
);
const editorHtml = await Deno.readTextFile(
  new URL("../boq-editor.html", import.meta.url),
);
const componentsCss = await Deno.readTextFile(
  new URL("../css/components.css", import.meta.url),
);
const customerFunction = boqSource.match(
  /function updateEditorCustomer\(\) \{[\s\S]*?\n  \}/,
)?.[0];
if (!customerFunction) throw new Error("Editor customer header updater missing");

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function renderCustomerHeader(customerSelect, record = null, locked = false) {
  const customerNode = { textContent: "", title: "", hidden: true };
  const separatorNode = { hidden: true };
  const saveState = { textContent: "Unsaved changes" };
  const nodes = new Map([
    ["#boq-customer", customerSelect],
    ["[data-editor-customer]", customerNode],
    ["[data-editor-customer-separator]", separatorNode],
    ["[data-save-state]", saveState],
  ]);
  const document = { querySelector: (selector) => nodes.get(selector) };
  const update = new Function(
    "document",
    "currentRecord",
    "isIssuedLocked",
    `return (${customerFunction});`,
  )(document, record, () => locked);
  update();
  return { customerNode, separatorNode, saveState, update };
}

Deno.test("shows the selected customer beside the editor save state", () => {
  const select = { value: "customer-1", selectedOptions: [{ text: " Customer One " }] };
  const { customerNode, separatorNode, saveState, update } = renderCustomerHeader(select);
  equal(customerNode.textContent, "Customer One", "customer name is trimmed");
  equal(customerNode.title, "Customer One", "full name remains available when truncated");
  equal(customerNode.hidden, false, "customer is visible");
  equal(separatorNode.hidden, false, "separator is visible");
  equal(saveState.textContent, "Unsaved changes", "existing save state is preserved");

  select.value = "customer-2";
  select.selectedOptions = [{ text: "Customer Two" }];
  update();
  equal(customerNode.textContent, "Customer Two", "changing customer updates the header immediately");
});

Deno.test("hides the customer and separator when no customer is selected", () => {
  const select = { value: "customer-1", selectedOptions: [{ text: "Customer One" }] };
  const { customerNode, separatorNode, update } = renderCustomerHeader(
    select,
    { status: "Draft", customerName: "Customer One" },
  );
  select.value = "";
  select.selectedOptions = [{ text: "No customer selected" }];
  update();
  equal(customerNode.textContent, "", "clearing customer does not restore the old saved name");
  equal(customerNode.title, "", "clearing customer removes its old tooltip");
  equal(customerNode.hidden, true, "empty customer is hidden");
  equal(separatorNode.hidden, true, "empty separator is hidden");
});

Deno.test("preserves saved customer names for locked issued and won BOQs", () => {
  for (const status of ["Issued", "Won"]) {
    const record = { status, customerName: "Original Customer", workingRevision: null };
    const before = JSON.stringify(record);
    const select = { value: "customer-1", selectedOptions: [{ text: "Renamed Customer" }] };
    const { customerNode } = renderCustomerHeader(select, record, true);
    equal(customerNode.textContent, "Original Customer", `${status} uses the saved name`);
    equal(JSON.stringify(record), before, "rendering does not mutate the BOQ");

    const missing = renderCustomerHeader({ value: "", selectedOptions: [] }, record, true);
    equal(missing.customerNode.textContent, "Original Customer", "saved name survives a missing directory entry");
  }
});

Deno.test("revision drafts follow current selection rather than the issued name", () => {
  const record = { status: "Issued", customerName: "Original Customer", workingRevision: 1 };
  const select = { value: "customer-2", selectedOptions: [{ text: "Revision Customer" }] };
  const { customerNode } = renderCustomerHeader(select, record);
  equal(customerNode.textContent, "Revision Customer", "draft revision uses its selected customer");
});

Deno.test("treats customer names as plain text and handles new empty BOQs", () => {
  const name = '<Customer & Partners> "North"';
  const selected = renderCustomerHeader({ value: "customer-1", selectedOptions: [{ text: name }] });
  equal(selected.customerNode.textContent, name, "customer text is not injected as HTML");
  const empty = renderCustomerHeader({ value: "", selectedOptions: [] });
  equal(empty.customerNode.hidden, true, "new BOQ has no customer label");
  equal(empty.separatorNode.hidden, true, "new BOQ has no separator");
});

Deno.test("keeps customer metadata compact and connected to header refresh", () => {
  for (const expected of [
    'class="editor-header-meta"',
    'class="editor-header-customer" data-editor-customer hidden',
    'data-editor-customer-separator aria-hidden="true" hidden',
    '<span data-save-state>Not saved yet</span>',
  ]) {
    if (!editorHtml.includes(expected)) throw new Error(`Missing header markup: ${expected}`);
  }
  if (!boqSource.includes("function updateEditorHeader() {\n    updateEditorCustomer();")) {
    throw new Error("Customer metadata must refresh through existing header lifecycle");
  }
  for (const expected of [
    ".editor-page-header .page-header-copy {\n  flex: 1 1 auto;\n  min-width: 0;",
    ".editor-header-meta {\n  display: flex;",
    ".editor-header-customer,\n.editor-header-meta [data-save-state] {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;",
    ".editor-header-customer {\n  color: var(--color-text);\n  font-weight: 500;",
    ".editor-header-meta [data-save-state] {\n  flex: 0 0 auto;\n  max-width: calc(100% - var(--space-2) * 2 - 1ch);",
  ]) {
    if (!componentsCss.includes(expected)) throw new Error(`Missing compact customer styling: ${expected}`);
  }
});
