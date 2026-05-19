export default function DiscordEmbedMockup() {
  return (
    <div className="space-y-3 font-sans">
      {/* ── Initial !hyperlink embed ── */}
      <div
        className="rounded overflow-hidden max-w-[440px]"
        style={{ backgroundColor: "#2b2d31" }}
      >
        <div style={{ borderLeft: "4px solid #5865f2" }}>
          <div className="px-3 pt-3 pb-2 space-y-2">
            {/* Title */}
            <p className="text-sm font-semibold" style={{ color: "#ffffff" }}>
              Hide a Link with Hyperlink
            </p>
            {/* Description */}
            <p className="text-sm leading-relaxed" style={{ color: "#dbdee1" }}>
              Want to disguise a long URL as a clean hyperlink?
              <br />
              Click <strong style={{ color: "#ffffff" }}>Submit Link</strong> below, paste your URL, and the bot will return a formatted hyperlink you can share anywhere.
            </p>
            {/* Field */}
            <div className="pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#ffffff" }}>
                How it works
              </p>
              <p className="text-sm mt-0.5" style={{ color: "#dbdee1" }}>
                Your URL is posted to{" "}
                <span style={{ color: "#5865f2" }} className="font-mono">linkurlshort.page.gd</span>{" "}
                and returned as a masked hyperlink.
              </p>
            </div>
            {/* Footer */}
            <p className="text-xs pt-1" style={{ color: "#80848e" }}>
              Powered by linkurlshort.page.gd
            </p>
          </div>
        </div>
        {/* Button */}
        <div className="px-3 pb-3">
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded cursor-default"
            style={{ backgroundColor: "#5865f2", color: "#ffffff" }}
            tabIndex={-1}
            aria-disabled="true"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Submit Link
          </button>
        </div>
      </div>

      {/* ── Result embed ── */}
      <div
        className="rounded overflow-hidden max-w-[440px]"
        style={{ backgroundColor: "#2b2d31" }}
      >
        <div style={{ borderLeft: "4px solid #5865f2" }}>
          <div className="px-3 pt-3 pb-3 space-y-3">
            {/* Title + description */}
            <div>
              <p className="text-sm font-semibold" style={{ color: "#ffffff" }}>
                Link Shortened
              </p>
              <p className="text-sm mt-0.5" style={{ color: "#dbdee1" }}>
                Ready to copy and share
              </p>
            </div>

            {/* Formatted Output */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#ffffff" }}>
                Formatted Output
              </p>
              <div
                className="text-xs font-mono px-2.5 py-2 rounded break-all leading-relaxed"
                style={{ backgroundColor: "#1e1f22", color: "#dbdee1" }}
              >
                {`[https://www.roblox.com/users/387872695312/profile](https://linkurlshort.page.gd/index.php?r=3am4vBE)`}
              </div>
            </div>

            {/* Short URL */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#ffffff" }}>
                Short URL
              </p>
              <p
                className="text-sm font-mono break-all"
                style={{ color: "#5865f2" }}
              >
                https://linkurlshort.page.gd/index.php?r=3am4vBE
              </p>
            </div>

            {/* Original URL */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#ffffff" }}>
                Original URL
              </p>
              <p className="text-sm font-mono break-all" style={{ color: "#dbdee1" }}>
                https://www.roblox.com/users/387872695312/profile
              </p>
            </div>

            {/* Footer */}
            <p className="text-xs border-t pt-2" style={{ color: "#80848e", borderColor: "#3f4147" }}>
              Powered by linkurlshort.page.gd
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
