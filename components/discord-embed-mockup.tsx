export default function DiscordEmbedMockup() {
  return (
    <div
      className="mt-1 rounded overflow-hidden max-w-md"
      style={{
        backgroundColor: "oklch(0.26 0.005 260)",
        borderLeft: "4px solid #5865f2",
      }}
    >
      <div className="p-3 space-y-3">
        {/* Title */}
        <div>
          <a
            href="https://logged.tg/dashboard"
            className="text-sm font-semibold text-primary hover:underline"
          >
            YourUsername | logged.tg
          </a>
        </div>

        {/* Description */}
        <p className="text-xs text-foreground">
          <span className="font-semibold">Username:</span>{" "}
          <code className="bg-secondary px-1 rounded font-mono text-[11px]">YourUsername</code>
          {" — "}
          <span className="text-yellow-400 font-semibold">Premium</span>
        </p>

        {/* Row 1 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Total Hits",  value: "1.2K" },
            { label: "Site Visits", value: "847"  },
            { label: "Summary",     value: "R$ 42.5K" },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide leading-tight">{label}</p>
              <div
                className="mt-0.5 rounded px-1.5 py-0.5"
                style={{ backgroundColor: "oklch(0.22 0.005 260)" }}
              >
                <span className="text-xs text-foreground font-mono">{value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Total RAP",    value: "R$ 120K" },
            { label: "Balance",      value: "R$ 8.3K" },
            { label: "Limiteds RAP", value: "R$ 55K"  },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide leading-tight">{label}</p>
              <div
                className="mt-0.5 rounded px-1.5 py-0.5"
                style={{ backgroundColor: "oklch(0.22 0.005 260)" }}
              >
                <span className="text-xs text-foreground font-mono">{value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Rare Items */}
        <div className="pt-1 border-t border-border">
          <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide mb-1">Rare Items</p>
          <div className="space-y-0.5 text-xs text-foreground">
            <p>Korblox: <span className="text-green-400 font-semibold">Yes</span></p>
            <p>Headless: <span className="text-red-400 font-semibold">No</span></p>
          </div>
        </div>

        {/* Billing / Groups row */}
        <div className="grid grid-cols-2 gap-4 pt-1 border-t border-border">
          <div>
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide mb-1">Subscription</p>
            <p className="text-xs text-foreground">Active: <span className="text-green-400 font-semibold">Yes</span></p>
            <p className="text-xs text-muted-foreground">Expires: 2026-01-01</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide mb-1">Groups</p>
            <p className="text-xs text-foreground">Owned: <span className="font-bold">3</span></p>
            <p className="text-xs text-muted-foreground">Balance: R$ 2.1K</p>
          </div>
        </div>

        {/* Cookie / Billing */}
        <div className="grid grid-cols-2 gap-4 pt-1 border-t border-border">
          <div>
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide mb-1">Cookie Status</p>
            <p className="text-xs text-green-400 font-semibold">Valid</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide mb-1">Billing</p>
            <p className="text-xs text-foreground">Total: R$ 340</p>
            <p className="text-xs text-muted-foreground">Credit: R$ 50</p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-1 border-t border-border flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-full bg-secondary shrink-0" />
          <p className="text-[10px] text-muted-foreground">
            Requested by user • logged.tg
          </p>
        </div>
      </div>
    </div>
  );
}
