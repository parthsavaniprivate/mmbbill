import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit3 } from "lucide-react";
import { inr } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/employees")({ component: EmployeesPage });

type Employee = {
  id?: string; company_id: string; employee_code: string | null; name: string;
  designation: string | null; department: string | null; mobile: string | null; email: string | null;
  joining_date: string | null; pan: string | null; bank_account: string | null; uan: string | null;
  basic: number; hra: number; conveyance: number; medical: number; is_active: boolean;
};

const empty = (companyId: string): Employee => ({
  company_id: companyId, employee_code: "", name: "", designation: "", department: "",
  mobile: "", email: "", joining_date: null, pan: "", bank_account: "", uan: "",
  basic: 0, hra: 0, conveyance: 0, medical: 0, is_active: true,
});

function EmployeesPage() {
  const { selected, isAll, companies } = useCompany();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [open, setOpen] = useState(false);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("*").order("name");
      return data ?? [];
    },
  });

  const filtered = employees.filter((e) => {
    if (!isAll && e.company_id !== selected) return false;
    if (search) {
      const s = search.toLowerCase();
      return [e.name, e.employee_code, e.designation, e.department, e.mobile].some((v) => (v ?? "").toLowerCase().includes(s));
    }
    return true;
  });

  const save = useMutation({
    mutationFn: async (e: Employee) => {
      if (!e.company_id) throw new Error("Company required");
      if (!e.name) throw new Error("Name required");
      if (e.id) {
        const { error } = await supabase.from("employees").update({
          ...e, joining_date: e.joining_date || null,
        }).eq("id", e.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert({
          ...e, joining_date: e.joining_date || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved"); setOpen(false); qc.invalidateQueries({ queryKey: ["employees"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["employees"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const startNew = () => {
    setEditing(empty(isAll ? companies[0]?.id ?? "" : selected));
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground">{filtered.length} employees</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={startNew}><Plus className="w-4 h-4" />Add Employee</Button>
          </DialogTrigger>
          {editing && (
            <EmployeeDialog
              employee={editing}
              companies={companies}
              onChange={setEditing}
              onSave={() => save.mutate(editing)}
              saving={save.isPending}
            />
          )}
        </Dialog>
      </div>

      <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />

      <Card className="shadow-card">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No employees yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead className="text-right">Basic</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">{e.employee_code || "—"}</TableCell>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="text-sm">{e.designation || "—"}</TableCell>
                    <TableCell className="text-sm">{e.department || "—"}</TableCell>
                    <TableCell className="text-sm">{e.mobile || "—"}</TableCell>
                    <TableCell className="text-right">{inr(Number(e.basic))}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(e as Employee); setOpen(true); }}>
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete employee?")) del.mutate(e.id); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmployeeDialog({ employee, companies, onChange, onSave, saving }: {
  employee: Employee; companies: { id: string; name: string }[];
  onChange: (e: Employee) => void; onSave: () => void; saving: boolean;
}) {
  const u = (patch: Partial<Employee>) => onChange({ ...employee, ...patch });
  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{employee.id ? "Edit" : "New"} Employee</DialogTitle></DialogHeader>
      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Company">
          <Select value={employee.company_id} onValueChange={(v) => u({ company_id: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Employee Code"><Input value={employee.employee_code ?? ""} onChange={(e) => u({ employee_code: e.target.value })} /></Field>
        <Field label="Name *"><Input value={employee.name} onChange={(e) => u({ name: e.target.value })} /></Field>
        <Field label="Designation"><Input value={employee.designation ?? ""} onChange={(e) => u({ designation: e.target.value })} /></Field>
        <Field label="Department"><Input value={employee.department ?? ""} onChange={(e) => u({ department: e.target.value })} /></Field>
        <Field label="Mobile"><Input value={employee.mobile ?? ""} onChange={(e) => u({ mobile: e.target.value })} /></Field>
        <Field label="Email"><Input value={employee.email ?? ""} onChange={(e) => u({ email: e.target.value })} /></Field>
        <Field label="Joining Date"><Input type="date" value={employee.joining_date ?? ""} onChange={(e) => u({ joining_date: e.target.value })} /></Field>
        <Field label="PAN"><Input value={employee.pan ?? ""} onChange={(e) => u({ pan: e.target.value })} /></Field>
        <Field label="Bank Account"><Input value={employee.bank_account ?? ""} onChange={(e) => u({ bank_account: e.target.value })} /></Field>
        <Field label="UAN"><Input value={employee.uan ?? ""} onChange={(e) => u({ uan: e.target.value })} /></Field>
        <div className="md:col-span-2 text-xs uppercase tracking-wide text-muted-foreground mt-2">Default salary components</div>
        <Field label="Basic"><Input type="number" value={employee.basic} onChange={(e) => u({ basic: Number(e.target.value) })} /></Field>
        <Field label="HRA"><Input type="number" value={employee.hra} onChange={(e) => u({ hra: Number(e.target.value) })} /></Field>
        <Field label="Conveyance"><Input type="number" value={employee.conveyance} onChange={(e) => u({ conveyance: Number(e.target.value) })} /></Field>
        <Field label="Medical"><Input type="number" value={employee.medical} onChange={(e) => u({ medical: Number(e.target.value) })} /></Field>
      </div>
      <DialogFooter><Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
