import { createContext, useContext, useEffect, useState } from "react";
import { settingsApi } from "./api";

// Supported currencies. Symbol-only switching (no FX conversion) — the same
// numeric amounts are shown with the selected currency's symbol and locale
// grouping (₹ uses Indian lakh/crore grouping, $ uses Western grouping).
export const CURRENCIES = {
  INR: { code: "INR", symbol: "₹", locale: "en-IN", label: "₹ INR" },
  USD: { code: "USD", symbol: "$", locale: "en-US", label: "$ USD" },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

const STORAGE_KEY = "bitwix_currency";

interface CurrencyContextValue {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  /** Format a number as money in the active currency. Returns "—" for null/NaN. */
  format: (value: number | string | null | undefined, opts?: { decimals?: number }) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return saved && saved in CURRENCIES ? (saved as CurrencyCode) : "INR";
  });

  // If the user hasn't chosen one yet, take the backend's default currency.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    settingsApi.get()
      .then((res) => {
        const def = res.data?.defaultCurrency;
        if (def && def in CURRENCIES) setCurrencyState(def as CurrencyCode);
      })
      .catch(() => { /* keep INR default */ });
  }, []);

  const setCurrency = (c: CurrencyCode) => {
    setCurrencyState(c);
    localStorage.setItem(STORAGE_KEY, c);
  };

  const format = (value: number | string | null | undefined, opts?: { decimals?: number }) => {
    if (value == null || value === "") return "—";
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";
    const { code, locale } = CURRENCIES[currency];
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: opts?.decimals ?? 0,
      minimumFractionDigits: 0,
    }).format(num);
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, format }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within a CurrencyProvider");
  return ctx;
}
