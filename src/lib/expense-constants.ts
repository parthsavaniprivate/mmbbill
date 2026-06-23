import type { Database } from "@/integrations/supabase/types";

export type Category = Database["public"]["Enums"]["expense_category"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type ExpenseKind = Database["public"]["Enums"]["expense_kind"];

export const CATEGORIES: { value: Category; label: string; kind: ExpenseKind }[] = [
  { value: "employee_salary", label: "Employee Salary", kind: "fixed" },
  { value: "office_rent", label: "Office Rent", kind: "fixed" },
  { value: "office", label: "Office", kind: "fixed" },
  { value: "electricity", label: "Electricity Bill", kind: "fixed" },
  { value: "internet", label: "Internet Bill", kind: "fixed" },
  { value: "software_subscriptions", label: "Software Subscription", kind: "fixed" },
  { value: "facebook_ads", label: "Facebook Ads", kind: "variable" },
  { value: "instagram_ads", label: "Instagram Ads", kind: "variable" },
  { value: "google_ads", label: "Google Ads", kind: "variable" },
  { value: "travel", label: "Travel", kind: "variable" },
  { value: "miscellaneous", label: "Miscellaneous", kind: "variable" },
  { value: "other", label: "Other", kind: "variable" },
];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
);

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Credit Card" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export const PAYMENT_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((p) => [p.value, p.label]),
);
