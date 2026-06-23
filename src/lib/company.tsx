import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type Company = { id: string; name: string };
export const ALL = "all";

interface Ctx {
  selected: string;
  setSelected: (id: string) => void;
  companies: Company[];
  isAll: boolean;
  filter: <T extends { company_id?: string | null }>(rows: T[] | undefined) => T[];
}

const CompanyCtx = createContext<Ctx | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [selected, setSelectedState] = useState<string>(ALL);

  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("selectedCompany") : null;
    if (v) setSelectedState(v);
  }, []);

  const setSelected = (id: string) => {
    setSelectedState(id);
    try { localStorage.setItem("selectedCompany", id); } catch {/* ignore */}
  };

  const { data: companies = [] } = useQuery({
    queryKey: ["companies", user?.id ?? null],
    enabled: !loading && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (error) throw error;
      return data as Company[];
    },
  });

  const isAll = selected === ALL;
  const filter = <T extends { company_id?: string | null }>(rows: T[] | undefined) =>
    !rows ? [] : isAll ? rows : rows.filter((r) => r.company_id === selected);

  return (
    <CompanyCtx.Provider value={{ selected, setSelected, companies, isAll, filter }}>
      {children}
    </CompanyCtx.Provider>
  );
}

export const useCompany = () => {
  const c = useContext(CompanyCtx);
  if (!c) throw new Error("useCompany outside provider");
  return c;
};
