import { defineMcp } from "@lovable.dev/mcp-js";
import listClients from "./tools/list-clients";
import listInvoices from "./tools/list-invoices";
import getInvoice from "./tools/get-invoice";
import listPayments from "./tools/list-payments";
import revenueSummary from "./tools/revenue-summary";

export default defineMcp({
  name: "agency-os-mcp",
  title: "Agency OS — MMB & JPS",
  version: "0.1.0",
  instructions:
    "Tools for the Agency OS billing/CRM. Read clients, invoices (with items and payments), payments, and revenue summaries across Make Me Brand and Janki Parth Savani companies.",
  tools: [listClients, listInvoices, getInvoice, listPayments, revenueSummary],
});
