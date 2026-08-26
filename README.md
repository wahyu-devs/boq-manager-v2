# BOQ Manager

BOQ Manager is a professional web application for creating quotations, managing products and customers, tracking BOQ revisions, and exporting customer-ready documents.

It is designed as a practical internal workspace for sales, estimation, procurement, and project teams. The interface prioritizes fast data entry, accurate pricing, clear document status, and efficient day-to-day use across desktop and mobile devices.

## Features

- Operational dashboard with record counts, recently updated BOQs, and time-sensitive follow-up.
- BOQ register with search, filtering, sorting, status, revision, customer, value, margin, and date information.
- Fast BOQ editor with inline item editing and real-time financial calculations.
- Product catalog lookup and support for custom items with optional part numbers.
- Category and item reordering through an explicit drag-and-drop mode.
- Per-item quantity, unit COGS, margin, and selling price controls.
- Configurable category subtotals and customer-facing price visibility.
- Persistent financial summary for total COGS, total selling, commission, margin value, and margin percentage.
- Draft, Issued, and Won workflow with customer PO metadata, locked revision snapshots, and revision history.
- Product and customer directories with related BOQ information.
- Customer PDF preview and document export to Excel, PDF, and Word, including a price-free Purchasing sheet in the internal estimation workbook.
- Company, commercial, numbering, document, tax, and user preference settings.
- Responsive application shell with intentionally designed light and dark themes.
- Authenticated, user-scoped storage with background cloud synchronization.

## BOQ Workflow

1. Create a BOQ and enter its project, customer, validity, currency, and notes.
2. Add products from the catalog or create custom line items.
3. Enter quantity, unit COGS, and target margin for each item.
4. Review the calculated selling prices and financial summary.
5. Save the working document as a Draft.
6. Mark the BOQ as Issued to create an official revision snapshot.
7. Create a new revision when further changes are required.
8. Preview or download the customer document in Excel, PDF, or Word format.

## Pricing Logic

BOQ Manager treats the item margin as gross margin on the selling price.

```text
Total COGS = Quantity × Unit COGS

Unit Selling Price = Unit COGS ÷ (1 − Margin Percentage ÷ 100)

Total Selling Price = Quantity × Unit Selling Price
```

The overall financial summary uses:

```text
Margin Value = Total Selling − Total COGS − Commission

Margin Percentage = Margin Value ÷ Total Selling × 100
```

Selling prices can follow the rounding rule selected in Commercial Defaults. A unit selling price can also be entered manually when a specific commercial price is required.

## Technology

- Semantic HTML5
- Vanilla CSS with shared design tokens and responsive styles
- Vanilla JavaScript organized by application responsibility
- Supabase for authentication and cloud workspace persistence
- ExcelJS for Excel document generation
- jsPDF and AutoTable for PDF generation
- docx for Word document generation
- Deno for automated tests

The application has no build step and does not require a front-end framework.

## Running Locally

Requirements:

- A modern web browser
- Python 3 or another local static-file server
- An authorized BOQ Manager account

From the project directory, start a local server:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8080/
```

An internet connection is required for authentication, cloud synchronization, and the document export libraries loaded from the configured content delivery network.

## Testing

Install Deno, then run the complete test suite from the project directory:

```bash
deno test --allow-read tests
```

The tests cover core data migration, pricing behavior, revision issuance, synchronization policy, export integration, document layout rules, and selected interface regressions.

## Project Structure

```text
.
├── index.html              # Dashboard
├── boqs.html               # BOQ register
├── boq-editor.html         # BOQ creation, editing, revisions, and export
├── products.html           # Product catalog
├── customers.html          # Customer directory
├── settings.html           # Application settings
├── assets/                 # Application image assets
├── css/                    # Design tokens, layout, components, and responsive styles
├── js/                     # Application, data, calculation, sync, and export modules
└── tests/                  # Automated integration and regression tests
```

## Data and Synchronization

Application records are scoped to the authenticated user. Local browser storage provides immediate access and fast page transitions, while the cloud workspace is reconciled at application startup and refreshed in the background afterward.

BOQ issuance performs a cloud conflict check before creating an official revision. If cloud confirmation is temporarily unavailable, the interface reports the pending synchronization state without discarding the local work.

Theme and BOQ editor display preferences are stored locally on the current device.

## Themes and Responsive Behavior

BOQ Manager supports light, dark, and system theme preferences. The selected theme is applied before the interface becomes visible to avoid a theme flash and is persisted in local browser storage.

The layout provides a persistent desktop sidebar, compact tablet navigation, a mobile drawer, responsive record views, and a mobile-friendly BOQ editing workflow.
